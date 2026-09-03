import { Octokit } from "@octokit/rest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const date = new Date();
const today = date.toISOString();

const tableName = "abundance-projects";

export const handler = async (event, context) => {
  // Get the user's GitHub token from Authorization header
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization;
  const githubToken = authHeader?.replace("Bearer ", "");

  if (!githubToken) {
    return {
      statusCode: 401,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Missing GitHub token in Authorization header",
      }),
    };
  }

  const octokit = new Octokit({
    auth: githubToken,
  });

  // Get the user from the request body
  const body =
    typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  const currentUser = body?.user;

  if (!currentUser) {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Missing 'user' parameter" }),
    };
  }

  console.log(`Checking PRs for user: ${currentUser}`);

  try {
    // Query only projects owned by the current user
    const queryParams = {
      TableName: tableName,
      KeyConditionExpression: "#ow = :owner",
      ExpressionAttributeNames: {
        "#ow": "owner",
      },
      ExpressionAttributeValues: {
        ":owner": currentUser,
      },
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
    };

    const queryCommand = new QueryCommand(queryParams);
    const queryResult = await dynamo.send(queryCommand);
    let userProjects = queryResult.Items || [];

    // Handle pagination if there are more items
    let lastEvaluatedKey = queryResult.LastEvaluatedKey;
    while (lastEvaluatedKey) {
      queryParams.ExclusiveStartKey = lastEvaluatedKey;
      const nextResult = await dynamo.send(new QueryCommand(queryParams));
      userProjects = userProjects.concat(nextResult.Items || []);
      lastEvaluatedKey = nextResult.LastEvaluatedKey;
    }

    console.log(
      `Found ${userProjects.length} projects for user ${currentUser}`,
    );

    if (userProjects.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "No projects found for user",
          pullRequests: [],
        }),
      };
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Batch processing to avoid DynamoDB throttling
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 500;

    // Filter to public repos only
    let reposToCheck = userProjects.filter((repo) => !repo.privateRepo);

    const allPullRequests = [];

    for (let i = 0; i < reposToCheck.length; i += BATCH_SIZE) {
      const batch = reposToCheck.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((repo) =>
          checkGithubAndUpdatePRs(
            repo.owner,
            repo.repoName,
            repo.forks,
            repo.lastFoundGit,
            repo.contentURL,
          ),
        ),
      );

      // Collect all PRs from this batch
      batchResults.forEach((result) => {
        if (result && result.pullRequests) {
          allPullRequests.push(...result.pullRequests);
        }
      });

      if (i + BATCH_SIZE < reposToCheck.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(
      `Total PRs found across user's projects: ${allPullRequests.length}`,
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Successfully checked user's pull requests",
        projectsChecked: reposToCheck.length,
        pullRequests: allPullRequests,
      }),
    };
  } catch (error) {
    console.error("Error checking user PRs:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to check pull requests",
        message: error.message,
      }),
    };
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
      TableName: tableName,
      UpdateExpression:
        "SET lastFoundGit = :lastFoundGit, forks = :forks, pullRequests = :pullRequests REMOVE failureCount",
      Key: {
        owner: owner,
        repoName: repoName,
      },
    };
    const command = new UpdateCommand(input);
    try {
      await dynamo.send(command);
      return pullRequests || [];
    } catch (error) {
      console.error(`Error updating PR data for ${owner}/${repoName}:`, error);
      throw error;
    }
  }

  async function getPullRequests(owner, repoName) {
    try {
      const prsResponse = await octokit.rest.pulls.list({
        owner: owner,
        repo: repoName,
        state: "open",
        per_page: 100,
      });

      // Extract relevant PR data
      const pullRequests = prsResponse.data.map((pr) => ({
        owner: pr.head.repo?.owner?.login || owner,
        repo: pr.head.repo?.name || repoName,
        branch: pr.head.ref,
        pullRequestNumber: pr.number,
        url: pr.html_url,
      }));

      console.log(
        `Found ${pullRequests.length} open PRs in ${owner}/${repoName}`,
      );
      return pullRequests;
    } catch (error) {
      console.error(`Error fetching PRs for ${owner}/${repoName}:`, error);
      return [];
    }
  }

  async function checkGithubAndUpdatePRs(
    owner,
    repoName,
    forks,
    lastFoundGit,
    contentURL,
  ) {
    try {
      // Check if repo exists
      const repoResponse = await octokit.rest.repos.get({
        owner: owner,
        repo: repoName,
      });

      // Fetch pull requests if repo has open issues
      let pullRequests = [];
      if (repoResponse.data.open_issues_count > 0) {
        pullRequests = await getPullRequests(owner, repoName);
      }

      // Update DynamoDB with new PR data
      await checkUpdate(
        owner,
        repoName,
        forks,
        repoResponse.data.forks_count,
        pullRequests,
      );

      return {
        owner,
        repoName,
        pullRequests,
      };
    } catch (error) {
      if (error.status === 404) {
        console.log(`Project not found: ${owner}/${repoName}`);
      } else {
        console.error(`Error checking repo ${owner}/${repoName}:`, error);
      }
      return {
        owner,
        repoName,
        pullRequests: [],
      };
    }
  }
};
