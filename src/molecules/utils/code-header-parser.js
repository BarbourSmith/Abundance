/**
 * @file Parses the `run(...)` signature out of a Code atom's TypeScript
 * source into a structured list of argument descriptors.
 *
 * We can't pull in the real `typescript` compiler (~10MB) and Monaco's TS
 * worker is async-only, so we hand-roll a tiny bracket-depth scanner.
 * Each step is a small helper. The public entry point is
 * `parseCodeHeader(srcCode)`; the CAD worker also uses
 * `extractRunSignature` and `splitTopLevelCommas` so that both read the
 * same parameter list.
 */

/** @typedef {"number" | "string" | "boolean" | "geometry" | "array"} AbundanceValueType */
/** @typedef {"number" | "string" | "boolean"} AbundanceArrayElementType */

/**
 * @typedef {Object} ParsedArg
 * @property {string} name - Parameter name (a valid JS identifier).
 * @property {AbundanceValueType} type - Abundance value type derived from
 *   the TS type annotation. Anything not a primitive becomes `"geometry"`.
 * @property {AbundanceArrayElementType} [elementType] - Element type, set
 *   only when `type === "array"`. One of `"number" | "string" | "boolean"`.
 * @property {boolean} isOptional - True if the parameter has a `?` marker
 *   or an explicit default value.
 * @property {number|string|boolean|Array|null|undefined} defaultValue -
 *   Parsed JS literal of the default expression. `undefined` when no
 *   default was declared and the type is not geometry/array; `null` for
 *   geometry inputs without an explicit default; `[]` for array inputs
 *   without an explicit default.
 */

/** Characters that open a bracket pair we want to track. */
const OPEN_BRACKETS = "([{<";
/** Characters that close a bracket pair we want to track. */
const CLOSE_BRACKETS = ")]}>";
/** Characters that open a string literal. */
const QUOTES = "\"'`";

/**
 * Return the index just past the string literal that opens at `src[start]`
 * (a `"`, `'`, or backtick). A quoted string still open at a newline ends
 * there, so a stray quote can't swallow the rest of the source.
 */
function skipString(src, start) {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") i++;
    else if (c === quote) return i + 1;
    else if (c === "\n" && quote !== "`") return i;
  }
  return src.length;
}

/**
 * Replace each `//` line comment and block comment in `src` with a space.
 * String literals are copied as-is, so a default like
 * `"https://example.com"` keeps its `//`.
 */
function stripComments(src) {
  let out = "";
  let copiedTo = 0;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (QUOTES.includes(c)) {
      i = skipString(src, i);
    } else if (c === "/" && src[i + 1] === "/") {
      // Stop before the newline so it is kept.
      const end = src.indexOf("\n", i);
      out += src.substring(copiedTo, i) + " ";
      i = end === -1 ? src.length : end;
      copiedTo = i;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      out += src.substring(copiedTo, i) + " ";
      i = end === -1 ? src.length : end + 2;
      copiedTo = i;
    } else {
      i++;
    }
  }
  return out + src.substring(copiedTo);
}

/**
 * Find the substring inside the parentheses of a top-level
 * `function run(...)` declaration. Returns the inner text with comments
 * removed, or null if `run` is missing / parens are unbalanced.
 */
export function extractRunSignature(src) {
  const startIdx = src.search(/\bfunction\s+run\s*\(/);
  if (startIdx === -1) return null;
  // Strip comments before counting brackets: Code atoms comment their
  // parameters, and a comment like `// must be > 0` would throw off the
  // depth.
  const inner = stripComments(src.substring(src.indexOf("(", startIdx) + 1));
  const end = findTopLevel(inner, (s, i) => s[i] === ")");
  return end === -1 ? null : inner.substring(0, end);
}

/**
 * Find the index of the first character in `s` for which `predicate(s, i)`
 * returns true while bracket depth is 0, skipping string literals. Returns
 * -1 if no match. A closing bracket at depth 0 is offered to `predicate`
 * before the depth drops, which is how `extractRunSignature` finds the `)`
 * that ends the parameter list.
 */
function findTopLevel(s, predicate) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // The loop's `i++` then lands just past the closing quote.
    if (QUOTES.includes(c)) i = skipString(s, i) - 1;
    else if (OPEN_BRACKETS.includes(c)) depth++;
    else if (depth === 0 && predicate(s, i)) return i;
    else if (CLOSE_BRACKETS.includes(c)) depth--;
  }
  return -1;
}

/**
 * Split a string on top-level commas, skipping commas inside brackets or
 * string literals (as in `[1, 2]` or `"a, b"`). Pieces are trimmed and
 * empty ones dropped.
 */
export function splitTopLevelCommas(sig) {
  const isComma = (s, i) => s[i] === ",";
  const pieces = [];
  let rest = sig;
  let comma;
  while ((comma = findTopLevel(rest, isComma)) !== -1) {
    pieces.push(rest.substring(0, comma));
    rest = rest.substring(comma + 1);
  }
  pieces.push(rest);
  return pieces.map((p) => p.trim()).filter(Boolean);
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
 * Map a TypeScript type expression to an Abundance value descriptor.
 *
 * Primitives (`number`, `string`, `boolean`) map to their respective value
 * types. `Assembly` (and any non-primitive single token) maps to `geometry`.
 * Array forms `T[]` and `Array<T>` for primitive `T` map to `array` with
 * the corresponding `elementType`. `Assembly[]` / `Array<Assembly>` are
 * explicitly rejected. Unions like `number | undefined` are mapped by
 * their leading token.
 *
 * @returns {{ valueType: AbundanceValueType, elementType?: AbundanceArrayElementType }}
 */
function tsTypeToValueInfo(tsType) {
  const head = (tsType || "").trim().split(/[\s|&]/)[0].trim();
  if (!head) {
    throw new Error(`Unsupported or missing type annotation: "${tsType}"`);
  }

  // `Array<T>` form.
  const arrayGenericMatch = head.match(/^Array<\s*([^<>]+?)\s*>$/);
  // `T[]` form (primitive identifier followed by `[]`). Only accept simple
  // identifiers here; e.g. `number[][]` is not supported.
  const bracketMatch = head.match(/^([A-Za-z_$][\w$]*)\[\]$/);

  if (arrayGenericMatch || bracketMatch) {
    const inner = (arrayGenericMatch?.[1] ?? bracketMatch[1]).trim();
    if (inner === "number" || inner === "string" || inner === "boolean") {
      return { valueType: "array", elementType: inner };
    }
    throw new Error(
      `Unsupported array element type: "${inner}". Supported element types are number, string, boolean.`,
    );
  }

  if (head === "number") return { valueType: "number" };
  if (head === "string") return { valueType: "string" };
  if (head === "boolean") return { valueType: "boolean" };
  if (head === "Assembly") return { valueType: "geometry" };
  throw new Error(`Unsupported or missing type annotation: "${tsType}"`);
}

/**
 * Parse the raw default-value text from a parameter declaration into the
 * appropriate JS literal for the given Abundance value type. Throws on
 * malformed primitive literals.
 *
 * Returns `undefined` when no default was declared and the type is not
 * `geometry` or `array` (the caller can then fall back to its own default).
 * Geometry inputs without an explicit default get `null`, indicating no
 * upstream connection is required. Array inputs without an explicit
 * default get `[]`.
 */
function parseDefaultLiteral(raw, valueType, paramName, elementType) {
  if (raw === undefined) {
    if (valueType === "geometry") return null;
    if (valueType === "array") return [];
    return undefined;
  }
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
  if (valueType === "array") {
    let parsed;
    try {
      // User code is already executed in a worker sandbox; treat the raw
      // expression as a JS literal. Parens force expression context so a
      // bare `[...]` is parsed as an array, not a block.
      parsed = new Function(`return (${raw});`)();
    } catch (e) {
      throw new Error(
        `Parameter "${paramName}" has an invalid array default value: "${raw}" (${e.message})`,
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Parameter "${paramName}" default value must be an array literal: "${raw}"`,
      );
    }
    for (const el of parsed) {
      if (typeof el !== elementType) {
        throw new Error(
          `Parameter "${paramName}" default array element "${el}" does not match element type "${elementType}"`,
        );
      }
    }
    return parsed;
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
    const { valueType, elementType } = tsTypeToValueInfo(tsType);
    const defaultValue = parseDefaultLiteral(
      defaultRaw,
      valueType,
      name,
      elementType,
    );
    /** @type {ParsedArg} */
    const result = {
      name,
      type: valueType,
      isOptional: hasOptionalMarker || defaultRaw !== undefined,
      defaultValue,
    };
    if (elementType) result.elementType = elementType;
    return result;
  });
}
