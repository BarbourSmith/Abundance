import { Octokit } from "@octokit/rest";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const tableName = "abundance-projects";
const recentlyDeletedTable = "recently-deleted-abundance";

export const handler = async (event, context) => {
  // Computed per invocation because warm Lambda containers reuse module scope
  const today = new Date().toISOString();

  const octokit = new Octokit({
    auth: process.env.GIT_ACCESS,
  });

  const ses = new SESClient({});

  let updatedCount = 0; // Counter for updated projects
  let deletedProjects = []; // Array to store deleted project names
  let notFoundProjects = []; // Array to store not found project names
  let failedProjects = []; // Array to store projects that errored during the check

  /*Scans parameter to returns attributes owner, repoName, fork from all repositories in table*/
  const scanInput = {
    ProjectionExpression:
      "#ow, #repoName, #forks, #lastFoundGit, #privateRepo, #contentURL",
    ExpressionAttributeNames: {
      "#ow": "owner",
      "#repoName": "repoName",
      "#forks": "forks",
      "#lastFoundGit": "lastFoundGit",
      "#privateRepo": "privateRepo",
      "#contentURL": "contentURL",
    },
    TableName: tableName,
  };

  await checkRateLimit();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Batch processing to avoid DynamoDB throttling
  const BATCH_SIZE = 5; // Number of repositories to process in parallel per batch
  const BATCH_DELAY_MS = 500; // Delay in milliseconds between each batch

  // Process one scan page at a time so memory stays bounded as the table grows
  let lastEvaluatedKey;
  let scannedCount = 0;
  do {
    const page = await dynamo.send(
      new ScanCommand({ ...scanInput, ExclusiveStartKey: lastEvaluatedKey }),
    );
    const pageItems = page.Items || [];
    scannedCount += pageItems.length;

    const reposToCheck = pageItems.filter((repo) => !repo.privateRepo);
    for (let i = 0; i < reposToCheck.length; i += BATCH_SIZE) {
      const batch = reposToCheck.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((repo) =>
          checkGithub(
            repo.owner,
            repo.repoName,
            repo.forks,
            repo.lastFoundGit,
            repo.contentURL,
          ).catch((error) => {
            console.error(
              `Failed to check ${repo.owner}/${repo.repoName}:`,
              error,
            );
            failedProjects.push(`${repo.owner}/${repo.repoName}`);
          }),
        ),
      );
      if (i + BATCH_SIZE < reposToCheck.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log("Items checked:", scannedCount);

  // Compose log report
  let logReport = [
    `Items scanned: ${scannedCount}`,
    `Projects updated: ${updatedCount}`,
    deletedProjects.length > 0
      ? `Projects deleted: ${deletedProjects.length} (${deletedProjects.join(
          ", ",
        )})`
      : "No projects deleted.",
    notFoundProjects.length > 0
      ? `Projects not found: ${
          notFoundProjects.length
        } (${notFoundProjects.join(", ")})`
      : "All projects found.",
    failedProjects.length > 0
      ? `Projects failed to check: ${
          failedProjects.length
        } (${failedProjects.join(", ")})`
      : "No check failures.",
  ].join("\n");

  console.log(logReport);

  // Send SES email report every run
  try {
    const params = {
      Source: process.env.SES_FROM_EMAIL,
      Destination: {
        ToAddresses: [process.env.SES_TO_EMAIL],
      },
      Message: {
        Subject: { Data: "Abundance Check GitHub AWS Report" },
        Body: {
          Text: { Data: logReport },
        },
      },
    };
    await ses.send(new SendEmailCommand(params));
    console.log("SES report email sent.");
  } catch (err) {
    console.error("Failed to send SES report email:", err);
  }

  async function checkUpdate(
    owner,
    repoName,
    forks,
    githubForks,
    pullRequests,
  ) {
    const input = {
      ExpressionAttributeValues: {
        ":forks": githubForks,
        ":lastFoundGit": today,
        ":pullRequests": pullRequests || [],
      },
      ReturnValues: "ALL_NEW",
      TableName: "abundance-projects",
      UpdateExpression:
        "SET lastFoundGit = :lastFoundGit, forks = :forks, pullRequests = :pullRequests REMOVE failureCount",
      Key: {
        owner: owner,
        repoName: repoName,
      },
    };
    const command = new UpdateCommand(input);
    try {
      const response = await dynamo.send(command);
      updatedCount++; // Increment counter on successful update
      return response;
    } catch (error) {
      console.error(error);
      throw error; // re-throw the error
    }
  }

  /* Checks the rate limit of the GitHub API */
  async function checkRateLimit() {
    const response = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Authorization: `Bearer ${process.env.GIT_ACCESS}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch rate limit status.");
      return null;
    }

    const data = await response.json();
    console.log("Rate Limit Status:", data);
    return data;
  }

  /* Fetches pull requests from a GitHub repository */
  async function getPullRequests(owner, repoName) {
    try {
      const prsResponse = await octokit.rest.pulls.list({
        owner: owner,
        repo: repoName,
        state: "open",
        per_page: 100, // Fetch up to 100 open PRs
      });

      // Extract relevant PR data: owner, repo, branch, and link
      const pullRequests = prsResponse.data.map((pr) => ({
        owner: pr.head.repo?.owner?.login || owner,
        repo: pr.head.repo?.name || repoName,
        branch: pr.head.ref,
        pullRequestNumber: pr.number,
        url: pr.html_url,
      }));

      console.log(
        `Found ${pullRequests.length} open pull requests in ${owner}/${repoName}`,
      );
      return pullRequests;
    } catch (error) {
      console.error(
        `Error fetching pull requests for ${owner}/${repoName}:`,
        error,
      );
      return []; // Return empty array if PR fetch fails
    }
  }

  /* Makes request to github to check if repo exists, if it doesn't deletes from table, it it does updates in table*/
  async function checkGithub(owner, repoName, forks, lastFoundGit, contentURL) {
    const failureCountKey = "failureCount";

    try {
      // Use Octokit to check if repo exists
      const repoResponse = await octokit.rest.repos.get({
        owner: owner,
        repo: repoName,
      });

      // Only fetch pull requests if the repo has open issues/PRs
      let pullRequests = [];
      if (repoResponse.data.open_issues_count > 0) {
        pullRequests = await getPullRequests(owner, repoName);
      }
      // Update repository details and reset failure count in one call
      return checkUpdate(
        owner,
        repoName,
        forks,
        repoResponse.data.forks_count,
        pullRequests,
      );
    } catch (error) {
      if (error.status === 404) {
        console.log(`Project not found: ${owner}/${repoName}`);
        notFoundProjects.push(`${owner}/${repoName}`);
        // Fetch current failure count from DynamoDB
        const getParams = {
          TableName: tableName,
          Key: {
            owner: owner,
            repoName: repoName,
          },
          ProjectionExpression: failureCountKey,
        };
        const getCommand = new GetCommand(getParams);
        const getResponse = await dynamo.send(getCommand);
        const currentFailureCount = getResponse.Item?.[failureCountKey] || 0;

        // Increment failure count
        const newFailureCount = currentFailureCount + 1;
        // Delete from table if failure count reaches 3
        if (newFailureCount >= 3) {
          console.log(
            `Deleting project after 3 consecutive failures: ${owner}/${repoName}`,
          );
          deletedProjects.push(`${owner}/${repoName}`);
          await deleteFromTable(owner, repoName);
        } else {
          const updateParams = {
            TableName: tableName,
            Key: {
              owner: owner,
              repoName: repoName,
            },
            UpdateExpression: `SET ${failureCountKey} = :failureCount`,
            ExpressionAttributeValues: {
              ":failureCount": newFailureCount,
            },
          };
          const updateCommand = new UpdateCommand(updateParams);
          await dynamo.send(updateCommand);
        }
      } else {
        // Log and rethrow unexpected errors
        console.error(`Error checking repo ${owner}/${repoName}:`, error);
        throw error;
      }
    }
  }
  /*Removes non existent repos from table */
  async function deleteFromTable(owner, repoName) {
    try {
      await pushingToRecentlyDeletedTable(owner, repoName);
      const params = {
        TableName: tableName,
        Key: {
          owner: owner,
          repoName: repoName,
        },
      };
      const command = new DeleteCommand(params);
      console.log("deleting item" + owner + "/" + repoName);
      return await dynamo.send(command);
    } catch (error) {
      console.error(error);
      throw error; // re-throw the error
    }
  }
  async function pushingToRecentlyDeletedTable(owner, repoName) {
    // push to recently deleted table
    const params2 = {
      TableName: tableName,
      Key: {
        owner: owner,
        repoName: repoName,
      },
    };
    const getCommand = new GetCommand(params2);
    const responseGet = await dynamo.send(getCommand); //delete from abundance-projects table
    if (!responseGet.Item) {
      return null;
    }
    responseGet.Item["deletedAt"] = today;

    const commandPut = new PutCommand({
      TableName: "recently-deleted-abundance",
      Item: responseGet.Item,
    });
    const responsePut = await dynamo.send(commandPut);
    return responsePut;
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify("Github has been checked"),
  };
  return response;
};
