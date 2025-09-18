import { expose } from "comlink";
import type { AnyShape, Edge, Shape3D, ShapeMesh } from "replicad";
import * as replicad from "replicad";
import { drawSVG } from "replicad-decorate";
import * as actions from "./actions";
import * as codeLib from "./code";
import type { LayoutConfig, Placement } from "./cutlayout";
import * as cutlayout from "./cutlayout";
import { ReplicadObject } from "./geometryProvider";
import * as interaction from "./interaction";
import * as shapes from "./shapes";
import * as tags from "./tags";
import type { AbundanceObject } from "./util";
import * as util from "./util";

// --- Type Definitions ---

type Library = Record<string, AbundanceObject>;
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

const library: Library = {};
let defaultMesh: any = undefined;
const started: Promise<boolean> = util.init();

function getOrThrow(id: string): AbundanceObject {
  if (id == undefined) {
    throw new Error("Missing a required input");
  }
  if (!library[id]) {
    throw new Error(`Library ID ${id} does not exist.`);
  }
  if (library[id] instanceof Promise) {
    throw new Error("Someone put a promise into the library at: " + id);
  }
  return library[id];
}

async function code(
  targetID: string,
  codeText: string,
  argumentsArray: any[]
): Promise<string> {
  await started;
  const result = await codeLib.executeCode(codeText, argumentsArray, library);
  library[targetID] = result;
  return targetID;
}

/**
 * Lay out the parts from inputID to be cut out from a sheet of material.
 */
async function layout(
  targetID: string,
  inputID: string,
  progressCallback: (progress: number, cancelCallback: () => void) => void,
  warningCallback: (msg: string) => void,
  placementCallback: (placements: Placement[][]) => void,
  layoutConfig: LayoutConfig,
  priorPlacements?: Placement[][]
): Promise<Placement[][]> {
  await started;
  return cutlayout
    .layout(
      getOrThrow(inputID),
      progressCallback,
      warningCallback,
      placementCallback,
      layoutConfig,
      priorPlacements
    )
    .then((resultArray: [AbundanceObject, Placement[][]]) => {
      const [layedOutAssembly, positions] = resultArray;
      library[targetID] = layedOutAssembly;
      return positions;
    });
}

/**
 * Lays out the parts of InputID according to the positions described in placements.
 */
async function displayLayout(
  targetID: string,
  inputID: string,
  placements: Placement[][],
  warningCallback: (msg: string) => void,
  layoutConfig: LayoutConfig
): Promise<string> {
  await started;
  const result = await cutlayout.displayLayout(
    getOrThrow(inputID),
    placements,
    warningCallback,
    layoutConfig
  );
  library[targetID] = result;
  return targetID;
}

/**
 * Deletes a geometry from the library.
 * @param inputID - The library ID to delete.
 * @returns {Promise<void>}
 */
function deleteFromLibrary(inputID: string): Promise<void> {
  return started.then(() => {
    delete library[inputID];
  });
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
 * Creates a circle geometry and stores it in the library.
 * @param id - The unique identifier for the circle.
 * @param diameter - The diameter of the circle.
 * @returns {Promise<string>}
 */
async function circle(id: string, diameter: number): Promise<string> {
  await started;
  library[id] = await shapes.circle(diameter);
  return id;
}

/**
 * Creates a rectangle geometry and stores it in the library.
 * @param targetID - The unique identifier for the rectangle.
 * @param x - The width of the rectangle.
 * @param y - The height of the rectangle.
 * @returns {Promise<string>}
 */
async function rectangle(
  targetID: string,
  x: number,
  y: number
): Promise<string> {
  await started;
  library[targetID] = await shapes.rectangle(x, y);
  return targetID;
}

/**
 * Creates a regular polygon geometry and stores it in the library.
 * @param id - The unique identifier for the polygon.
 * @param radius - The radius of the polygon.
 * @param numberOfSides - The number of sides.
 * @returns {Promise<string>}
 */
async function regularPolygon(
  id: string,
  radius: number,
  numberOfSides: number
): Promise<string> {
  await started;
  library[id] = await shapes.regularPolygon(radius, numberOfSides);
  return id;
}

/**
 * Creates text geometry and stores it in the library.
 * @param id - The unique identifier for the text geometry.
 * @param text - The text content.
 * @param fontSize - The font size.
 * @param fontFamily - The font family.
 * @returns {Promise<string>}
 */
async function text(
  id: string,
  text: string,
  fontSize: number,
  fontFamily: string
): Promise<string> {
  await started;
  const result = await shapes.text(text, fontSize, fontFamily);
  library[id] = result;
  return id;
}

/**
 * Creates a loft shape by blending between multiple 2D sketches and stores it in the library.
 * @param {string} targetID - The unique identifier to store the lofted geometry in the library
 * @param {string[]} inputsIDs - Array of library IDs containing 2D sketches to be lofted
 * @returns {Promise<string>} A promise that resolves to the ID of the created loft geometry
 * @throws {Error} Throws an error if input parts are not sketches or contain interior geometries
 */
async function loftShapes(
  targetID: string,
  inputsIDs: string[]
): Promise<string> {
  await started;
  library[targetID] = await interaction.loftShapes(
    (inputsIDs || []).map(getOrThrow)
  );
  return targetID;
}

/**
 * Extrudes a 2D sketch to create a 3D geometry with the specified height and stores it in the library.
 * @param {string} targetID - The unique identifier to store the extruded geometry in the library
 * @param {string} inputID - The library ID of the 2D sketch to be extruded
 * @param {number} height - The height to extrude the sketch
 * @returns {Promise<boolean>} A promise that resolves to true when the extrusion is completed successfully
 */
async function extrude(
  targetID: string,
  inputID: string,
  height: number
): Promise<string> {
  await started;
  library[targetID] = await actions.extrude(getOrThrow(inputID), height);
  return targetID;
}

/**
 * Moves a geometry by the specified x, y, and z distances.
 * @param {string} geom - The library ID of the geometry to move
 * @param {number} x - The distance to move along the x-axis
 * @param {number} y - The distance to move along the y-axis
 * @param {number} z - The distance to move along the z-axis
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the moved geometry, or true if targetID is provided
 */
async function move(
  geom: string,
  x: number,
  y: number,
  z: number,
  targetID: string
): Promise<string | boolean> {
  await started;
  const result = await actions.move(getOrThrow(geom), x, y, z);
  library[targetID] = result;
  return targetID;
}

/**
 * Function to rotate a geometry around the x, y, and z axis
 * @param {string} inputId - Library ID of the geometry to rotate
 * @param {number} x - The angle to rotate around the x axis
 * @param {number} y - The angle to rotate around the y axis
 * @param {number} z - The angle to rotate around the z axis
 * @param {string} targetID - The ID to store the result in. If it undefined the result will be returned instead
 * @returns {Promise<boolean|Object>} A promise that resolves to the rotated geometry or true if targetID is provided
 **/
async function rotate(
  geom: string,
  x: number,
  y: number,
  z: number,
  targetID: string
): Promise<string | boolean> {
  await started;

  const result = await actions.rotate(getOrThrow(geom), x, y, z);
  library[targetID] = result;
  return targetID;
}

/**
 * Scales a geometry by the specified scale factor.
 * @param {string} inputId - libraryId of the geometry to scale
 * @param {number} scaleFactor - The scale factor to apply (1.0 = no change, 2.0 = double size, 0.5 = half size)
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the scaled geometry, or true if targetID is provided
 */
async function scale(
  geom: string,
  scaleFactor: number,
  targetID: string
): Promise<string | boolean> {
  await started;

  const result = await actions.scale(getOrThrow(geom), scaleFactor);
  library[targetID] = result;
  return targetID;
}

/**
 * Applies a fillet (rounded edge) to the input geometry.
 * @param {string} inputId - inputId of the geometry to fillet
 * @param {number} radius - The radius of the fillet
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the filleted geometry or true if targetID is provided
 */
async function fillet(
  geom: string,
  radius: number,
  targetID: string
): Promise<string | boolean> {
  await started;

  const result = await actions.fillet(getOrThrow(geom), radius);
  library[targetID] = result;
  return targetID;
}

/**
 * Applies a chamfer (beveled edge) to the input geometry.
 * @param {Object|string} geom - The geometry to chamfer, or library ID for same
 * @param {number} size - The size of the chamfer
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the chamfered geometry or true if targetID is provided
 */
async function chamfer(
  geom: string,
  size: number,
  targetID: string
): Promise<string> {
  await started;

  const result = await actions.chamfer(getOrThrow(geom), size);
  library[targetID] = result;
  return targetID;
}

/**
 * Performs a boolean difference operation between two geometries.
 * This function subtracts the second geometry (cutter) from the first geometry (target).
 *
 * @param {string} targetID - The ID where the resulting geometry will be stored in the library
 * @param {string} input1ID - The ID of the base geometry from which material will be removed
 * @param {string} input2ID - The ID of the cutting geometry that will be subtracted
 * @returns {Promise<boolean>} - A promise that resolves to true when the operation completes
 * @throws {Error} - If the input geometries are not of the same type (both must be either 3D or 2D)
 *
 * The function maintains all metadata from the base geometry including tags, color, plane, and BOM.
 * If the base geometry is an assembly, the cut operation is applied to each leaf independently.
 * Uses bounding box checks to avoid processing cuts for non-overlapping geometries.
 */
function difference(
  targetID: string,
  input1ID: string,
  input2ID: string
): Promise<string> {
  return started.then(async () => {
    library[targetID] = await interaction.difference(
      getOrThrow(input1ID),
      getOrThrow(input2ID)
    );
    return targetID;
  });
}

/**
 * Creates a shrink-wrapped boundary around multiple 2D sketches and stores it in the library.
 * @param {string} targetID - The unique identifier to store the shrink-wrapped geometry in the library
 * @param {string[]} inputIDs - Array of library IDs containing 2D sketches to be shrink-wrapped
 * @returns {Promise<boolean>} A promise that resolves to true when the shrink wrapping is completed successfully
 * @throws {Error} Throws an error if inputs are not all sketches or if sketches have interior geometries
 */
function shrinkWrapSketches(
  targetID: string,
  inputIDs: string[]
): Promise<string> {
  return started.then(async () => {
    library[targetID] = await interaction.shrinkWrapSketches(
      inputIDs.map(getOrThrow)
    );
    return targetID;
  });
}

/**
 * Performs a boolean intersection operation between two geometries.
 * @param {string|Object} input1ID - The ID of the first geometry or the geometry object itself
 * @param {string|Object} input2ID - The ID of the second geometry or the geometry object itself
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to true if targetID is provided, or the intersected geometry if targetID is null
 */
function intersect(
  input1ID: string,
  input2ID: string,
  targetID: string
): Promise<string> {
  return started.then(async () => {
    const result = await interaction.intersect(
      getOrThrow(input1ID),
      getOrThrow(input2ID)
    );
    library[targetID] = result;
    return targetID;
  });
}

/**
 * Adds tags to a geometry and stores the tagged geometry in the library.
 * @param {string} targetID - The unique identifier to store the tagged geometry in the library
 * @param {string} inputID - The library ID of the geometry to tag
 * @param {string[]} TAG - Array of tags to add to the geometry
 * @returns {Promise<boolean>} A promise that resolves to true when the tagging is completed successfully
 */
function tag(
  targetID: string,
  inputID: string,
  TAG: string[]
): Promise<string> {
  return started.then(() => {
    library[targetID] = tags.tag(getOrThrow(inputID), TAG);
    return targetID;
  });
}

/**
 * Extracts and returns all tags from a geometry and its subassemblies.
 * @param {string} inputID - The library ID of the geometry to extract tags from
 * @returns {Promise<string[]>} A promise that resolves to an array of all unique tags, with "Select Tag" as the first element
 * @throws {Error} Throws an error if the geometry with the specified ID is not found in the library
 */
function extractAllTags(inputID: string): Promise<string[]> {
  return started.then(() => {
    return tags.extractAllTags(getOrThrow(inputID));
  });
}

/**
 * Applies a color to a geometry and stores the colored geometry in the library.
 * @param {string} targetID - The unique identifier to store the colored geometry in the library
 * @param {string} inputID - The library ID of the geometry to color
 * @param {string} color - The color to apply to the geometry (hex color code)
 * @returns {Promise} A promise that resolves when the coloring operation is completed
 * @note If the color is "#D9544D", a "keepout" tag is automatically added to the geometry
 */
function color(
  targetID: string,
  inputID: string,
  color: string
): Promise<string> {
  return started.then(() => {
    library[targetID] = tags.color(getOrThrow(inputID), color);
    return targetID;
  });
}

/**
 * Adds a Bill of Materials (BOM) entry to a geometry and stores it in the library.
 * @param {string} targetID - The unique identifier to store the geometry with BOM in the library
 * @param {string} inputID - The library ID of the geometry to add BOM entry to
 * @param {Object} BOM - The BOM entry to add to the geometry
 * @returns {Promise<boolean>} A promise that resolves to true when the BOM addition is completed successfully
 */
function bom(targetID: string, inputID: string, BOM: string): Promise<string> {
  return started.then(() => {
    library[targetID] = tags.bom(getOrThrow(inputID), BOM);
    return targetID;
  });
}

/**
 * Extracts geometry with a specific tag and stores it in the library.
 * @param {string} targetID - The unique identifier to store the extracted geometry in the library
 * @param {string} inputID - The library ID of the geometry to extract from
 * @param {string} TAG - The specific tag to search for and extract
 * @returns {Promise<boolean>} A promise that resolves to true when the extraction is completed successfully
 * @throws {Error} Throws an error if the specified tag is not found in the geometry
 */
function extractTag(
  targetID: string,
  inputID: string,
  TAG: string
): Promise<string> {
  return started.then(() => {
    library[targetID] = tags.extractTag(getOrThrow(inputID), TAG);
    return targetID;
  });
}

/**
 * Copies a geometry from one library location to another, typically used for output connections.
 * @param {string} targetID - The unique identifier to store the output geometry in the library
 * @param {string} inputID - The library ID of the geometry to output
 * @returns {Promise<boolean>} A promise that resolves to true when the output operation is completed successfully
 * @throws {Error} Throws an error if nothing is connected to the output (inputID is undefined)
 */
function output(targetID: string, inputID: string): Promise<string> {
  return started.then(() => {
    if (library[inputID] != undefined) {
      library[targetID] = library[inputID];
    } else {
      throw new Error("Nothing is connected to the output");
    }

    return targetID;
  });
}

/**
 * Copies a geometry from one library location to another, typically used for molecule connections.
 * @param {string} targetID - The unique identifier to store the molecule geometry in the library
 * @param {string} inputID - The library ID of the geometry to copy for the molecule
 * @returns {Promise<boolean>} A promise that resolves to true when the molecule operation is completed successfully
 * @throws {Error} Throws an error if the output ID is undefined
 */
function molecule(targetID: string, inputID: string): Promise<string> {
  return started.then(() => {
    if (library[inputID] != undefined) {
      library[targetID] = library[inputID];
    } else {
      throw new Error("output ID is undefined");
    }
    return targetID;
  });
}

/**
 * Extracts the Bill of Materials (BOM) list from a geometry.
 * @param {string} inputID - The library ID of the geometry to extract BOM from
 * @returns {Array|boolean} The BOM array if it exists, or false if BOM is undefined
 */
function extractBomList(inputID: string): string[] | false {
  return tags.extractBomList(getOrThrow(inputID));
}

/**
 * Prepares geometry for visualization export in various file formats (STL, STEP, SVG).
 * @param {string} targetID - The unique identifier to store the prepared export geometry in the library
 * @param {string} inputID - The library ID of the geometry to prepare for export
 * @param {string} fileType - The file type for export ("STL", "STEP", or "SVG")
 * @returns {Promise<targetID>} A promise that resolves to ID of the result when the export preparation is completed successfully
 */
function visExport(
  targetID: string,
  inputID: string,
  fileType: string
): Promise<string> {
  return started.then(async () => {
    let geometryToExport = tags.extractKeepOut(library[inputID]);
    if (!geometryToExport) {
      throw new Error(
        "Geometry To Export has no geometry after keepout is applied"
      );
    }
    let fusedGeometry = await interaction.digFuse(geometryToExport);
    let displayColor =
      fileType == "STL"
        ? "#91C8D5"
        : fileType == "STEP"
        ? "#ACAFDD"
        : "#3C3C3C";
    let finalGeometry = fusedGeometry;
    if (fileType == "SVG") {
      /** Fuses input geometry, draws a top view projection*/
      if (util.is3D(library[inputID])) {
        const shape3d = (await util.geometryProvider!.get(
          fusedGeometry.geometry
        )) as AnyShape;
        const drawingResult = util.replicad.drawProjection(
          shape3d,
          "top"
        ).visible;
        const cachedGeom = await util.geometryProvider!.addSingularToCache(
          drawingResult
        );
        finalGeometry = {
          ...fusedGeometry,
          geometry: cachedGeom,
          dimension: "2D",
        };
      }
    }
    library[targetID] = {
      ...finalGeometry,
      color: displayColor,
    };
    return targetID;
  });
}

/**
 * Exports geometry to downloadable file formats (STL, STEP, SVG).
 * @param {string} ID - The library ID of the geometry to export
 * @param {string} fileType - The file type for export ("STL", "STEP", or "SVG")
 * @param {number} svgResolution - The resolution for SVG export
 * @param {string} units - The units for scaling ("Inches", "MM", or other)
 * @returns {Promise<Blob>} A promise that resolves to a Blob containing the exported file data
 */
function downExport(
  inputID: string,
  fileType: string,
  svgResolution: number,
  units: string
): Promise<Blob> {
  return started.then(async () => {
    // as with visexport, fuse the result before exporting.
    let geometryToExport = tags.extractKeepOut(library[inputID]);
    if (!geometryToExport) {
      throw new Error(
        "Geometry To Export has no geometry after keepout is applied"
      );
    }
    let fusedGeometry = await interaction.digFuse(geometryToExport);
    const geom = await util.geometryProvider!.get(fusedGeometry.geometry);
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
  });
}

/**
 * Imports a STEP file and stores the resulting geometry in the library.
 * @param {string} targetID - The unique identifier to store the imported geometry in the library
 * @param {File} file - The STEP file to import
 * @returns {Promise<boolean>} A promise that resolves to true when the import is completed successfully
 */
async function importingSTEP(targetID: string, file: File) {
  let STEPresult = await util.replicad.importSTEP(file);
  if (!util.geometryProvider!.isShape3D(STEPresult)) {
    throw new Error(
      "Imported STEP file describes a " +
        typeof STEPresult +
        ". Must be a Solid, Shell, Compound, or CompSolid."
    );
  }

  library[targetID] = {
    geometry: await util.geometryProvider!.addSingularToCache(STEPresult),
    tags: [],
    color: util.defaultColor,
    bom: [],
    dimension: "3D",
    plane: util.XYPlane,
  };
  return targetID;
}

/**
 * Imports an STL file and stores the resulting geometry in the library.
 * @param {string} targetID - The unique identifier to store the imported geometry in the library
 * @param {File} file - The STL file to import
 * @returns {Promise<boolean>} A promise that resolves to true when the import is completed successfully
 */
async function importingSTL(targetID: string, file: File) {
  let STLresult = await util.replicad.importSTL(file);
  if (!util.geometryProvider!.isShape3D(STLresult)) {
    throw new Error(
      "Imported STL file describes a " +
        typeof STLresult +
        ". Must be a Solid, Shell, Compound, or CompSolid."
    );
  }
  library[targetID] = {
    geometry: await util.geometryProvider!.addSingularToCache(STLresult),
    tags: [],
    color: util.defaultColor,
    bom: [],
    plane: util.XYPlane,
    dimension: "3D",
  };
  return targetID;
}

/**
 * Imports an SVG file and creates 2D geometry, then stores it in the library.
 * @param {string} targetID - The unique identifier to store the imported SVG geometry in the library
 * @param {string} svg - The SVG content as a string
 * @param {number} width - The width to scale the SVG to
 * @returns {Promise<boolean>} A promise that resolves to true when the import is completed successfully
 * @throws {Error} Throws an error if the SVG import fails
 */
async function importingSVG(targetID: string, svg: string, width: number) {
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

    library[targetID] = {
      geometry: await util.geometryProvider!.addSingularToCache(
        drawnSVG.clone().translate(-center[0], -center[1])
      ),
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
      dimension: "2D",
    };

    return targetID;
  } catch (error) {
    //add alert  ----> Try tweaking your file here https://iconly.io/tools/svg-convert-stroke-to-fill "

    console.error("Error importing SVG:", error);
    throw error;
  }
}

/**
 * Visualizes G-code by parsing movement commands and creating 3D wire geometry.
 * @param {string} targetID - The unique identifier to store the visualized G-code geometry in the library
 * @param {string} gcode - The G-code string to visualize
 * @returns {void} This function does not return a value, it directly stores the result in the library
 */
async function visualizeGcode(targetID: string, gcode: string): Promise<void> {
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
  library[targetID] = {
    // TODO: we could probably use a hash of the gcode string as an ID here.
    geometry: await util.geometryProvider!.addSingularToCache(wire),
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
 * @param {string} inputID - The library ID of the geometry to generate a thumbnail for
 * @returns {Promise<string>} A promise that resolves to an SVG string representing the thumbnail
 * @throws {Error} Throws an error if the geometry is undefined or thumbnail generation fails
 */
async function generateThumbnail(inputID: string): Promise<string> {
  return started.then(async () => {
    if (library[inputID] != undefined) {
      const fusedAssembly = await interaction.digFuse(library[inputID]);
      const fusedGeometry = await util.geometryProvider!.get(
        fusedAssembly.geometry
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
    } else {
      throw new Error("can't generate thumbnail for undefined geometry");
    }
  });
}

function getBoundingBox(
  inputID: string
): Promise<{ min: number[]; max: number[] }> {
  return util.getBounds(getOrThrow(inputID));
}

/**
 * Check if the given geometry ID represents an assembly
 * @param {string} inputID - The geometry ID to check
 * @returns {Promise<boolean>} True if it's an assembly, false otherwise
 */
async function isAssembly(inputID: string): Promise<boolean> {
  await started;
  const geometry = getOrThrow(inputID);
  return util.isAssembly(geometry);
}

/**
 * Extract individual parts from an assembly
 * @param {string} assemblyID - The assembly ID
 * @returns {Promise<Array<string>>} Array of part IDs
 */
async function extractParts(assemblyID: string): Promise<string[]> {
  await started;
  const assembly = getOrThrow(assemblyID);

  if (!util.isAssembly(assembly)) {
    // If it's not an assembly, return the original ID
    return [assemblyID];
  }

  const parts: string[] = [];
  let partIndex = 0;

  // Extract each part from the assembly and store it in the library
  util.actOnLeafs(assembly, (leaf) => {
    if (leaf.geometry && leaf.geometry.length > 0) {
      const partID = `${assemblyID}_part_${partIndex++}`;
      library[partID] = leaf;
      parts.push(partID);
    }
    return leaf;
  });

  return parts;
}

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(inputIDs: string[], targetID: string): Promise<string> {
  await started;
  const result = await interaction.assembly(inputIDs.map(getOrThrow));
  library[targetID] = result;
  return targetID;
}

/**
 * Performs a boolean fusion (union) operation on multiple geometries and stores the result in the library.
 * @param {string} targetID - The unique identifier to store the fused geometry in the library
 * @param {string[]} inputIDs - Array of library IDs containing geometries to be fused together
 * @returns {Promise<boolean>} A promise that resolves to true when the fusion is completed successfully
 * @throws {Error} Throws an error if inputs are mixed between 2D and 3D geometries
 */
function fusion(targetID: string, inputIDs: string[]): Promise<string> {
  return started.then(async () => {
    library[targetID] = await interaction.fusion(inputIDs.map(getOrThrow));
    return targetID;
  });
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
  Black: "#3C3C3C",
  White: "#FFFCF7",
  "Keep Out": "#E0E0E0",
};

/**
 * Generates and memoizes default mesh for display when no output is available.
 * @param {string} id - The unique identifier to store the default mesh in the library
 * @returns {Promise} A promise that resolves to the default text mesh
 */
async function generateDefaultMesh() {
  if (defaultMesh == undefined) {
    const libId = await text(
      "default-mesh",
      "No output to display",
      28,
      "ROBOTO"
    );
    defaultMesh = await generateDisplayMesh(libId);
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
  id: string | AbundanceObject
): Promise<DisplayMesh[]> {
  await started;
  console.log("Generating display mesh for ID:", JSON.stringify(id));
  let geom = undefined;
  if (util.isAbundanceObject(id)) {
    geom = id;
  } else {
    if (library[id] != undefined && id != undefined) {
      geom = library[id];
      try {
        console.log("resolved to: " + JSON.stringify(geom));
      } catch (error) {
        console.error("Error resolving geometry:", error);
        throw error;
      }
    } else {
      return generateDefaultMesh();
    }
  }

  // Flatten the assembly to remove hierarchy
  const flattened = util.flattenAssembly(geom);

  let meshArray: { color: string; geometry: ReplicadObject }[] = [];

  for (let i = 0; i < flattened.length; i++) {
    const displayObject = flattened[i];
    let cleanedGeometry;
    // TODO: would love a better way to check if geometry is 2D or 3D.
    const geom = await util.geometryProvider!.get(displayObject.geometry);
    if (!("mesh" in geom) || geom.mesh == undefined) {
      cleanedGeometry = await util.geometryProvider!.get(
        await util.geometryProvider!.extrude(
          displayObject.geometry,
          displayObject.plane,
          0.0001
        )
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
    output,
    molecule,
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
  assembly, bom, chamfer, circle, code, color, createMesh, deleteFromLibrary, difference, displayLayout, downExport, extractAllTags, extractParts, extractTag, extrude, fillet, generateThumbnail, getBoundingBox, importingSTEP,
  importingSTL,
  importingSVG, intersect, isAssembly, layout, library, loftShapes, molecule, move, output, rectangle, regularPolygon, rotate,
  scale, shrinkWrapSketches, started, tag, text, visExport, visualizeGcode
};
