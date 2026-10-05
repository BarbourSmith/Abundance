import GlobalVariables from "./globalvariables.js";
import { encodeProjectContentForGitHub } from "./projectContentCodec.js";
import { version as appVersion } from "../../package.json";

export const BUG_REPORT_REPO = { owner: "BarbourSmith", repo: "Abundance" };
// The issues.opened workflow labels issues containing this marker as user-bug-report.
export const BUG_REPORT_MARKER = "<!-- abundance-bug-report -->";
export const OPEN_BUG_REPORT_EVENT = "abundance-open-bug-report";

const ISSUE_BODY_LIMIT = 60000;
const CONSOLE_LINES_IN_ISSUE = 200;

/** Opens the bug report dialog. `reason` and `details` prefill it for automatic prompts. */
export function openBugReport({ reason = "user", details = "" } = {}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_BUG_REPORT_EVENT, { detail: { reason, details } }),
  );
}

/** Masks credentials and email addresses. */
export function scrub(text) {
  return String(text)
    .replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}/g, "$1[redacted]")
    .replace(/\babd-[A-Za-z0-9_-]{6,}/g, "abd-[redacted]")
    .replace(
      /(authorization["']?\s*[:=]\s*["']?)(bearer|token)?\s*[^\s"',}]+/gi,
      "$1[redacted]",
    )
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
}

function formatConsoleLine({ timestamp, level, message }) {
  return `${timestamp} [${level}] ${message}`;
}

/** Everything attached to a report, scrubbed. */
export function collectBugReport({ reason = "user" } = {}) {
  let stateReport;
  try {
    stateReport = JSON.parse(GlobalVariables.getSystemStateReport());
  } catch (err) {
    stateReport = { error: `Failed to build state report: ${err}` };
  }
  const report = {
    reason,
    appVersion,
    url: window.location.href,
    userAgent: navigator.userAgent,
    reporter: GlobalVariables.currentUser ?? null,
    stateReport,
    console: GlobalVariables.recentConsole.map(formatConsoleLine),
  };
  return JSON.parse(scrub(JSON.stringify(report)));
}

function branchName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    "bug-report/" +
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** Commits the in-memory project and diagnostics to a new branch in the project's repo. */
async function pushSnapshotBranch(octokit, { owner, repo, report }) {
  const repoInfo = await octokit.rest.repos.get({ owner, repo });
  const base = repoInfo.data.default_branch;
  const baseRef = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${base}`,
  });
  const baseSha = baseRef.data.object.sha;
  const baseCommit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  const project = GlobalVariables.topLevelMolecule.serialize();
  project.filetypeVersion = 1;
  const files = {
    "project.abundance": encodeProjectContentForGitHub(
      JSON.stringify(project, null, 2),
    ).content,
    "bug-report.json": JSON.stringify(report, null, 2),
  };

  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await octokit.rest.git.createBlob({
      owner,
      repo,
      content,
      encoding: "utf-8",
    });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.data.sha });
  }
  const newTree = await octokit.rest.git.createTree({
    owner,
    repo,
    tree,
    base_tree: baseCommit.data.tree.sha,
  });
  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: "Bug report snapshot",
    tree: newTree.data.sha,
    parents: [baseSha],
  });
  const branch = branchName();
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: commit.data.sha,
  });
  return {
    branch,
    isPrivate: repoInfo.data.private,
    treeUrl: `${repoInfo.data.html_url}/tree/${branch}`,
    compareUrl: `${repoInfo.data.html_url}/compare/${base}...${encodeURIComponent(branch)}`,
  };
}

function buildIssueBody({ description, report, owner, repo, snapshot, snapshotError }) {
  const state = report.stateReport ?? {};
  const lines = [
    BUG_REPORT_MARKER,
    "## Description",
    "",
    description.trim() || "_No description provided._",
    "",
    "## Environment",
    "",
    `- Project: [${owner}/${repo}](https://github.com/${owner}/${repo})`,
    `- Reporter: @${report.reporter ?? "unknown"}`,
    `- Abundance version: ${report.appVersion}`,
    `- Trigger: ${report.reason}`,
    `- Browser: ${report.userAgent}`,
    "",
    "## Snapshot",
    "",
  ];
  if (snapshot) {
    lines.push(
      `Project and full diagnostics: [${snapshot.branch}](${snapshot.treeUrl}) ([unsaved changes](${snapshot.compareUrl}))`,
    );
    if (snapshot.isPrivate) {
      lines.push("", "_The project repo is private, so this branch may not be visible._");
    }
  } else {
    lines.push(`_Snapshot branch could not be created: ${snapshotError}_`);
  }

  const errored = state.erroredAtoms ?? [];
  if (errored.length) {
    lines.push("", "## Atoms in error", "");
    errored.slice(0, 20).forEach((a) => {
      lines.push(`- \`${a.path}\` (${a.atomType}): ${a.message ?? ""}`);
    });
  }

  const workerLogs = state.workerLogs ?? [];
  if (workerLogs.length) {
    lines.push(
      "",
      "<details><summary>Worker logs</summary>",
      "",
      "```",
      ...workerLogs.slice(-20).map((l) =>
        typeof l === "string" ? l : `${l.timestamp} [${l.level}] ${l.message}`,
      ),
      "```",
      "</details>",
    );
  }

  lines.push(
    "",
    `<details><summary>Last ${CONSOLE_LINES_IN_ISSUE} console lines</summary>`,
    "",
    "```",
    ...report.console.slice(-CONSOLE_LINES_IN_ISSUE),
    "```",
    "</details>",
  );

  let body = lines.join("\n");
  if (body.length > ISSUE_BODY_LIMIT) {
    body =
      body.slice(0, ISSUE_BODY_LIMIT) +
      "\n```\n</details>\n\n_Truncated; see the snapshot branch for everything._";
  }
  return body;
}

/** Pushes the snapshot branch and files the issue. Returns the new issue's URL. */
export async function submitBugReport(octokit, { title, description, reason }) {
  const owner = GlobalVariables.currentRepo.owner.login;
  const repo = GlobalVariables.currentRepo.name;
  const report = collectBugReport({ reason });

  let snapshot = null;
  let snapshotError = null;
  try {
    snapshot = await pushSnapshotBranch(octokit, { owner, repo, report });
  } catch (err) {
    console.error("Bug report snapshot failed:", err);
    snapshotError = err?.message || String(err);
  }

  const issue = await octokit.rest.issues.create({
    ...BUG_REPORT_REPO,
    title: `[Bug report] ${scrub(title.trim())}`,
    body: buildIssueBody({
      description: scrub(description),
      report,
      owner,
      repo,
      snapshot,
      snapshotError,
    }),
  });
  return issue.data.html_url;
}
