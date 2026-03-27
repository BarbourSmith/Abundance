import { expose } from "comlink";
import type { AnyShape, Drawing, Edge, Shape3D, ShapeMesh } from "replicad";
import * as replicad from "replicad";
import { drawSVG } from "replicad-decorate";
import { chamfer, extrude, fillet, move, rotate, scale } from "./actions";
import { executeCode as code } from "./code";
import {
  createAndDisplayDefaultLayout,
  displayLayout,
  layout,
  clearRotateCache,
} from "./cutlayout";
import { ReplicadObject, RequestContext } from "./geometryProvider";
import {
  assembly,
  difference,
  fuseAssembly,
  fusion,
  intersect,
  loftShapes,
  shrinkWrapSketches,
} from "./interaction";
import { circle, rectangle, regularPolygon, text } from "./shapes";
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
import type { AbundanceObject, AbundanceLeaf } from "./util";
import * as util from "./util";

// --- Type Definitions ---
const started: Promise<boolean> = util.init();

/**
 * Deletes a geometry from the library.
 * @param inputID - The library ID to delete.
 */
function deleteFromLibrary(inputID: string): Promise<boolean> {
  return started;
}

/**
 * Creates a mesh with the specified thickness.
 * @param thickness - The thickness value for the mesh.
 * @returns {Promise<any[]>}
 */
function createMesh(thickness: number): Promise<any[]> {
  return started.then(() => {
    return [];
  });
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
    let geometryToFilter = extractKeepOut(input);
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

      const isHorizontal = (normal) =>
        Math.abs(normal.x) < threshold &&
        Math.abs(normal.y) < threshold &&
        Math.abs(Math.abs(normal.z) - 1) < threshold;

      const horizontalFaces = geom.faces.filter((face, idx) => {
        const normal = face.normalAt ? face.normalAt() : null;
        const result = normal && isHorizontal(normal);

        return result;
      });

      horizontalFaces.forEach((face, idx) => {
        const center = face.center;
        const zVal = center[2] ?? center.z;
        zValues.push(zVal);
      });
    });
    // Remove duplicate z values
    const uniqueZValues = Array.from(new Set(zValues));
    //Exclude the smallest and the largest z values as those are likely the floor and ceiling, and return the rest as potential flat faces for area operations.
    let filteredZValues = uniqueZValues.filter((z) => {
      return (
        z > Math.min(...uniqueZValues) + threshold &&
        z < Math.max(...uniqueZValues) - threshold
      );
    });

    return filteredZValues;
  });
}

/**
 * Prepares geometry for visualization export in various file formats (STL, STEP, SVG).
 * @param {AbundanceObject} input - The geometry to export
 * @param {string} fileType - The file type for export ("STL", "STEP", or "SVG")
 * @returns {Promise<targetID>} A promise that resolves to ID of the result when the export preparation is completed successfully
 */
function visExport(
  input: AbundanceObject,
  fileType: string,
  context: RequestContext,
): Promise<AbundanceObject> {
  return started.then(async () => {
    let geometryToExport = extractKeepOut(input);
    if (!geometryToExport) {
      throw new Error(
        "Geometry To Export has no geometry after keepout is applied",
      );
    }
    let fusedGeometry = await fuseAssembly(geometryToExport, context);
    let displayColor =
      fileType == "STL"
        ? "#91C8D5"
        : fileType == "STEP"
          ? "#ACAFDD"
          : "#5A5A5A";
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
 * Exports geometry to downloadable file formats (STL, STEP, SVG).
 * @param {AbundanceObject} input - The geometry to export
 * @param {string} fileType - The file type for export ("STL", "STEP", or "SVG")
 * @param {number} svgResolution - The resolution for SVG export
 * @param {string} units - The units for scaling ("Inches", "MM", or other)
 * @returns {Promise<Blob>} A promise that resolves to a Blob containing the exported file data
 */
async function downExport(
  input: AbundanceObject,
  fileType: string,
  svgResolution: number,
  units: string,
  context: RequestContext,
): Promise<Blob> {
  await started;
  // as with visexport, fuse the result before exporting.
  let geometryToExport = extractKeepOut(input);
  if (!geometryToExport) {
    throw new Error(
      "Geometry To Export has no geometry after keepout is applied",
    );
  }
  let fusedGeometry = await fuseAssembly(geometryToExport, context);
  const geom = await util.geometryProvider!.get(
    fusedGeometry.geometry,
    context,
  );
  let scaleUnit = units == "Inches" ? 1 : units == "MM" ? 25.4 : 1;
  let scaling = svgResolution / scaleUnit;
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
      let svg = drawingResult.scale(scaling).toSVG(scaling);
      var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });

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
  let STEPresult = await util.replicad.importSTEP(file);
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
  let STLresult = await util.replicad.importSTL(file);
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
  const baseWidth = width + width * 0.05;
  const baseShape = util.replicad
    .drawRectangle(baseWidth, baseWidth)
    .sketchOnPlane()
    .extrude(1);
  const svgString = svg;

  /* Add svg to face, consider bringing back if we are ever able to choose faces or want to add pattern to face
  addSVG(baseShape, {
    faceIndex: 5,
    depth: depth,
    svgString: svgString,
    width: width,
  })*/
  try {
    let drawnSVG = await drawSVG(svgString, { width: width });
    let center = drawnSVG.boundingBox.center;

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

      let x = xMatch ? Number(xMatch[1]) : currentPosition[0];
      let y = yMatch ? Number(yMatch[1]) : currentPosition[1];
      let z = zMatch ? Number(zMatch[1]) : currentPosition[2];

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
  console.log(`\n=== Gcode Visualization with Individual Wire Assembly ===`);
  console.log(`Processing ${gcodeArray.length} gcode parts`);
  if (forceVisualization) {
    console.log(`⚠️ Force mode enabled - skipping edge count validation`);
  }

  // Create a generation-specific ID by hashing all gcode content together
  // This ensures each unique set of gcode strings gets a unique generation ID
  const generationId = util.hashString(gcodeArray.join("|||"));

  const overallStart = performance.now();

  // Maintain position across all parts to avoid phantom lines back to origin
  const currentPosition: [number, number, number] = [0, 0, 0];

  // Collect edges per part for individual wire assembly
  const edgesPerPart: Edge[][] = [];

  // Process each gcode part separately to create edges
  const parseStart = performance.now();
  for (let i = 0; i < gcodeArray.length; i++) {
    const gcode = gcodeArray[i];
    const partEdges = parseGcodeToEdges(gcode, currentPosition);

    if (partEdges.length > 0) {
      edgesPerPart.push(partEdges);
    }
  }
  const parseTime = performance.now() - parseStart;

  // Log edge statistics to help diagnose issues
  if (edgesPerPart.length > 0) {
    const edgeCounts = edgesPerPart.map((edges) => edges.length);
    const totalEdges = edgeCounts.reduce((sum, count) => sum + count, 0);
    const minEdges = Math.min(...edgeCounts);
    const maxEdges = Math.max(...edgeCounts);
    const avgEdges = (totalEdges / edgeCounts.length).toFixed(1);

    console.log(`\nEdge Statistics:`);
    console.log(`  Total edges: ${totalEdges}`);
    console.log(`  Average edges per part: ${avgEdges}`);

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
  console.log(`\n--- Assembling Individual Wires ---`);
  const assemblyStart = performance.now();
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

      const wireStart = performance.now();
      const wire = util.replicad.assembleWire(edges);
      const wireTime = performance.now() - wireStart;

      console.log(
        `  ✓ Wire assembly completed for part ${i + 1} in ${wireTime.toFixed(2)}ms`,
      );

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

      // Log progress: first 5 parts, every 10th part, and last part
      const shouldLog =
        i < 5 || i === edgesPerPart.length - 1 || (i + 1) % 10 === 0;
      if (shouldLog) {
        console.log(
          `  Part ${i + 1}/${edgesPerPart.length}: ${edgeCount} edges in ${wireTime.toFixed(2)}ms`,
        );
      }
    } catch (err) {
      console.error(`  ❌ Failed to create wire for part ${i + 1}:`, err);
      // Continue processing other parts even if one fails
    }
  }

  const assemblyTime = performance.now() - assemblyStart;
  console.log(
    `\nAssembled ${wireObjects.length} wires in ${assemblyTime.toFixed(2)}ms`,
  );
  if (wireObjects.length > 0) {
    console.log(
      `Average per wire: ${(assemblyTime / wireObjects.length).toFixed(2)}ms`,
    );
  }

  const overallTime = performance.now() - overallStart;
  console.log(`Total visualization time: ${overallTime.toFixed(2)}ms`);
  console.log(`===========================================\n`);

  // Return as an assembly if multiple wires, single wire if only one
  if (wireObjects.length === 0) {
    throw new Error("No valid wires could be created");
  }

  if (wireObjects.length === 1) {
    return wireObjects[0];
  }

  // Use the assembly function to combine multiple wires
  console.log(`Creating assembly of ${wireObjects.length} wire objects...`);
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
  console.log(`\n=== Experimental: Gcode as Assembly ===`);
  const startTime = performance.now();

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

        // Log edge information before wire assembly
        console.log(
          `\n  [Wire Assembly] Experimental part ${i + 1}/${gcodeArray.length}: ${edgeCount} edges`,
        );

        // Check for potential issues
        if (edgeCount > 10000) {
          console.warn(
            `  ⚠️ Warning: Part ${i + 1} has unusually high edge count (${edgeCount})`,
          );
        }

        const wireStart = performance.now();
        const wire = util.replicad.assembleWire(partEdges);
        const wireTime = performance.now() - wireStart;

        console.log(
          `  ✓ Experimental wire assembly completed for part ${i + 1} in ${wireTime.toFixed(2)}ms`,
        );

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

  const assemblyTime = performance.now() - startTime;
  console.log(
    `Created assembly with ${wireObjects.length} wires in ${assemblyTime.toFixed(2)}ms`,
  );
  console.log(`Note: This approach may show wires as disconnected in the UI`);
  console.log(`=======================================\n`);

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
    } else {
      projectionShape = util.replicad.drawProjection(
        fusedGeometry.sketchOnPlane("XY").extrude(0.0001),
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

let colorOptions = {
  Default: util.defaultColor,
  Red: "#FF9065",
  Orange: "#FFB458",
  Yellow: "#FFD600",
  Olive: "#C7DF66",
  Teal: "#71D1C2",
  "Light Blue": "#75DBF2",
  Green: "#A3CE5B",
  "Lavender ": "#CCABED",
  Brown: "#CFAB7C",
  Pink: "#FFB09D",
  Sand: "#E2C66C",
  Clay: "#C4D3AC",
  Blue: "#91C8D5",
  "Light Green": "#96E1BB",
  Purple: "#ACAFDD",
  "Light Purple": "#DFB1E8",
  Tan: "#F5D3B6",
  "Mauve ": "#DBADA9",
  Grey: "#BABABA",
  Black: "#5A5A5A",
  White: "#FFFCF7",
  "Keep Out": "#E0E0E0",
};

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
  let idsToRetainSet = new Set<string>();
  for (let abundanceObj of shapesToRetain) {
    for (let leaf of await util.flattenAssembly(abundanceObj)) {
      idsToRetainSet.add(leaf.geometry);
    }
  }

  return util.geometryProvider!.sweepCache(idsToRetainSet, context);
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
  expose({
    deleteFromLibrary,
    importingSTEP,
    importingSTL,
    importingSVG,
    clearCache,
    clearRotateCache,
    createMesh,
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
    createAndDisplayDefaultLayout,
    bom,
    addNonReplicadGeom,
    extractTag,
    extractNotKeepOut,
    intersect,
    assembly,
    loftShapes,
    text,
    resetView,
    visualizeGcodeIncremental,
    visualizeGcodeIncrementalForced,
    visualizeGcodeAsAssembly,
    getBoundingBox,
    isAssembly,
    extractParts,
    sweepCache,
  });
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
  createMesh,
  deleteFromLibrary,
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
  visExport,
  visualizeGcodeIncremental,
  visualizeGcodeIncrementalForced,
  visualizeGcodeAsAssembly,
};
