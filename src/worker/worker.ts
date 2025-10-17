import { expose } from "comlink";
import type { AnyShape, Edge, Shape3D, ShapeMesh } from "replicad";
import * as replicad from "replicad";
import { drawSVG } from "replicad-decorate";
import { chamfer, extrude, fillet, move, rotate, scale } from "./actions";
import { executeCode as code } from "./code";
import { displayLayout, layout } from "./cutlayout";
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
  extractAllTags,
  extractBomList,
  extractKeepOut,
  extractTag,
  tag,
} from "./tags";
import type { AbundanceObject, AbundanceLeaf } from "./util";
import * as util from "./util";

// --- Type Definitions ---

type DisplayMesh = {
  cameraZoom: number;
  faces: ShapeMesh;
  edges: {
    lines: number[];
    edgeGroups: {
      start: number;
      count: number;
      edgeId: number;
    }[];
  };
  color: string;
};

let defaultMesh: any = undefined;
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
 * Prepares geometry for visualization export in various file formats (STL, STEP, SVG).
 * @param {AbundanceObject} input - The geometry to export
 * @param {string} fileType - The file type for export ("STL", "STEP", or "SVG")
 * @returns {Promise<targetID>} A promise that resolves to ID of the result when the export preparation is completed successfully
 */
function visExport(
  input: AbundanceObject,
  fileType: string,
  context: RequestContext
): Promise<AbundanceObject> {
  return started.then(async () => {
    let geometryToExport = extractKeepOut(input);
    if (!geometryToExport) {
      throw new Error(
        "Geometry To Export has no geometry after keepout is applied"
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
          context
        )) as AnyShape;
        const drawingResult = util.replicad.drawProjection(
          shape3d,
          "top"
        ).visible;
        const cachedGeom = await util.geometryProvider!.addSingularToCache(
          drawingResult,
          context
        );
        finalGeometry = {
          ...fusedGeometry,
          geometry: cachedGeom,
          dimension: "2D",
        };
      }
    }
    return {
      ...finalGeometry,
      color: displayColor,
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
  context: RequestContext
): Promise<Blob> {
  await started;
  // as with visexport, fuse the result before exporting.
  let geometryToExport = extractKeepOut(input);
  if (!geometryToExport) {
    throw new Error(
      "Geometry To Export has no geometry after keepout is applied"
    );
  }
  let fusedGeometry = await fuseAssembly(geometryToExport, context);
  const geom = await util.geometryProvider!.get(
    fusedGeometry.geometry,
    context
  );
  let scaleUnit = units == "Inches" ? 1 : units == "MM" ? 25.4 : 1;
  let scaling = svgResolution / scaleUnit;
  if (fileType == "SVG") {
    if ("toSVG" in geom == false) {
      throw new Error("SVG export requires 2D geometry");
    }
    let svg = geom.clone().scale(scaling).toSVG(scaling);
    var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });

    return blob;
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
  context: RequestContext
): Promise<AbundanceObject> {
  await started;
  let STEPresult = await util.replicad.importSTEP(file);
  if (!util.geometryProvider!.isShape3D(STEPresult)) {
    throw new Error(
      "Imported STEP file describes a " +
        typeof STEPresult +
        ". Must be a Solid, Shell, Compound, or CompSolid."
    );
  }

  return {
    geometry: await util.geometryProvider!.addSingularToCache(
      STEPresult,
      context,
      await util.hashFileContents(file)
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
  context: RequestContext
): Promise<AbundanceObject> {
  await started;
  let STLresult = await util.replicad.importSTL(file);
  if (!util.geometryProvider!.isShape3D(STLresult)) {
    throw new Error(
      "Imported STL file describes a " +
        typeof STLresult +
        ". Must be a Solid, Shell, Compound, or CompSolid."
    );
  }
  return {
    geometry: await util.geometryProvider!.addSingularToCache(
      STLresult,
      context,
      await util.hashFileContents(file)
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
  width: number
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
        await util.hashString(svg)
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
async function visualizeGcode(
  gcode: string,
  context: RequestContext
): Promise<AbundanceObject> {
  let currentPosition: [number, number, number] = [0, 0, 0];
  let edges: Edge[] = [];
  // Split the gcode into lines
  const lines = gcode.split("\n");
  lines.forEach((line) => {
    // Normalize line: trim whitespace and uppercase for robust matching
    const cmd = line.trim().toUpperCase();
    // Only process lines that start with G0 or G1
    if (cmd.startsWith("G0") || cmd.startsWith("G1")) {
      // Parse the line for X, Y, Z values
      const xMatch = cmd.match(/X([\d.-]+)/);
      const yMatch = cmd.match(/Y([\d.-]+)/);
      const zMatch = cmd.match(/Z([\d.-]+)/);

      // Update coordinates if found, otherwise keep the previous value
      let x = xMatch ? Number(xMatch[1]) : currentPosition[0];
      let y = yMatch ? Number(yMatch[1]) : currentPosition[1];
      let z = zMatch ? Number(zMatch[1]) : currentPosition[2];

      // Lower threshold to capture all movements
      const threshold = 0.001; // Accept nearly all movements
      if (
        Math.abs(x - currentPosition[0]) < threshold &&
        Math.abs(y - currentPosition[1]) < threshold &&
        Math.abs(z - currentPosition[2]) < threshold
      ) {
        return; // Skip truly negligible movements
      }

      // Create a line from the current position to the new position
      edges.push(util.replicad.makeLine(currentPosition, [x, y, z]));

      currentPosition = [x, y, z];
    }
  });
  // Create a wire from the edges

  const wire = util.replicad.assembleWire(edges);
  return {
    geometry: await util.geometryProvider!.addSingularToCache(
      wire,
      context,
      util.hashString(gcode)
    ),
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
    dimension: "3D",
  };
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
  context: RequestContext
): Promise<string> {
  return started.then(async () => {
    const fusedAssembly = await fuseAssembly(input, context);
    const fusedGeometry = await util.geometryProvider!.get(
      fusedAssembly.geometry,
      context
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
        "top"
      ).visible;
      svg = projectionShape.toSVG();
    }
    //let hiddenSvg = projectionShape.hidden.toSVGPaths();
    return svg;
  });
}

function getBoundingBox(
  geometry: AbundanceObject,
  context: RequestContext
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
  assembly: AbundanceObject
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
 * Generates and memoizes default mesh for display when no output is available.
 * @param {string} id - The unique identifier to store the default mesh in the library
 * @returns {Promise} A promise that resolves to the default text mesh
 */
async function generateDefaultMesh(context: RequestContext) {
  if (defaultMesh == undefined) {
    const defaultText = await text(
      "No output to display",
      28,
      "ROBOTO",
      context
    );
    defaultMesh = await generateDisplayMesh(defaultText, context);
  }
  return defaultMesh;
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

function getLargestBoundingBox(meshArray: ReplicadObject[]): {
  width: number;
  height: number;
  depth: number;
} {
  let overallMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let overallMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  if (!Array.isArray(meshArray)) {
    throw new Error("meshArray is not defined or not an array");
  }

  meshArray.forEach((mesh) => {
    if (!mesh.boundingBox || !Array.isArray(mesh.boundingBox.bounds)) {
      throw new Error("Invalid mesh geometry or boundingBox structure");
    }

    let boundingBox = mesh.boundingBox.bounds;
    if (
      boundingBox.length < 2 ||
      !Array.isArray(boundingBox[0]) ||
      !Array.isArray(boundingBox[1])
    ) {
      throw new Error("boundingBox bounds are not properly defined");
    }

    let min = boundingBox[0];
    let max = boundingBox[1];

    // Update overall minimum coordinates
    overallMin[0] = Math.min(overallMin[0], min[0]);
    overallMin[1] = Math.min(overallMin[1], min[1]);
    if (min[2] != undefined) {
      overallMin[2] = Math.min(overallMin[2], min[2]);
    }

    // Update overall maximum coordinates
    overallMax[0] = Math.max(overallMax[0], max[0]);
    overallMax[1] = Math.max(overallMax[1], max[1]);
    if (max[2] != undefined) {
      overallMax[2] = Math.max(overallMax[2], max[2]);
    }
  });

  // Calculate the width, height, and depth
  let width = overallMax[0] - overallMin[0];
  let height = overallMax[1] - overallMin[1];
  let depth = overallMax[2] - overallMin[2];

  return { width, height, depth };
}

function calculateZoom(boundingBox: {
  width: number;
  height: number;
  depth: number;
}): number {
  try {
    // Given example bounding box and zoom level
    const exampleBoundingBox = {
      width: 312.0005000624958,
      height: 312.00074999364347,
      depth: 432.0009977339615,
    };
    const exampleZoom = 0.5;

    // Calculate the diagonal length of the given example bounding box
    const exampleDiagonal = Math.sqrt(
      Math.pow(exampleBoundingBox.width, 2) +
        Math.pow(exampleBoundingBox.height, 2) +
        Math.pow(exampleBoundingBox.depth, 2)
    );

    // Calculate the diagonal length of the input bounding box
    const diagonal = Math.sqrt(
      Math.pow(boundingBox.width, 2) +
        Math.pow(boundingBox.height, 2) +
        Math.pow(boundingBox.depth, 2)
    );

    // Calculate the zoom level based on the proportional relationship
    const zoom = (exampleZoom * exampleDiagonal) / diagonal;
    return zoom;
  } catch (e) {
    throw new Error("Error calculating zoom level");
  }
}

function generateCameraPosition(meshArray: ReplicadObject[]): number {
  // Get the largest bounding box from the mesh array
  let largestBoundingBox = getLargestBoundingBox(meshArray);
  let zoom = calculateZoom(largestBoundingBox);

  return zoom;
}

async function generateDisplayMesh(
  id: AbundanceObject,
  context: RequestContext
): Promise<DisplayMesh[]> {
  await started;
  console.log("Generating display mesh for ID:", JSON.stringify(id));
  let geom = undefined;
  if (util.isAbundanceObject(id)) {
    geom = id;
  } else {
    return generateDefaultMesh(context);
  }

  // Flatten the assembly to remove hierarchy
  const flattened = util.flattenAssembly(geom);

  let meshArray: { color: string; geometry: ReplicadObject }[] = [];

  for (let i = 0; i < flattened.length; i++) {
    const displayObject = flattened[i];
    let cleanedGeometry;
    // TODO: would love a better way to check if geometry is 2D or 3D.
    const geom = await util.geometryProvider!.get(
      displayObject.geometry,
      context
    );
    if (!("mesh" in geom) || geom.mesh == undefined) {
      cleanedGeometry = await util.geometryProvider!.get(
        await util.geometryProvider!.extrude(
          displayObject.geometry,
          displayObject.plane,
          0.0001,
          context
        ),
        context
      );
    } else {
      cleanedGeometry = geom;
    }
    meshArray.push({
      color: displayObject.color,
      geometry: cleanedGeometry,
    });
  }

  let cameraZoom;
  try {
    cameraZoom = generateCameraPosition(meshArray.map((m) => m.geometry));
  } catch (e) {
    cameraZoom = 1;
  }

  let finalMeshes = [];
  // Iterate through the meshArray and create final meshes with faces, edges and color to pass to display
  for (const meshObj of meshArray) {
    try {
      let sketchPlane = util.asReplicadPlane(geom.plane);
      if (meshObj.geometry instanceof replicad.Drawing) {
        const threeDShape = meshObj.geometry
          .sketchOnPlane(sketchPlane)
          .extrude(0.0001);
        finalMeshes.push({
          cameraZoom: cameraZoom,
          faces: threeDShape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }),
          edges: threeDShape.meshEdges({
            tolerance: 0.1,
            angularTolerance: 0.5,
          }),
          color: meshObj.color,
        });
      } else {
        finalMeshes.push({
          cameraZoom: cameraZoom,
          faces: meshObj.geometry.mesh({
            tolerance: 0.1,
            angularTolerance: 0.5,
          }),
          edges: meshObj.geometry.meshEdges({
            tolerance: 0.1,
            angularTolerance: 0.5,
          }),
          color: meshObj.color,
        });
      }
    } catch (e) {
      throw new Error("Error generating display mesh" + e);
    }
  }
  return finalMeshes;
}

async function clearCache(context: RequestContext): Promise<boolean> {
  await started;
  return util.geometryProvider!.clearCache(context);
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
    createMesh,
    circle,
    color,
    code,
    regularPolygon,
    rectangle,
    generateDisplayMesh,
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
    chamfer,
    difference,
    tag,
    extractAllTags,
    layout,
    displayLayout,
    bom,
    extractTag,
    intersect,
    assembly,
    loftShapes,
    text,
    resetView,
    visualizeGcode,
    getBoundingBox,
    isAssembly,
    extractParts,
  });
}

// Export functions for testing and ES module environments
export {
  assembly,
  bom,
  chamfer,
  circle,
  code,
  color,
  createMesh,
  deleteFromLibrary,
  clearCache,
  difference,
  displayLayout,
  downExport,
  extractAllTags,
  extractParts,
  extractTag,
  extrude,
  fillet,
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
  tag,
  text,
  visExport,
  visualizeGcode,
};
