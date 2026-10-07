import { fetchGitHubFileContent } from "./githubFileUtils.js";

/**
 * A loaded BOM baseline is text or null (file absent). Undefined means unknown.
 * Only a contents-API 404 means absent; other failures must reach the load UI.
 */
export async function loadSavedBom(octokit, owner, repo) {
  let response;
  try {
    response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "BillOfMaterials.md",
    });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
  return fetchGitHubFileContent(response.data, { octokit });
}

export function hasProjectChanges(
  lastSaved,
  projectKey,
  currentSerialized,
  bomContent,
) {
  return (
    !lastSaved ||
    lastSaved.projectKey !== projectKey ||
    lastSaved.json !== currentSerialized ||
    (bomContent != null && bomContent !== lastSaved.bom)
  );
}
