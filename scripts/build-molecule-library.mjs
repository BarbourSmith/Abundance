#!/usr/bin/env node
/**
 * Builds src/agent/moleculeLibrary.json: the curated list of GitHub molecules
 * the local AI agent is encouraged to reuse instead of writing Code atoms.
 *
 * Picks the most-used public molecules (by the usage-tier `ranking` the
 * Abundance backend computes, then by how many listed projects use each one),
 * reads each molecule's inputs and default values from its project.abundance,
 * and merges hand-written notes from src/agent/moleculeLibrary.notes.json.
 *
 * Usage: node scripts/build-molecule-library.mjs [--count 20]
 * Set GITHUB_TOKEN to avoid GitHub's unauthenticated rate limit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeProjectContentFromGitHub } from "../src/js/projectContentCodec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const OUT = path.join(root, "src/agent/moleculeLibrary.json");
const NOTES = path.join(root, "src/agent/moleculeLibrary.notes.json");
const SEARCH_URL =
  "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/scan-search-abundance";

const countArg = process.argv.indexOf("--count");
const COUNT = countArg >= 0 ? Number(process.argv[countArg + 1]) : 20;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchProjectFile(owner, repo) {
  const headers = {
    Accept: "application/vnd.github.raw",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/project.abundance`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  // Large projects may be stored gzip-compressed; decode like the app does.
  return JSON.parse(decodeProjectContentFromGitHub(await res.text()));
}

/** Plain-text summary from a README: first paragraph, no images or markup. */
function summarizeReadme(readme) {
  if (typeof readme !== "string") return "";
  const text = readme
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/^#+\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find((p) => p.length > 20);
  return text ? text.slice(0, 280) : "";
}

/** Top-level Input atoms become the molecule's inputs. */
function extractInputs(project) {
  const saved = new Map(
    (project.ioValues || []).map((v) => [v.name, v.ioValue]),
  );
  return (project.allAtoms || [])
    .filter((a) => a.atomType === "Input")
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
    .map((a) => {
      // An Input saved without a name uses the class default, "Input".
      const name = a.name || "Input";
      const type = a.type || "number";
      let value = saved.has(name) ? saved.get(name) : null;
      if (value === "__GEOMETRY_INPUT__" || type === "geometry") value = null;
      return { name, type, default: value };
    });
}

async function main() {
  const listing = await getJson(
    `${SEARCH_URL}?attribute=searchField&yearShow=2&mode=all`,
  );
  const repos = (listing.repos || []).filter((r) => !r.privateRepo);

  const usage = new Map();
  for (const r of repos) {
    for (const m of r.githubMoleculesUsed || []) {
      if (!m) continue;
      const id = `${m.owner}/${m.repoName}`;
      usage.set(id, (usage.get(id) || 0) + 1);
    }
  }
  const idOf = (r) => `${r.owner}/${r.repoName}`;
  repos.sort(
    (a, b) =>
      Number(b.ranking || 0) - Number(a.ranking || 0) ||
      (usage.get(idOf(b)) || 0) - (usage.get(idOf(a)) || 0) ||
      Number(b.userRanking || 0) - Number(a.userRanking || 0),
  );

  const notes = fs.existsSync(NOTES)
    ? JSON.parse(fs.readFileSync(NOTES, "utf8"))
    : {};

  const molecules = [];
  for (const r of repos.slice(0, COUNT)) {
    const id = idOf(r);
    let inputs = [];
    try {
      inputs = extractInputs(await fetchProjectFile(r.owner, r.repoName));
    } catch (err) {
      console.warn(`  could not read ${id}: ${err.message}`);
    }
    const description =
      (r.description || "").trim() || summarizeReadme(r.readme);
    molecules.push({
      repo: id,
      owner: r.owner,
      repoName: r.repoName,
      description,
      ...(notes[id] ? { use_for: notes[id] } : {}),
      inputs,
      usage_tier: Number(r.ranking || 0),
      used_in_listed_projects: usage.get(id) || 0,
      topics: r.topics || [],
      dateModified: r.dateModified || null,
    });
    console.log(`  ${id} (${inputs.length} inputs)`);
  }

  const missingNotes = Object.keys(notes).filter(
    (id) => !molecules.some((m) => m.repo === id),
  );
  if (missingNotes.length) {
    console.warn(
      `notes for molecules not in the list: ${missingNotes.join(", ")}`,
    );
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generated: new Date().toISOString().slice(0, 10),
        source:
          "Most-used public Abundance molecules; regenerate with scripts/build-molecule-library.mjs",
        molecules,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Wrote ${molecules.length} molecules to ${path.relative(root, OUT)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
