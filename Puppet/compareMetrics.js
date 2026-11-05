import fs from "fs";
import {
  compareTimings,
  median,
  DEFAULT_ALPHA,
  DEFAULT_MIN_EFFECT,
} from "./perfStats.js";

/**
 * Turn the output of metrics.js into the PR comment comparing two targets.
 *
 * Usage:
 *   node Puppet/compareMetrics.js metrics.json [--base base] [--pr pr]
 *     [--base-label text] [--pr-label text] [--out report.md]
 */

const HEADING = "## ⚡ Performance Metrics Comparison";
const MAX_COMMENT_LENGTH = 65500; // GitHub's limit is 65536

const TIMINGS = [
  { key: "coldLoadTimeMs", label: "Cold load" },
  { key: "warmLoadTimeMs", label: "Warm load" },
];
const GCODE_TIMINGS = [
  { key: "generationTimeMs", label: "GCode generation" },
  { key: "visualizationTimeMs", label: "GCode visualization" },
];
const SIZES = [
  { key: "cacheSize", label: "Cache size", bytes: true },
  { key: "cacheEntryCount", label: "Cache entries" },
  { key: "projectFileSize", label: "Project file", bytes: true },
];

const VERDICTS = {
  slower: "🔴 slower",
  faster: "🟢 faster",
  same: "no significant change",
  inconclusive: "❔ too noisy to tell",
};

function parseArgs(argv) {
  const options = { base: "base", pr: "pr" };
  const names = {
    "--base": "base",
    "--pr": "pr",
    "--base-label": "baseLabel",
    "--pr-label": "prLabel",
    "--out": "out",
  };
  for (let i = 0; i < argv.length; i++) {
    if (names[argv[i]]) {
      options[names[argv[i]]] = argv[++i];
    } else if (!options.file) {
      options.file = argv[i];
    } else {
      throw new Error(`Unknown argument ${argv[i]}`);
    }
  }
  if (!options.file) throw new Error("Pass the metrics.json file to compare");
  return options;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)),
    sizes.length - 1,
  );
  return `${parseFloat((bytes / 1024 ** i).toFixed(2))} ${sizes[i]}`;
}

const formatMs = (ms) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;

const formatPercent = (fraction) => {
  const value = (fraction * 100).toFixed(1);
  return `${fraction > 0 ? "+" : ""}${value === "-0.0" ? "0.0" : value}%`;
};

const formatSpread = (spread) =>
  spread === null ? "" : ` ±${Math.round(spread * 100)}%`;

function timingRow(project, label, base, pr) {
  const result = compareTimings(base, pr);
  if (result.baseMedian === null || result.prMedian === null) {
    return { result, row: `| ${project} | ${label} | – | – | not measured | |` };
  }
  const change =
    result.ciLow === null
      ? `${formatPercent(result.change)} (too few runs for a range)`
      : `${formatPercent(result.change)} (${formatPercent(result.ciLow)} to ${formatPercent(result.ciHigh)})`;
  return {
    result,
    row:
      `| ${project} | ${label} ` +
      `| ${formatMs(result.baseMedian)}${formatSpread(result.baseSpread)} ` +
      `| ${formatMs(result.prMedian)}${formatSpread(result.prSpread)} ` +
      `| ${change} | ${VERDICTS[result.verdict]} |`,
  };
}

function sizeCell(spec, base, pr) {
  const format = spec.bytes ? formatBytes : (v) => String(v);
  const baseValue = median(base);
  const prValue = median(pr);
  if (baseValue === null || prValue === null) return "–";
  // Serialized geometry can differ by a few bytes from run to run; a
  // difference no bigger than that isn't a change.
  const range = (values) => Math.max(...values) - Math.min(...values);
  const tolerance = Math.max(range(base), range(pr));
  const diff = prValue - baseValue;
  const note =
    tolerance > 0.01 * baseValue ? " <sub>varies between runs</sub>" : "";
  if (Math.abs(diff) <= tolerance) return `${format(prValue)}${note}`;
  const pct = baseValue ? ` (${formatPercent(diff / baseValue)})` : "";
  const sign = diff > 0 ? "+" : "−";
  return `${format(baseValue)} → **${format(prValue)}**<br>${sign}${format(Math.abs(diff))}${pct}${note}`;
}

async function projectFileDiff(project, baseJson, prJson) {
  let diff;
  try {
    ({ diff } = await import("jest-diff"));
  } catch {
    return null;
  }
  const text = (json) =>
    typeof json === "string" ? json : JSON.stringify(json, null, 2);
  return (
    `<details><summary>Project file changes in ${project}</summary>\n\n` +
    "```\n" +
    diff(text(baseJson), text(prJson), {
      expand: false,
      aAnnotation: "Base branch",
      bAnnotation: "PR branch",
    }) +
    "\n```\n</details>\n"
  );
}

export async function buildReport(metrics, options) {
  const { base, pr } = options;
  const runs = metrics.meta.runs;
  const projects = Object.entries(metrics.projects);
  const valid = (target) =>
    (target?.samples || []).filter((sample) => !sample.error);
  const values = (samples, key) =>
    samples.map((s) => s[key]).filter((v) => typeof v === "number");

  const timingRows = [];
  const flagged = [];
  const failures = [];
  const sizeRows = [];
  const diffs = [];

  for (const [project, targets] of projects) {
    const baseSamples = valid(targets[base]);
    const prSamples = valid(targets[pr]);
    for (const [name, target] of [
      [base, targets[base]],
      [pr, targets[pr]],
    ]) {
      const errors = (target?.samples || []).filter((s) => s.error);
      if (errors.length) {
        failures.push(
          `${project} (${name}): ${errors.length} of ${target.samples.length} runs failed: ${errors[0].error}`,
        );
      }
    }

    for (const spec of TIMINGS) {
      const { result, row } = timingRow(
        project,
        spec.label,
        values(baseSamples, spec.key),
        values(prSamples, spec.key),
      );
      timingRows.push(row);
      if (result.verdict === "slower" || result.verdict === "faster") {
        flagged.push({ project, label: spec.label, result });
      }
    }
    for (const spec of GCODE_TIMINGS) {
      const gcode = (samples) =>
        samples
          .map((s) => s.gcode?.[spec.key])
          .filter((v) => typeof v === "number" && v > 0);
      if (gcode(baseSamples).length || gcode(prSamples).length) {
        const { result, row } = timingRow(
          project,
          spec.label,
          gcode(baseSamples),
          gcode(prSamples),
        );
        timingRows.push(row);
        if (result.verdict === "slower" || result.verdict === "faster") {
          flagged.push({ project, label: spec.label, result });
        }
      }
    }

    sizeRows.push(
      `| ${project} | ` +
        SIZES.map((spec) =>
          sizeCell(
            spec,
            values(baseSamples, spec.key),
            values(prSamples, spec.key),
          ),
        ).join(" | ") +
        " |",
    );

    const baseFile = targets[base]?.projectFileRawJson;
    const prFile = targets[pr]?.projectFileRawJson;
    if (
      baseFile !== undefined &&
      prFile !== undefined &&
      JSON.stringify(baseFile) !== JSON.stringify(prFile)
    ) {
      const section = await projectFileDiff(project, baseFile, prFile);
      if (section) diffs.push(section);
    }
  }

  const slower = flagged.filter((f) => f.result.verdict === "slower");
  const faster = flagged.filter((f) => f.result.verdict === "faster");
  const describe = (f) =>
    `${f.project} ${f.label.toLowerCase()} ${formatPercent(f.result.change)}`;

  let markdown = `${HEADING}\n\n`;
  if (slower.length) {
    markdown += `**🔴 Slower:** ${slower.map(describe).join(", ")}\n\n`;
  }
  if (faster.length) {
    markdown += `**🟢 Faster:** ${faster.map(describe).join(", ")}\n\n`;
  }
  if (!slower.length && !faster.length) {
    markdown += "**No significant timing changes.**\n\n";
  }
  if (failures.length) {
    markdown += `**⚠️ Failed runs:**\n${failures.map((f) => `- ${f}`).join("\n")}\n\n`;
  }

  markdown += `| Project | Timing | Base | PR | Change (${Math.round((1 - DEFAULT_ALPHA) * 100)}% range) | |\n`;
  markdown += "| --- | --- | --- | --- | --- | --- |\n";
  markdown += timingRows.join("\n") + "\n\n";

  markdown += `| Project | ${SIZES.map((s) => s.label).join(" | ")} |\n`;
  markdown += `| --- | ${SIZES.map(() => "---").join(" | ")} |\n`;
  markdown += sizeRows.join("\n") + "\n\n";

  const labels =
    options.baseLabel || options.prLabel
      ? ` Base is ${options.baseLabel || base}; PR is ${options.prLabel || pr}.`
      : "";
  markdown +=
    `<details><summary>How to read this</summary>\n\n` +
    `Both builds were measured on the same machine, ${runs} times each, alternating between them so a slow moment on the runner hits both equally.${labels} ` +
    "GitHub responses are fetched once and replayed, so network speed doesn't count. " +
    "A load is timed from navigation until the project finishes computing; cold loads start with an empty geometry cache, warm loads reuse it.\n\n" +
    "Base and PR show the median run, and ± is how far a typical run is from it. " +
    `Change is the estimated difference, with the range it falls in at ${Math.round((1 - DEFAULT_ALPHA) * 100)}% confidence. ` +
    `A timing is marked slower or faster only when that range excludes zero and the change is at least ${Math.round(DEFAULT_MIN_EFFECT * 100)}%. ` +
    `"Too noisy to tell" means the range reaches beyond ±${Math.round(DEFAULT_MIN_EFFECT * 200)}%; re-run the job if it matters.\n\n` +
    "Sizes show a change only when it is bigger than the run-to-run variation, and are marked when that variation is over 1%.\n</details>\n";

  const withDiffs = `${markdown}\n${diffs.join("\n")}`;
  if (withDiffs.length <= MAX_COMMENT_LENGTH) return withDiffs;
  return `${markdown}\n⚠️ Project file diffs omitted: the comment would exceed GitHub's length limit. The full metrics are in the workflow artifacts.\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const metrics = JSON.parse(fs.readFileSync(options.file, "utf8"));
  const markdown = await buildReport(metrics, options);
  if (options.out) {
    fs.writeFileSync(options.out, markdown);
  } else {
    console.log(markdown);
  }
}
