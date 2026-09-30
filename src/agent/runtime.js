/**
 * In-page implementation of the local agent tools (see ./tools.js).
 *
 * Everything here works on the live project graph through the same code paths
 * the editor UI uses: parameters change through each atom's own properties
 * panel handlers, atoms and connectors are placed with Molecule#placeAtom and
 * Molecule#placeConnector, and every change records the app's normal undo
 * commands. One agent edit is grouped into a single undo step.
 *
 * Loaded lazily by the bridge client only after the user turns the bridge on.
 */
import GlobalVariables from "../js/globalvariables.js";
import {
  AddAtomCommand,
  CompositeCommand,
  DeleteAtomsCommand,
  DeleteConnectorCommand,
} from "../js/undoCommands.js";
import { meshKey } from "../js/displayScheduler.js";
import {
  extractBase64FromDataURL,
  generateMeshPNG,
} from "../js/meshPNGGenerator.js";
import AttachmentPoint from "../prototypes/attachmentpoint.js";
import { ObservableEntity, Status } from "../prototypes/observableEntity.js";
import { extractBomList } from "../worker/util";
import { isTranspilerReady } from "../molecules/code.js";
import { fetchGitHubFileContent } from "../js/githubFileUtils.js";
import { Octokit } from "octokit";
import moleculeLibrary from "./moleculeLibrary.json";
import { agentBridge } from "./bridgeClient.js";
import { ERROR_CODES, ToolError } from "./protocol.js";
import { BATCHABLE_TOOLS, TOOLS_BY_NAME, isToolAllowed } from "./tools.js";

/** Window event fired after every agent edit so UI can refresh. */
export const AGENT_EDIT_EVENT = "abundance-agent-edit";
/** Window event asking the UI to make an atom the active (panel) atom. */
export const AGENT_SELECT_EVENT = "abundance-agent-select";

const MAX_STRING = 400;
/**
 * Types the agent can't add: Output is created with each molecule, Box is the
 * editor's selection-rectangle helper (also hidden from the add menu), and a
 * GitHubMolecule needs the user to pick a repository.
 */
const NOT_ADDABLE = new Set(["Output", "Box", "GitHubMolecule"]);

/**
 * Default `type` for the atoms GlobalVariables.isReferencableByName covers,
 * matching their constructors (src/molecules/input.js, constant.js).
 */
const DEFAULT_REFERENCABLE_TYPES = { Input: "number", Constant: "constant" };

/** The same molecule search the editor's GitHub search menu uses. */
const SEARCH_URL =
  "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/scan-search-abundance";

/**
 * Network access used by the library tools. Swappable so tests don't reach
 * GitHub or the search service.
 */
const SEARCH_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
]);

/**
 * Lowercase stems of a search query's words: "Flattening curved faces" ->
 * ["flat", "curv", "fac"]. Stems are matched as substrings, so they find the
 * other forms of each word too.
 */
export function searchTerms(query) {
  const words = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !SEARCH_STOP_WORDS.has(w));
  const stems = words.map((word) => {
    let stem = word;
    for (let i = 0; i < 2; i++) {
      const next = stem.replace(/(able|ible|ing|ed|es|en|er|ly|s|e)$/, "");
      if (next.length < 3) break;
      stem = next;
    }
    // "flatt" -> "flat"
    if (/([b-df-hj-np-tv-z])\1$/.test(stem) && stem.length > 3) {
      stem = stem.slice(0, -1);
    }
    return stem;
  });
  return [...new Set(stems)].slice(0, 6);
}

/** Copies and forks of another project, which clutter search results. */
function isCopy(r) {
  return Boolean(r.parentRepo) || /-copy\d*$/i.test(r.repoName);
}

const fetchers = {
  /** Parsed project.abundance of a public GitHub molecule. */
  async projectFile(owner, repo) {
    const octokit = new Octokit({
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/project.abundance",
      { owner, repo },
    );
    return JSON.parse(await fetchGitHubFileContent(response.data, { octokit }));
  },
  /** Raw search results: [{ owner, repoName, description, ranking, ... }]. */
  async search(query) {
    const url =
      `${SEARCH_URL}?attribute=searchField&yearShow=2&mode=all&query=` +
      encodeURIComponent(query);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`search failed (${res.status})`);
    return (await res.json()).repos || [];
  },
};

let atomCatalog = null;

/**
 * Describe every addable built-in atom by constructing one in a detached
 * sandbox molecule and reading its description, inputs, and panel fields.
 * Built once per page load; always matches the running code.
 */
function buildAtomCatalog() {
  if (atomCatalog) return atomCatalog;
  const types = GlobalVariables.availableTypes || {};
  const MoleculeClass = types.molecule?.creator;
  const sandbox = MoleculeClass
    ? new MoleculeClass({
        x: 0,
        y: 0,
        parent: null,
        uniqueID: "agent-catalog-sandbox",
      })
    : null;
  const categories = {};
  for (const [key, entry] of Object.entries(types)) {
    if (!entry.atomCategory || NOT_ADDABLE.has(entry.atomType)) continue;
    const item = { type: entry.atomType };
    try {
      const probe = new entry.creator({
        parent: sandbox,
        uniqueID: `agent-catalog-${key}`,
        x: 0.5,
        y: 0.5,
      });
      if (probe.description && probe.description !== "none") {
        item.description = summarizeValue(probe.description);
      }
      const inputs = (probe.inputs || []).map((ap) => {
        const input = { name: ap.name, type: ap.valueType };
        const def = ap.defaultValue ?? ap.value;
        if (def !== undefined && def !== null && ap.valueType !== "geometry") {
          input.default = summarizeValue(def);
        }
        return input;
      });
      if (inputs.length) item.inputs = inputs;
      const inputNames = new Set(inputs.map((i) => i.name));
      const fields = collectParams(probe)
        .map((p) => p.label)
        .filter((label) => !inputNames.has(label));
      if (fields.length) item.panel_fields = fields;
    } catch {
      // Some atoms need a loaded project to construct; list them by name.
    }
    (categories[entry.atomCategory] ||= []).push(item);
  }
  atomCatalog = { categories };
  return atomCatalog;
}

function libraryEntry(repo) {
  const wanted = String(repo).toLowerCase();
  return (moleculeLibrary.molecules || []).find(
    (m) => m.repo.toLowerCase() === wanted,
  );
}

function parseRepo(repo) {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(String(repo).trim());
  if (!match) {
    throw new ToolError(
      ERROR_CODES.INVALID_PARAMS,
      `"${repo}" is not a repository. Use "owner/name", e.g. "BarbourSmith/RotatePattern".`,
    );
  }
  return { owner: match[1], repoName: match[2] };
}

/**
 * The atoms the editor lets users rename (through a name field in the
 * properties panel). Every other atom keeps its type's default name.
 */
const RENAMABLE_TYPES = new Set(["Molecule", "Input", "Constant"]);

/** Name -> atom for atoms added earlier in the running apply_edits batch. */
let batchAliases = null;
const PARAM_TYPES = new Set([
  "number",
  "string",
  "boolean",
  "select",
  "range",
  "rangeSlider",
  "point",
  "color",
]);

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function isMolecule(atom) {
  return (
    !!atom &&
    (atom.atomType === "Molecule" || atom.atomType === "GitHubMolecule") &&
    Array.isArray(atom.nodesOnTheScreen)
  );
}

function topLevel() {
  const top = GlobalVariables.topLevelMolecule;
  if (!top) {
    throw new ToolError(
      ERROR_CODES.NO_PROJECT,
      "No project is open in this tab. Ask the user to open one.",
    );
  }
  return top;
}

function children(molecule) {
  return isMolecule(molecule) ? molecule.nodesOnTheScreen : [];
}

/** Depth-first walk of every atom below (and including) `root`. */
function walk(root, visit) {
  const stack = [root];
  while (stack.length) {
    const atom = stack.pop();
    visit(atom);
    const kids = children(atom);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
}

/** Path of names from the top-level molecule down to `atom`. */
export function atomPath(atom) {
  const names = [];
  let current = atom;
  while (current) {
    names.unshift(current.name ?? current.atomType ?? "?");
    current = current.parent;
  }
  return names.join("/");
}

function ancestors(atom) {
  const chain = [];
  let current = atom;
  while (current) {
    chain.unshift(current);
    current = current.parent;
  }
  return chain;
}

/**
 * Resolve an atom reference: a unique ID ("id-42") or a slash-separated path
 * of names. The top-level molecule's name may be included or left out. An
 * empty or missing reference means the molecule open in the editor.
 */
export function resolveAtom(ref, { allowEmpty = true } = {}) {
  const top = topLevel();
  if (ref === undefined || ref === null || String(ref).trim() === "") {
    if (!allowEmpty) {
      throw new ToolError(ERROR_CODES.INVALID_PARAMS, "An atom is required.");
    }
    return GlobalVariables.currentMolecule || top;
  }
  const text = String(ref).trim();

  // Inside apply_edits, names given to atoms added earlier in the batch keep
  // pointing at them even if the atom renamed itself (Equation atoms take
  // their equation as their name).
  const alias = batchAliases?.get(text);
  if (alias && ancestors(alias)[0] === top) return alias;

  // Unique IDs never contain "/". Older projects use numeric IDs, newer ones
  // "id-42", so compare as strings and fall back to a name lookup.
  if (!text.includes("/")) {
    let found = null;
    walk(top, (atom) => {
      if (!found && String(atom.uniqueID) === text) found = atom;
    });
    if (found) return found;
    if (
      /^(id-)?\d+$/.test(text) &&
      !children(top).some((a) => a.name === text)
    ) {
      throw new ToolError(ERROR_CODES.NOT_FOUND, `No atom has ID ${text}.`);
    }
  }

  const segments = text
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length && segments[0] === top.name) segments.shift();

  // A path may start from a molecule added earlier in the batch, such as
  // "leg/Output", so the agent can wire inside a molecule it just made.
  let current = top;
  const start = segments.length > 1 && batchAliases?.get(segments[0]);
  if (start && ancestors(start)[0] === top) {
    current = start;
    segments.shift();
  }
  for (let i = 0; i < segments.length; i++) {
    const name = segments[i];
    const matches = children(current).filter((a) => a.name === name);
    if (matches.length === 0) {
      const available = children(current)
        .map((a) => a.name)
        .filter((n) => n !== undefined);
      throw new ToolError(
        ERROR_CODES.NOT_FOUND,
        `No atom named "${name}" in ${atomPath(current)}. It contains: ${available.join(", ") || "nothing"}.`,
      );
    }
    if (matches.length > 1) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `Several atoms in ${atomPath(current)} are named "${name}". Use one of these IDs instead: ${matches
          .map((a) => String(a.uniqueID))
          .join(", ")}.`,
      );
    }
    current = matches[0];
  }
  return current;
}

function resolveMolecule(ref) {
  const atom = resolveAtom(ref);
  if (!isMolecule(atom)) {
    throw new ToolError(
      ERROR_CODES.INVALID_PARAMS,
      `${atomPath(atom)} is a ${atom.atomType}, not a molecule.`,
    );
  }
  return atom;
}

/** Refuse edits inside imported GitHub molecules: they belong to another repo. */
function assertEditable(atom) {
  for (const a of ancestors(atom).slice(0, -1)) {
    if (a.atomType === "GitHubMolecule") {
      throw new ToolError(
        ERROR_CODES.PERMISSION_DENIED,
        `${atomPath(atom)} is inside the imported GitHub molecule ${atomPath(a)}, which is read-only here. Edit that project instead.`,
      );
    }
  }
}

/** Refuse to add atoms to an imported GitHub molecule or anything inside one. */
function assertEditableContainer(molecule) {
  for (const a of ancestors(molecule)) {
    if (a.atomType === "GitHubMolecule") {
      throw new ToolError(
        ERROR_CODES.PERMISSION_DENIED,
        `${atomPath(molecule)} is inside the imported GitHub molecule ${atomPath(a)}, which is read-only here.`,
      );
    }
  }
}

function findInput(atom, name) {
  const input = (atom.inputs || []).find(
    (ap) => ap.name === name || ap.oldNames?.includes(name),
  );
  if (!input) {
    const names = (atom.inputs || []).map((ap) => ap.name);
    throw new ToolError(
      ERROR_CODES.NOT_FOUND,
      `${atomPath(atom)} has no input "${name}". Inputs: ${names.join(", ") || "none"}.`,
    );
  }
  return input;
}

// ---------------------------------------------------------------------------
// Serialization helpers (results must be small, JSON-safe, and acyclic)
// ---------------------------------------------------------------------------

function isGeometryValue(value) {
  return (
    !!value &&
    typeof value === "object" &&
    "geometry" in value &&
    ("dimension" in value || Array.isArray(value.geometry))
  );
}

export function summarizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? value.slice(0, MAX_STRING) + `… (${value.length} chars)`
      : value;
  }
  if (isGeometryValue(value)) {
    return `<${value.dimension || "assembly"} geometry>`;
  }
  if (Array.isArray(value)) {
    if (value.length <= 16 && value.every((v) => typeof v !== "object")) {
      return value;
    }
    return `<array of ${value.length}>`;
  }
  try {
    const json = JSON.stringify(value);
    if (json && json.length <= MAX_STRING) return JSON.parse(json);
  } catch {
    // fall through
  }
  return `<${value.constructor?.name || "object"}>`;
}

function atomRef(atom) {
  return { id: String(atom.uniqueID), path: atomPath(atom) };
}

function alertText(atom) {
  if (atom.alert && atom.alert.type && atom.alert.type !== "none") {
    return atom.alert.message || null;
  }
  return null;
}

function describeInputs(atom) {
  return (atom.inputs || []).map((ap) => {
    const entry = { name: ap.name, type: ap.valueType };
    const connector = ap.connectors?.[0];
    if (connector) {
      const source = connector.attachmentPoint1?.parentMolecule;
      if (source) entry.from = atomRef(source);
    } else {
      if (ap.currentEquation) entry.equation = ap.currentEquation;
      if (ap.valueType !== "geometry") entry.value = summarizeValue(ap.value);
    }
    if (ap.isOptional) entry.optional = true;
    return entry;
  });
}

function describeFeeds(atom) {
  if (!atom.output?.connectors) return [];
  return atom.output.connectors
    .map((c) => {
      const target = c.attachmentPoint2?.parentMolecule;
      if (!target) return null;
      return { ...atomRef(target), input: c.attachmentPoint2.name };
    })
    .filter(Boolean);
}

function describeAtomBrief(atom, depth) {
  const entry = {
    id: String(atom.uniqueID),
    name: atom.name,
    type: atom.atomType,
    status: atom.status,
  };
  const alert = alertText(atom);
  if (alert) entry.error = alert;
  const inputs = describeInputs(atom);
  if (inputs.length) entry.inputs = inputs;
  const feeds = describeFeeds(atom);
  if (feeds.length) entry.feeds = feeds;
  if (!isGeometryValue(atom.value) && atom.status === Status.READY) {
    const v = summarizeValue(atom.value);
    if (v !== null && typeof v !== "object") entry.value = v;
  }
  if (isMolecule(atom)) {
    if (depth > 1) {
      entry.atoms = children(atom).map((a) => describeAtomBrief(a, depth - 1));
    } else {
      entry.atom_count = children(atom).length;
    }
  }
  return entry;
}

/**
 * Read an atom's properties-panel fields. We pass a setter that forwards to
 * the panel's real setter and restore it afterwards, so reading params never
 * disconnects the open properties panel from the atom.
 */
function collectParams(atom) {
  const existing = atom.setInputChanged;
  const forward = (value) => {
    if (typeof existing === "function") existing(value);
  };
  let config = {};
  try {
    config = atom.createInputParams(forward) || {};
  } finally {
    atom.setInputChanged = existing;
  }
  const out = [];
  const visit = (entries) => {
    for (const [key, cfg] of entries) {
      if (!cfg || typeof cfg !== "object") continue;
      if (cfg.type === "group" && cfg.children) {
        visit(Object.entries(cfg.children));
        continue;
      }
      if (!PARAM_TYPES.has(cfg.type) || typeof cfg.onChange !== "function") {
        continue;
      }
      out.push({ key, label: cfg.label ?? key, config: cfg });
    }
  };
  visit(Object.entries(config));
  return out;
}

function describeParam({ label, config }) {
  const entry = {
    label,
    type: config.type,
    value: summarizeValue(config.value),
  };
  if (config.options) {
    entry.options = Array.isArray(config.options)
      ? config.options
      : Object.keys(config.options);
  }
  if (config.min !== undefined) entry.min = config.min;
  if (config.max !== undefined) entry.max = config.max;
  if (config.disabled) entry.disabled = "driven by a connection";
  return entry;
}

function coerceParamValue(param, value) {
  const { type, options } = param.config;
  switch (type) {
    case "number":
    case "range":
    case "rangeSlider": {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          `"${param.label}" needs a number, got ${JSON.stringify(value)}.`,
        );
      }
      return n;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `"${param.label}" needs true or false.`,
      );
    case "point": {
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        value.some((v) => !Number.isFinite(Number(v)))
      ) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          `"${param.label}" needs [x, y, z] numbers.`,
        );
      }
      return value.map(Number);
    }
    case "select": {
      const allowed = Array.isArray(options)
        ? options
        : Object.keys(options || {});
      const text = String(value);
      if (allowed.length && !allowed.includes(text)) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          `"${param.label}" must be one of: ${allowed.join(", ")}.`,
        );
      }
      return text;
    }
    default:
      if (typeof value === "object") {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          `"${param.label}" needs a text or number value.`,
        );
      }
      return String(value);
  }
}

async function summarizeGeometry(atom) {
  const value = atom.value;
  const summary = {
    dimension: value.dimension || "assembly",
  };
  const cad = GlobalVariables.cad;
  const context = atom.getContext();
  const tasks = [];
  if (cad?.getBoundingBox) {
    tasks.push(
      withTimeout(cad.getBoundingBox(value, context), 20000).then((bounds) => {
        if (bounds?.min && bounds?.max) {
          const round = (n) => Math.round(n * 1000) / 1000;
          summary.bounding_box = {
            min: bounds.min.map(round),
            max: bounds.max.map(round),
            size: bounds.max.map((v, i) => round(v - bounds.min[i])),
          };
        }
      }),
    );
  }
  if (cad?.extractParts) {
    tasks.push(
      withTimeout(cad.extractParts(value), 20000).then((leaves) => {
        if (!Array.isArray(leaves)) return;
        summary.part_count = leaves.length;
        const tags = new Set();
        const colors = new Set();
        leaves.forEach((leaf) => {
          (leaf.tags || []).forEach((t) => tags.add(t));
          if (leaf.color) colors.add(leaf.color);
        });
        if (tags.size) summary.tags = [...tags].slice(0, 50);
        if (colors.size) summary.colors = [...colors].slice(0, 20);
      }),
    );
  }
  const results = await Promise.allSettled(tasks);
  const failed = results.find((r) => r.status === "rejected");
  if (failed)
    summary.note = `Some details unavailable: ${failed.reason?.message || failed.reason}`;
  return summary;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]);
}

function requireValue(atom) {
  if (
    atom.status !== Status.READY ||
    atom.value === null ||
    atom.value === undefined
  ) {
    const alert = alertText(atom);
    throw new ToolError(
      ERROR_CODES.CONFLICT,
      `${atomPath(atom)} has no result yet (status: ${atom.status}${alert ? `, error: ${alert}` : ""}). Call wait_for_settle first.`,
    );
  }
  return atom.value;
}

function requireGeometry(atom) {
  const value = requireValue(atom);
  if (!isGeometryValue(value)) {
    throw new ToolError(
      ERROR_CODES.INVALID_PARAMS,
      `${atomPath(atom)} outputs ${typeof value}, not geometry.`,
    );
  }
  return value;
}

function notifyEdit(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENT_EDIT_EVENT, { detail }));
}

function refreshPanel(atom) {
  if (typeof atom?.setInputChanged === "function") {
    atom.setInputChanged(`agent-${Date.now()}`);
  }
}

// ---------------------------------------------------------------------------
// Undo grouping
// ---------------------------------------------------------------------------

/**
 * Run `fn` so every undo command it records becomes one CompositeCommand. If
 * `fn` throws, the recorded commands are undone so a failed edit leaves the
 * project as it was. Nested calls (apply_edits) join the outer group.
 */
async function withUndoGroup(description, fn) {
  if (GlobalVariables.undoCaptureStack) return fn();
  const captured = [];
  GlobalVariables.undoCaptureStack = captured;
  let result;
  try {
    result = await fn();
  } catch (err) {
    GlobalVariables.undoCaptureStack = null;
    for (let i = captured.length - 1; i >= 0; i--) {
      try {
        await captured[i].undo();
      } catch (rollbackErr) {
        console.error("[agent] rollback failed", rollbackErr);
      }
    }
    throw err;
  } finally {
    GlobalVariables.undoCaptureStack = null;
  }
  if (captured.length) {
    GlobalVariables.pushUndoCommand(
      new CompositeCommand(captured, `AI: ${description}`, { agent: true }),
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Navigation (mirrors double-click into a molecule and the "up" button)
// ---------------------------------------------------------------------------

function enterMolecule(molecule) {
  GlobalVariables.resetView?.();
  GlobalVariables.currentMolecule = molecule;
  molecule.enableAllChildren();
  molecule.valueWhenNavigatedIn = molecule.value;
  molecule.selected = false;
  molecule.getOutputAtom?.()?.sendToRender?.();
}

function navigateTo(molecule) {
  const chain = ancestors(molecule);
  let guard = 0;
  while (
    GlobalVariables.currentMolecule &&
    !chain.includes(GlobalVariables.currentMolecule) &&
    guard++ < 100
  ) {
    GlobalVariables.currentMolecule.goToParentMolecule();
  }
  if (!GlobalVariables.currentMolecule) {
    GlobalVariables.currentMolecule = chain[0];
  }
  const start = chain.indexOf(GlobalVariables.currentMolecule);
  for (let i = start + 1; i < chain.length; i++) enterMolecule(chain[i]);
}

function requestActiveAtom(atom) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AGENT_SELECT_EVENT, { detail: { atom } }),
  );
}

// ---------------------------------------------------------------------------
// Save hook (the editor route registers it on the bridge client, since the
// editor owns saveProject and this module is loaded lazily)
// ---------------------------------------------------------------------------

function canSave() {
  return typeof agentBridge.saveHandler === "function";
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function projectInfo() {
  const node = GlobalVariables.currentAWSnode;
  if (!node?.owner) return null;
  return {
    owner: node.owner,
    repo: node.repoName,
    name: node.name || node.repoName,
  };
}

function collectErrors() {
  const errors = [];
  let upstream = 0;
  let processing = 0;
  walk(topLevel(), (atom) => {
    if (atom.status === Status.ERROR) {
      errors.push({
        ...atomRef(atom),
        type: atom.atomType,
        message: alertText(atom) || "Unknown error",
      });
    } else if (atom.status === Status.UPSTREAM_ERROR) {
      upstream += 1;
    } else if (atom.status === Status.PROCESSING) {
      processing += 1;
    }
  });
  return { errors, blocked_by_upstream_error: upstream, processing };
}

const handlers = {
  async get_project(_args, ctx) {
    const top = topLevel();
    const current = GlobalVariables.currentMolecule || top;
    const [ready, total] = top.getCompletionTuple?.() ?? [0, 0];
    const selected = children(current)
      .filter((a) => a.selected)
      .map(atomRef);
    const { errors } = collectErrors();
    return {
      project: projectInfo(),
      top_level: {
        id: String(top.uniqueID),
        name: top.name,
        status: top.status,
      },
      units: top.unitsKey || null,
      loading: !!GlobalVariables.projectIsLoading,
      progress: { ready, total },
      open_molecule: atomRef(current),
      selected,
      error_count: errors.length,
      edits_enabled: ctx.mode === "edit",
      can_save: canSave(),
      page: typeof window !== "undefined" ? window.location.pathname : null,
    };
  },

  async list_atoms({ molecule, depth = 1 }) {
    const mol = resolveMolecule(molecule);
    return {
      molecule: atomRef(mol),
      atoms: children(mol).map((a) => describeAtomBrief(a, depth)),
    };
  },

  async get_atom({ atom: ref }) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    const detail = {
      id: String(atom.uniqueID),
      name: atom.name,
      type: atom.atomType,
      path: atomPath(atom),
      status: atom.status,
    };
    const alert = alertText(atom);
    if (alert) detail.error = alert;
    if (atom.description && atom.description !== "none") {
      detail.description = summarizeValue(atom.description);
    }
    detail.inputs = describeInputs(atom);
    detail.feeds = describeFeeds(atom);
    detail.params = collectParams(atom).map(describeParam);
    if (isMolecule(atom)) {
      detail.atom_count = children(atom).length;
      if (atom.atomType === "GitHubMolecule") detail.read_only = true;
    }
    if (atom.atomType === "Code") {
      detail.code = atom.code;
      detail.language =
        (atom.interpreterVersion ?? 0) >= 1 ? "typescript" : "javascript";
      const entries = atom.consoleEntries || [];
      const lastRun = [...entries].reverse().find((e) => e.level === "divider");
      if (lastRun) detail.last_run = lastRun.message;
      const logs = entries
        .filter((e) => e.level !== "divider")
        .slice(-20)
        .map((e) => ({
          level: e.level || "log",
          message: summarizeValue(e.message ?? ""),
        }));
      if (logs.length) detail.console = logs;
    }
    if (atom.status === Status.READY) {
      if (isGeometryValue(atom.value)) {
        detail.output = await summarizeGeometry(atom);
        if (atom.atomType === "Code" && detail.output.part_count > 1) {
          detail.warning = `This Code atom builds ${detail.output.part_count} separate parts. Give each physical part a molecule of its own, built from built-in atoms where they can do the job, and keep code to the one part it can't.`;
        }
      } else {
        detail.output = { value: summarizeValue(atom.value) };
      }
    }
    return detail;
  },

  async list_atom_types() {
    return buildAtomCatalog();
  },

  async list_library_molecules({ query }) {
    const q = query ? String(query).toLowerCase() : null;
    const molecules = (moleculeLibrary.molecules || [])
      .filter(
        (m) =>
          !q ||
          [m.repo, m.description, m.use_for]
            .filter(Boolean)
            .some((t) => t.toLowerCase().includes(q)),
      )
      .map((m) => ({
        repo: m.repo,
        ...(m.use_for ? { use_for: m.use_for } : {}),
        description: summarizeValue(m.description || ""),
        inputs: m.inputs,
        usage_tier: m.usage_tier,
      }));
    return {
      molecules,
      note: "Import with add_github_molecule. Inputs are as last saved by the molecule's author; get_atom shows the live inputs after import.",
    };
  },

  async search_molecules({ query, limit = 10 }) {
    // The search service matches one lowercase substring, so "Unroll" or
    // "unroll face" find nothing. Search each word's stem on its own and rank
    // projects by how many of the words they match.
    const terms = searchTerms(query);
    if (!terms.length) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        "Search for at least one word of three or more letters.",
      );
    }
    let batches;
    try {
      batches = await Promise.all(terms.map((t) => fetchers.search(t)));
    } catch (err) {
      throw new ToolError(
        ERROR_CODES.INTERNAL_ERROR,
        `The molecule search is unavailable: ${err.message}`,
      );
    }
    const byRepo = new Map();
    for (const r of batches.flat()) {
      if (!r || !r.owner || !r.repoName || r.privateRepo) continue;
      byRepo.set(`${r.owner}/${r.repoName}`, r);
    }
    let copies = 0;
    const scored = [];
    for (const r of byRepo.values()) {
      if (isCopy(r)) {
        copies += 1;
        continue;
      }
      const text = (
        r.searchField ||
        [r.repoName, r.owner, r.description, ...(r.topics || [])].join(" ")
      ).toLowerCase();
      scored.push({ r, matches: terms.filter((t) => text.includes(t)).length });
    }
    const molecules = scored
      .sort(
        (a, b) =>
          b.matches - a.matches ||
          Number(b.r.ranking || 0) - Number(a.r.ranking || 0),
      )
      .slice(0, limit)
      .map(({ r }) => {
        const repo = `${r.owner}/${r.repoName}`;
        return {
          repo,
          description: summarizeValue(
            String(r.description || "").slice(0, 240),
          ),
          usage_tier: Number(r.ranking || 0),
          ...(r.topics?.length ? { topics: r.topics } : {}),
          ...(libraryEntry(repo) ? { in_library: true } : {}),
        };
      });
    return {
      query,
      searched_for: terms,
      molecules,
      ...(copies ? { copies_hidden: copies } : {}),
    };
  },

  async get_errors() {
    return collectErrors();
  },

  async wait_for_settle({ timeout_ms = 120000 }, ctx) {
    const started = Date.now();
    // A tab can connect before its project has loaded; wait for one.
    let lastNotice = 0;
    while (!GlobalVariables.topLevelMolecule) {
      if (Date.now() - started >= timeout_ms) topLevel(); // throws NO_PROJECT
      if (Date.now() - lastNotice > 1000) {
        lastNotice = Date.now();
        ctx.progress?.({ message: "Waiting for a project to load" });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const top = topLevel();
    const QUIET_MS = 1000;
    let lastEpoch = -1;
    let quietSince = null;
    let lastProgressAt = 0;

    const busyCount = () => {
      let processing = 0;
      walk(top, (atom) => {
        if (atom.status === Status.PROCESSING) processing += 1;
      });
      const inFlight = GlobalVariables.cad?._pendingCalls?.length ?? 0;
      return { processing, inFlight };
    };

    for (;;) {
      const now = Date.now();
      const epoch = ObservableEntity.statusEpoch;
      const { processing, inFlight } = busyCount();
      const busy =
        processing > 0 || inFlight > 0 || GlobalVariables.projectIsLoading;
      if (busy || epoch !== lastEpoch) {
        quietSince = null;
        lastEpoch = epoch;
      } else if (quietSince === null) {
        quietSince = now;
      }

      if (now - lastProgressAt > 1000) {
        lastProgressAt = now;
        const [ready, total] = top.getCompletionTuple?.() ?? [0, 0];
        ctx.progress?.({
          progress: ready,
          total,
          message: `${ready} of ${total} atoms ready${processing ? `, ${processing} computing` : ""}`,
        });
      }

      const settled = quietSince !== null && now - quietSince >= QUIET_MS;
      if (settled || now - started >= timeout_ms) {
        const [ready, total] = top.getCompletionTuple?.() ?? [0, 0];
        const waiting = [];
        const stillProcessing = [];
        walk(top, (atom) => {
          if (atom.status === Status.WAITING && waiting.length < 20)
            waiting.push(atomRef(atom));
          if (
            atom.status === Status.PROCESSING &&
            stillProcessing.length < 20
          ) {
            stillProcessing.push(atomRef(atom));
          }
        });
        const { errors, blocked_by_upstream_error } = collectErrors();
        return {
          settled,
          elapsed_ms: now - started,
          top_level_status: top.status,
          progress: { ready, total },
          errors,
          blocked_by_upstream_error,
          ...(stillProcessing.length
            ? { still_processing: stillProcessing }
            : {}),
          ...(waiting.length ? { waiting_on_inputs: waiting } : {}),
        };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  },

  async get_state_report() {
    const report = GlobalVariables.getSystemStateReport();
    try {
      return JSON.parse(report);
    } catch {
      return { report };
    }
  },

  async get_worker_logs({ limit = 50 }) {
    const logs = GlobalVariables.cad?._workerLogs || [];
    return { logs: logs.slice(-limit) };
  },

  async get_bom({ atom: ref }) {
    const atom = ref ? resolveAtom(ref) : topLevel();
    const value = requireGeometry(atom);
    const items = new Map();
    for (const el of extractBomList(value) || []) {
      if (!el?.BOMitemName) continue;
      const item = items.get(el.BOMitemName) || {
        item: el.BOMitemName,
        quantity: 0,
        cost_usd: 0,
        source: el.source || null,
      };
      item.quantity += Number(el.numberNeeded) || 0;
      item.cost_usd =
        Math.round((item.cost_usd + (Number(el.costUSD) || 0)) * 100) / 100;
      items.set(el.BOMitemName, item);
    }
    const list = [...items.values()].sort((a, b) =>
      String(a.source).localeCompare(String(b.source)),
    );
    const total =
      Math.round(list.reduce((s, i) => s + i.cost_usd, 0) * 100) / 100;
    return { atom: atomRef(atom), items: list, total_cost_usd: total };
  },

  async get_readme({ molecule }) {
    const mol = molecule ? resolveMolecule(molecule) : topLevel();
    const sections = (await mol.requestReadme()) || [];
    const text = (Array.isArray(sections) ? sections : [sections])
      .map((section) =>
        typeof section === "string" ? section : section?.readMeText,
      )
      .filter((t) => typeof t === "string" && t.trim().length > 0)
      // Drop embedded SVG image links; they point at files the agent can't open.
      .map((t) => t.replace(/!\[readme\]\(\/readme[^)]*\)/g, "").trim())
      .join("\n\n");
    const result = { molecule: atomRef(mol), readme: text };
    if (!mol.parent && GlobalVariables.currentAWSnode?.description) {
      result.project_description = GlobalVariables.currentAWSnode.description;
    }
    return result;
  },

  async render_image({ atom: ref, view = "iso", size = 800 }) {
    const atom = ref
      ? resolveAtom(ref)
      : GlobalVariables.currentMolecule || topLevel();
    const value = requireGeometry(atom);
    const context = atom.getContext();
    const meshTask = GlobalVariables.displayScheduler
      ? GlobalVariables.displayScheduler.run(
          "generateDisplayMesh",
          [value, context],
          meshKey(value, context),
        )
      : GlobalVariables.pool
          .proxy()
          .then((worker) => worker.generateDisplayMesh(value, context));
    const result = await withTimeout(meshTask, 240000);
    const mesh = result?.mesh;
    if (!mesh || !mesh.length) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `${atomPath(atom)} produced no visible mesh.`,
      );
    }
    const dataUrl = await generateMeshPNG(mesh, size, size, {
      view,
      fit: true,
    });
    if (!dataUrl) {
      throw new ToolError(
        ERROR_CODES.INTERNAL_ERROR,
        "Rendering the PNG failed.",
      );
    }
    return {
      base64: extractBase64FromDataURL(dataUrl),
      mimeType: "image/png",
      atom: atomRef(atom),
      view,
      size,
    };
  },

  async export_geometry({ atom: ref, format }) {
    const atom = ref
      ? resolveAtom(ref)
      : GlobalVariables.currentMolecule || topLevel();
    const value = requireGeometry(atom);
    const units = topLevel().unitsKey;
    const blob = await GlobalVariables.cad.downExport(
      value,
      format,
      96,
      units,
      atom.getContext(),
      units === "Inches" ? 0.002 : 0.05,
    );
    const buffer = await blob.arrayBuffer();
    return {
      filename: `${atom.name || "export"}.${format.toLowerCase()}`,
      base64: arrayBufferToBase64(buffer),
      format,
      units: units || null,
      atom: atomRef(atom),
    };
  },

  async get_gcode({ atom: ref }) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    if (atom.atomType !== "Gcode") {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${atomPath(atom)} is not a Gcode atom.`,
      );
    }
    if (!atom.gcodeGenerated || !atom.gcodeString) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `${atomPath(atom)} has not generated G-code yet (status: ${atom.status}).`,
      );
    }
    const lines = atom.gcodeString.split("\n");
    return {
      filename: `${atom.findIOValue?.("Part Name") || atom.name || "output"}.gcode`,
      text: atom.gcodeString,
      lines: lines.length,
      preview: lines.slice(0, 15).join("\n"),
      atom: atomRef(atom),
    };
  },

  async get_undo_history() {
    const stack = GlobalVariables.undoCommandStack || [];
    return {
      steps: [...stack].reverse().map((cmd) => ({
        description: cmd.description || cmd.constructor?.name || "change",
        by_agent: !!cmd.isAgentCommand,
      })),
    };
  },

  async select_atom({ atom: ref }) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    if (!atom.parent) {
      navigateTo(atom);
      requestActiveAtom(atom);
      return { selected: atomRef(atom), open_molecule: atomRef(atom) };
    }
    navigateTo(atom.parent);
    children(atom.parent).forEach((a) => {
      a.selected = false;
    });
    atom.parent.selected = false;
    atom.selected = true;
    if (atom.status === Status.READY) atom.sendToRender();
    requestActiveAtom(atom);
    return { selected: atomRef(atom), open_molecule: atomRef(atom.parent) };
  },

  async open_molecule({ molecule }) {
    // "" means the top level here, not "the molecule already open".
    const text = String(molecule).trim();
    const mol =
      text === "" || text === "/" ? topLevel() : resolveMolecule(molecule);
    navigateTo(mol);
    mol.selected = true;
    requestActiveAtom(mol);
    return { open_molecule: atomRef(mol) };
  },

  // ------------------------------------------------------------- edits

  async set_param({ atom: ref, param, value }) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    assertEditable(atom);
    const params = collectParams(atom);
    const matches = params.filter((p) => p.label === param);
    const target = matches[0] || params.find((p) => p.key === param);
    if (!target) {
      throw new ToolError(
        ERROR_CODES.NOT_FOUND,
        `${atomPath(atom)} has no editable parameter "${param}". Parameters: ${params.map((p) => p.label).join(", ") || "none"}.`,
      );
    }
    if (target.config.disabled) {
      const connected = (atom.inputs || []).some(
        (ap) => ap.name === target.label && ap.connectors?.length,
      );
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        connected
          ? `"${param}" on ${atomPath(atom)} is driven by a connection. Disconnect it first.`
          : `"${param}" on ${atomPath(atom)} is locked in the editor and can't be changed.`,
      );
    }
    const coerced = coerceParamValue(target, value);
    const nameBefore = atom.name;
    await target.config.onChange(coerced);
    refreshPanel(atom);
    const after = collectParams(atom).find((p) => p.label === target.label);
    const result = {
      atom: atomRef(atom),
      param: target.label,
      value: after
        ? summarizeValue(after.config.value)
        : summarizeValue(coerced),
    };
    if (atom.name !== nameBefore) {
      result.renamed = {
        from: nameBefore,
        to: atom.name,
        note: "Refer to this atom by its new path or ID.",
      };
    }
    return result;
  },

  async set_code({ atom: ref, code, compiled_code }) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    assertEditable(atom);
    if (atom.atomType !== "Code") {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${atomPath(atom)} is not a Code atom.`,
      );
    }
    const isTs = (atom.interpreterVersion ?? 0) >= 1;
    if (isTs && !isTranspilerReady() && typeof compiled_code !== "string") {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        "TypeScript can't be compiled in the page until the code editor has been opened, and no compiled code was supplied.",
      );
    }
    await atom.updateCode(
      code,
      typeof compiled_code === "string" ? compiled_code : null,
    );
    return {
      atom: atomRef(atom),
      language: isTs ? "typescript" : "javascript",
      inputs: (atom.inputs || []).map((ap) => ({
        name: ap.name,
        type: ap.valueType,
      })),
      status: atom.status,
      ...(alertText(atom) ? { error: alertText(atom) } : {}),
    };
  },

  async compute_cut_layout({ atom: ref, action = "compute" }, ctx) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    assertEditable(atom);
    if (typeof atom.computeValueButton !== "function") {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${atomPath(atom)} is not a Cut Layout atom.`,
      );
    }
    if (atom.computing || atom.status === Status.PROCESSING) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `${atomPath(atom)} is already computing. Call wait_for_settle, then try again.`,
      );
    }
    if (!atom.inputsAreReady()) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `${atomPath(atom)} has no geometry to lay out yet. Connect its geometry input (usually from a Cut Orient atom) and call wait_for_settle first.`,
      );
    }
    // The panel's buttons take the panel's setter; forward to it so an open
    // properties panel keeps tracking the layout, as when the user clicks.
    const existing = atom.setInputChanged;
    const forward = (value) => {
      if (typeof existing === "function") existing(value);
    };
    if (action === "reset") {
      atom.placements = [];
      atom.placementsFor = "";
      atom.createDefaultPlacements();
    } else {
      atom.computeValueButton(forward);
    }

    const started = Date.now();
    const TIMEOUT_MS = 4 * 60_000;
    let lastProgressAt = 0;
    while (atom.computing || atom.status === Status.PROCESSING) {
      if (Date.now() - started > TIMEOUT_MS) {
        throw new ToolError(
          ERROR_CODES.TIMEOUT,
          `${atomPath(atom)} was still laying out parts after ${TIMEOUT_MS / 60_000} minutes.`,
        );
      }
      if (Date.now() - lastProgressAt > 1000) {
        lastProgressAt = Date.now();
        ctx.progress?.({
          progress: Math.round((atom.progress || 0) * 100),
          total: 100,
          message: "Laying out parts",
        });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    refreshPanel(atom);

    const sheets = atom.getPlacements() || [];
    const result = {
      atom: atomRef(atom),
      status: atom.status,
      sheets: sheets.length,
      parts_placed: sheets.flat().length,
    };
    const alert = alertText(atom);
    if (alert)
      result[atom.status === Status.ERROR ? "error" : "warning"] = alert;
    return result;
  },

  async reset_atom_names({ molecule }) {
    const root = molecule ? resolveMolecule(molecule) : topLevel();
    assertEditableContainer(root);
    // Default names come from the atom classes themselves (some differ from
    // the type, e.g. "Shrink Wrap"), read from a throwaway instance.
    const types = GlobalVariables.availableTypes || {};
    const MoleculeClass = types.molecule?.creator;
    const sandbox = MoleculeClass
      ? new MoleculeClass({
          x: 0,
          y: 0,
          parent: null,
          uniqueID: "agent-names-sandbox",
        })
      : null;
    const defaults = new Map();
    const defaultName = (atomType) => {
      if (defaults.has(atomType)) return defaults.get(atomType);
      const entry = Object.entries(types).find(
        ([, t]) => t.atomType === atomType,
      );
      let value = null;
      try {
        if (entry) {
          value = new entry[1].creator({
            parent: sandbox,
            uniqueID: `agent-names-${entry[0]}`,
            x: 0.5,
            y: 0.5,
          }).name;
        }
      } catch {
        value = null;
      }
      defaults.set(atomType, value);
      return value;
    };

    const renamed = [];
    const visit = (mol) => {
      for (const atom of children(mol)) {
        if (atom.atomType === "GitHubMolecule") continue; // its insides belong to another repo
        if (isMolecule(atom)) visit(atom);
        // Renamable atoms, Equations (named after their equation), and
        // Outputs keep their names.
        if (
          RENAMABLE_TYPES.has(atom.atomType) ||
          atom.atomType === "Equation" ||
          atom.atomType === "Output"
        ) {
          continue;
        }
        const standard = defaultName(atom.atomType);
        if (!standard || atom.name === standard) continue;
        const from = atom.name;
        atom.name = standard;
        GlobalVariables.pushUndoCommand({
          description: `Rename ${standard}`,
          undo: async () => {
            atom.name = from;
          },
        });
        renamed.push({ id: String(atom.uniqueID), from, to: standard });
      }
    };
    visit(root);
    return { molecule: atomRef(root), renamed };
  },

  async add_github_molecule({ repo, molecule, x, y, ref }) {
    const { owner, repoName } = parseRepo(repo);
    const mol = resolveMolecule(molecule);
    assertEditableContainer(mol);

    // The source record the editor keeps on a GitHub molecule (used for
    // reloading and shown in its panel). Small on purpose: it is saved.
    let parentRepo = { owner, repoName, privateRepo: false };
    const known = libraryEntry(`${owner}/${repoName}`);
    if (known?.dateModified) parentRepo.dateModified = known.dateModified;
    if (!known) {
      try {
        const hit = (await fetchers.search(repoName)).find(
          (r) => r.owner === owner && r.repoName === repoName,
        );
        if (hit?.privateRepo) {
          throw new ToolError(
            ERROR_CODES.PERMISSION_DENIED,
            `${owner}/${repoName} is private; the agent can only import public molecules.`,
          );
        }
        if (hit?.dateModified) parentRepo.dateModified = hit.dateModified;
      } catch (err) {
        if (err instanceof ToolError) throw err;
        // Search is only for metadata; carry on without it.
      }
    }

    let project;
    try {
      project = await fetchers.projectFile(owner, repoName);
    } catch (err) {
      throw new ToolError(
        ERROR_CODES.NOT_FOUND,
        `Couldn't load ${owner}/${repoName} from GitHub: ${err.message}`,
      );
    }
    if (!project || !Array.isArray(project.allAtoms)) {
      throw new ToolError(
        ERROR_CODES.NOT_FOUND,
        `${owner}/${repoName} doesn't contain an Abundance project.`,
      );
    }

    // Same steps as the editor's loader: fresh IDs, then place as a
    // GitHubMolecule. Done here so it targets `mol` and can be awaited.
    const copy = mol.remapIDs(project);
    copy.atomType = "GitHubMolecule";
    const uniqueID = GlobalVariables.generateUniqueID();
    const siblings = children(mol).filter((a) => a.atomType !== "Output");
    const maxX = siblings.reduce((m, a) => Math.max(m, Number(a.x) || 0), 0.1);
    const placed = await mol.placeAtom(copy, false, {
      uniqueID,
      parentRepo,
      x: x ?? Math.min(0.85, maxX + 0.08),
      y: y ?? 0.2 + (siblings.length % 6) * 0.12,
      topLevel: false,
      lastReloadedFromGithubAt: Date.now(),
    });
    const atom =
      (placed && String(placed.uniqueID) === String(uniqueID) && placed) ||
      children(mol).find((a) => String(a.uniqueID) === String(uniqueID));
    if (!atom) {
      throw new ToolError(
        ERROR_CODES.INTERNAL_ERROR,
        `Could not place ${owner}/${repoName}.`,
      );
    }
    GlobalVariables.pushUndoCommand(
      new AddAtomCommand(atom.uniqueID, mol, `Add ${owner}/${repoName}`),
    );
    atom.enable?.();
    return {
      ...atomRef(atom),
      repo: `${owner}/${repoName}`,
      inputs: (atom.inputs || []).map((ap) => ({
        name: ap.name,
        type: ap.valueType,
      })),
    };
  },

  async add_atom({ type, molecule, name, x, y, reason, ref }) {
    const mol = resolveMolecule(molecule);
    assertEditableContainer(mol);
    const wanted = String(type).toLowerCase();
    const entry = Object.entries(GlobalVariables.availableTypes || {}).find(
      ([key, t]) =>
        key.toLowerCase() === wanted || t.atomType?.toLowerCase() === wanted,
    )?.[1];
    if (!entry || NOT_ADDABLE.has(entry.atomType)) {
      throw new ToolError(
        ERROR_CODES.NOT_FOUND,
        `Unknown atom type "${type}". Call list_atom_types for the options.`,
      );
    }
    if (name && !RENAMABLE_TYPES.has(entry.atomType)) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${entry.atomType} atoms keep their standard name in Abundance; only Molecule, Input, and Constant atoms can be named. ` +
          'Use "ref" to refer to it later in the same apply_edits batch, or use the ID this tool returns.',
      );
    }
    if (entry.atomType === "Code" && !String(reason || "").trim()) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        'Adding a Code atom needs a "reason": say why no built-in atom (list_atom_types) or library molecule (list_library_molecules) can do this job.',
      );
    }

    const siblings = children(mol).filter((a) => a.atomType !== "Output");
    const maxX = siblings.reduce((m, a) => Math.max(m, Number(a.x) || 0), 0.1);
    const obj = {
      atomType: entry.atomType,
      parent: mol,
      parentMolecule: mol,
      uniqueID: GlobalVariables.generateUniqueID(),
      x: x ?? Math.min(0.85, maxX + 0.08),
      y: y ?? 0.2 + (siblings.length % 6) * 0.12,
    };
    if (name) obj.name = name;
    if (GlobalVariables.isReferencableByName(obj)) {
      obj.name = GlobalVariables.incrementVariableName(
        obj.name || entry.atomType,
        mol,
      );
      // Molecule#placeAtom copies `type` from this object for named Inputs
      // and Constants (it expects a saved atom). Pass the default, or the new
      // atom's type is blanked and it saves without one.
      obj.type = DEFAULT_REFERENCABLE_TYPES[entry.atomType];
    }

    const placed = await mol.placeAtom(obj, false);
    const atom =
      (placed && placed.uniqueID === obj.uniqueID && placed) ||
      children(mol).find((a) => a.uniqueID === obj.uniqueID);
    if (!atom) {
      throw new ToolError(
        ERROR_CODES.INTERNAL_ERROR,
        `Could not place a ${entry.atomType} atom.`,
      );
    }
    // Molecules take their name from the placement object; Inputs and
    // Constants were named (and de-duplicated) above. Nothing else is named.
    GlobalVariables.pushUndoCommand(
      new AddAtomCommand(atom.uniqueID, mol, `Add ${atom.atomType}`),
    );
    atom.enable?.();
    const output = isMolecule(atom) ? atom.getOutputAtom?.() : null;
    return {
      ...atomRef(atom),
      type: atom.atomType,
      inputs: (atom.inputs || []).map((ap) => ({
        name: ap.name,
        type: ap.valueType,
      })),
      ...(output ? { output: atomRef(output) } : {}),
    };
  },

  async connect({ from, to, input }) {
    const source = resolveAtom(from, { allowEmpty: false });
    const target = resolveAtom(to, { allowEmpty: false });
    assertEditable(target);
    if (source.parent !== target.parent) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${atomPath(source)} and ${atomPath(target)} are in different molecules. Connections only link atoms in the same molecule; use the molecule's Input and Output atoms to cross levels.`,
      );
    }
    if (!source.output) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${atomPath(source)} has no output.`,
      );
    }
    const ap = findInput(target, input);
    if (!AttachmentPoint.areTypesCompatible(source.output, ap)) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `Can't connect ${source.output.valueType} output of ${atomPath(source)} to ${ap.valueType} input "${ap.name}".`,
      );
    }
    try {
      target.parent.placeConnector({
        ap1ID: source.uniqueID,
        ap2ID: target.uniqueID,
        ap2Name: ap.name,
      });
    } catch (err) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `Connection refused: ${err.message}`,
      );
    }
    const connected =
      ap.connectors?.[0]?.attachmentPoint1?.parentMolecule === source;
    if (!connected) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `The editor refused to connect ${atomPath(source)} to "${ap.name}" on ${atomPath(target)}.`,
      );
    }
    return { from: atomRef(source), to: atomRef(target), input: ap.name };
  },

  async disconnect({ atom: ref, input }) {
    const atom = resolveAtom(ref, { allowEmpty: false });
    assertEditable(atom);
    const ap = findInput(atom, input);
    const connector = ap.connectors?.[0];
    if (!connector) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `Input "${ap.name}" on ${atomPath(atom)} is not connected.`,
      );
    }
    const source = connector.attachmentPoint1.parentMolecule;
    GlobalVariables.pushUndoCommand(
      new DeleteConnectorCommand(
        { ap1ID: source.uniqueID, ap2ID: atom.uniqueID, ap2Name: ap.name },
        atom.parent,
      ),
    );
    ap.deleteConnector(connector);
    return { atom: atomRef(atom), input: ap.name, was_from: atomRef(source) };
  },

  async delete_atoms({ atoms: refs }) {
    const atoms = [
      ...new Set(refs.map((r) => resolveAtom(r, { allowEmpty: false }))),
    ];
    const parent = atoms[0].parent;
    for (const atom of atoms) {
      assertEditable(atom);
      if (!atom.parent) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          "The top-level molecule can't be deleted.",
        );
      }
      if (atom.parent !== parent) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          "All atoms in one delete_atoms call must be in the same molecule.",
        );
      }
      if (atom.atomType === "Output") {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          "A molecule's Output atom can't be deleted.",
        );
      }
    }
    const connectorSnapshots = [];
    atoms.forEach((atom) => {
      atom.output?.connectors.forEach((conn) => {
        const other = conn.attachmentPoint2.parentMolecule;
        if (!atoms.includes(other)) {
          connectorSnapshots.push({
            ap1ID: atom.uniqueID,
            ap2ID: other.uniqueID,
            ap2Name: conn.attachmentPoint2.name,
          });
        }
      });
      atom.inputs.forEach((ap) => {
        ap.connectors.forEach((conn) => {
          const other = conn.attachmentPoint1.parentMolecule;
          if (!atoms.includes(other)) {
            connectorSnapshots.push({
              ap1ID: other.uniqueID,
              ap2ID: atom.uniqueID,
              ap2Name: ap.name,
            });
          }
        });
      });
    });
    GlobalVariables.pushUndoCommand(
      new DeleteAtomsCommand(
        atoms.map((a) => a.serialize()),
        connectorSnapshots,
        parent,
      ),
    );
    const deleted = atoms.map(atomRef);
    atoms.forEach((atom) => atom.deleteNode());
    if (GlobalVariables.currentMolecule === parent) requestActiveAtom(parent);
    return { deleted };
  },

  async apply_edits({ edits }, ctx) {
    const results = [];
    const outer = batchAliases;
    batchAliases = new Map(outer || []);
    try {
      return await runBatch(edits, ctx, results);
    } finally {
      batchAliases = outer;
    }
  },

  async undo() {
    const stack = GlobalVariables.undoCommandStack || [];
    const topCmd = stack[stack.length - 1];
    if (!topCmd) {
      throw new ToolError(ERROR_CODES.CONFLICT, "There is nothing to undo.");
    }
    if (!topCmd.isAgentCommand) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        `The newest undo step ("${topCmd.description}") was made by the user, so the agent won't undo it.`,
      );
    }
    const done = await topLevel().undo();
    return { undone: done?.description || topCmd.description };
  },

  async save_project({ reason }) {
    if (!canSave()) {
      throw new ToolError(
        ERROR_CODES.CONFLICT,
        "This tab can't save: saving is only available in the editor for a project the user can write to.",
      );
    }
    return agentBridge.saveHandler(
      reason || "The AI agent asked to save the project.",
    );
  },
};

/** Run apply_edits' edits in order; the caller's undo group rolls back on failure. */
async function runBatch(edits, ctx, results) {
  for (let i = 0; i < edits.length; i++) {
    const { tool, arguments: args = {} } = edits[i] || {};
    if (!BATCHABLE_TOOLS.includes(tool)) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `Edit ${i + 1}: "${tool}" can't be used in apply_edits. Allowed: ${BATCHABLE_TOOLS.join(", ")}.`,
      );
    }
    validateArgs(TOOLS_BY_NAME[tool], args, `Edit ${i + 1} (${tool}): `);
    try {
      const result = await handlers[tool](args, ctx);
      if (
        (tool === "add_atom" || tool === "add_github_molecule") &&
        result?.id
      ) {
        for (const handle of [args.ref, args.name]) {
          if (handle) batchAliases.set(String(handle), resolveAtom(result.id));
        }
      }
      results.push({ tool, result });
    } catch (err) {
      throw new ToolError(
        err.code ?? ERROR_CODES.INTERNAL_ERROR,
        `Edit ${i + 1} (${tool}) failed, so none of the ${edits.length} edits were applied: ${err.message}`,
      );
    }
  }
  return { applied: results.length, results };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Validation and dispatch
// ---------------------------------------------------------------------------

function typeMatches(schema, value) {
  if (!schema || !schema.type) return true;
  switch (schema.type) {
    case "string":
      // Atom IDs from older projects are numbers; accept them as references.
      return (
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value))
      );
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return !!value && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

/** Arguments the bridge adds on its own (never shown to the model). */
const BRIDGE_ADDED_ARGS = new Set(["compiled_code"]);

export function validateArgs(tool, args, prefix = "") {
  const schema = tool.inputSchema || {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new ToolError(
      ERROR_CODES.INVALID_PARAMS,
      `${prefix}arguments must be an object.`,
    );
  }
  for (const key of schema.required || []) {
    if (args[key] === undefined || args[key] === null) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${prefix}"${key}" is required.`,
      );
    }
  }
  const known = schema.properties || {};
  for (const key of Object.keys(args)) {
    if (!(key in known) && !BRIDGE_ADDED_ARGS.has(key)) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${prefix}unknown argument "${key}". Expected: ${Object.keys(known).join(", ") || "none"}.`,
      );
    }
  }
  for (const [key, prop] of Object.entries(known)) {
    const value = args[key];
    if (value === undefined) continue;
    if (!typeMatches(prop, value)) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${prefix}"${key}" must be a ${prop.type}.`,
      );
    }
    if (prop.enum && !prop.enum.includes(value)) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${prefix}"${key}" must be one of ${prop.enum.join(", ")}.`,
      );
    }
    if (typeof value === "number") {
      if (prop.minimum !== undefined && value < prop.minimum) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          `${prefix}"${key}" must be at least ${prop.minimum}.`,
        );
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        throw new ToolError(
          ERROR_CODES.INVALID_PARAMS,
          `${prefix}"${key}" must be at most ${prop.maximum}.`,
        );
      }
    }
    if (
      Array.isArray(value) &&
      prop.minItems !== undefined &&
      value.length < prop.minItems
    ) {
      throw new ToolError(
        ERROR_CODES.INVALID_PARAMS,
        `${prefix}"${key}" needs at least ${prop.minItems} item(s).`,
      );
    }
  }
}

function nameFor(ref) {
  try {
    return resolveAtom(ref, { allowEmpty: false }).name || String(ref);
  } catch {
    return String(ref);
  }
}

function describeEdit(name, args) {
  switch (name) {
    case "set_param":
      return `set ${args.param} on ${nameFor(args.atom)}`;
    case "set_code":
      return `edit code of ${nameFor(args.atom)}`;
    case "add_atom": {
      const what = args.name ? `${args.type} "${args.name}"` : args.type;
      return args.reason
        ? `add ${what} (${String(args.reason).slice(0, 80)})`
        : `add ${what}`;
    }
    case "add_github_molecule":
      return `import ${args.repo}`;
    case "reset_atom_names":
      return "restore standard atom names";
    case "compute_cut_layout":
      return `${args.action === "reset" ? "reset" : "compute"} layout of ${nameFor(args.atom)}`;
    case "connect":
      return `connect ${nameFor(args.from)} to ${nameFor(args.to)}`;
    case "disconnect":
      return `disconnect ${args.input} on ${nameFor(args.atom)}`;
    case "delete_atoms":
      return `delete ${args.atoms.length} atom${args.atoms.length === 1 ? "" : "s"}`;
    case "apply_edits":
      return args.description;
    default:
      return name;
  }
}

/**
 * Run one tool call from the bridge.
 * @param {string} name
 * @param {object} args
 * @param {{ mode: "read"|"edit", progress?: (p: object) => void }} ctx
 */
export async function runTool(name, args = {}, ctx = { mode: "read" }) {
  const tool = TOOLS_BY_NAME[name];
  const impl = handlers[name];
  if (!tool || !impl) {
    throw new ToolError(ERROR_CODES.METHOD_NOT_FOUND, `Unknown tool ${name}.`);
  }
  if (!isToolAllowed(name, ctx.mode)) {
    throw new ToolError(
      ERROR_CODES.PERMISSION_DENIED,
      'Edits are turned off in the page. Ask the user to turn on "Allow edits" in the AI agent chip at the top of the Abundance window.',
    );
  }
  validateArgs(tool, args);

  if (
    tool.permission !== "edit" ||
    name === "undo" ||
    name === "save_project"
  ) {
    const result = await impl(args, ctx);
    if (name === "undo") notifyEdit({ tool: name });
    return result;
  }

  const result = await withUndoGroup(describeEdit(name, args), () =>
    impl(args, ctx),
  );
  notifyEdit({ tool: name });
  return result;
}

export const __test__ = { handlers, collectParams, withUndoGroup, fetchers };
