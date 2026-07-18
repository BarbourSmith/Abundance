import { expose } from "comlink";
import type { AnyShape, Edge, Shape3D } from "replicad";
import * as replicad from "replicad";
import { drawSVG } from "replicad-decorate";
import { chamfer, extrude, fillet, move, rotate, scale } from "./actions";
import { executeCode as code } from "./code";
import {
  createAndDisplayDefaultLayout,
  displayLayout,
  layout,
  orient,
  displayOrientation,
  clearRotateCache,
} from "./cutlayout";
import { RequestContext } from "./geometryProvider";
import {
  assembly,
  difference,
  fuseAssembly,
  fusion,
  intersect,
  loftShapes,
  shrinkWrapSketches,
} from "./interaction";
import { circle, rectangle, regularPolygon, text, vertex } from "./shapes";
import {
  bom,
  color,
  addNonReplicadGeom,
  extractAllTags,
  extractBomList,
  extractKeepOut,
  extractTag,
  tag,
} from "./tags";
import { AbundanceObject, AbundanceLeaf, geometryProvider } from "./util";
import * as util from "./util";

// --- Type Definitions ---
const started: Promise<boolean> = util.init();
void started.then(() => util.startHeapMonitor("geometryWorker"));

/**
 * Replace this worker's set of known-hanging boolean cuts. Called from the main
 * thread on every (re)start so a fresh worker skips cuts that previously hung
 * (surfacing the two offending parts in red) instead of hanging again.
 */
function setBadCuts(pairs: Array<{ toCut: string; cutter: string }>): void {
  util.geometryProvider!.setBadCuts(pairs);
}

/**
 * Returns the z-values of flat faces in the geometry, which can be used for area operations in gcode generation.
 * @param {AbundanceObject} input - The geometry to export
 * @returns {Promise<number[]>} A promise that resolves to an array of z-values corresponding to flat faces in the geometry
 */
function findFlatFaces(
  input: AbundanceObject,
  context: RequestContext,
): Promise<number[]> {
  return started.then(async () => {
    const zValues: number[] = [];
    const geometryToFilter = extractKeepOut(input);
    if (!geometryToFilter) {
      throw new Error(
        "Geometry To Export has no geometry after keepout is applied",
      );
    }
    //// Algo overview:
    // collect all prospective horizontal flats to pass to area operation
    const threshold = 0.01;
    await util.actOnLeafs(geometryToFilter, async (leaf: AbundanceLeaf) => {
      let geom = await util.geometryProvider!.get(leaf.geometry, context);
      if (!("faces" in geom)) {
        // geom is a 2D object.
        return leaf;
        // TODO: add a warning here
      } else if (geom.faces.length == 0) {
        // unexpectedly no faces on this geometry. TODO: add a warning here.
        return leaf;
      }
      geom = geom as Shape3D; // Safe to cast b/c we checked for faces above.

      // In order to be considered, a face must be...
      //  1) a flat PLANE, not a cylinder, or sphere or other curved face type.

      const isHorizontal = (normal: replicad.Vector) =>
        Math.abs(normal.x) < threshold &&
        Math.abs(normal.y) < threshold &&
        Math.abs(Math.abs(normal.z) - 1) < threshold;

      const horizontalFaces = geom.faces.filter((face) => {
        const normal = face.normalAt ? face.normalAt() : null;
        const result = normal && isHorizontal(normal);

        return result;
      });

      horizontalFaces.forEach((face) => {
        const center = face.center;
        const zVal = center.z;
        zValues.push(zVal);
      });
    });
    // Remove duplicate z values
    const uniqueZValues = Array.from(new Set(zValues));
    //Exclude the smallest and the largest z values as those are likely the floor and ceiling, and return the rest as potential flat faces for area operations.
    const filteredZValues = uniqueZValues.filter((z) => {
      return (
        z > Math.min(...uniqueZValues) + threshold &&
        z < Math.max(...uniqueZValues) - threshold
      );
    });

    return filteredZValues;
  });
}
/**
 * Prepares geometry for visualization export in various file formats (STL, STEP, SVG, TXT).
 * @param {AbundanceObject|string} input - The geometry to export (AbundanceObject for 3D formats, string for TXT)
 * @param {string} fileType - The file type for export ("STL", "STEP", "SVG", or "TXT")
 * @returns {Promise<targetID>} A promise that resolves to ID of the result when the export preparation is completed successfully
 */
function visExport(
  input: AbundanceObject | string,
  fileType: string,
  context: RequestContext,
): Promise<AbundanceObject> {
  return started.then(async () => {
    // TXT format doesn't need geometry processing, just return input as-is
    if (fileType == "TXT") {
      if (typeof input === "string") {
        return input as any;
      }
      throw new Error("TXT export requires string input");
    }
    if (typeof input === "string") {
      throw new Error(
        "String input is not valid for this export format. Use TXT export for string data.",
      );
    }

    const geometryToExport = extractKeepOut(input);
    if (!geometryToExport) {
      throw new Error(
        "Geometry To Export has no geometry after keepout is applied",
      );
    }
    const fusedGeometry = await fuseAssembly(geometryToExport, context);
    let finalGeometry = fusedGeometry;
    if (fileType == "SVG") {
      /** Fuses input geometry, draws a top view projection*/
      if (util.is3D(input)) {
        const shape3d = (await util.geometryProvider!.get(
          fusedGeometry.geometry,
          context,
        )) as AnyShape;

        const drawing = util.replicad.drawProjection(shape3d, "bottom").visible;

        const cachedGeom = await util.geometryProvider!.addSingularToCache(
          drawing,
          context,
          "export",
          [fileType, input],
        );
        finalGeometry = {
          ...fusedGeometry,
          geometry: cachedGeom,
          color: "#fefffa",
          dimension: "2D",
        };
      }
    }
    return {
      ...finalGeometry,
      color: "#fefffa",
    };
  });
}

/**
 * Exports geometry to downloadable file formats (STL, STEP, SVG, TXT).
 * @param {AbundanceObject|string} input - The geometry to export (AbundanceObject for 3D formats, string for TXT)
 * @param {string} fileType - The file type for export ("STL", "STEP", "SVG", or "TXT")
 * @param {number} svgResolution - The resolution for SVG export
 * @param {string} units - The units for scaling ("Inches", "MM", or other)
 * @returns {Promise<Blob>} A promise that resolves to a Blob containing the exported file data
 */
async function downExport(
  input: AbundanceObject | string,
  fileType: string,
  svgResolution: number,
  units: string,
  context: RequestContext,
): Promise<Blob> {
  await started;
  // TXT export
  if (fileType == "TXT") {
    if (typeof input === "string") {
      const blob = new Blob([input], { type: "text/plain;charset=utf-8" });
      return blob;
    }
    throw new Error(
      "TXT export requires string input (e.g., from a cutlist or text atom)",
    );
  }
  console.log(input);
  if (typeof input === "string") {
    throw new Error(
      "String input is not valid for this export format. Use TXT export for string data.",
    );
  }
  // For 3D exports (STL, STEP) and SVG, we need to process the geometry
  const geometryToExport = extractKeepOut(input);
  if (!geometryToExport) {
    throw new Error(
      "Geometry To Export has no geometry after keepout is applied",
    );
  }

  // As with visexport, fuse the result before exporting.
  const fusedGeometry = await fuseAssembly(geometryToExport, context);
  const geom = await util.geometryProvider!.get(
    fusedGeometry.geometry,
    context,
  );
  const scaleUnit = units == "Inches" ? 1 : units == "MM" ? 25.4 : 1;
  const scaling = svgResolution / scaleUnit;
  if (fileType == "SVG") {
    /** Fuses input geometry, draws a top view projection*/
    if (util.is3D(input)) {
      const shape3d = (await util.geometryProvider!.get(
        fusedGeometry.geometry,
        context,
      )) as AnyShape;
      const drawingResult = util.replicad.drawProjection(
        shape3d,
        "bottom",
      ).visible;

      if ("toSVG" in drawingResult == false) {
        throw new Error("SVG export requires 2D geometry");
      }
      // Flip the drawing to correct SVG orientation
      const svg = drawingResult.scale(scaling).toSVG(scaling);
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });

      return blob;
    }
  } else if (fileType == "STL") {
    if ("blobSTL" in geom == false) {
      throw new Error("STL export requires 3D geometry");
    }
    return geom.clone().blobSTL();
  } else {
    if ("blobSTEP" in geom == false) {
      throw new Error("STEP export requires 3D geometry");
    }
    return geom.clone().blobSTEP();
  }
}

/**
 * Imports a STEP file and stores the resulting geometry in the library.
 * @param {File} file - The STEP file to import
 */
async function importingSTEP(
  file: File,
  context: RequestContext,
): Promise<AbundanceObject> {
  await started;
  const STEPresult = await util.replicad.importSTEP(file);
  if (!util.geometryProvider!.isShape3D(STEPresult)) {
    throw new Error(
      "Imported STEP file describes a " +
        typeof STEPresult +
        ". Must be a Solid, Shell, Compound, or CompSolid.",
    );
  }

  return {
    geometry: await util.geometryProvider!.addSingularToCache(
      STEPresult,
      context,
      "import-step",
      [await util.hashFileContents(file)],
    ),
    tags: [],
    color: util.defaultColor,
    bom: [],
    dimension: "3D",
    plane: util.XYPlane,
  };
}

/**
 * Imports an STL file and stores the resulting geometry in the library.
 * @param {File} file - The STL file to import
 */
async function importingSTL(
  file: File,
  context: RequestContext,
): Promise<AbundanceObject> {
  await started;
  const STLresult = await util.replicad.importSTL(file);
  if (!util.geometryProvider!.isShape3D(STLresult)) {
    throw new Error(
      "Imported STL file describes a " +
        typeof STLresult +
        ". Must be a Solid, Shell, Compound, or CompSolid.",
    );
  }
  return {
    geometry: await util.geometryProvider!.addSingularToCache(
      STLresult,
      context,
      "import-stl",
      [await util.hashFileContents(file)],
    ),
    tags: [],
    color: util.defaultColor,
    bom: [],
    plane: util.XYPlane,
    dimension: "3D",
  };
}

/**
 * Imports an SVG file and creates 2D geometry, then stores it in the library.
 * @param {string} svg - The SVG content as a string
 * @param {number} width - The width to scale the SVG to
 * @throws {Error} Throws an error if the SVG import fails
 */
async function importingSVG(
  svg: string,
  context: RequestContext,
  width: number,
): Promise<AbundanceObject> {
  await started;
  const svgString = svg;

  try {
    const drawnSVG = await drawSVG(svgString, { width: width });
    const center = drawnSVG.boundingBox.center;

    return {
      geometry: await util.geometryProvider!.addSingularToCache(
        drawnSVG.clone().translate(-center[0], -center[1]),
        context,
        "import-svg",
        [await util.hashString(svg), width],
      ),
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
      dimension: "2D",
    };
  } catch (error) {
    //add alert  ----> Try tweaking your file here https://iconly.io/tools/svg-convert-stroke-to-fill "

    console.error("Error importing SVG:", error);
    throw error;
  }
}

/**
 * Visualizes G-code by parsing movement commands and creating 3D wire geometry.
 * @param {string} gcode - The G-code string to visualize
 */
/**
 * Helper function to parse gcode and create edges
 * @param gcode - Gcode string to parse
 * @param currentPosition - Current position state (modified in place)
 * @returns Array of edges created from the gcode
 */
function parseGcodeToEdges(
  gcode: string,
  currentPosition: [number, number, number],
): Edge[] {
  const edges: Edge[] = [];
  const lines = gcode.split("\n");

  lines.forEach((line) => {
    const cmd = line.trim().toUpperCase();
    if (cmd.startsWith("G0") || cmd.startsWith("G1")) {
      const xMatch = cmd.match(/X([\d.-]+)/);
      const yMatch = cmd.match(/Y([\d.-]+)/);
      const zMatch = cmd.match(/Z([\d.-]+)/);

      const x = xMatch ? Number(xMatch[1]) : currentPosition[0];
      const y = yMatch ? Number(yMatch[1]) : currentPosition[1];
      const z = zMatch ? Number(zMatch[1]) : currentPosition[2];

      const threshold = 0.001;
      if (
        Math.abs(x - currentPosition[0]) < threshold &&
        Math.abs(y - currentPosition[1]) < threshold &&
        Math.abs(z - currentPosition[2]) < threshold
      ) {
        return;
      }

      edges.push(util.replicad.makeLine(currentPosition, [x, y, z]));
      currentPosition[0] = x;
      currentPosition[1] = y;
      currentPosition[2] = z;
    }
  });

  return edges;
}

/**
 * Visualize gcode incrementally by processing individual parts and assembling wires
 * instead of assembling all edges at once. This is more efficient for projects with many parts.
 * @param gcodeArray - Array of individual gcode strings for each part
 * @param context - Request context for caching
 * @returns Promise<AbundanceObject> - The assembled visualization
 */
async function visualizeGcodeIncremental(
  gcodeArray: string[],
  context: RequestContext,
): Promise<AbundanceObject> {
  return visualizeGcodeIncrementalInternal(gcodeArray, context, false);
}

/**
 * Visualize gcode incrementally, forcing visualization even with high edge counts
 * @param gcodeArray - Array of individual gcode strings for each part
 * @param context - Request context for caching
 * @returns Promise<AbundanceObject> - The assembled visualization
 */
async function visualizeGcodeIncrementalForced(
  gcodeArray: string[],
  context: RequestContext,
): Promise<AbundanceObject> {
  return visualizeGcodeIncrementalInternal(gcodeArray, context, true);
}

/**
 * Internal implementation of gcode visualization
 * @param gcodeArray - Array of individual gcode strings for each part
 * @param context - Request context for caching
 * @param forceVisualization - Skip edge count validation if true
 * @returns Promise<AbundanceObject> - The assembled visualization
 */
async function visualizeGcodeIncrementalInternal(
  gcodeArray: string[],
  context: RequestContext,
  forceVisualization: boolean = false,
): Promise<AbundanceObject> {
  // Create a generation-specific ID by hashing all gcode content together
  // This ensures each unique set of gcode strings gets a unique generation ID
  const generationId = util.hashString(gcodeArray.join("|||"));

  // Maintain position across all parts to avoid phantom lines back to origin
  const currentPosition: [number, number, number] = [0, 0, 0];

  // Collect edges per part for individual wire assembly
  const edgesPerPart: Edge[][] = [];

  // Process each gcode part separately to create edges
  for (let i = 0; i < gcodeArray.length; i++) {
    const gcode = gcodeArray[i];
    const partEdges = parseGcodeToEdges(gcode, currentPosition);

    if (partEdges.length > 0) {
      edgesPerPart.push(partEdges);
    }
  }

  // Check edge statistics to help diagnose issues
  if (edgesPerPart.length > 0) {
    const edgeCounts = edgesPerPart.map((edges) => edges.length);
    const maxEdges = Math.max(...edgeCounts);

    // Check if any part has unusually high edge count (unless forced)
    if (!forceVisualization && maxEdges > 35000) {
      const error: any = new Error(
        "HIGH_EDGE_COUNT: Your parts have an unusually high number of edges, continuing might stall the project. Try changing your tool size or number of passes. You can still download the gcode and visualize it elsewhere.",
      );
      error.type = "HIGH_EDGE_COUNT";
      error.maxEdges = maxEdges;
      throw error;
    }
  }

  if (edgesPerPart.length === 0) {
    throw new Error("No valid gcode movements found to visualize");
  }

  // Assemble individual wires and create separate AbundanceObjects
  const wireObjects: AbundanceObject[] = [];

  for (let i = 0; i < edgesPerPart.length; i++) {
    try {
      const edges = edgesPerPart[i];
      const edgeCount = edges.length;

      // Check for potential issues that might cause hanging
      if (edgeCount === 0) {
        console.warn(
          `  ⚠️ Warning: Part ${i + 1} has 0 edges, skipping wire assembly`,
        );
        continue;
      }

      if (edgeCount > 20000) {
        console.warn(
          `  ⚠️ Warning: Part ${i + 1} has unusually high edge count (${edgeCount})`,
        );
      }

      const wire = util.replicad.assembleWire(edges);

      // Create a unique hash for this part using generation ID, index, and gcode content
      // The generationId (hash of all gcode) ensures different generations don't collide in cache
      const partHash = util.hashString(
        `gcode-part-${generationId}-${i}-${gcodeArray[i]}`,
      );

      wireObjects.push({
        geometry: await util.geometryProvider!.addSingularToCache(
          wire,
          context,
          `gcode-part-${i}`,
          [partHash],
        ),
        tags: [],
        plane: util.XYPlane,
        color: util.defaultColor,
        bom: [],
        dimension: "3D",
      });
    } catch (err) {
      console.error(`  ❌ Failed to create wire for part ${i + 1}:`, err);
      // Continue processing other parts even if one fails
    }
  }

  // Return as an assembly if multiple wires, single wire if only one
  if (wireObjects.length === 0) {
    throw new Error("No valid wires could be created");
  }

  if (wireObjects.length === 1) {
    return wireObjects[0];
  }

  // Use the assembly function to combine multiple wires
  return await assembly(wireObjects, context);
}

/**
 * EXPERIMENTAL: Visualize gcode as an assembly of separate wires
 * This allows individual wires to be created and potentially displayed progressively
 * @param gcodeArray - Array of individual gcode strings for each part
 * @param context - Request context for caching
 * @returns Promise<AbundanceObject> - The assembly of wire visualizations
 */
async function visualizeGcodeAsAssembly(
  gcodeArray: string[],
  context: RequestContext,
): Promise<AbundanceObject> {
  // Create a generation-specific ID by hashing all gcode content together
  const generationId = util.hashString(gcodeArray.join("|||"));

  const currentPosition: [number, number, number] = [0, 0, 0];
  const wireObjects: AbundanceObject[] = [];

  // Process each gcode part and create a separate AbundanceObject for each wire
  for (let i = 0; i < gcodeArray.length; i++) {
    const gcode = gcodeArray[i];
    const partEdges = parseGcodeToEdges(gcode, currentPosition);

    if (partEdges.length > 0) {
      try {
        const edgeCount = partEdges.length;

        // Check for potential issues
        if (edgeCount > 10000) {
          console.warn(
            `  ⚠️ Warning: Part ${i + 1} has unusually high edge count (${edgeCount})`,
          );
        }

        const wire = util.replicad.assembleWire(partEdges);

        // Use generationId to prevent cache collisions between different generations
        const partHash = util.hashString(
          `gcode-exp-${generationId}-${i}-${gcode}`,
        );

        wireObjects.push({
          geometry: await util.geometryProvider!.addSingularToCache(
            wire,
            context,
            `gcode-part-${i}`,
            [partHash],
          ),
          tags: [],
          plane: util.XYPlane,
          color: util.defaultColor,
          bom: [],
          dimension: "3D",
        });
      } catch (err) {
        console.error(`  ❌ Failed to create wire for part ${i + 1}:`, err);
      }
    }
  }

  // Return as an assembly
  if (wireObjects.length === 0) {
    throw new Error("No valid wires could be created");
  }

  if (wireObjects.length === 1) {
    return wireObjects[0];
  }

  // Use the assembly function to combine them
  return await assembly(wireObjects, context);
}

/**
 * Creates a pretty projection of a 3D shape for thumbnail generation.
 * @param {Object} shape - The 3D shape to create a projection from
 * @returns {Object} An object containing visible and hidden projection lines
 */
const prettyProjection = (shape: Shape3D | replicad.Wire) => {
  const bbox = shape.boundingBox;
  const center = bbox.center;
  const corner: [number, number, number] = [
    bbox.center[0] + bbox.width,
    bbox.center[1] - bbox.height,
    bbox.center[2] + bbox.depth,
  ];
  const camera = new util.replicad.ProjectionCamera(corner).lookAt(center);
  const { visible, hidden } = util.replicad.drawProjection(shape, camera);

  return { visible, hidden };
};

/**
 * Generates an SVG thumbnail representation of a geometry.
 * @param {AbundanceObject} input - geometry to generate a thumbnail for
 * @returns {Promise<string>} A promise that resolves to an SVG string representing the thumbnail
 * @throws {Error} Throws an error if the geometry is undefined or thumbnail generation fails
 */
async function generateThumbnail(
  input: AbundanceObject,
  context: RequestContext,
): Promise<string> {
  return started.then(async () => {
    const fusedAssembly = await fuseAssembly(input, context);
    const fusedGeometry = await util.geometryProvider!.get(
      fusedAssembly.geometry,
      context,
    );
    let projectionShape;
    let svg;
    if (
      util.geometryProvider!.isShape3D(fusedGeometry) ||
      fusedGeometry instanceof replicad.Wire
    ) {
      projectionShape = prettyProjection(fusedGeometry);
      svg = projectionShape.visible.toSVG();
    } else if (fusedGeometry instanceof replicad.Vertex) {
      throw new Error(
        "Cannot generate an SVG projection for a Point3D geometry.",
      );
    } else {
      projectionShape = util.replicad.drawProjection(
        (fusedGeometry as replicad.Drawing).sketchOnPlane("XY").extrude(0.0001),
        "top",
      ).visible;
      svg = projectionShape.toSVG();
    }
    //let hiddenSvg = projectionShape.hidden.toSVGPaths();
    return svg;
  });
}

function getBoundingBox(
  geometry: AbundanceObject,
  context: RequestContext,
): Promise<{ min: number[]; max: number[] }> {
  return util.getBounds(geometry, context);
}

/**
 * Check if the given geometry ID represents an assembly
 * @param {string} inputID - The geometry ID to check
 * @returns {Promise<boolean>} True if it's an assembly, false otherwise
 */
async function isAssembly(geometry: AbundanceObject): Promise<boolean> {
  await started;
  return util.isAssembly(geometry);
}

/**
 * Extract individual parts from an assembly. Returns a list of leaf nodes.
 */
async function extractParts(
  assembly: AbundanceObject,
): Promise<AbundanceLeaf[]> {
  await started;
  return util.flattenAssembly(assembly);
}

/**
 * Resets the view by returning an empty array.
 * @returns {Promise<Array>} A promise that resolves to an empty array
 */
function resetView() {
  return started.then(() => {
    return [];
  });
}

async function clearCache(context: RequestContext): Promise<boolean> {
  await started;
  return util.geometryProvider!.clearCache(context);
}

async function sweepCache(
  shapesToRetain: Set<AbundanceObject>,
  context: RequestContext,
): Promise<number> {
  await started;

  // Filter down to the set of distinct geometry ids from the given abundance objects
  const idsToRetainSet = new Set<string>();
  for (const abundanceObj of shapesToRetain) {
    for (const leaf of await util.flattenAssembly(abundanceObj)) {
      idsToRetainSet.add(leaf.geometry);
    }
  }

  return util.geometryProvider!.sweepCache(idsToRetainSet, context);
}

// Expose a function to get a point as a tuple of [x, y, z] coordinates
async function getAsPoint3D(
  geometry: string,
  context: RequestContext,
): Promise<[number, number, number]> {
  await started;
  return (
    await util.geometryProvider!._getAsPoint(geometry, context)
  ).asTuple();
}

/**
 * Extracts all geometry except those tagged as "keepout".
 * Throws an error if no geometry remains after removing keepout geometry.
 * @param {AbundanceObject} input - The geometry to filter
 * @returns {AbundanceObject} The geometry with all keepout-tagged geometry removed
 */
function extractNotKeepOut(input: AbundanceObject): AbundanceObject {
  const result = extractKeepOut(input);
  if (!result) {
    throw new Error("No geometry remaining after removing keepout geometry");
  }
  return result;
}

if (
  typeof self !== "undefined" &&
  typeof self.addEventListener === "function" &&
  process.env.NODE_ENV !== "test"
) {
  // Forward worker-thread logs to the main thread so they can be captured in a
  // System State Report. The main-thread console interceptor cannot see logs
  // that originate here (batch-operation leak warnings, OCCT failures), which
  // makes stalled-worker bugs hard to diagnose. CadWorkerManager listens for
  // `__abundanceWorkerLog` messages; comlink ignores them.
  const forwardWorkerLog = (level: string, args: unknown[]): void => {
    try {
      const message = args
        .map((a) => {
          if (a instanceof Error) {
            return a.stack || a.message;
          }
          if (typeof a === "object") {
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(" ");
      (self as unknown as Worker).postMessage({
        __abundanceWorkerLog: {
          level,
          message,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Never let diagnostics forwarding break the worker.
    }
  };

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    forwardWorkerLog("error", args);
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    forwardWorkerLog("warn", args);
    originalWarn(...args);
  };
  self.addEventListener("error", (event) => {
    forwardWorkerLog("error", [
      event.message || event.error || "uncaught worker error",
    ]);
  });
  self.addEventListener("unhandledrejection", (event) => {
    forwardWorkerLog("error", [
      "unhandledrejection:",
      (event as PromiseRejectionEvent).reason,
    ]);
  });

  const handlers = {
    importingSTEP,
    importingSTL,
    importingSVG,
    clearCache,
    clearRotateCache,
    circle,
    color,
    code,
    regularPolygon,
    rectangle,
    extrude,
    fusion,
    extractBomList,
    generateThumbnail,
    visExport,
    downExport,
    shrinkWrapSketches,
    move,
    rotate,
    scale,
    fillet,
    findFlatFaces,
    chamfer,
    difference,
    tag,
    extractAllTags,
    layout,
    displayLayout,
    orient,
    displayOrientation,
    createAndDisplayDefaultLayout,
    bom,
    addNonReplicadGeom,
    extractTag,
    extractNotKeepOut,
    intersect,
    assembly,
    loftShapes,
    text,
    vertex,
    resetView,
    visualizeGcodeIncremental,
    visualizeGcodeIncrementalForced,
    visualizeGcodeAsAssembly,
    getBoundingBox,
    isAssembly,
    extractParts,
    sweepCache,
    getAsPoint3D,
    setBadCuts,
  };

  // Gate EVERY exposed worker method on `started` (OCCT WASM init). Until
  // util.init() resolves, `util.geometryProvider` is undefined and most methods
  // access it directly (actions/interaction/shapes/code all do). On the initial
  // worker init finishes before any real work, but on a worker RESTART (e.g. the
  // 90s inactivity timeout firing on a large project), CadWorkerManager
  // re-dispatches queued calls to the fresh worker immediately — those could run
  // before init completed and fail with "util.geometryProvider is undefined"
  // (observed as many Code atoms erroring only in large projects). Awaiting an
  // already-resolved `started` is a no-op, so methods that also await it
  // internally are unaffected. This is a single choke point instead of relying
  // on each method to remember the guard (executeCode did not).
  const guardedHandlers = Object.fromEntries(
    Object.entries(handlers).map(([name, fn]) => [
      name,
      (...args: unknown[]) =>
        started.then(() => (fn as (...a: unknown[]) => unknown)(...args)),
    ]),
  );

  expose(guardedHandlers);
}

// Export functions for testing and ES module environments
export {
  assembly,
  bom,
  addNonReplicadGeom,
  chamfer,
  circle,
  clearCache,
  clearRotateCache,
  code,
  color,
  createAndDisplayDefaultLayout,
  difference,
  displayLayout,
  downExport,
  extractAllTags,
  extractNotKeepOut,
  extractParts,
  extractTag,
  extrude,
  fillet,
  findFlatFaces,
  generateThumbnail,
  getBoundingBox,
  importingSTEP,
  importingSTL,
  importingSVG,
  intersect,
  isAssembly,
  layout,
  loftShapes,
  move,
  rectangle,
  regularPolygon,
  rotate,
  scale,
  shrinkWrapSketches,
  started,
  sweepCache,
  tag,
  text,
  vertex,
  visExport,
  visualizeGcodeIncremental,
  visualizeGcodeIncrementalForced,
  visualizeGcodeAsAssembly,
  getAsPoint3D,
};
