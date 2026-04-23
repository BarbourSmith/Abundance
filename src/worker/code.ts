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
 *       - invoke `run(...)` inside a sandboxed Function,
 *       - convert the returned `AbundanceObj` (or array) back to a
 *         RealizedAssembly for downstream cache / render consumption.
 *     TS-mode users do NOT have access to `userLib`, wrapped* helpers, or
 *     anything else carried over from the legacy surface — the only globals
 *     exposed are `replicad`, `AbundanceObj`, and `AbundanceProps`.
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
  realizeAssembly,
  validateUserCode,
} from "./code-legacy";
// Raw JS source for the AbundanceObj / AbundanceProps runtime framework.
// Prepended to every transpiled user program so that `new AbundanceObj(...)`
// in user code resolves to the classes defined in `ts-framework.js`.
import ABUNDANCE_TS_FRAMEWORK_JS from "./ts-framework.js?raw";

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
 * Structural test for an AbundanceObj produced inside user code. We can't
 * use `instanceof` because the class lives inside the sandboxed Function
 * scope where user code runs, so identities differ across that boundary.
 */
function isAbundanceObj(value: any): boolean {
  return !!value && value.__abundance === "AbundanceObj";
}

/**
 * Convert a TypeScript `run()` return value (AbundanceObj, array of them, or
 * a bare replicad shape) back into the RealizedAssembly shape that downstream
 * cache / render code expects.
 */
function tsResultToRealized(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return {
      geometry: value.map(tsResultToRealized),
      plane: value[0]?.plane,
      color: value[0]?.color,
      tags: value[0]?.tags ?? [],
      bom: value[0]?.bom ?? [],
    };
  }
  if (isAbundanceObj(value)) {
    const geom = value.geometry;
    return {
      geometry: Array.isArray(geom) ? geom : [geom],
      plane: value.plane,
      color: value.color,
      tags: value.tags,
      bom: value.bom,
    };
  }
  return value;
}

/**
 * Execute a TypeScript-mode Code atom. `code` is the already-transpiled JS
 * produced by Monaco on the main thread; it defines a `run(...)` function
 * that we invoke with the user's argument values.
 */
async function executeTsCode(
  code: string,
  argumentsArray: { [key: string]: any },
  context: RequestContext,
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
    const argsSignature: string[] = [];
    for (const [key, value] of Object.entries(argumentsArray)) {
      const actualValue = isNoGeometry(value) ? null : value;
      if (util.isAbundanceObject(actualValue)) {
        const realized = await realizeAssembly(actualValue, context);
        const geom =
          "geometry" in realized && Array.isArray((realized as any).geometry)
            ? (realized as any).geometry.length === 1
              ? (realized as any).geometry[0]
              : (realized as any).geometry
            : realized;
        argumentsArray[key] = {
          __isRawAbundanceObj: true,
          geometry: geom,
          color: (realized as any).color,
          tags: (realized as any).tags,
          bom: (realized as any).bom,
          plane: (realized as any).plane,
        };
        argsSignature.push(JSON.stringify(actualValue));
      } else {
        argsSignature.push(String(value));
        argumentsArray[key] = actualValue;
      }
    }

    // Cache lookup on the (transpiled) code + args signature.
    const cacheId = composeID(code, argsSignature);
    const cached = await util.geometryProvider!.getAssembly(cacheId, context);
    if (cached) return cached;

    const batchId = "code-atom-" + cacheId;
    const batch: RequestContext | AbundanceObject =
      await util.geometryProvider!.startBatchOperation(context, batchId);
    if (util.isAbundanceObject(batch)) return batch;

    context = batch;
    context.nextId = 0;

    validateUserCode(code);

    // Minimal TS-mode surface: only `replicad` is injected. AbundanceObj /
    // AbundanceProps come from the prepended framework source. User code
    // interacts with geometry directly (e.g. `shape.geometry.chamfer(...)`).
    const keys: string[] = ["replicad"];
    const values: any[] = [util.replicad];
    for (const [key, value] of Object.entries(argumentsArray)) {
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
        throw new Error(`Invalid parameter name: ${key}`);
      }
      keys.push(key);
      values.push(value);
    }

    // Build the sandbox body:
    //   1. framework declares AbundanceObj/AbundanceProps/__promoteInput
    //   2. user code declares function run(...)
    //   3. we invoke run() with each param routed through __promoteInput so
    //      geometry inputs become real AbundanceObj instances.
    const paramNames = Object.keys(argumentsArray);
    const promotedArgs = paramNames
      .map((n) => `__promoteInput(${n})`)
      .join(", ");
    const body =
      // `${ABUNDANCE_TS_FRAMEWORK_JS}\n` +
      `${code}\n` + `return (async () => run(${promotedArgs}))();`;
    const userFunction = new Function(...keys, body);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Code execution timed out")), 120000); // 2 min timeout
    });

    let rawResult = await Promise.race([
      userFunction(...values),
      timeoutPromise,
    ]);

    rawResult = tsResultToRealized(rawResult);

    if (isPrimitive(rawResult) || Array.isArray(rawResult)) {
      // Clean up the warm cache without caching the result
      // Primitive and array (point) results are not cached - only geometry results are cached
      await util.geometryProvider!.cleanupBatchWithoutCaching(context);
      return rawResult;
    }

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
): Promise<AbundanceObject | number | string | boolean | null | undefined> {
  if (interpreterVersion < 1) {
    return executeLegacy(code, argumentsArray, context);
  }
  return executeTsCode(code, argumentsArray, context);
}
