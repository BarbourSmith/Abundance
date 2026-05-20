/**
 * @file Parses the `run(...)` signature out of a Code atom's TypeScript
 * source into a structured list of argument descriptors.
 *
 * We can't pull in the real `typescript` compiler (~10MB) and Monaco's TS
 * worker is async-only, so we hand-roll a tiny bracket-depth scanner.
 * Each step is a small private helper; the only public entry point is
 * `parseCodeHeader(srcCode)`.
 */

/** @typedef {"number" | "string" | "boolean" | "geometry"} AbundanceValueType */

/**
 * @typedef {Object} ParsedArg
 * @property {string} name - Parameter name (a valid JS identifier).
 * @property {AbundanceValueType} type - Abundance value type derived from
 *   the TS type annotation. Anything not a primitive becomes `"geometry"`.
 * @property {boolean} isOptional - True if the parameter has a `?` marker
 *   or an explicit default value.
 * @property {number|string|boolean|null|undefined} defaultValue - Parsed
 *   JS literal of the default expression. `undefined` when no default was
 *   declared and the type is not geometry; `null` for geometry inputs
 *   without an explicit default.
 */

/** Characters that open a bracket pair we want to track. */
const OPEN_BRACKETS = "([{<";
/** Characters that close a bracket pair we want to track. */
const CLOSE_BRACKETS = ")]}>";

/**
 * Find the substring inside the parentheses of a top-level
 * `function run(...)` declaration. Returns the inner text, or null if
 * `run` is missing / parens are unbalanced.
 */
function extractRunSignature(src) {
  const startIdx = src.search(/\bfunction\s+run\s*\(/);
  if (startIdx === -1) return null;
  const openParen = src.indexOf("(", startIdx);

  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (OPEN_BRACKETS.includes(c)) depth++;
    else if (CLOSE_BRACKETS.includes(c)) {
      depth--;
      if (depth === 0 && c === ")") {
        return src.substring(openParen + 1, i);
      }
    }
  }
  return null;
}

/**
 * Find the index of the first character in `s` for which `predicate(s, i)`
 * returns true while bracket depth is 0. Returns -1 if no match.
 */
function findTopLevel(s, predicate) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (OPEN_BRACKETS.includes(c)) depth++;
    else if (CLOSE_BRACKETS.includes(c)) depth--;
    else if (depth === 0 && predicate(s, i)) return i;
  }
  return -1;
}

/** Split a string on top-level commas (respecting bracket depth). */
function splitTopLevelCommas(sig) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sig.length; i++) {
    const c = sig[i];
    if (OPEN_BRACKETS.includes(c)) depth++;
    else if (CLOSE_BRACKETS.includes(c)) depth--;
    else if (depth === 0 && c === ",") {
      const piece = sig.substring(start, i).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }
  const last = sig.substring(start).trim();
  if (last) out.push(last);
  return out;
}

/**
 * Split a single parameter declaration like `name?: SomeType<X> = 5` into
 * `{ name, hasOptionalMarker, tsType, defaultRaw }`. Returns null if the
 * name is missing or not a valid JS identifier.
 */
function splitParam(p) {
  // Split off the default value on the first top-level `=` that is not
  // part of `==`, `!=`, or an arrow `=>`.
  const eqIdx = findTopLevel(
    p,
    (s, i) =>
      s[i] === "=" && s[i + 1] !== "=" && s[i - 1] !== "=" && s[i + 1] !== ">",
  );
  const beforeEq = eqIdx === -1 ? p : p.substring(0, eqIdx);
  const defaultRaw = eqIdx === -1 ? undefined : p.substring(eqIdx + 1).trim();

  // Split `name : type` on the FIRST top-level `:`.
  const colonIdx = findTopLevel(beforeEq, (s, i) => s[i] === ":");
  const nameRaw = colonIdx === -1 ? beforeEq : beforeEq.substring(0, colonIdx);
  const tsType = colonIdx === -1 ? "" : beforeEq.substring(colonIdx + 1).trim();

  const trimmedName = nameRaw.trim();
  const hasOptionalMarker = trimmedName.endsWith("?");
  const name = hasOptionalMarker
    ? trimmedName.slice(0, -1).trim()
    : trimmedName;
  if (!name || !/^[a-zA-Z_$][\w$]*$/.test(name)) return null;
  return { name, hasOptionalMarker, tsType, defaultRaw };
}

/**
 * Map a TypeScript type expression to one of Abundance's input value types.
 * Anything not number/string/boolean (replicad shapes, AbundanceObj, any,
 * ...) becomes a `geometry` input. Unions like `number | undefined` are
 * mapped by their leading token.
 *
 * @returns {AbundanceValueType}
 */
function tsTypeToValueType(tsType) {
  const first = (tsType || "").trim().split(/[\s|&]/)[0];
  if (first === "number") return "number";
  if (first === "string") return "string";
  if (first === "boolean") return "boolean";
  if (first === "Assembly") return "geometry";
  throw new Error(`Unsupported or missing type annotation: "${tsType}"`);
}

/**
 * Parse the raw default-value text from a parameter declaration into the
 * appropriate JS literal for the given Abundance value type. Throws on
 * malformed primitive literals.
 *
 * Returns `undefined` when no default was declared and the type is not
 * `geometry` (the caller can then fall back to its own default). Geometry
 * inputs without an explicit default get `null`, indicating no upstream
 * connection is required.
 */
function parseDefaultLiteral(raw, valueType, paramName) {
  if (raw === undefined) return valueType === "geometry" ? null : undefined;
  if (raw === "") {
    throw new Error(
      `Parameter "${paramName}" in run() has an empty default value`,
    );
  }
  if (valueType === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(
        `Parameter "${paramName}" has an invalid number default value: "${raw}"`,
      );
    }
    return n;
  }
  if (valueType === "boolean") {
    if (raw !== "true" && raw !== "false") {
      throw new Error(
        `Parameter "${paramName}" has an invalid boolean default value: "${raw}"`,
      );
    }
    return raw === "true";
  }
  if (valueType === "string") {
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      return raw.slice(1, -1);
    }
    return raw;
  }
  return null;
}

/**
 * Parse a Code atom's TypeScript source and return a structured, ordered
 * list of its `run(...)` parameters.
 *
 * @param {string} srcCode - Full TypeScript source of the code atom.
 * @returns {ParsedArg[]} Ordered list of parsed parameters; `[]` when
 *   `run()` has no parameters.
 * @throws {Error} If `run` is missing, parens are unbalanced, or any
 *   parameter is malformed (invalid name, empty/invalid default, etc.).
 */
export function parseCodeHeader(srcCode) {
  if (!/\bfunction\s+run\s*\(/.test(srcCode)) {
    throw new Error("Missing function called 'run'");
  }
  const sig = extractRunSignature(srcCode);
  if (sig === null) {
    throw new Error("Unbalanced parentheses in run() signature");
  }
  if (sig.trim() === "") return [];

  return splitTopLevelCommas(sig).map((piece, idx) => {
    const parsed = splitParam(piece);
    if (!parsed) {
      throw new Error(
        `Malformed parameter at position ${idx} in run() signature: "${piece}"`,
      );
    }
    const { name, hasOptionalMarker, tsType, defaultRaw } = parsed;
    const type = tsTypeToValueType(tsType);
    const defaultValue = parseDefaultLiteral(defaultRaw, type, name);
    return {
      name,
      type,
      isOptional: hasOptionalMarker || defaultRaw !== undefined,
      defaultValue,
    };
  });
}
