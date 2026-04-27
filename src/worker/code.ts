/**
 * Code atom executor dispatcher.
 *
 * This file is the single entry point from the worker into user-authored
 * Code atom execution. It picks between two mutually-exclusive execution
 * modes based on the atom's `interpreterVersion`:
 *
 *   0 (JavaScript / legacy): delegated to `./code-legacy.ts`. That path
 *     exposes the classic wrapped* helpers (Move, Chamfer, CutAssembly, ...)
 *     and the `userLib` abstraction. Do not add new features there.
 *
 *   1+ (TypeScript): handled in this file. The user authored a `run(...)`
 *     function that was transpiled to JS on the main thread (see
 *     `src/molecules/code.js#transpileTypeScript`). Our job here is to:
 *       - prepare arguments into `AbundanceObj` / primitive form,
 *       - invoke `run(...)` inside a Blob URL module sandbox,
 *       - convert the returned `AbundanceObj` (or array) back to a
 *         RealizedAssembly for downstream cache / render consumption.
 *     TS-mode users do NOT have access to `userLib`, wrapped* helpers, or
 *     anything else carried over from the legacy surface — the only globals
 *     exposed are `replicad`, `AbundanceObj`, and `AbundanceProps`. User
 *     code MAY contain static ES `import` statements for external modules
 *     (e.g. `import * as math from 'https://esm.sh/mathjs'`) because each
 *     atom executes as a real ES module via a Blob URL.
 */
import * as util from "./util";
import { AbundanceObject } from "./util";
import { RequestContext } from "./geometryProvider";
import {
  executeCode as executeLegacy,
  RealizedAssembly,
  addAssemblyPartsToCache,
  composeID,
  ensureDimension,
  validateUserCode,
} from "./code-legacy";
// Runtime JS for the AbundanceObj / AbundanceProps sandbox framework.
// Generated from src/worker/ts-framework.ts — run `npm run build:ts-framework`
// to regenerate after changes to the canonical source.
import ABUNDANCE_TS_FRAMEWORK_JS from "./generated/ts-framework.generated.js?raw";

/**
 * Helper function to check if a value is the NO_GEOMETRY sentinel.
 */
function isNoGeometry(value: any): boolean {
  return value && typeof value === "object" && value.__NO_GEOMETRY__ === true;
}

/**
 * Check if a value is a primitive type.
 */
function isPrimitive(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

/**
 * Structural test for an Assembly produced inside user code. We can't
 * use `instanceof` because the class lives inside the sandboxed Function
 * scope where user code runs, so identities differ across that boundary.
 */
function isAssembly(value: any): boolean {
  return !!value && value.__abundance === "Assembly";
}

/**
 * Extract the parameter names from the user's `function run(...)` signature
 * in the (already-transpiled) code. This is the authoritative ordering used
 * when invoking `run()` — `argumentsArray` is a plain object and its key
 * order is not guaranteed to match the user's declared parameter order.
 *
 * The transpiler emits a plain `function run(a, b, c) { ... }` (type
 * annotations and default values are erased in the output JS we get here,
 * but we still tolerate defaults / destructuring defensively).
 *
 * Throws if `run` cannot be located — user code without a `run()` function
 * can't be executed in TS mode.
 */
function extractRunParamNames(code: string): string[] {
  // Match: function run ( <params> )   — allow whitespace / newlines.
  const m = /\bfunction\s+run\s*\(([^)]*)\)/.exec(code);
  if (!m) {
    throw new Error(
      "TypeScript atom must define a top-level `function run(...)`.",
    );
  }
  const raw = m[1].trim();
  if (raw === "") return [];
  return raw
    .split(",")
    .map((part) => {
      // Strip default-value expressions (`= 2`, `= [0,0]`, ...).
      const beforeDefault = part.split("=")[0];
      // Strip trailing type annotations that might survive (defensive;
      // Monaco normally erases these, but `noEmitOnError:false` + partial
      // transpile can leave them).
      const beforeType = beforeDefault.split(":")[0];
      return beforeType.trim().replace(/^\.{3}/, ""); // drop `...rest`
    })
    .filter((n) => n.length > 0);
}

/**
 * Default metadata for a RealizedAssembly created from a bare replicad
 * shape (user returned `shape` / `drawing` directly with no AbundanceObj
 * wrapper). Matches the defaults set by `AbundanceProps` in ts-framework.ts.
 */
function defaultProps() {
  return {
    color: "#ffffff",
    tags: [] as string[],
    bom: [] as string[],
    plane: util.replicad.makePlane(),
  };
}

/**
 * Convert the raw code atom result into a value the downstream pipeline can
 * consume. Allowed return types from a TS code atom `run()`:
 *   - Primitive values: number, string, boolean (plus null/undefined)
 *   - AbundanceObj
 *   - bare replicad.AnyShape or replicad.Drawing
 *   - An array of any of the above (producing a RealizedBranch)
 *
 * Primitives pass through unchanged. Everything else is normalised into the
 * RealizedAssembly shape (`{ geometry, plane, color, tags, bom }`) that
 * `ensureDimension` + `addAssemblyPartsToCache` expect.
 */
function convertCodeAtomResult(value: any): any {
  if (value == null) return value;
  if (isPrimitive(value)) return value;

  // Array → RealizedBranch. Children are recursively converted so that a
  // mix of AbundanceObj / bare replicad shapes inside the same array all
  // end up as proper RealizedAssembly nodes.
  if (Array.isArray(value)) {
    const children = value.map(convertCodeAtomResult);
    const first = children[0];
    return {
      geometry: children,
      plane: first?.plane ?? util.replicad.makePlane(),
      color: first?.color ?? "#ffffff",
      tags: first?.tags ?? [],
      bom: first?.bom ?? [],
    };
  }

  // AbundanceObj wrapper → RealizedLeaf using its metadata.
  if (isAssembly(value)) {
    const geom = value.geometry;
    return {
      geometry: Array.isArray(geom) ? geom : [geom],
      plane: value.plane,
      color: value.color,
      tags: value.tags,
      bom: value.bom,
    };
  }

  // Bare replicad shape (AnyShape or Drawing) → RealizedLeaf with defaults.
  return { geometry: [value], ...defaultProps() };
}

/**
 * Execute a TypeScript-mode Code atom. `code` is the already-transpiled JS
 * produced by Monaco on the main thread; it defines a `run(...)` function
 * that we invoke with the user's argument values.
 *
 * Execution uses a Blob URL module import (rather than `new Function`) so
 * that user code can contain static ES `import` statements for external
 * libraries (e.g. `import * as math from 'https://esm.sh/mathjs'`).
 * `replicad` and user arguments are handed off via a per-atom slot on
 * `globalThis` (see `CTX_KEY` below).
 */
/**
 * Levels of `console.*` calls captured from inside user code.
 */
export type CodeAtomLogLevel =
  | "log"
  | "info"
  | "warn"
  | "error"
  | "debug"
  | "trace";

/**
 * Callback invoked once per `console.*` call inside the user's code atom.
 * Arguments are pre-formatted to plain strings on the worker side so they
 * survive the comlink/postMessage boundary safely (replicad shapes etc.
 * are not structured-cloneable). When provided to `executeCode`, this is
 * expected to be a `Comlink.proxy(...)` wrapped function.
 */
export type CodeAtomLogCallback = (
  level: CodeAtomLogLevel,
  message: string,
  stack: string | null,
) => void;

/**
 * Format `console.*` arguments into a single string. Tries JSON for objects
 * (with cycle handling), falls back to `String(value)` when serialisation
 * fails (e.g. replicad shape instances backed by WASM).
 */
function formatLogArg(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "string") return value;
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  if (t === "function") return value.toString();
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value, (key, val) => {
      if (key === "oc") {
        return "<oc wasm ref>";
      } else {
        return val;
      }
    });
  } catch (e) {
    console.warn(e);
    console.log(value);
    return "cyclic value";
  }
}

async function executeTsCode(
  code: string,
  argumentsArray: { [key: string]: any },
  context: RequestContext,
  atomUniqueId: string | number,
  onLog?: CodeAtomLogCallback,
): Promise<AbundanceObject | number | string | boolean | null | undefined> {
  try {
    if (typeof code !== "string") {
      throw new Error("Code must be a string");
    }
    if (code.length === 0) {
      throw new Error(
        "TypeScript atom is missing compiled output. Open the code editor and click Save to regenerate.",
      );
    }
    if (code.length > 50000) {
      throw new Error("Code too long (maximum 50,000 characters)");
    }

    // Convert incoming Abundance geometry arguments into raw POJOs marked
    // with `__isRawAbundanceObj`. The prepended framework's `__promoteInput`
    // helper will wrap these into real AbundanceObj instances inside the
    // sandbox before invoking `run()`.
    const assemblyAsPojo = async (
      assembly: AbundanceObject,
      context: RequestContext,
    ): Promise<any> => {
      if (util.isLeaf(assembly)) {
        return {
          ...assembly,
          geometry: await util.geometryProvider!.get(
            assembly.geometry,
            context,
          ),
          plane: util.asReplicadPlane(assembly.plane),
          __isRawAbundanceObj: true,
        };
      } else {
        const children = await Promise.all(
          (assembly.geometry as AbundanceObject[]).map(async (child) => {
            return await assemblyAsPojo(child, context);
          }),
        );
        return {
          ...assembly,
          geometry: children,
          plane: util.asReplicadPlane(assembly.plane),
          dimension: children[0].dimension,
          __isRawAbundanceObj: true,
        };
      }
    };

    const argsSignature: string[] = [];
    for (const [key, value] of Object.entries(argumentsArray)) {
      const actualValue = isNoGeometry(value) ? null : value;
      if (util.isAbundanceObject(actualValue)) {
        argumentsArray[key] = await assemblyAsPojo(actualValue, context);
        argsSignature.push(JSON.stringify(actualValue));
      } else {
        argsSignature.push(String(value));
        argumentsArray[key] = actualValue;
      }
    }

    // Build a sandbox-side `console` shim. We forward each call to the
    // main-thread `onLog` callback (if any) AFTER formatting args to a
    // string here in the worker — replicad shapes / WASM objects are not
    // structured-cloneable, so we can't pass raw args across the boundary.
    // Fall back to the worker's native console when no callback was given.
    const sandboxConsole: any = onLog
      ? (() => {
          const make =
            (level: CodeAtomLogLevel) =>
            (...args: any[]) => {
              // Mirror to the worker's real console too, so devs running
              // with DevTools open still see output in the worker context.
              (console as any)[level === "trace" ? "log" : level](...args);

              // Process for UI console and onLog callback
              const message = args.map(formatLogArg).join(" ");
              const stack =
                level === "trace"
                  ? (new Error().stack || "").split("\n").slice(2).join("\n")
                  : null;
              onLog(level, message, stack);
            };
          return {
            log: make("log"),
            info: make("info"),
            warn: make("warn"),
            error: make("error"),
            debug: make("debug"),
            trace: make("trace"),
          };
        })()
      : console;

    // Cache lookup on the (transpiled) code + args signature.
    const cacheId = composeID(code, argsSignature);
    const cached = await util.geometryProvider!.getAssembly(cacheId, context);
    if (cached) return cached;

    const batchId = "code-atom-" + cacheId;
    const batch: RequestContext | AbundanceObject =
      await util.geometryProvider!.startBatchOperation(context, batchId);
    if (util.isAbundanceObject(batch)) {
      sandboxConsole.info("Cache hit. Execution skipped.");
      return batch;
    }

    context = batch;
    context.nextId = 0;

    validateUserCode(code);

    // Extract the parameter names from the user's `run(...)` signature.
    // The order of args passed to `run()` MUST match the user's declared
    // order — not the (arbitrary) key order of `argumentsArray`.
    const runParamNames = extractRunParamNames(code);

    // Validate parameter names — they become `const` bindings in the blob.
    // We only bind names that (a) appear in the `run()` signature, so user
    // code can reference them, and (b) were supplied in `argumentsArray`.
    for (const key of runParamNames) {
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
        throw new Error(`Invalid parameter name: ${key}`);
      }
    }

    // Per-atom context key on `globalThis`. Uses the atom's uniqueID so
    // concurrent executions of different atoms never collide; re-executing
    // the same atom is safe because the key is read + deleted synchronously
    // at the top of the blob's preamble before anything else runs.
    const CTX_KEY = `__abundanceCtx_${atomUniqueId}`;
    (globalThis as any)[CTX_KEY] = {
      replicad: util.replicad,
      args: { ...argumentsArray },
      console: sandboxConsole,
    };

    // Build the blob body. Order matters:
    //   1. Extract + delete ctx from globalThis (first line, synchronous).
    //   2. Framework declares AbundanceProps / AbundanceObj / __promoteInput.
    //   3. Promote each named arg into an AbundanceObj via __promoteInput.
    //      Arg bindings are emitted in `run()` declaration order.
    //   4. User code (defines `function run(...)`).
    //   5. Epilogue invokes run(...) positionally, again in declared order.
    const argDecls = runParamNames
      .map((n) => `const ${n} = __promoteInput(__abundanceArgs.${n});`)
      .join("\n");
    const runArgs = runParamNames.join(", ");
    // `console` is shadowed at the top of the module scope so user code's
    // `console.log(...)` calls hit our shim (which forwards to the UI)
    // rather than the worker's native console.
    const body =
      `const { replicad, args: __abundanceArgs, console } = globalThis[${JSON.stringify(CTX_KEY)}];\n` +
      `delete globalThis[${JSON.stringify(CTX_KEY)}];\n` +
      `${ABUNDANCE_TS_FRAMEWORK_JS}\n` +
      `${argDecls}\n` +
      `${code}\n` +
      `export default await run(${runArgs});\n`;

    const blob = new Blob([body], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);

    let rawResult: any;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Code execution timed out")), 60000);
      });
      const mod: any = await Promise.race([
        import(/* @vite-ignore */ blobUrl),
        timeoutPromise,
      ]);
      rawResult = mod.default;
    } finally {
      URL.revokeObjectURL(blobUrl);
      // Defensive: in case user code threw before reaching the delete line,
      // make sure we don't leak the ctx object on globalThis.
      delete (globalThis as any)[CTX_KEY];
    }

    rawResult = convertCodeAtomResult(rawResult);

    if (isPrimitive(rawResult) || Array.isArray(rawResult)) {
      // Clean up the warm cache without caching the result
      // Primitive and array (point) results are not cached - only geometry results are cached
      await util.geometryProvider!.cleanupBatchWithoutCaching(context);
      return rawResult;
    }

    // TODO.
    const processedResult = await ensureDimension(rawResult);
    const abundanceObj = await addAssemblyPartsToCache(
      processedResult as RealizedAssembly,
      context,
      cacheId,
    );
    await util.geometryProvider!.endBatchOperation(context, abundanceObj);
    return abundanceObj;
  } catch (error) {
    console.error("Code execution error:", error);
    throw new Error(`Code execution failed: ${(error as Error).message}`);
  }
}

/**
 * Top-level Code atom executor. Dispatches on `interpreterVersion`.
 */
export async function executeCode(
  code: string,
  argumentsArray: { [key: string]: any },
  context: RequestContext,
  interpreterVersion: number = 0,
  atomUniqueId: string | number = "anon",
  onLog?: CodeAtomLogCallback,
): Promise<AbundanceObject | number | string | boolean | null | undefined> {
  if (interpreterVersion < 1) {
    return executeLegacy(code, argumentsArray, context);
  }
  return executeTsCode(code, argumentsArray, context, atomUniqueId, onLog);
}
