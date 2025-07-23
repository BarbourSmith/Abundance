import * as util from "./util.js";
import { rotate, move, scale, fillet, chamfer } from "./actions.js";
import { intersect, assembly, cutAssembly } from "./interaction.js";

/**
 * A best-effort check for exploits in user provided code. Checks for a series of known bad patterns.
 * @param {string} code - The JavaScript code string to validate
 * @returns {boolean} True if code appears safe, throws error if dangerous patterns detected
 */
function validateUserCode(code) {
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
 * Executes the given code with the provided arguments list.
 * 
 * Unusually this function requires library as context since the source code may reference library.
 */
async function executeCode(code, argumentsArray, library) {
  try {
    // Validate input parameters
    if (typeof code !== "string") {
      throw new Error("Code must be a string");
    }
    if (code.length > 50000) {
      throw new Error("Code too long (maximum 50,000 characters)");
    }

    // Validate code for dangerous patterns
    // TODO: we probably want to allow some of these but still need to warn about them before executing
    // the code molecule.
    validateUserCode(code);

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
      rotate,
      move,
      scale,
      assembly,
      intersect,
      cutAssembly,
      assemblyMap,
      assemblyAsIterable,
      util.getBounds,
      fillet,
      chamfer,
      library, // TODO(tristan): I think we should deprecate this but it'll require passing the actual geom.
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

    return await Promise.race([userFunction(...inputValues), timeoutPromise]);
  } catch (error) {
    console.error("Code execution error:", error);
    throw new Error(`Code execution failed: ${error.message}`);
  }
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
async function assemblyMap(assembly, callbackFn) {
  try {
    // Helper function to process nodes recursively
    async function processNode(node, depth) {
      // If this is a leaf node
      if (
        node.geometry.length === 1 &&
        node.geometry[0].geometry === undefined
      ) {
        // Apply callback and return result
        let result = await callbackFn(node, depth);
        return result;
      }
      // This is a branch node (an assembly)
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

        // Return a new node with the same metadata but transformed children
        return {
          geometry: filteredGeometry,
          tags: node.tags || [],
          color: node.color,
          plane: node.plane,
          bom: node.bom || [],
        };
      }
    }

    // Start processing from the root
    const result = await processNode(assembly, 0);
    return result;
  } catch (error) {
    logError(error, "AssemblyMap");
    throw error;
  }
}

async function assemblyAsIterable(assembly) {
  const result = [];
  util.actOnLeafs(assembly, (leaf) => {
    result.push(leaf);
  });
  // TODO: when we typescriptify things, this should be a read-only list.
  return result;
}

function logError(error, context) {
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
  if (error.lineNumber) {
    console.error("Line number:", error.lineNumber);
  }
  if (error.columnNumber) {
    console.error("Column number:", error.columnNumber);
  }
  console.log("full error:");
  console.log(error);
}

export { executeCode };
