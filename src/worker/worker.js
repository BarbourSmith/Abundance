import { expose } from "comlink";
import { Plane } from "replicad";
import { drawSVG } from "replicad-decorate";
import * as cutlayout from "./cutlayout.js";
import * as util from "./util.js";
import * as shapes from "./shapes.js";
import * as actions from "./actions.js";
import * as interaction from "./interaction.js";
import * as tags from "./tags.js";
import * as codeLib from "./code.js";

var library = {};

const started = util.init();

function getOrThrow(id) {
  if (id == undefined) {
    throw new Error("Missing a required input");
  }
  if (!library[id]) {
    throw new Error(`Library ID ${id} does not exist.`);
  }
  return library[id];
}

async function code(targetID, codeText, argumentsArray) {
  await started;
  const result = await codeLib.executeCode(codeText, argumentsArray, library);
  library[targetID] = result;
  return true;
}

/**
 * Lay out the parts from inputID to be cut out from a sheet of material. Attempts to lay them out
 * in a compact and machinable way while respecting the layoutConfig.
 *
 * @param {string} inputID - Shape or assembly to be layed out
 * @param {string} targetID - The unique identifier to store the layed out assembly in the library
 * @param progressCallback - a function which takes two parameters:
 *    - progress - 0 to 1 inclusive
 *    - cancelationHandle - a callable which cancels this task.
 * @param warningCallback - a to be called with an informational message if layout fails or partially fails.
 * @param placementCallback - called back with a placement object specifying a singular layout for these parts.
 *    - will be called multiple times as progressively better layouts are found.
 * @param {*} layoutConfig - dictionary with keys:
 *    - width
 *    - height - together with width specifies the dimensions of the stock material
 *    - partPadding - space between parts in the resulting placement
 *    - units - MM or Inches. Used for resolution when generating part perimeters
 * @param {*} priorPlacements - optional array of previous placements to use as starting point
 *
 * @returns {Promise<Array>} A promise that resolves to the best placement found during this run.
 */
async function layout(
  targetID,
  inputID,
  progressCallback,
  warningCallback,
  placementCallback,
  layoutConfig,
  priorPlacements
) {
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
    .then((resultArray) => {
      const [layedOutAssembly, positions] = resultArray;
      library[targetID] = layedOutAssembly;
      return positions;
    });
}

/**
 * Lays out the parts of InputID according to the positions described in placements. Where `placements`
 * is the result of an earlier call to `layout`.
 *
 * @param {string} targetID - where in the library to store the resulting layed out assembly.
 * @param {string} inputID - the ID of the input geometry to layout
 * @param {*} placements - the placement information from the layout
 * @param {*} warningCallback - will be called back if there are issues with this placement (eg: does not account for all parts)
 * @param {*} layoutConfig - the layout configuration. See `layout` for expected properties.
 * @returns {Promise<boolean>} A promise that resolves when the layout is displayed.
 */
async function displayLayout(
  targetID,
  inputID,
  placements,
  warningCallback,
  layoutConfig
) {
  await started;

  library[targetID] = await cutlayout.displayLayout(
    getOrThrow(inputID),
    placements,
    warningCallback,
    layoutConfig
  );

  return true;
}

/**
 * A function which converts any input into Abundance style geometry. Input can be a library ID, an abundance object, or a single geometry object.
 * This is useful for allowing our functions to work within the Code atom or within the flow canvas.
 */
function toGeometry(input, name = "geometry") {
  //If the input is a library ID we look it up
  if (typeof input === "string" || typeof input === "number") {
    return library[input];
  }
  //If the input is already an abundance object we return it
  else if (input.geometry) {
    return input;
  }

  // else check if it's a raw geometry object
  const raw_type = input?._wrapped?.$$?.ptrType?.name;
  if (raw_type && raw_type instanceof String && raw_type.startsWith("TopoDS")) {
    // If it's a raw geometry object, we wrap it in an abundance object
    return {
      geometry: [input],
      tags: [],
      color: util.defaultColor,
      bom: [],
    };
  } else {
    // If it's something else, we throw an error
    throw new Error(name + " value cannot be interpreted as geometry.");
  }
}

/**
 * A function that deletes a geometry from the library.
 */
function deleteFromLibrary(inputID) {
  return started.then(() => {
    delete library[inputID];
  });
}

/**
 * Creates a mesh with the specified thickness.
 * @param {number} thickness - The thickness value for the mesh
 * @returns {Promise<Array>} A promise that resolves to an empty array representing mesh data structure
 */
function createMesh(thickness) {
  return started.then(() => {
    // This is how you get the data structure that the replica-three-helper
    // can synchronize with three BufferGeometry
    return [];
  });
}

/**
 * Creates a circle geometry with the specified diameter and stores it in the library.
 * @param {string} id - The unique identifier to store the circle geometry in the library
 * @param {number} diameter - The diameter of the circle
 * @returns {Promise<boolean>} A promise that resolves to true when the circle is created successfully
 */
async function circle(id, diameter) {
  await started;
  library[id] = await shapes.circle(diameter);
  return true;
}

/**
 * Creates a rectangle geometry with the specified dimensions and stores it in the library.
 * @param {string} id - The unique identifier to store the rectangle geometry in the library
 * @param {number} x - The width of the rectangle
 * @param {number} y - The height of the rectangle
 * @returns {Promise<boolean>} A promise that resolves to true when the rectangle is created successfully
 */
async function rectangle(id, x, y) {
  await started;
  library[id] = await shapes.rectangle(x, y);
  return true;
}

/**
 * Creates a regular polygon geometry with the specified radius and number of sides, and stores it in the library.
 * @param {string} id - The unique identifier to store the polygon geometry in the library
 * @param {number} radius - The radius of the polygon (distance from center to vertex)
 * @param {number} numberOfSides - The number of sides of the polygon
 * @returns {Promise<boolean>} A promise that resolves to true when the polygon is created successfully
 */
async function regularPolygon(id, radius, numberOfSides) {
  await started;
  library[id] = await shapes.regularPolygon(radius, numberOfSides);
  return true;
}

/**
 * Creates text geometry with the specified text, font size, and font family, and stores it in the library.
 * @param {string} id - The unique identifier to store the text geometry in the library
 * @param {string} text - The text content to be rendered
 * @param {number} fontSize - The size of the font
 * @param {string} fontFamily - The font family to use for rendering the text
 * @returns {Promise<boolean>} A promise that resolves to true when the text geometry is created successfully
 * @throws {Error} Throws an error if the font fails to load
 */
async function text(id, text, fontSize, fontFamily) {
  return started.then(async () => {
    const result = await shapes.text(text, fontSize, fontFamily);
    library[id] = result;
    return true;
  });
}

/**
 * Creates a loft shape by blending between multiple 2D sketches and stores it in the library.
 * @param {string} targetID - The unique identifier to store the lofted geometry in the library
 * @param {string[]} inputsIDs - Array of library IDs containing 2D sketches to be lofted
 * @returns {Promise<boolean>} A promise that resolves to true when the loft is created successfully
 * @throws {Error} Throws an error if input parts are not sketches or contain interior geometries
 */
async function loftShapes(targetID, inputsIDs) {
  await started;
  library[targetID] = await interaction.loftShapes(
    (inputsIDs || []).map(getOrThrow)
  );
  return true;
}

/**
 * Extrudes a 2D sketch to create a 3D geometry with the specified height and stores it in the library.
 * @param {string} targetID - The unique identifier to store the extruded geometry in the library
 * @param {string} inputID - The library ID of the 2D sketch to be extruded
 * @param {number} height - The height to extrude the sketch
 * @returns {Promise<boolean>} A promise that resolves to true when the extrusion is completed successfully
 */
async function extrude(targetID, inputID, height) {
  await started;
  library[targetID] = await actions.extrude(getOrThrow(inputID), height);
  return true;
}

/**
 * Moves a geometry by the specified x, y, and z distances.
 * @param {Object|string} geom - The geometry to move, or library ID for same
 * @param {number} x - The distance to move along the x-axis
 * @param {number} y - The distance to move along the y-axis
 * @param {number} z - The distance to move along the z-axis
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the moved geometry, or true if targetID is provided
 */
async function move(geom, x, y, z, targetID = null) {
  await started;
  const result = await actions.move(toGeometry(geom, "move-geometry"), x, y, z);
  if (targetID) {
    library[targetID] = result;
    return true;
  } else {
    return result;
  }
}

/**
 * Function to rotate a geometry around the x, y, and z axis
 * @param {Object|string} geom - The geometry to rotate or id for same
 * @param {number} x - The angle to rotate around the x axis
 * @param {number} y - The angle to rotate around the y axis
 * @param {number} z - The angle to rotate around the z axis
 * @param {string} targetID - The ID to store the result in. If it undefined the result will be returned instead
 * @returns {Promise<boolean|Object>} A promise that resolves to the rotated geometry or true if targetID is provided
 **/
async function rotate(geom, x, y, z, targetID = null) {
  await started;

  const asGeom = toGeometry(geom, "rotate-geometry"); // TODO(tristan): I'd love to deprecate use of this method here.
  const result = await actions.rotate(asGeom, x, y, z);
  if (targetID) {
    library[targetID] = result;
    return true;
  } else {
    return result;
  }
}

/**
 * Scales a geometry by the specified scale factor.
 * @param {Object|string} geom - The geometry to scale, or library ID for same
 * @param {number} scaleFactor - The scale factor to apply (1.0 = no change, 2.0 = double size, 0.5 = half size)
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the scaled geometry, or true if targetID is provided
 */
async function scale(geom, scaleFactor, targetID = null) {
  await started;

  geom = toGeometry(geom, "scale-geometry");
  const result = await actions.scale(geom, scaleFactor);
  if (targetID) {
    library[targetID] = result;
    return true;
  } else {
    return result;
  }
}

/**
 * Applies a fillet (rounded edge) to the input geometry.
 * @param {Object|string} geom - The geometry to fillet, or library ID for same
 * @param {number} radius - The radius of the fillet
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the filleted geometry or true if targetID is provided
 */
async function fillet(geom, radius, targetID = null) {
  await started;

  const result = await actions.fillet(
    toGeometry(geom, "fillet-geometry"),
    radius
  );
  if (targetID) {
    library[targetID] = result;
    return true;
  } else {
    return result;
  }
}

/**
 * Applies a chamfer (beveled edge) to the input geometry.
 * @param {Object|string} geom - The geometry to chamfer, or library ID for same
 * @param {number} size - The size of the chamfer
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to the chamfered geometry or true if targetID is provided
 */
async function chamfer(geom, size, targetID = null) {
  await started;

  const result = await actions.chamfer(
    toGeometry(geom, "chamfer-geometry"),
    size
  );
  if (targetID) {
    library[targetID] = result;
    return true;
  } else {
    return result;
  }
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
function difference(targetID, input1ID, input2ID) {
  return started.then(async () => {
    library[targetID] = await interaction.difference(
      getOrThrow(input1ID),
      getOrThrow(input2ID)
    );
    return true;
  });
}

/**
 * Creates a shrink-wrapped boundary around multiple 2D sketches and stores it in the library.
 * @param {string} targetID - The unique identifier to store the shrink-wrapped geometry in the library
 * @param {string[]} inputIDs - Array of library IDs containing 2D sketches to be shrink-wrapped
 * @returns {Promise<boolean>} A promise that resolves to true when the shrink wrapping is completed successfully
 * @throws {Error} Throws an error if inputs are not all sketches or if sketches have interior geometries
 */
function shrinkWrapSketches(targetID, inputIDs) {
  return started.then(async () => {
    library[targetID] = await interaction.shrinkWrapSketches(
      inputIDs.map(getOrThrow)
    );
    return true;
  });
}

/**
 * Performs a boolean intersection operation between two geometries.
 * @param {string|Object} input1ID - The ID of the first geometry or the geometry object itself
 * @param {string|Object} input2ID - The ID of the second geometry or the geometry object itself
 * @param {string|null} targetID - The ID to store the result in the library. If null, the result is returned
 * @returns {Promise<boolean|Object>} A promise that resolves to true if targetID is provided, or the intersected geometry if targetID is null
 */
function intersect(input1ID, input2ID, targetID = null) {
  return started.then(async () => {
    const result = await interaction.intersect(
      getOrThrow(input1ID),
      getOrThrow(input2ID)
    );
    if (targetID) {
      library[targetID] = result;
      return true;
    } else {
      return result;
    }
  });
}

/**
 * Adds tags to a geometry and stores the tagged geometry in the library.
 * @param {string} targetID - The unique identifier to store the tagged geometry in the library
 * @param {string} inputID - The library ID of the geometry to tag
 * @param {string[]} TAG - Array of tags to add to the geometry
 * @returns {Promise<boolean>} A promise that resolves to true when the tagging is completed successfully
 */
function tag(targetID, inputID, TAG) {
  return started.then(() => {
    library[targetID] = tags.tag(getOrThrow(inputID), TAG);
    return true;
  });
}

/**
 * Extracts and returns all tags from a geometry and its subassemblies.
 * @param {string} inputID - The library ID of the geometry to extract tags from
 * @param {string} tag - Currently unused parameter (kept for compatibility)
 * @returns {Promise<string[]>} A promise that resolves to an array of all unique tags, with "Select Tag" as the first element
 * @throws {Error} Throws an error if the geometry with the specified ID is not found in the library
 */
function extractAllTags(inputID, tag) {
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
function color(targetID, inputID, color) {
  return started.then(() => {
    library[targetID] = tags.color(getOrThrow(inputID), color);
    return true;
  });
}

/**
 * Adds a Bill of Materials (BOM) entry to a geometry and stores it in the library.
 * @param {string} targetID - The unique identifier to store the geometry with BOM in the library
 * @param {string} inputID - The library ID of the geometry to add BOM entry to
 * @param {Object} BOM - The BOM entry to add to the geometry
 * @returns {Promise<boolean>} A promise that resolves to true when the BOM addition is completed successfully
 */
function bom(targetID, inputID, BOM) {
  return started.then(() => {
    library[targetID] = tags.bom(getOrThrow(inputID), BOM);
    return true;
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
async function extractTag(targetID, inputID, TAG) {
  await started;
  library[targetID] = tags.extractTag(getOrThrow(inputID), TAG);
  return true;
}

/**
 * Copies a geometry from one library location to another, typically used for output connections.
 * @param {string} targetID - The unique identifier to store the output geometry in the library
 * @param {string} inputID - The library ID of the geometry to output
 * @returns {Promise<boolean>} A promise that resolves to true when the output operation is completed successfully
 * @throws {Error} Throws an error if nothing is connected to the output (inputID is undefined)
 */
function output(targetID, inputID) {
  return started.then(() => {
    if (library[inputID] != undefined) {
      library[targetID] = library[inputID];
    } else {
      throw new Error("Nothing is connected to the output");
    }

    return true;
  });
}

/**
 * Copies a geometry from one library location to another, typically used for molecule connections.
 * @param {string} targetID - The unique identifier to store the molecule geometry in the library
 * @param {string} inputID - The library ID of the geometry to copy for the molecule
 * @returns {Promise<boolean>} A promise that resolves to true when the molecule operation is completed successfully
 * @throws {Error} Throws an error if the output ID is undefined
 */
function molecule(targetID, inputID) {
  return started.then(() => {
    if (library[inputID] != undefined) {
      library[targetID] = library[inputID];
    } else {
      throw new Error("output ID is undefined");
    }
    return true;
  });
}

/**
 * Extracts the Bill of Materials (BOM) list from a geometry.
 * @param {string} inputID - The library ID of the geometry to extract BOM from
 * @returns {Array|boolean} The BOM array if it exists, or false if BOM is undefined
 */
function extractBomList(inputID) {
  return tags.extractBomList(getOrThrow(inputID));
}

/**
 * Prepares geometry for visualization export in various file formats (STL, STEP, SVG).
 * @param {string} targetID - The unique identifier to store the prepared export geometry in the library
 * @param {string} inputID - The library ID of the geometry to prepare for export
 * @param {string} fileType - The file type for export ("STL", "STEP", or "SVG")
 * @returns {Promise<boolean>} A promise that resolves to true when the export preparation is completed successfully
 */
function visExport(targetID, inputID, fileType) {
  return started.then(() => {
    let geometryToExport = tags.extractKeepOut(library[inputID]);
    let fusedGeometry = interaction.digFuse(geometryToExport);
    let displayColor =
      fileType == "STL"
        ? "#91C8D5"
        : fileType == "STEP"
        ? "#ACAFDD"
        : "#3C3C3C";
    let finalGeometry;
    if (fileType == "SVG") {
      /** Fuses input geometry, draws a top view projection*/
      if (util.is3D(library[inputID])) {
        finalGeometry = [
          util.replicad.drawProjection(fusedGeometry, "top").visible,
        ];
      } else {
        finalGeometry = [fusedGeometry];
      }
    } else {
      finalGeometry = [fusedGeometry];
    }
    if (targetID) {
      library[targetID] = {
        geometry: finalGeometry,
        color: displayColor,
        plane: library[inputID].plane,
      };
    }
    return true;
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
function downExport(ID, fileType, svgResolution, units) {
  return started.then(() => {
    let scaleUnit = units == "Inches" ? 1 : units == "MM" ? 25.4 : 1;
    let scaling = svgResolution / scaleUnit;
    if (fileType == "SVG") {
      let svg = library[ID].geometry[0].clone().scale(scaling).toSVG(scaling);
      var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });

      return blob;
    } else if (fileType == "STL") {
      return library[ID].geometry[0].clone().blobSTL();
    } else {
      return library[ID].geometry[0].clone().blobSTEP();
    }
  });
}

/**
 * Imports a STEP file and stores the resulting geometry in the library.
 * @param {string} targetID - The unique identifier to store the imported geometry in the library
 * @param {File} file - The STEP file to import
 * @returns {Promise<boolean>} A promise that resolves to true when the import is completed successfully
 */
async function importingSTEP(targetID, file) {
  let STEPresult = await util.replicad.importSTEP(file);

  library[targetID] = {
    geometry: [STEPresult],
    tags: [],
    color: util.defaultColor,
    bom: [],
  };
  return true;
}

/**
 * Imports an STL file and stores the resulting geometry in the library.
 * @param {string} targetID - The unique identifier to store the imported geometry in the library
 * @param {File} file - The STL file to import
 * @returns {Promise<boolean>} A promise that resolves to true when the import is completed successfully
 */
async function importingSTL(targetID, file) {
  let STLresult = await util.replicad.importSTL(file);

  library[targetID] = {
    geometry: [STLresult],
    tags: [],
    color: util.defaultColor,
    bom: [],
  };
  return true;
}

/**
 * Imports an SVG file and creates 2D geometry, then stores it in the library.
 * @param {string} targetID - The unique identifier to store the imported SVG geometry in the library
 * @param {string} svg - The SVG content as a string
 * @param {number} width - The width to scale the SVG to
 * @returns {Promise<boolean>} A promise that resolves to true when the import is completed successfully
 * @throws {Error} Throws an error if the SVG import fails
 */
async function importingSVG(targetID, svg, width) {
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
      geometry: [drawnSVG.clone().translate(-center[0], -center[1])],
      tags: [],
      plane: new Plane().pivot(0, "Y"),
      color: util.defaultColor,
      bom: [],
    };

    return true;
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
function visualizeGcode(targetID, gcode) {
  let currentPosition = [0, 0, 0];
  let edges = [];

  // Split the gcode into lines
  const lines = gcode.split("\n");
  lines.forEach((line) => {
    // Only process lines that start with G0 or G1
    if (line.startsWith("G0") || line.startsWith("G1")) {
      // Parse the line for X, Y, Z values
      const xMatch = line.match(/X([\d.-]+)/);
      const yMatch = line.match(/Y([\d.-]+)/);
      const zMatch = line.match(/Z([\d.-]+)/);

      // Update coordinates if found, otherwise keep the previous value
      let x = xMatch ? Number(xMatch[1]) : currentPosition[0];
      let y = yMatch ? Number(yMatch[1]) : currentPosition[1];
      let z = zMatch ? Number(zMatch[1]) : currentPosition[2];

      edges.push(util.replicad.makeLine(currentPosition, [x, y, z]));
      currentPosition = [x, y, z];
    }
  });

  // Create a wire from the edges
  const wire = util.replicad.assembleWire(edges);
  library[targetID] = {
    geometry: [wire],
    tags: [],
    plane: new Plane().pivot(0, "Y"),
    color: util.defaultColor,
    bom: [],
  };
}

/**
 * Creates a pretty projection of a 3D shape for thumbnail generation.
 * @param {Object} shape - The 3D shape to create a projection from
 * @returns {Object} An object containing visible and hidden projection lines
 */
const prettyProjection = (shape) => {
  const bbox = shape.boundingBox;
  const center = bbox.center;
  const corner = [
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
function generateThumbnail(inputID) {
  return started.then(() => {
    if (library[inputID] != undefined) {
      let fusedGeometry;
      let projectionShape;
      let svg;
      if (util.is3D(library[inputID])) {
        fusedGeometry = interaction.digFuse(library[inputID]);
        projectionShape = prettyProjection(fusedGeometry);
        svg = projectionShape.visible.toSVG();
      } else {
        fusedGeometry = interaction
          .digFuse(library[inputID])
          .sketchOnPlane("XY")
          .extrude(0.0001);
        projectionShape = util.replicad.drawProjection(
          fusedGeometry,
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

/**
 * Calculate the bounding box of the input geometry by walking through it and finding the min/max of
 * the bounding box of each leaf.
 */

function getBoundingBox(inputID) {
  // TODO(tristan): this is redundant with util.getBounds I think.
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  util.actOnLeafs(library[inputID], (leaf) => {
    const bbox = leaf.geometry[0].boundingBox.bounds;
    minX = Math.min(minX, bbox[0][0]);
    minY = Math.min(minY, bbox[0][1]);
    minZ = Math.min(minZ, bbox[0][2]);
    maxX = Math.max(maxX, bbox[1][0]);
    maxY = Math.max(maxY, bbox[1][1]);
    maxZ = Math.max(maxZ, bbox[1][2]);
  });

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(inputIDs, targetID = null) {
  await started;
  const result = await interaction.assembly(inputIDs.map(getOrThrow));
  if (targetID != null) {
    library[targetID] = result;
    return true;
  } else {
    return result;
  }
}

/**
 * Performs a boolean fusion (union) operation on multiple geometries and stores the result in the library.
 * @param {string} targetID - The unique identifier to store the fused geometry in the library
 * @param {string[]} inputIDs - Array of library IDs containing geometries to be fused together
 * @returns {Promise<boolean>} A promise that resolves to true when the fusion is completed successfully
 * @throws {Error} Throws an error if inputs are mixed between 2D and 3D geometries
 */
function fusion(targetID, inputIDs) {
  return started.then(async () => {
    library[targetID] = await interaction.fusion(inputIDs.map(getOrThrow));
    return true;
  });
}

/**
 * Recursively flattens an assembly tree into a flat array of geometry objects with colors.
 * @param {Object} assembly - The assembly to flatten
 * @returns {Array} An array of objects containing geometry and color properties
 */
function flattenAssembly(assembly) {
  var flattened = [];
  if (assembly == undefined || assembly.geometry == undefined) {
    console.trace("attempted to flatten empty assembly");
    return flattened;
  }

  //This is a leaf
  if (
    assembly.geometry.length == 1 &&
    assembly.geometry[0].geometry == undefined
  ) {
    flattened.push({ geometry: assembly.geometry[0], color: assembly.color });
    return flattened;
  }
  //This is a branch
  else {
    assembly.geometry.forEach((subAssembly) => {
      flattened.push(...flattenAssembly(subAssembly));
    });
    return flattened;
  }
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
 * Generates a default mesh for display when no output is available.
 * @param {string} id - The unique identifier to store the default mesh in the library
 * @returns {Promise} A promise that resolves to the default text mesh
 */
async function generateDefaultMesh(id) {
  return await text(id, "No output to display", 28, "ROBOTO");
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

function getLargestBoundingBox(meshArray) {
  let overallMin = [Infinity, Infinity, Infinity];
  let overallMax = [-Infinity, -Infinity, -Infinity];

  if (!Array.isArray(meshArray)) {
    throw new Error("meshArray is not defined or not an array");
  }

  meshArray.forEach((mesh) => {
    if (
      !mesh.geometry ||
      !mesh.geometry.boundingBox ||
      !Array.isArray(mesh.geometry.boundingBox.bounds)
    ) {
      throw new Error("Invalid mesh geometry or boundingBox structure");
    }

    let boundingBox = mesh.geometry.boundingBox.bounds;
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
    overallMin[2] = Math.min(overallMin[2], min[2]);

    // Update overall maximum coordinates
    overallMax[0] = Math.max(overallMax[0], max[0]);
    overallMax[1] = Math.max(overallMax[1], max[1]);
    overallMax[2] = Math.max(overallMax[2], max[2]);
  });

  // Create a new bounding box with the overall min and max coordinates
  let newBoundingBox = [overallMin, overallMax];

  // Calculate the width, height, and depth
  let width = overallMax[0] - overallMin[0];
  let height = overallMax[1] - overallMin[1];
  let depth = overallMax[2] - overallMin[2];

  // Return the dimensions as a 3-point vector
  return { width, height, depth };

  //return newBoundingBox;
}

function calculateZoom(boundingBox) {
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

function generateCameraPosition(meshArray) {
  try {
    // Get the largest bounding box from the mesh array
    let largestBoundingBox = getLargestBoundingBox(meshArray);
    let zoom = calculateZoom(largestBoundingBox);

    return zoom;
  } catch (e) {
    throw new Error(e);
  }
}

function generateDisplayMesh(id) {
  return started.then(() => {
    if (library[id] == undefined || id == undefined) {
      //throw new Error("ID not found in library");
      generateDefaultMesh(id).then((result) => {
        // Default mesh generated
      });
    }
    let meshArray = [];

    //Flatten the assembly to remove hierarchy
    const flattened = flattenAssembly(library[id]);

    flattened.forEach((displayObject) => {
      var cleanedGeometry = [];
      if (displayObject.geometry.mesh == undefined) {
        let sketchPlane = library[id].plane;
        let sketches = displayObject.geometry.clone();
        cleanedGeometry = sketches.sketchOnPlane(sketchPlane).extrude(0.0001);
      } else {
        cleanedGeometry = displayObject.geometry;
      }
      meshArray.push({
        color: displayObject.color,
        geometry: cleanedGeometry,
      });
    });
    let cameraZoom;
    try {
      cameraZoom = generateCameraPosition(meshArray);
    } catch (e) {
      cameraZoom = 1;
    }
    let finalMeshes = [];
    //Iterate through the meshArray and create final meshes with faces, edges and color to pass to display
    meshArray.forEach((meshgeometry) => {
      try {
        //Try extruding if there is no 3d shape
        let sketchPlane = library[id].plane;
        if (meshgeometry.geometry.mesh == undefined) {
          const threeDShape = meshgeometry
            .sketchOnPlane(sketchPlane)
            .clone()
            .extrude(0.0001);
          return {
            faces: threeDShape.mesh({ tolerance: 0.1, angularTolerance: 0.5 }),
            edges: threeDShape.meshEdges({
              tolerance: 0.1,
              angularTolerance: 0.5,
            }),
          };
        } else {
          finalMeshes.push({
            cameraZoom: cameraZoom,
            faces: meshgeometry.geometry.mesh({
              tolerance: 0.1,
              angularTolerance: 0.5,
            }),
            edges: meshgeometry.geometry.meshEdges({
              tolerance: 0.1,
              angularTolerance: 0.5,
            }),
            color: meshgeometry.color,
          });
        }
      } catch (e) {
        throw new Error("Error generating display mesh" + e);
      }
    });

    return finalMeshes;
  });
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
  });
}

// Export functions for testing and ES module environments
export {
  library,
  started,
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
  extrude,
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
  visualizeGcode,
  getBoundingBox,
  generateThumbnail,
  visExport,
  downExport,
  shrinkWrapSketches,
};
