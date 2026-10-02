/**
 * Brings a pull request's head branch up to date with its base branch by
 * committing a merge on the head (fork) branch through the GitHub API.
 *
 * GitHub can't merge the files Abundance regenerates on every save (project.png
 * is binary) or line-merge project.abundance reliably, so a fork that has
 * fallen behind its base shows conflicts. This resolves them the way Abundance
 * understands the files:
 * - project.abundance is merged structurally (see projectMerge.js)
 * - any other file changed on both sides takes the head's version; generated
 *   files are rebuilt on the next save anyway
 *
 * The merge commit is written to the head repo, which works for the fork owner
 * and for base maintainers when the PR allows edits from maintainers.
 */
import { mergeProjects } from "./projectMerge.js";
import { decodeProjectContentFromGitHub } from "./projectContentCodec.js";

const PROJECT_FILE = "project.abundance";

/**
 * Request headers that make the browser ask GitHub again instead of reusing a
 * cached response (GitHub API responses are cacheable for 60 seconds, so
 * branch tips and PR status would otherwise lag behind a recent push).
 */
export const NO_CACHE = { "If-None-Match": "" };

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getTreeEntries(octo, owner, repo, treeSha) {
  const { data } = await octo.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner, repo, tree_sha: treeSha, recursive: "true" },
  );
  if (data.truncated) {
    throw new Error(`The ${owner}/${repo} file list is too large to merge`);
  }
  return new Map(
    data.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, entry]),
  );
}

async function readProject(octo, owner, repo, entry) {
  if (!entry) return undefined;
  const { data } = await octo.request(
    "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
    { owner, repo, file_sha: entry.sha },
  );
  return JSON.parse(
    decodeProjectContentFromGitHub(decodeBase64Utf8(data.content)),
  );
}

const sameEntry = (a, b) => a?.sha === b?.sha && a?.mode === b?.mode;

/**
 * @param {object} octo - Authorized Octokit instance
 * @param {object} options
 * @param {string} options.baseOwner
 * @param {string} options.baseRepo
 * @param {string} options.headOwner
 * @param {string} options.headRepo
 * @param {string} [options.branch] - Branch name on both sides
 * @param {object} [options.resolutions] - Conflict id -> "main" | "head", from a previous "conflicts" result
 * @returns {Promise<{status: "up-to-date" | "synced" | "conflicts", headSha?: string, conflicts?: Array}>}
 *   headSha is the head branch's commit afterwards.
 *   "conflicts" means nothing was written: ask the user which value to keep
 *   for each conflict and call again with resolutions.
 */
export async function syncHeadWithBase(
  octo,
  { baseOwner, baseRepo, headOwner, headRepo, branch = "main", resolutions },
) {
  // Compare exact commits: comparing branch names can return stale results
  // for a few seconds after a push
  const getBranchSha = async (owner, repo) =>
    (
      await octo.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
        owner,
        repo,
        ref: `heads/${branch}`,
        headers: NO_CACHE,
      })
    ).data.object.sha;
  const [baseSha, headSha] = await Promise.all([
    getBranchSha(baseOwner, baseRepo),
    getBranchSha(headOwner, headRepo),
  ]);

  const { data: compare } = await octo.request(
    "GET /repos/{owner}/{repo}/compare/{basehead}",
    {
      owner: baseOwner,
      repo: baseRepo,
      basehead: `${baseSha}...${headOwner}:${headSha}`,
    },
  );
  if (compare.behind_by === 0) return { status: "up-to-date", headSha };

  const updateHeadRef = (sha) =>
    octo.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
      owner: headOwner,
      repo: headRepo,
      ref: `heads/${branch}`,
      sha,
      force: false,
    });

  // Head has nothing of its own yet: just fast-forward it
  if (compare.ahead_by === 0) {
    await updateHeadRef(baseSha);
    return { status: "synced", headSha: baseSha };
  }

  const { data: headCommit } = await octo.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    { owner: headOwner, repo: headRepo, commit_sha: headSha },
  );
  const [ancestorFiles, baseFiles, headFiles] = await Promise.all([
    getTreeEntries(
      octo,
      baseOwner,
      baseRepo,
      compare.merge_base_commit.commit.tree.sha,
    ),
    getTreeEntries(
      octo,
      baseOwner,
      baseRepo,
      compare.base_commit.commit.tree.sha,
    ),
    getTreeEntries(octo, headOwner, headRepo, headCommit.tree.sha),
  ]);

  // Start from the head's files and bring in what changed only on the base
  const treeChanges = [];
  const paths = new Set([
    ...ancestorFiles.keys(),
    ...baseFiles.keys(),
    ...headFiles.keys(),
  ]);
  for (const path of paths) {
    const ancestor = ancestorFiles.get(path);
    const base = baseFiles.get(path);
    const head = headFiles.get(path);
    if (sameEntry(base, head) || sameEntry(ancestor, base)) continue;

    if (sameEntry(ancestor, head)) {
      treeChanges.push(
        base
          ? { path, mode: base.mode, type: "blob", sha: base.sha }
          : { path, mode: head.mode, type: "blob", sha: null },
      );
      continue;
    }

    // Changed on both sides
    if (path === PROJECT_FILE && base && head) {
      const [ancestorProject, baseProject, headProject] = await Promise.all([
        readProject(octo, baseOwner, baseRepo, ancestor),
        readProject(octo, baseOwner, baseRepo, base),
        readProject(octo, headOwner, headRepo, head),
      ]);
      const { merged, conflicts } = mergeProjects(
        ancestorProject,
        baseProject,
        headProject,
        resolutions,
      );
      const unresolved = conflicts.filter(
        (conflict) => !resolutions?.[conflict.id],
      );
      if (unresolved.length > 0) return { status: "conflicts", conflicts };

      const { data: blob } = await octo.request(
        "POST /repos/{owner}/{repo}/git/blobs",
        {
          owner: headOwner,
          repo: headRepo,
          content: JSON.stringify(merged, null, 2),
          encoding: "utf-8",
        },
      );
      treeChanges.push({ path, mode: head.mode, type: "blob", sha: blob.sha });
    }
    // Any other file changed on both sides keeps the head's version
  }

  let treeSha = headCommit.tree.sha;
  if (treeChanges.length > 0) {
    const { data: tree } = await octo.request(
      "POST /repos/{owner}/{repo}/git/trees",
      {
        owner: headOwner,
        repo: headRepo,
        base_tree: headCommit.tree.sha,
        tree: treeChanges,
      },
    );
    treeSha = tree.sha;
  }

  const { data: mergeCommit } = await octo.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner: headOwner,
      repo: headRepo,
      message: `Merge latest changes from ${baseOwner}/${baseRepo}`,
      tree: treeSha,
      parents: [headSha, baseSha],
    },
  );
  await updateHeadRef(mergeCommit.sha);
  return { status: "synced", headSha: mergeCommit.sha };
}
