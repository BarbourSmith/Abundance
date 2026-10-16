import GlobalVariables from "./globalvariables.js";

/** The commit message the thumbnail dialog uses when the user sets project.png. */
export const USER_THUMBNAIL_COMMIT = "Update project thumbnail";

/**
 * Whether project.png is a thumbnail the user set from the thumbnail dialog,
 * which saves must not replace.
 *
 * The flag on currentAWSnode isn't enough on its own: thumbnails set before it
 * was stored correctly don't have it, and a thumbnail set in another tab after
 * this one loaded isn't in this tab's copy. GitHub's history settles it: the
 * dialog's commit is the last one that touched project.png.
 */
export async function hasUserSetThumbnail(octokit, owner, repo) {
  const node = GlobalVariables.currentAWSnode;
  if (node?.userSetAsThumbnail) return true;
  try {
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path: "project.png",
      per_page: 1,
      // The browser may cache this, which would miss a thumbnail just set
      request: {
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
    });
    const userSet = data[0]?.commit?.message === USER_THUMBNAIL_COMMIT;
    if (userSet && node) node.userSetAsThumbnail = true;
    return userSet;
  } catch (err) {
    console.warn("Couldn't check whether project.png was set by the user:", err);
    return false;
  }
}
