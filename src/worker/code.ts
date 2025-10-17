import { chamfer, fillet, move, rotate, scale } from "./actions";
import { ReplicadObject } from "./geometryProvider";
import { assembly, cutAssembly, intersect } from "./interaction";
import * as util from "./util";
import { AbundanceObject } from "./util";
import * as replicad from "replicad";
import { RequestContext } from "./geometryProvider";

/**
 * For backward compatibility reasons we allow users to call functions with
 * any of the UserGeometryObj types.
 */
type UserGeometryObj = string | RealizedAssembly | ReplicadObject;

/**
 * Provide a non-cached version of assemblies for user code execution.
 * This ensures that user code doesn't have to deal with cacheIDs
 * and can easily use replicad functions directly.
 */
type RealizedAssembly = RealizedLeaf | RealizedBranch;

type RealizedBranch = {
  geometry: RealizedAssembly[];
  plane: replicad.Plane;
  dimension: "2D" | "3D" | "Wire";
  color: string;
  tags: string[];
  bom: string[];
};

type RealizedLeaf = {
  geometry: ReplicadObject[]; // For backwards compatibility this is an array. But it always contains a single item.
  plane: replicad.Plane;
  dimension: "2D" | "3D" | "Wire";
  color: string;
  tags: string[];
  bom: string[];
};

/**
 * A best-effort check for exploits in user provided code. Checks for a series of known bad patterns.
 * @param {string} code - The JavaScript code string to validate
 * @returns {boolean} True if code appears safe, throws error if dangerous patterns detected
 */
function validateUserCode(code: string): boolean {
  const dangerousPatterns = [
    /eval\s*\(/,
    /import\s*\(/,
    /require\s*\(/,
    /process\s*\./,
    /global\s*\./,
    /window\s*\./,
    /document\s*\./,
    /XMLHttpRequest/,
    /fetch\s*\(/,
    /localStorage/,
    /sessionStorage/,
    /IndexedDB/,
    /WebSocket/,
    /Worker\s*\(/,
    /setTimeout\s*\(/,
    /setInterval\s*\(/,
    /__proto__/,
    /constructor/,
    /prototype/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new Error(
        `Code contains potentially dangerous pattern: ${pattern.source}`
      );
    }
  }

  return true;
}

/**
 * A function which converts any input into Abundance style geometry. Input can be a library ID, an abundance object, or a single geometry object.
 * This is useful for allowing our functions to work within the Code atom or within the flow canvas.
 */
async function toGeometry(
  input: UserGeometryObj,
  name = "geometry",
  userLib: { [key: string]: RealizedAssembly },
  context: RequestContext
): Promise<AbundanceObject> {
  if (input === undefined || input === null) {
    throw new Error(name + " value is undefined or null");
  }

  if (typeof input === "string" || typeof input === "number") {
    if (!userLib[input]) {
      throw new Error(`Library ID ${input} does not exist.`);
    }
    return addAssemblyPartsToCache(userLib[input], context, "code-transient");
  } else if ("geometry" in input) {
    return addAssemblyPartsToCache(
      input as RealizedAssembly,
      context,
      "code-transient"
    );
  }

  // @ts-ignore - using _wrapped to detect if this is a raw replicad object
  const raw_type = input?._wrapped?.$$?.ptrType?.name;
  if (raw_type && raw_type instanceof String && raw_type.startsWith("TopoDS")) {
    // If it's a raw geometry object, we wrap it in an abundance object
    return {
      dimension: "3D",
      plane: util.XYPlane,
      color: util.defaultColor,
      tags: [],
      bom: [],
      geometry: await util.geometryProvider!.addSingularToCache(
        input as ReplicadObject,
        context,
        "code-transient-" + context.nextId++
      ),
    };
  } else {
    // If it's something else, we throw an error
    throw new Error(
      name + " value cannot be interpreted as geometry: " + input
    );
  }
}

/**
 * Executes the given code with the provided arguments list.
 */
async function executeCode(
  code: string,
  argumentsArray: { [key: string]: any },
  context: RequestContext
): Promise<AbundanceObject> {
  try {
    // Validate input parameters
    if (typeof code !== "string") {
      throw new Error("Code must be a string");
    }
    if (code.length > 50000) {
      throw new Error("Code too long (maximum 50,000 characters)");
    }

    // Make a copy of the necessary entries in the library where all geometries are de-cached.
    // This library copy will be in focus for the user. Has the side effect that direct assignments
    // to the library by the user code will not affect the main library.
    const userLib: { [key: string]: RealizedAssembly } = {};
    let i = 0;
    const argsSignature: string[] = [];
    for (const [key, value] of Object.entries(argumentsArray)) {
      if (util.isAbundanceObject(value)) {
        const newKey = `userlib_${i++}`;
        userLib[newKey] = await realizeAssembly(value, context);
        argumentsArray[key] = newKey;
        argsSignature.push(JSON.stringify(value));
      } else {
        argsSignature.push(value.toString());
      }
    }

    // check cache for existing result
    const cacheId = composeID(code, argsSignature);
    const cached = await util.geometryProvider!.getAssembly(cacheId, context);
    if (cached) {
      return cached;
    }

    const batchId = "code-atom-" + cacheId;
    const batch: RequestContext | AbundanceObject =
      await util.geometryProvider!.startBatchOperation(context, batchId);

    // Full assembly cache hit. No work to do.
    if (util.isAbundanceObject(batch)) {
      return batch;
    }

    context = batch;
    context.nextId = 0;

    // Validate code for dangerous patterns
    // TODO: we probably want to allow some of these but still need to warn about them before executing
    // the code molecule.
    validateUserCode(code);

    // Create wrapper functions that handle library ID to geometry conversion
    const wrappedMove = async (
      geom: UserGeometryObj,
      x: number,
      y: number,
      z: number
    ) => {
      return realizeAssembly(
        await move(
          await toGeometry(geom, "move-geometry", userLib, context),
          x,
          y,
          z,
          context
        ),
        context
      );
    };

    const wrappedRotate = async (
      geom: string | RealizedAssembly,
      x: number,
      y: number,
      z: number
    ) => {
      return realizeAssembly(
        await rotate(
          await toGeometry(geom, "rotate-geometry", userLib, context),
          x,
          y,
          z,
          context
        ),
        context
      );
    };

    const wrappedScale = async (geom: UserGeometryObj, scaleFactor: number) => {
      return realizeAssembly(
        await scale(
          await toGeometry(geom, "scale-geometry", userLib, context),
          scaleFactor,
          context
        ),
        context
      );
    };

    const wrappedFillet = async (geom: UserGeometryObj, radius: number) => {
      return realizeAssembly(
        await fillet(
          await toGeometry(geom, "fillet-geometry", userLib, context),
          radius,
          context
        ),
        context
      );
    };

    const wrappedChamfer = async (geom: UserGeometryObj, size: number) => {
      return realizeAssembly(
        await chamfer(
          await toGeometry(geom, "chamfer-geometry", userLib, context),
          size,
          context
        ),
        context
      );
    };

    const wrappedIntersect = async (
      input1: UserGeometryObj,
      input2: UserGeometryObj
    ) => {
      return realizeAssembly(
        await intersect(
          await toGeometry(input1, "intersect-geometry1", userLib, context),
          await toGeometry(input2, "intersect-geometry2", userLib, context),
          context
        ),
        context
      );
    };

    const wrappedAssembly = async (inputIDs: UserGeometryObj[]) => {
      const ids = await Promise.all(
        inputIDs.map(
          async (id) =>
            await toGeometry(id, "assembly-geometry", userLib, context)
        )
      );
      const res = await assembly(ids, context);
      return realizeAssembly(res, context);
    };

    const wrappedCutAssembly = async (
      input1: UserGeometryObj,
      input2Array: UserGeometryObj[]
    ) => {
      return realizeAssembly(
        await cutAssembly(
          await toGeometry(input1, "cut-geometry1", userLib, context),
          await Promise.all(
            input2Array.map(
              async (id) =>
                await toGeometry(id, "cut-geometry", userLib, context)
            )
          ),
          context
        ),
        context
      );
    };

    const wrappedGetBounds = async (geom: UserGeometryObj) => {
      return util.getBounds(
        await toGeometry(geom, "bounds-geometry", userLib, context),
        context
      );
    };

    let keys1 = [
      "Rotate",
      "Move",
      "Scale",
      "Assembly",
      "Intersect",
      "CutAssembly",
      "AssemblyMap",
      "AssemblyAsIterable",
      "GetBounds",
      "Fillet",
      "Chamfer",
      "library",
      "replicad",
    ];
    let inputValues = [
      wrappedRotate,
      wrappedMove,
      wrappedScale,
      wrappedAssembly,
      wrappedIntersect,
      wrappedCutAssembly,
      assemblyMap,
      assemblyAsIterable,
      wrappedGetBounds,
      wrappedFillet,
      wrappedChamfer,
      userLib, // TODO(tristan): I think we should deprecate this but it'll require passing the actual geom.
      util.replicad,
    ];
    for (const [key, value] of Object.entries(argumentsArray)) {
      // Sanitize parameter names to prevent injection
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
        throw new Error(`Invalid parameter name: ${key}`);
      }
      keys1.push(key);
      inputValues.push(value);
    }
    // Use Function constructor instead of eval - still allows code execution but safer than eval
    const userFunction = new Function(
      ...keys1,
      `return (async () => { ${code} })();`
    );

    // Execute with timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Code execution timed out")), 60000); // 1 min timeout
    });

    return await Promise.race([
      ensureDimension(userFunction(...inputValues)),
      timeoutPromise,
    ]).then(async (result) => {
      const abundanceObj = await addAssemblyPartsToCache(
        result as RealizedAssembly,
        context,
        cacheId
      );
      util.geometryProvider!.endBatchOperation(context, abundanceObj);
      return abundanceObj;
    });
  } catch (error) {
    console.error("Code execution error:", error);
    throw new Error(`Code execution failed: ${(error as Error).message}`);
  }
}

async function ensureDimension(
  assembly: RealizedAssembly | Promise<RealizedAssembly>
): Promise<RealizedAssembly> {
  return Promise.resolve(assembly).then(async (resolvedAssembly) => {
    if (isRealizedLeaf(resolvedAssembly)) {
      if (
        !("dimension" in resolvedAssembly) ||
        resolvedAssembly.dimension === undefined
      ) {
        resolvedAssembly.dimension =
          "_wrapped" in resolvedAssembly.geometry[0] ? "3D" : "2D";
      }
    } else {
      resolvedAssembly.geometry = await Promise.all(
        resolvedAssembly.geometry.map((child) => ensureDimension(child))
      );
      resolvedAssembly.dimension = resolvedAssembly.geometry[0].dimension;
    }
    return resolvedAssembly;
  });
}

/**
 * AssemblyMap
 *
 * Maps the given callbackFn to each leaf in the specified assembly. And returns
 * a new assembly of the same structure and metadata, but with transformed leafs.
 * If the provided assembly is a single entity, returns a transformed singular entity.
 *
 * @param {*} assemblyId
 * @param {*} callbackFn - A function that takes a leaf and returns a new leaf.
 * @returns a new assembly with the same structure and metadata as assemblyId,
 * but where each leaf is the result of applying callbackFn to the
 * corresponding leaf in the input assembly.
 */
async function assemblyMap(
  assembly: RealizedAssembly,
  callbackFn: (
    node: RealizedLeaf,
    depth: number
  ) => RealizedAssembly | Promise<RealizedAssembly>
): Promise<RealizedAssembly | undefined> {
  try {
    // Helper function to process nodes recursively
    async function processNode(
      node: RealizedAssembly,
      depth: number
    ): Promise<RealizedAssembly | undefined> {
      if (isRealizedLeaf(node)) {
        return ensureDimension(callbackFn(node, depth));
      }
      // This is a branch node
      else {
        const newGeometry = await Promise.all(
          node.geometry.map(async (child) => {
            return await processNode(child, depth + 1);
          })
        );

        // Filter out any undefined results (in case callbackFn filters some nodes)
        const filteredGeometry = newGeometry.filter(
          (item) => item !== undefined
        );

        if (filteredGeometry.length === 0) {
          return undefined;
        }

        // Return a new node with the same metadata but transformed children
        return {
          geometry: filteredGeometry,
          tags: node.tags || [],
          color: node.color,
          plane: node.plane,
          bom: node.bom || [],
          dimension: filteredGeometry[0].dimension,
        };
      }
    }

    // Start processing from the root
    const result = await processNode(assembly, 0);
    return result;
  } catch (error) {
    logError(error as Error, "AssemblyMap");
    throw error;
  }
}

async function assemblyAsIterable(assembly: RealizedAssembly) {
  const result: RealizedAssembly[] = [];
  const helper = (assembly: RealizedAssembly) => {
    if (isRealizedLeaf(assembly)) {
      result.push(assembly);
    } else {
      assembly.geometry.forEach((child) => helper(child));
    }
  };
  helper(assembly);
  return result;
}

function logError(error: Error, context: string) {
  console.warn("error from context: ", context);
  if (error instanceof SyntaxError) {
    console.error("SyntaxError encountered:", error.message);
  } else if (error instanceof ReferenceError) {
    console.error("ReferenceError encountered:", error.message);
  } else {
    console.error("An error occurred:", error.message);
  }

  // Log additional error details if available
  if (error.stack) {
    console.error("Stack trace:", error.stack);
  }
  if ("lineNumber" in error) {
    console.error("Line number:", error.lineNumber);
  }
  if ("columnNumber" in error) {
    console.error("Column number:", error.columnNumber);
  }
  console.error("full error:");
  console.error(error);
}

async function realizeAssembly(
  assembly: AbundanceObject,
  context: RequestContext
): Promise<RealizedAssembly> {
  if (util.isLeaf(assembly)) {
    return {
      ...assembly,
      geometry: [await util.geometryProvider!.get(assembly.geometry, context)],
      plane: util.asReplicadPlane(assembly.plane),
    };
  } else {
    const children = await Promise.all(
      (assembly.geometry as AbundanceObject[]).map(async (child) => {
        return await realizeAssembly(child, context);
      })
    );
    return {
      ...assembly,
      geometry: children,
      plane: util.asReplicadPlane(assembly.plane),
      dimension: children[0].dimension,
    };
  }
}

function isRealizedLeaf(node: RealizedAssembly): node is RealizedLeaf {
  return (
    Array.isArray(node.geometry) &&
    node.geometry.every((item) => "geometry" in item === false)
  );
}

function composeID(code: string, argsSignature: string[]): string {
  return [util.hashString(code), ...argsSignature].join("-");
}

async function addAssemblyPartsToCache(
  assembly: RealizedAssembly,
  context: RequestContext,
  cacheId: string
): Promise<AbundanceObject> {
  const helperFunc = async (
    assembly: RealizedAssembly
  ): Promise<AbundanceObject> => {
    if (isRealizedLeaf(assembly)) {
      return {
        ...assembly,
        geometry: await util.geometryProvider!.addSingularToCache(
          assembly.geometry[0],
          context,
          cacheId + "-" + context.nextId++ // Cache under the code atom's id + an offset within the result structure
        ),
        plane: assembly.plane
          ? util.asSimplePlane(assembly.plane)
          : util.XYPlane,
      };
    } else {
      const children = await Promise.all(
        (assembly.geometry as RealizedAssembly[]).map(async (child) => {
          return await helperFunc(child);
        })
      );
      return {
        ...assembly,
        geometry: children,
        plane: assembly.plane
          ? util.asSimplePlane(assembly.plane)
          : util.XYPlane,
      };
    }
  };
  return helperFunc(assembly);
}

export { executeCode };
