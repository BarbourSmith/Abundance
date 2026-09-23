import { Octokit } from "@octokit/rest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const tableName = process.env.TABLE_NAME || "abundance-projects";

/**
 * Recovers project metadata from GitHub API to restore truncated DynamoDB records.
 *
 * This Lambda function scans the entire Abundance projects table and rebuilds missing metadata
 * by fetching repository information from GitHub for each project.
 *
 * Recovered Metadata:
 *   - description, topics, html_url, private, forks_count from GitHub API
 *   - URLs: readme, project.abundance, project.svg, project.png from raw GitHub
 *   - searchField: combined index for search functionality
 *   - dateModified: last update time from GitHub (updated_at)
 *   - yyyy: year extracted from dateCreated for yyyy-ranking-index and other year-based indexes
 *   - parentRepo: detected if project is a fork
 *
 * Preserved Data (not overwritten):
 *   - ranking: reset to 1 (tier for no molecule usage, will be recalculated)
 *   - userRanking, likes: preserved from existing records
 *   - topMoleculeID, githubMoleculesUsed: preserved (empty if truncated)
 *   - pullRequests: initialized as empty (populated by check-user-prs Lambda)
 *   - userSetAsThumbnail: preserved from existing records
 *
 * Requirements:
 *   - Lambda timeout: 15+ minutes (due to full table scan + GitHub API calls)
 *   - GIT_ACCESS environment variable: GitHub personal access token
 *   - TABLE_NAME environment variable: DynamoDB table name
 *
 * Returns:
 *   {statusCode, body: {recovered: count, failed: count, errors: [...]}}
 */
export const handler = async (event, context) => {
  const octokit = new Octokit({
    auth: process.env.GIT_ACCESS,
  });

  let recoveredCount = 0;
  let failedCount = 0;
  const errors = [];

  try {
    console.log("Starting project metadata recovery...");

    // Scan entire table to get all projects
    const scanCommand = new ScanCommand({
      TableName: tableName,
    });

    let items = [];
    let result;
    let lastEvaluatedKey;

    do {
      const command = new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      });

      result = await dynamo.send(command);
      items = items.concat(result.Items || []);
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Found ${items.length} projects to recover`);

    // Process each project
    for (const item of items) {
      try {
        const owner = item.owner;
        const repoName = item.repoName;

        if (!owner || !repoName) {
          console.log(
            `Skipping item with missing owner/repoName: ${JSON.stringify(item)}`,
          );
          continue;
        }

        console.log(`Recovering metadata for ${owner}/${repoName}`);

        // Fetch repository data from GitHub API
        const repoResponse = await octokit.rest.repos.get({
          owner,
          repo: repoName,
        });

        const repoData = repoResponse.data;

        // Extract metadata from GitHub response
        const description = repoData.description || "";
        const topics = repoData.topics || [];
        const htmlUrl = repoData.html_url;
        const privateRepo = repoData.private || false;
        const dateCreated = repoData.created_at;
        const dateModified = repoData.updated_at; // Get last update time from GitHub
        const forks = repoData.forks_count || 0;

        // Check if this is a fork and get parent repo info
        let parentRepo = null;
        if (repoData.fork && repoData.parent) {
          parentRepo = `${repoData.parent.owner.login}/${repoData.parent.name}`;
          console.log(`  → Detected fork of ${parentRepo}`);
        }

        // Construct URLs
        const readme = `https://raw.githubusercontent.com/${owner}/${repoName}/master/README.md?sanitize=true`;
        const contentURL = `https://raw.githubusercontent.com/${owner}/${repoName}/master/project.abundance?sanitize=true`;
        const svgURL = `https://raw.githubusercontent.com/${owner}/${repoName}/master/project.svg?sanitize=true`;
        const pngURL = `https://raw.githubusercontent.com/${owner}/${repoName}/master/project.png?sanitize=true`;

        // Build search field
        const searchField = (
          repoName +
          " " +
          owner +
          " " +
          description +
          " " +
          topics.join(" ")
        ).toLowerCase();

        // Preserve existing values that weren't truncated
        // Note: molecule usage data is lost, so ranking will start at 1 (no usage)
        // It will be recalculated by update-AP-rankings Lambda once users save projects
        const existingRanking = 1; // Start at tier 1 (no molecule usage)
        const existingUserRanking = item.userRanking || 0;
        const existingLikes = item.likes || 0;
        const existingTopMoleculeID = item.topMoleculeID || "";
        const existingGithubMoleculesUsed = item.githubMoleculesUsed || [];
        const existingUserSetAsThumbnail = item.userSetAsThumbnail || false;

        // Extract year from dateCreated for yyyy-ranking-index
        const yyyy = new Date(dateCreated).getFullYear();

        // Build update item
        const updateItem = {
          owner,
          repoName,
          description,
          topics,
          html_url: htmlUrl,
          privateRepo,
          dateCreated,
          dateModified,
          forks,
          readme,
          contentURL,
          svgURL,
          pngURL,
          searchField,
          yyyy,
          ranking: existingRanking,
          userRanking: existingUserRanking,
          likes: existingLikes,
          topMoleculeID: existingTopMoleculeID,
          githubMoleculesUsed: existingGithubMoleculesUsed,
          pullRequests: [],
          userSetAsThumbnail: existingUserSetAsThumbnail,
        };

        // Add parentRepo if it was detected as a fork
        if (parentRepo) {
          updateItem.parentRepo = parentRepo;
        }

        // Update in DynamoDB
        const putCommand = new PutCommand({
          TableName: tableName,
          Item: updateItem,
        });

        await dynamo.send(putCommand);

        console.log(`✓ Recovered ${owner}/${repoName}`);
        recoveredCount++;
      } catch (e) {
        const errorMsg = `Error recovering ${item.owner}/${item.repoName}: ${e.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        failedCount++;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        recovered: recoveredCount,
        failed: failedCount,
        errors: errors,
      }),
    };
  } catch (e) {
    console.error(`Fatal error: ${e.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: e.message,
        recovered: recoveredCount,
        failed: failedCount,
      }),
    };
  }
};
