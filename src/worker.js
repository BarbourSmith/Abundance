import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import * as replicad from "replicad";
import { expose, proxy } from "comlink";
import { Plane, Solid } from "replicad";
import shrinkWrap from "replicad-shrink-wrap";
import { addSVG, drawSVG } from "replicad-decorate";
import Fonts from "./js/fonts.js";
import { AnyNest, FloatPolygon } from "any-nest";
import { equal, re } from "mathjs";

var library = {};
let defaultColor = "#aad7f2";

// This is the logic to load the web assembly code into replicad
let loaded = false;
const init = async () => {
  if (loaded) return Promise.resolve(true);

  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  replicad.setOC(OC);
  console.log(replicad);

  return true;
};
const started = init();

/**
 * A function which converts any input into Abundance style geometry. Input can be a library ID, an abundance object, or a single geometry object.
 * This is useful for allowing our functions to work within the Code atom or within the flow canvas.
 */
function toGeometry(input) {
  //If the input is a library ID we look it up
  if (typeof input === "number") {
    return library[input];
  }
  //If the input is already an abundance object we return it
  else if (input.geometry) {
    return input;
  }
  //Else we build an abundance object from the input
  else {
    return {
      geometry: [input],
      tags: [],
      color: defaultColor,
      bom: [],
    };
  }
}

/**
 * A function to generate a unique ID value.
 */
function generateUniqueID() {
  const dateString = new Date().getTime();
  const randomness = Math.floor(Math.random() * 1000);
  const newID = dateString + randomness;
  return newID;
}

/**
 * A function that deletes a geometry from the library.
 */
function deleteFromLibrary(inputID) {
  return started.then(() => {
    delete library[inputID];
  });
}

function createMesh(thickness) {
  return started.then(() => {
    // This is how you get the data structure that the replica-three-helper
    // can synchronize with three BufferGeometry
    return [];
  });
}

function circle(id, diameter) {
  return started.then(() => {
    const newPlane = new Plane().pivot(0, "Y");
    library[id] = {
      geometry: [replicad.drawCircle(diameter / 2)],
      tags: [],
      plane: newPlane,
      color: defaultColor,
      bom: [],
    };
    return true;
  });
}

function rectangle(id, x, y) {
  return started.then(() => {
    const newPlane = new Plane().pivot(0, "Y");
    library[id] = {
      geometry: [replicad.drawRectangle(x, y)],
      tags: [],
      plane: newPlane,
      color: defaultColor,
      bom: [],
    };
    return true;
  });
}

function regularPolygon(id, radius, numberOfSides) {
  return started.then(() => {
    const newPlane = new Plane().pivot(0, "Y");
    library[id] = {
      geometry: [replicad.drawPolysides(radius, numberOfSides)],
      tags: [],
      plane: newPlane,
      color: defaultColor,
      bom: [],
    };
    return true;
  });
}
async function text(id, text, fontSize, fontFamily) {
  await replicad
    .loadFont(Fonts[fontFamily])
    .then(() => {
      console.log("Font loaded");
      return started.then(() => {
        const newPlane = new Plane().pivot(0, "Y");

        const textGeometry = replicad.drawText(text, {
          startX: 0,
          startY: 0,
          fontSize: fontSize,
          font: fontFamily,
        });
        library[id] = {
          geometry: [textGeometry],
          tags: [],
          plane: newPlane,
          color: defaultColor,
          bom: [],
        };
        return true;
      });
    })
    .catch((err) => {
      throw new Error("Error loading font: ", err);
    });
}

function loftShapes(targetID, inputsIDs) {
  return started.then(() => {
    let arrayOfSketchedGeometry = [];

    inputsIDs.forEach((inputID) => {
      if (is3D(library[inputID])) {
        throw new Error("Parts to be lofted must be sketches");
      }
      let partToLoft = digFuse(library[inputID]);
      let sketchedpart = partToLoft.sketchOnPlane(library[inputID].plane);
      if (!sketchedpart.sketches) {
        arrayOfSketchedGeometry.push(sketchedpart);
      } else {
        throw new Error("Sketches to be lofted can't have interior geometries");
      }
    });
    let startGeometry = arrayOfSketchedGeometry.shift();
    const newPlane = new Plane().pivot(0, "Y");

    library[targetID] = {
      geometry: [startGeometry.loftWith([...arrayOfSketchedGeometry])],
      tags: [],
      plane: newPlane,
      color: defaultColor,
      bom: [],
    };
    return true;
  });
}

function extrude(targetID, inputID, height) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[inputID], (leaf) => {
      return {
        geometry: [
          leaf.geometry[0].clone().sketchOnPlane(leaf.plane).extrude(height),
        ],
        tags: leaf.tags,
        plane: leaf.plane,
        color: leaf.color,
        bom: leaf.bom,
      };
    });
    return true;
  });
}

/* function to check if shape has mesh*/
function is3D(inputs) {
  // if it's an assembly assume it's 3d since our assemblies don't work for drawings right now
  if (isAssembly(inputs)) {
    return inputs.geometry.some((input) => is3D(input));
  } else if (inputs.geometry[0].mesh !== undefined) {
    return true;
  } else {
    return false;
  }
}

function move(inputID, x, y, z, targetID = null) {
  return started.then(() => {
    if (is3D(library[inputID])) {
      let result = actOnLeafs(
        library[inputID],
        (leaf) => {
          return {
            geometry: [leaf.geometry[0].clone().translate(x, y, z)],
            plane: leaf.plane,
            tags: leaf.tags,
            color: leaf.color,
            bom: leaf.bom,
          };
        },
        library[inputID].plane
      );
      if (targetID) {
        library[targetID] = result;
      } else {
        return result;
      }
    } else {
      let result = actOnLeafs(
        library[inputID],
        (leaf) => {
          return {
            geometry: [leaf.geometry[0].clone().translate([x, y])],
            tags: leaf.tags,
            plane: leaf.plane.translate([0, 0, z]),
            color: leaf.color,
            bom: leaf.bom,
          };
        },
        library[inputID].plane.translate([0, 0, z])
      );
      if (targetID) {
        library[targetID] = result;
      } else {
        return result;
      }
    }
    return true;
  });
}

/**
 * Function to rotate a geometry around the x, y, and z axis
 * @param {string} inputGeometry - The geometry to rotate. Can be any type
 * @param {number} x - The angle to rotate around the x axis
 * @param {number} y - The angle to rotate around the y axis
 * @param {number} z - The angle to rotate around the z axis
 * @param {string} targetID - The ID to store the result in. If it undefined the result will be returned instead
 * @returns {object} - The rotated geometry
 **/
function rotate(inputGeometry, x, y, z, targetID = null) {
  let input = toGeometry(inputGeometry);
  return started.then(() => {
    if (is3D(input)) {
      let result = actOnLeafs(input, (leaf) => {
        return {
          geometry: [
            leaf.geometry[0]
              .clone()
              .rotate(x, [0, 0, 0], [1, 0, 0])
              .rotate(y, [0, 0, 0], [0, 1, 0])
              .rotate(z, [0, 0, 0], [0, 0, 1]),
          ],
          tags: leaf.tags,
          plane: leaf.plane,
          color: leaf.color,
          bom: leaf.bom,
        };
      });
      if (targetID) {
        library[targetID] = result;
      } else {
        return result;
      }
    } else {
      let result = actOnLeafs(toGeometry(inputGeometry), (leaf) => {
        return {
          geometry: [leaf.geometry[0].clone().rotate(z, [0, 0, 0], [0, 0, 1])],
          tags: leaf.tags,
          plane: leaf.plane.pivot(x, "X").pivot(y, "Y"),
          color: leaf.color,
          bom: leaf.bom,
        };
      });
      if (targetID) {
        library[targetID] = result;
        //library[inputID].plane.pivot(x, "X").pivot(y, "Y"); //@Alzatin what is this line for?
      } else {
        return result;
      }
    }
  });
}

function difference(targetID, input1ID, input2ID) {
  return started.then(() => {
    let cutTemplate;

    if (
      (is3D(library[input1ID]) && is3D(library[input2ID])) ||
      (!is3D(library[input1ID]) && !is3D(library[input2ID]))
    ) {
      cutTemplate = digFuse(library[input2ID]);

      library[targetID] = actOnLeafs(library[input1ID], (leaf) => {
        return {
          geometry: [leaf.geometry[0].clone().cut(cutTemplate)],
          tags: leaf.tags,
          color: leaf.color,
          plane: leaf.plane,
          bom: leaf.bom,
        };
      });
    } else {
      throw new Error("Both inputs must be either 3D or 2D");
    }
    return true;
  });
}

function shrinkWrapSketches(targetID, inputIDs) {
  return started.then(() => {
    let BOM = [];
    if (inputIDs.every((inputID) => !is3D(library[inputID]))) {
      let inputsToFuse = [];
      inputIDs.forEach((inputID) => {
        let fusedInput = digFuse(library[inputID]);
        inputsToFuse.push(fusedInput);
        if (fusedInput.innerShape.blueprints) {
          throw new Error(
            "Sketches to be lofted can't have interior geometries"
          );
        }
        BOM.push(library[inputID].bom);
      });
      let geometryToWrap = chainFuse(inputsToFuse);
      const newPlane = new Plane().pivot(0, "Y");
      library[targetID] = {
        geometry: [shrinkWrap(geometryToWrap, 50)],
        tags: [],
        color: defaultColor,
        plane: newPlane,
        bom: BOM,
      };
      return true;
    } else {
      throw new Error("All inputs must be sketches");
    }
  });
}

function intersect(targetID, input1ID, input2ID) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[input1ID], (leaf) => {
      const shapeToIntersectWith = digFuse(library[input2ID]);
      return {
        geometry: [leaf.geometry[0].clone().intersect(shapeToIntersectWith)],
        tags: leaf.tags,
        color: leaf.color,
        plane: leaf.plane,
        bom: leaf.bom,
      };
    });
    return true;
  });
}

function tag(targetID, inputID, TAG) {
  return started.then(() => {
    library[targetID] = {
      geometry: library[inputID].geometry,
      bom: library[inputID].bom,
      tags: [...TAG, ...library[inputID].tags],
      color: library[inputID].color,
      plane: library[inputID].plane,
    };
    return true;
  });
}

function extractAllTags(inputID, tag) {
  return started.then(() => {
    // Recursive helper function to collect tags
    function collectTags(geometry) {
      let tags = new Set(geometry.tags || []); // Use a Set to ensure uniqueness

      // If the geometry is an assembly, recursively collect tags from subassemblies
      if (isAssembly(geometry)) {
        geometry.geometry.forEach((subAssembly) => {
          const subTags = collectTags(subAssembly);
          subTags.forEach((tag) => tags.add(tag)); // Add tags from subassemblies
        });
      }

      return tags;
    }

    // Start collecting tags from the input geometry
    const inputGeometry = library[inputID];
    if (!inputGeometry) {
      throw new Error(`Geometry with ID ${inputID} not found in library`);
    }

    const allTags = collectTags(inputGeometry);
    let returningArray = Array.from(allTags); // Convert the Set to an array

    returningArray = ["Select Tag", ...new Set(returningArray)];
    return returningArray;
  });
}

//---------------------Functions for the code atom---------------------

/**
 * A wrapper for the rotate function to allow it to be Rotate and used in the Code atom
 */
async function Rotate(input, x, y, z) {
  try {
    const rotatedGeometry = await rotate(input, x, y, z);
    return rotatedGeometry;
  } catch (error) {
    console.error("Error rotating geometry:", error);
    throw error;
  }
}

/**
 * A wrapper for the move function to allow it to be Move and used in the Code atom
 */
async function Move(input, x, y, z) {
  try {
    const movedGeometry = await move(input, x, y, z);
    return movedGeometry;
  } catch (error) {
    console.error("Error moving geometry:", error);
    throw error;
  }
}

/**
 * A wrapper for the assembly function to allow it to be Assembly and used in the Code atom
 */
async function Assembly(inputs) {
  try {
    const assembledGeometry = await assembly(inputs);
    return assembledGeometry;
  } catch (error) {
    console.error("Error assembling geometry:", error);
    throw error;
  }
}

// Runs the user entered code in the worker thread and returns the result.
async function code(targetID, code, argumentsArray) {
  await started;
  let keys1 = ["Rotate", "Move", "Assembly"];
  let inputValues = [Rotate, Move, Assembly];
  for (const [key, value] of Object.entries(argumentsArray)) {
    keys1.push(`${key}`);
    inputValues.push(value);
  }

  // revisit this eval/ Is this the right/safest way to do this?
  var result = await eval(
    "(async (" +
      keys1.join(",") +
      ") => {" +
      code +
      "})(" +
      inputValues.join(",") +
      ")"
  );

  library[targetID] = result;
  // If the type of the result is a number return the number so it can be passed to the next atom
  if (typeof result === "number") {
    return result;
  } else {
    return true;
  }
}

function color(targetID, inputID, color) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[inputID], (leaf) => {
      // keep out color add tag
      if (color == "#D9544D") {
        leaf.tags.push("keepout");
      }
      return {
        geometry: leaf.geometry,
        tags: [...leaf.tags],
        color: color,
        bom: leaf.bom,
        plane: leaf.plane,
      };
    });
  });
}

function bom(targetID, inputID, BOM) {
  return started.then(() => {
    if (library[inputID].bom != []) {
      BOM = [...library[inputID].bom, BOM];
    }
    library[targetID] = {
      geometry: library[inputID].geometry,
      tags: [...library[inputID].tags],
      bom: BOM,
      color: library[inputID].color,
    };
    return true;
  });
}

function extractTag(targetID, inputID, TAG) {
  return started.then(() => {
    let taggedGeometry = extractTags(library[inputID], TAG);
    if (taggedGeometry != false) {
      library[targetID] = {
        bom: taggedGeometry.bom,
        geometry: taggedGeometry.geometry,
        tags: taggedGeometry.tags,
        color: taggedGeometry.color,
      };
    } else {
      throw new Error("Tag not found");
    }
    return true;
  });
}

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

/** Function that extracts geometry with BOM tags and returns bomItems*/
function extractBomList(inputID) {
  if (library[inputID].bom !== undefined) {
    return library[inputID].bom;
  } else {
    return false;
  }
}

/** Visualize STL or STEP*/
function visExport(targetID, inputID, fileType) {
  return started.then(() => {
    let geometryToExport = extractKeepOut(library[inputID]);
    let fusedGeometry = digFuse(geometryToExport);
    let displayColor =
      fileType == "STL"
        ? "#91C8D5"
        : fileType == "STEP"
        ? "#ACAFDD"
        : "#3C3C3C";
    let finalGeometry;
    if (fileType == "SVG") {
      /** Fuses input geometry, draws a top view projection*/
      if (is3D(library[inputID])) {
        finalGeometry = [replicad.drawProjection(fusedGeometry, "top").visible];
      } else {
        finalGeometry = [fusedGeometry];
      }
    } else {
      finalGeometry = [fusedGeometry];
    }
    library[targetID] = {
      geometry: finalGeometry,
      color: displayColor,
      plane: library[inputID].plane,
    };
    return true;
  });
}

/** down STL*/
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

async function importingSTEP(targetID, file) {
  let STEPresult = await replicad.importSTEP(file);

  library[targetID] = {
    geometry: [STEPresult],
    tags: [],
    color: defaultColor,
    bom: [],
  };
  return true;
}

async function importingSTL(targetID, file) {
  let STLresult = await replicad.importSTL(file);

  library[targetID] = {
    geometry: [STLresult],
    tags: [],
    color: defaultColor,
    bom: [],
  };
  return true;
}

async function importingSVG(targetID, svg, width) {
  const baseWidth = width + width * 0.05;
  const baseShape = replicad
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
      color: defaultColor,
      bom: [],
    };
    console.log("SVG imported successfully");

    return true;
  } catch (error) {
    //add alert  ----> Try tweaking your file here https://iconly.io/tools/svg-convert-stroke-to-fill "

    console.error("Error importing SVG:", error);
    throw error;
  }
}

const prettyProjection = (shape) => {
  const bbox = shape.boundingBox;
  const center = bbox.center;
  const corner = [
    bbox.center[0] + bbox.width,
    bbox.center[1] - bbox.height,
    bbox.center[2] + bbox.depth,
  ];
  const camera = new replicad.ProjectionCamera(corner).lookAt(center);
  const { visible, hidden } = replicad.drawProjection(shape, camera);

  return { visible, hidden };
};

function generateThumbnail(inputID) {
  return started.then(() => {
    if (library[inputID] != undefined) {
      let fusedGeometry;
      let projectionShape;
      let svg;
      if (is3D(library[inputID])) {
        fusedGeometry = digFuse(library[inputID]);
        projectionShape = prettyProjection(fusedGeometry);
        svg = projectionShape.visible.toSVG();
      } else {
        fusedGeometry = digFuse(library[inputID])
          .sketchOnPlane("XY")
          .extrude(0.0001);
        projectionShape = replicad.drawProjection(fusedGeometry, "top").visible;
        svg = projectionShape.toSVG();
      }
      //let hiddenSvg = projectionShape.hidden.toSVGPaths();
      return svg;
    } else {
      throw new Error("can't generate thumbnail for undefined geometry");
    }
  });
}

function extractTags(inputGeometry, TAG) {
  if (inputGeometry.tags.includes(TAG)) {
    return inputGeometry;
  } else if (isAssembly(inputGeometry)) {
    let geometryWithTags = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedGeometry = extractTags(subAssembly, TAG);

      if (extractedGeometry != false) {
        geometryWithTags.push(extractedGeometry);
      }
    });
    if (geometryWithTags.length > 0) {
      let thethingtoreturn = {
        geometry: geometryWithTags,
        tags: inputGeometry.tags,
        color: inputGeometry.color,
        bom: inputGeometry.bom,
      };
      return thethingtoreturn;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function extractKeepOut(inputGeometry) {
  if (inputGeometry.tags.includes("keepout")) {
    return false;
  } else if (isAssembly(inputGeometry)) {
    let geometryNoKeepOut = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedGeometry = extractKeepOut(subAssembly, "keepout");

      if (extractedGeometry != false) {
        geometryNoKeepOut.push(extractedGeometry);
      }
    });
    if (geometryNoKeepOut.length > 0) {
      let thethingtoreturn = {
        geometry: geometryNoKeepOut,
        tags: inputGeometry.tags,
        color: inputGeometry.color,
        bom: inputGeometry.bom,
      };
      return thethingtoreturn;
    } else {
      return false;
    }
  } else {
    return inputGeometry;
  }
}

/**
 * @param progressCallback - a function which takes two parameters:
 *    - progress - 0 to 1 inclusive
 *    - cancelationHandle - a callable which cancels this task.
 * @param {*} layoutConfig - dictionary with keys:
 *    - thickness - thickness of the stock material
 *    - width
 *    - height - together with width specifies the demensions of the stock material
 *    - partPadding - space between parts in the resulting placement
 */
function layout(
  targetID,
  inputID,
  progressCallback,
  placementsCallback,
  layoutConfig
) {
  return started.then(() => {
    var shapesForLayout = rotateForLayout(targetID, inputID, layoutConfig);

    let positionsPromise = computePositions(
      shapesForLayout,
      progressCallback,
      placementsCallback,
      layoutConfig
    );
    return positionsPromise.then((positions) => {
      let warning;
      if (positions.length == 0) {
        warning = "Failed to place any parts. Are sheet dimensions right?";
      } else {
        let unplacedParts = shapesForLayout.length - positions.flat().length;
        if (unplacedParts > 0) {
          warning =
            unplacedParts +
            " parts are too big to fit on this sheet size. Failed layout for " +
            unplacedParts +
            " part(s)";
        }
      }

      //This does the actual layout of the parts. We want to break this out into it's own function which can be passed a list of positions
      applyLayout(targetID, inputID, positions, layoutConfig);
      return warning;
    });
  });
}

/**
 * Lay the input geometry flat and apply the transformations to display it
 */
function displayLayout(targetID, inputID, positions, layoutConfig) {
  rotateForLayout(targetID, inputID, layoutConfig);

  applyLayout(targetID, inputID, positions, layoutConfig);
}


/**
 * Rotate shapes to be placed on their most cuttable face (basically lay them flat)
 */
function rotateForLayout(targetID, inputID, layoutConfig) {
  var THICKNESS_TOLLERANCE = 0.001;

  function equalThickness(a, b) {
    return Math.abs(a - b) < THICKNESS_TOLLERANCE;
  }

  let geometryToLayout = library[inputID];

  let localId = 0;
  let shapesForLayout = [];

  //TODO: revisit this? Split apart disjoint geometry into assemblies so they can be placed seperately
  // let splitGeometry = actOnLeafs(taggedGeometry, disjointGeometryToAssembly);

  // Algo overview:
  // collect all prospective orientations for all parts
  // come up with a best-guess material thickness or n/a
  // select among candidates for each part based on either good fit to the
  //    estimated material thickness, or just take thinnest orientation.


  // get candidates as {leaf_id: "abc", [candidate 1, candidate 2 etc]}
  const all_candidates = {}
  const intermediate = actOnLeafs(geometryToLayout, (leaf) => {
    // For each face, consider it as the underside of the shape on the CNC bed.
    // In order to be considered, a face must be...
    //  1) a flat PLANE, not a cylinder, or sphere or other curved face type.
    //  2) there must be no parts of the shape which protrude "below" this face
    const candidates = [];
    let hasFlatFace = false;
    let faceIndex = 0;
    leaf.geometry[0].faces.forEach((face) => {
      if (face.geomType == "PLANE") {
        hasFlatFace = true;
        const prospectiveGoem = moveFaceToCuttingPlane(leaf.geometry[0], face);
//        if (thickness < layoutConfig.thickness + THICKNESS_TOLLERANCE) {
        // Check for protrusions "below" the bottom of the raw material.
        if (
          prospectiveGoem.boundingBox.bounds[0][2] >
          -1 * THICKNESS_TOLLERANCE
        ) {
          candidates.push({
            face: face,
            geom: prospectiveGoem,
            faceIndex: faceIndex,
            thickness: prospectiveGoem.boundingBox.depth,
          });
        }
      }
      faceIndex++;
    });

    if (candidates.length == 0) {
      if (!hasFlatFace) {
        // TODO: This should be a warning not an error and we should fail over to placing
        // objects on a curved side.
        throw new Error("Upstream object uncuttable, has no flat face");
      }
    }
    all_candidates[localId]= candidates
    const newLeaf = {
      geometry: leaf.geometry,
      id: localId,
      tags: leaf.tags,
      color: leaf.color,
      plane: leaf.plane,
      bom: leaf.bom,
    };
    localId++;
    return newLeaf;

  });

  // Heuristic here is... for each part get it's minimum thickness. If the largest of these is
  // <= 1" then it's credibly the size of stock being used, so set that as our material
  // thickness and select among candidates for each part.

  let material_thickness = -1;
  if (layoutConfig.units) {
    const LARGEST_PLAUSIBLE_STOCK = layoutConfig.units == "MM" ? 25.4 : 1    
    const min_thickness_per_part = Object.values(all_candidates).map(s => Math.min(...s.map(c => c.thickness)));
    if (Math.max(...min_thickness_per_part) <= LARGEST_PLAUSIBLE_STOCK + THICKNESS_TOLLERANCE) {
      material_thickness = Math.max(...min_thickness_per_part);
    }
  }

  library[targetID] = actOnLeafs(intermediate, (leaf) => {
    let candidates = all_candidates[leaf.id]
    let selected;
    if (candidates.length == 1) {
      selected = candidates[0];
    } else {
      // For each candidate generate a descriptive struct with the properties we care about.
      // namely:
      //  - height
      //  - area (approx)
      //  - number of interior wires (if any)
      const scores = candidates.map((c, index) => {
        return {
          candidate_index: index,
          thickness: c.thickness,
          area: areaApprox(c.face.UVBounds),
          interiorWires: c.face.clone().innerWires().length,
        }});


      // Sort in order of preference (scores[0] being best).
      scores.sort((a, b) => {
        // Thickness differences take priority over all other factors.
        if (!equalThickness(a.thickness, b.thickness)) {
          // Candidates with thickness exactly equal to material thickness always win.
          if (equalThickness(a.thickness, material_thickness)) {
            return -1;
          } else if (equalThickness(b.thickness, material_thickness)) {
            return 1;
          } else {
            // Neither candidate is equal to material thickness. Prefer thinnest
            // candidate.
            return a.thickness - b.thickness;
          }
        }

        // Tie brakes for candidates of equal thickness.
        
        // First, look for interior wires, if unequal we prefer candidates with fewer since
        // interior wires *might* indicate carve-outs which are unreachable on the underside of the sheet.
        if (a.interiorWires != b.interiorWires) {
          return a.interiorWires - b.interiorWires;
        }

        // Second (finally), prefer candidates with larger area.
        if (Math.abs(a.area - b.area) > THICKNESS_TOLLERANCE) {
          return b.area - a.area;
        }

        return 0; // we can't decide.
      }
      );
      console.log("score");
      console.log(scores);
      selected = candidates[scores[0].candidate_index];
    }
    let newLeaf = {
      geometry: [selected.geom],
      id: localId,
      referencePoint: selected.face.center,
      tags: leaf.tags,
      color: leaf.color,
      plane: leaf.plane,
      bom: leaf.bom,
    };
    // Retrieve face from the re-positioned shape so that we get the shape of the face after
    // it's been moved to the xy cutting plane. Otherwise we can get weird skewed projections
    // of the face shape.
    shapesForLayout.push({
      id: localId,
      shape: newLeaf.geometry[0].faces[selected.faceIndex],
    });
    localId++;

    return newLeaf;
  });
  return shapesForLayout;
}

/**
 * Apply the transformations to the geometry to apply the layout
 */
function applyLayout(targetID, inputID, positions, layoutConfig) {
  library[targetID] = actOnLeafs(library[targetID], (leaf) => {
    let transform, index;
    for (var i = 0; i < positions.length; i++) {
      let candidates = positions[i].filter(
        (transform) => transform.id == leaf.id
      );
      if (candidates.length == 1) {
        transform = candidates[0];
        index = i;
        break;
      } else if (candidates.length > 1) {
        console.warn("Found more than one transformation for same id");
      }
    }
    if (transform == undefined) {
      console.log("didn't find transform for id: " + leaf.id);
      return undefined;
    }
    // apply rotation first. All rotations are around (0, 0, 0)
    // Additionally, shift by sheet-index * sheet height so that multiple
    // sheet layouts are spaced out from one another.
    let newGeom = leaf.geometry[0]
      .clone()
      .rotate(
        transform.rotate,
        new replicad.Vector([0, 0, 0]),
        new replicad.Vector([0, 0, 1])
      )
      .translate(
        transform.translate.x,
        transform.translate.y + i * layoutConfig.height,
        0
      );

    return {
      geometry: [newGeom],
      tags: leaf.tags,
      color: leaf.color,
      plane: leaf.plane,
      bom: leaf.bom,
    };
  });
}

/**
 * Use the packing engine, note this is potentially time consuming step. FIXME: Can this be moved into a different worker?
 */
function computePositions(
  shapesForLayout,
  progressCallback,
  placementsCallback,
  layoutConfig
) {
  const populationSize = 5;
  const nestingEngine = new AnyNest();
  const tolerance = 0.1;
  // include tolerance * 2 to ensure padding is the minimum spacing between parts.
  const configWithDefaults = nestingEngine.config({
    spacing: layoutConfig.partPadding + tolerance * 2,
    binSpacing: 0,
    populationSize: populationSize,
    exploreConcave: false, // we eventually want this to be true, but it's unsupported right now
  });
  nestingEngine.setBin(
    FloatPolygon.fromPoints(
      [
        { x: 0, y: 0 },
        { x: layoutConfig.width, y: 0 },
        { x: layoutConfig.width, y: layoutConfig.height },
        { x: 0, y: layoutConfig.height },
      ],
      "bin"
    )
  );

  let parts = [];

  shapesForLayout.forEach((shape) => {
    let face = shape.shape;
    const mesh = face
      .clone()
      .outerWire()
      .meshEdges({ tolerance: 0.5, angularTolerance: 5 }); //The tolerance here is described in the conversation here https://github.com/BarbourSmith/Abundance/pull/173
    const points = preparePoints(mesh, tolerance); // TOOD: it's not actually clear that this tolerance should be the same..
    parts.push(FloatPolygon.fromPoints(points, shape.id));
  });
  nestingEngine.setParts(parts);

  console.log(
    "Starting nesting task with configuration: " +
      JSON.stringify(configWithDefaults)
  );
  let callbackCounter = 0;
  const targetGenerations = 5;
  return new Promise((resolve, reject) => {
    try {
      nestingEngine.start(
        (num) => {
          const fraction = 1 / (targetGenerations * populationSize);
          // start at 0.1 to acknowledge the rotation computations which happed above.
          progressCallback(
            0.1 + 0.9 * (num + callbackCounter) * fraction,
            proxy(() => {
              nestingEngine.stop();
            })
          );
        },
        (placement, utilization) => {
          callbackCounter++;
          if (callbackCounter >= targetGenerations * populationSize) {
            console.log(
              "nesting search completed " +
                targetGenerations +
                " generations. Final result: " +
                JSON.stringify(placement)
            );
            placementsCallback(placement);
            nestingEngine.stop();
            resolve(placement);
          }
        }
      );
    } catch (err) {
      console.log("error in nesting engine: " + err);
      nestingEngine.stop();
      reject(err);
    }
  });
}

// from the mesh format of [x1, y1, z1, x2, y2, z2, ...] to FloatPolygon friendly format of
// [{x: x1, y: y1}, {x: x2, y: y2}...]
function preparePoints(mesh, tolerance) {
  // Unfortunately the "edges" of this mesh aren't always in sequential order. Here we re-sort them so we can
  // pass the points into FloatPolygon in a looping order, ie, starting at one point and looping around the
  // perimiter of the shape.

  // create structure for lookup of line segments by start point or end point
  let edgeStarts = [];
  mesh.edgeGroups.forEach((edge) => {
    edgeStarts.push({
      startPoint: {
        x: mesh.lines[edge.start * 3],
        y: mesh.lines[edge.start * 3 + 1],
      },
      start: edge.start * 3,
      len: edge.count,
      edgeId: edge.edgeId,
    });
    const endIndex = (edge.start + edge.count - 1) * 3;
    edgeStarts.push({
      startPoint: { x: mesh.lines[endIndex], y: mesh.lines[endIndex + 1] },
      start: endIndex,
      len: -1 * edge.count,
      edgeId: edge.edgeId,
    });
  });

  const almostEqual = (p1, p2) => {
    const x = Math.abs(p1.x - p2.x) < tolerance;
    const y = Math.abs(p1.y - p2.y) < tolerance;
    return x && y;
  };

  const result = [];
  let currentEdge = edgeStarts[0];
  while (edgeStarts.length > 0) {
    // add currentEdge to result. Remember, it could be reverse direction if we matched
    // an endpoint.
    for (var i = 1; i < Math.abs(currentEdge.len); i++) {
      // skip start point
      let offset = i * 3;
      if (currentEdge.len < 0) {
        offset = -1 * offset;
      }
      const index = currentEdge.start + offset;
      result.push({ x: mesh.lines[index], y: mesh.lines[index + 1] });
    }

    // Remove this edge and it's inverse from the lookup table.
    edgeStarts = edgeStarts.filter((edge) => {
      return edge.edgeId != currentEdge.edgeId;
    });

    // else find next edge which starts where current result ends.
    const nextEgdes = edgeStarts.filter((edge) => {
      return almostEqual(result[result.length - 1], edge.startPoint);
    });

    if (edgeStarts.length > 0 && nextEgdes.length != 1) {
      // console.log(result);
      // console.log(edgeStarts);
      // console.log(nextEgdes);
      throw new Error(
        "Geometry error when preparing for cutlayout. Part perimiter has an edge with: " +
          nextEgdes.length +
          " continuations"
      );
    }
    currentEdge = nextEgdes[0];
  }
  return result;
}

function moveFaceToCuttingPlane(geom, face) {
  let pointOnSurface = face.pointOnSurface(0, 0);
  let faceNormal = face.normalAt();

  // Always use "XY" plane as the cutting surface
  // TODO(tristan): there's an inversion here I don't fully understand, hence using the negative Z vector.
  let cutPlaneNormal = new replicad.Vector([0, 0, -1]);

  let rotationAxis = faceNormal.cross(cutPlaneNormal);
  if (rotationAxis.Length == 0) {
    // Face already parallel to cut plane, no rotation necessary.
    return geom.clone().translate(0, 0, -1 * pointOnSurface.z);
  }

  let rotationDegrees =
    (Math.acos(
      faceNormal.dot(cutPlaneNormal) /
        (cutPlaneNormal.Length * faceNormal.Length)
    ) *
      360) /
    (2 * Math.PI);

  return geom
    .clone()
    .rotate(rotationDegrees, pointOnSurface, rotationAxis)
    .translate(0, 0, -1 * pointOnSurface.z);
}

function areaApprox(bounds) {
  return (bounds.uMax - bounds.uMin) * (bounds.vMax - bounds.vMin);
}

// Checks if part is an assembly)
function isAssembly(part) {
  if (part.geometry.length > 0) {
    if (part.geometry[0].geometry) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

/** Cut assembly function that takes in a part to cut (library object), cutting parts (unique IDS), assembly id and index */
/** Returns a new single cut part or an assembly of cut parts */
function cutAssembly(partToCut, cuttingParts, assemblyID) {
  try {
    //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
    if (isAssembly(partToCut)) {
      let assemblyToCut = partToCut.geometry;
      let assemblyCut = [];
      assemblyToCut.forEach((part) => {
        // make new assembly from cut parts
        assemblyCut.push(cutAssembly(part, cuttingParts, assemblyID));
      });

      let subID = generateUniqueID();
      //returns new assembly that has been cut
      library[subID] = {
        //This feels like a hack, we shouldn't be using the library internally like this
        geometry: assemblyCut,
        tags: partToCut.tags,
        bom: partToCut.bom,
      };
      return library[subID];
    } else {
      // if part to cut is a single part send to cutting function with cutting parts
      var partCutCopy = partToCut.geometry[0];
      cuttingParts.forEach((cuttingPart) => {
        // for each cutting part cut the part
        partCutCopy = recursiveCut(partCutCopy, toGeometry(cuttingPart));
      });
      /*   if the part is a compound return each solid as a new assembly */
      function getSolids(compound) {
        return Array.from(
          replicad.iterTopo(compound.wrapped, "solid"),
          (s) => new Solid(s)
        );
      }
      if (partCutCopy.wrapped) {
        let solids = getSolids(partCutCopy);
        if (solids.length > 1) {
          let newAssembly = [];
          solids.forEach((solid) => {
            newAssembly.push({
              geometry: [solid],
              tags: partToCut.tags,
              color: partToCut.color,
              bom: partToCut.bom,
              plane: partToCut.plane,
            });
          });
          // return new cut part
          let newID = generateUniqueID();
          library[newID] = {
            geometry: newAssembly,
            tags: partToCut.tags,
            color: partToCut.color,
            bom: partToCut.bom,
            plane: partToCut.plane,
          };

          return library[newID];
        }
      }
      // return new cut part
      let newID = generateUniqueID();
      library[newID] = {
        geometry: [partCutCopy],
        tags: partToCut.tags,
        color: partToCut.color,
        bom: partToCut.bom,
        plane: partToCut.plane,
      };

      return library[newID];
    }
  } catch (e) {
    throw new Error("Cut Assembly failed");
  }
}
/** Recursive function that gets passed a solid to cut and a library object that cuts it */
function recursiveCut(partToCut, cuttingPart) {
  try {
    let cutGeometry = partToCut;
    // if cutting part is an assembly pass back into the function to be cut by each part in that assembly
    if (isAssembly(cuttingPart)) {
      for (let i = 0; i < cuttingPart.geometry.length; i++) {
        cutGeometry = recursiveCut(cutGeometry, cuttingPart.geometry[i]);
      }
      return cutGeometry;
    } else {
      // cut and return part
      let cutPart;
      cutPart = partToCut.cut(cuttingPart.geometry[0]);
      return cutPart;
    }
  } catch (e) {
    throw new Error("Recursive Cut failed");
  }
}

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(inputIDs, targetID = null) {
  if (!Array.isArray(inputIDs) || inputIDs.length === 0) {
    throw new Error("inputIDs must be a non-empty array");
  }

  await started;

  let assembly = [];
  let bomAssembly = [];

  if (inputIDs.length > 1) {
    const all3D = inputIDs.every((inputID) => is3D(toGeometry(inputID)));
    const all2D = inputIDs.every((inputID) => !is3D(toGeometry(inputID)));

    if (all3D || all2D) {
      for (let i = 0; i < inputIDs.length; i++) {
        const geometry = toGeometry(inputIDs[i]);
        assembly.push(cutAssembly(geometry, inputIDs.slice(i + 1), targetID));
        if (geometry.bom.length > 0) {
          bomAssembly.push(...geometry.bom);
        }
      }
    } else {
      throw new Error(
        "Assemblies must be composed from only sketches OR only solids"
      );
    }
  } else {
    const geometry = toGeometry(inputIDs[0]);
    assembly.push(geometry);
    if (geometry.bom.length > 0) {
      bomAssembly.push(...geometry.bom);
    }
  }

  const newPlane = new Plane().pivot(0, "Y");
  let generatedAssembly = {
    geometry: assembly,
    plane: newPlane,
    tags: [],
    bom: bomAssembly,
  };

  if (targetID != null) {
    library[targetID] = generatedAssembly;
  } else {
    return generatedAssembly;
  }

  return true;
}

function fusion(targetID, inputIDs) {
  return started.then(() => {
    let fusedGeometry = [];
    let bomAssembly = [];
    inputIDs.forEach((inputID) => {
      if (inputIDs.every((inputID) => is3D(library[inputID]))) {
        fusedGeometry.push(digFuse(library[inputID]));
      } else if (inputIDs.every((inputID) => !is3D(library[inputID]))) {
        fusedGeometry.push(digFuse(library[inputID]));
      } else {
        throw new Error(
          "Fusion must be composed from only sketches OR only solids"
        );
      }
      if (library[inputID].bom.length > 0) {
        bomAssembly.push(...library[inputID].bom);
      }
    });
    const newPlane = new Plane().pivot(0, "Y");
    library[targetID] = {
      geometry: [chainFuse(fusedGeometry)],
      tags: [],
      bom: bomAssembly,
      plane: newPlane,
      color: defaultColor,
    };
    return true;
  });
}

//Action is a function which takes in a leaf and returns a new leaf which has had the action applied to it
// The action may return 'undefined' to cause the leaf to be removed from the result.
function actOnLeafs(assembly, action, plane) {
  plane = plane || assembly.plane;
  //This is a leaf
  if (
    assembly.geometry.length == 1 &&
    assembly.geometry[0].geometry == undefined
  ) {
    return action(assembly);
  }
  //This is a branch
  else {
    let transformedAssembly = [];
    assembly.geometry.forEach((subAssembly) => {
      const result = actOnLeafs(subAssembly, action);
      if (result != undefined) {
        transformedAssembly.push(result);
      }
    });
    return {
      geometry: transformedAssembly,
      tags: assembly.tags,
      bom: assembly.bom,
      plane: plane,
    };
  }
}

function flattenAssembly(assembly) {
  var flattened = [];
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

function chainFuse(chain) {
  try {
    let fused = chain[0].clone();
    for (let i = 1; i < chain.length; i++) {
      fused = fused.fuse(chain[i]);
    }
    return fused;
  } catch (e) {
    throw new Error("Fusion failed");
  }
}

function digFuse(assembly) {
  var flattened = [];

  if (isAssembly(assembly)) {
    assembly.geometry.forEach((subAssembly) => {
      if (!isAssembly(subAssembly)) {
        //if it's not an assembly hold on add it to the fusion list
        flattened.push(subAssembly.geometry[0]);
      } else {
        // if it is an assembly keep digging
        // add the fused things in
        flattened.push(digFuse(subAssembly));
      }
    });
    return chainFuse(flattened);
  } else {
    return assembly.geometry[0];
  }
}

let colorOptions = {
  Default: defaultColor,
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
async function generateDefaultMesh(id) {
  let defaultMesh = await text(id, "No output to display", 28, "ROBOTO");
  return defaultMesh;
}

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
    console.log("Generating display mesh for " + id);

    if (library[id] == undefined || id == undefined) {
      console.log("ID undefined or not found in library");
      //throw new Error("ID not found in library");
      generateDefaultMesh(id).then((result) => {
        console.log(result);
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
      console.log("Error generating camera position");
      cameraZoom = 1;
    }
    let finalMeshes = [];
    //Iterate through the meshArray and create final meshes with faces, edges and color to pass to display
    meshArray.forEach((meshgeometry) => {
      try {
        //Try extruding if there is no 3d shape
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

/**
 * Serializes a geometry from the library to a transferable format
 * @param {number} libraryID - ID of the geometry in the library to serialize
 * @returns {object} Serialized representation of the geometry
 */
function serialize(libraryID) {
  return started.then(async () => {
    if (!library[libraryID]) {
      throw new Error(`Geometry with ID ${libraryID} not found in library`);
    }

    const item = library[libraryID];
    
    // Function to serialize a single geometry object using STEP format to preserve parametric data
    async function serializeSingleGeometry(geom, is3DObject) {
      if (!geom) return null;
      
      try {
        let geometryToSerialize = geom;
        
        // If it's a 2D sketch, we need to extrude it temporarily to create a STEP representation
        if (!is3DObject) {
          // Create a very thin extrusion for 2D objects
          geometryToSerialize = geom.clone().sketchOnPlane().extrude(0.0001);
        }
        
        // Convert geometry to STEP blob (preserves parametric data better than STL)
        const stepBlob = await geometryToSerialize.blobSTEP();
        
        // Convert blob to base64 string
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(stepBlob);
        });
      } catch (error) {
        console.error("Error serializing geometry:", error);
        throw new Error(`Failed to serialize geometry: ${error.message}`);
      }
    }

    // Function to serialize a geometry item (could be an assembly)
    async function serializeGeometryItem(item) {
      try {
        if (isAssembly(item)) {
          // Handle assembly - recursively serialize each component
          const serializedAssembly = [];
          for (const component of item.geometry) {
            serializedAssembly.push(await serializeGeometryItem(component));
          }
          
          return {
            isAssembly: true,
            geometry: serializedAssembly,
            tags: item.tags || [],
            color: item.color || defaultColor,
            bom: item.bom || [],
            hasPlane: !!item.plane,
            is3D: is3D(item)
          };
        } else {
          // Handle simple geometry
          const serializedGeometries = [];
          const is3DObject = is3D(item);
          
          for (const geom of item.geometry) {
            if (geom) {
              serializedGeometries.push(await serializeSingleGeometry(geom, is3DObject));
            }
          }
          
          return {
            isAssembly: false,
            geometry: serializedGeometries,
            tags: item.tags || [],
            color: item.color || defaultColor,
            bom: item.bom || [],
            hasPlane: !!item.plane,
            is3D: is3DObject
          };
        }
      } catch (error) {
        console.error("Error in serializeGeometryItem:", error);
        throw error;
      }
    }

    return serializeGeometryItem(item);
  });
}

/**
 * Deserializes data and stores it in the library
 * @param {object} data - Serialized geometry data
 * @param {number} libraryID - ID to store the deserialized geometry in the library
 * @returns {boolean} True if deserialization was successful
 */
function deserialize(data, libraryID) {
  return started.then(async () => {
    if (!data) {
      throw new Error('No data provided for deserialization');
    }

    // Function to deserialize a single geometry from base64 STEP data
    async function deserializeSingleGeometry(base64, is3DObject) {
      if (!base64) return null;
      
      try {
        // Convert base64 to blob
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        // Use application/step MIME type for the STEP file format
        const blob = new Blob([byteArray], { type: 'application/step' });
        
        // Import STEP - this preserves the parametric data unlike STL import
        let importedGeometry = await replicad.importSTEP(blob);
        
        // If the original was a 2D sketch, extract a sketch from the imported geometry
        if (!is3DObject) {
          try {
            // Extract a 2D projection from the thin 3D object
            importedGeometry = replicad.drawProjection(importedGeometry, "top").visible;
          } catch (error) {
            console.warn("Could not convert back to 2D sketch:", error);
            // Return the object as is if conversion fails
          }
        }
        
        return importedGeometry;
      } catch (error) {
        console.error("Error deserializing geometry:", error);
        throw new Error(`Failed to deserialize geometry: ${error.message}`);
      }
    }

    // Function to deserialize a geometry item (could be an assembly)
    async function deserializeGeometryItem(item) {
      try {
        if (item.isAssembly) {
          // Handle assembly - recursively deserialize each component
          const deserializedGeometry = [];
          
          for (const component of item.geometry) {
            deserializedGeometry.push(await deserializeGeometryItem(component));
          }
          
          // Create new plane
          const plane = new Plane().pivot(0, "Y");
          
          return {
            geometry: deserializedGeometry,
            tags: item.tags || [],
            color: item.color || defaultColor,
            bom: item.bom || [],
            plane: plane
          };
        } else {
          // Handle simple geometry
          const deserializedGeometries = [];
          
          for (const base64 of item.geometry) {
            if (base64) {
              deserializedGeometries.push(await deserializeSingleGeometry(base64, item.is3D));
            }
          }
          
          // Create new plane
          const plane = new Plane().pivot(0, "Y");
          
          return {
            geometry: deserializedGeometries,
            tags: item.tags || [],
            color: item.color || defaultColor,
            bom: item.bom || [],
            plane: plane
          };
        }
      } catch (error) {
        console.error("Error in deserializeGeometryItem:", error);
        throw error;
      }
    }

    try {
      // Deserialize and store in library
      library[libraryID] = await deserializeGeometryItem(data);
      return true;
    } catch (error) {
      console.error("Error deserializing data:", error);
      throw error;
    }
  });
}

/**
 * Tests the serialization and deserialization functionality with various geometry types
 * @returns {object} Test results including success status and details
 */
function testSerializeDeserialize() {
  return started.then(async () => {
    try {
      const results = {
        success: true,
        details: []
      };
      
      // Test 1: Simple geometry (circle) - 2D sketch
      const testCircleID = generateUniqueID();
      const destCircleID = generateUniqueID();
      
      await circle(testCircleID, 10);
      
      // Verify this is a 2D object
      if (is3D(library[testCircleID])) {
        results.success = false;
        results.details.push("Circle should be a 2D object");
      }
      
      const serializedCircle = await serialize(testCircleID);
      await deserialize(serializedCircle, destCircleID);
      
      // Basic validation - check if objects exist in library
      if (!library[testCircleID] || !library[destCircleID]) {
        results.success = false;
        results.details.push("Failed to serialize/deserialize circle: objects not found in library");
      } else {
        // Test parametric properties are preserved
        const originalCircle = library[testCircleID].geometry[0];
        const deserializedCircle = library[destCircleID].geometry[0];
        
        // Check if the shapes have similar properties
        if (Math.abs(originalCircle.boundingBox.width - deserializedCircle.boundingBox.width) > 0.1) {
          results.success = false;
          results.details.push("Circle dimensions not preserved during serialization/deserialization");
        } else {
          results.details.push("Successfully serialized and deserialized a circle (2D sketch) with parametric properties preserved");
        }
      }
      
      // Test 2: Rectangle - 2D sketch
      const testRectID = generateUniqueID();
      const destRectID = generateUniqueID();
      
      await rectangle(testRectID, 20, 10);
      
      // Verify this is a 2D object
      if (is3D(library[testRectID])) {
        results.success = false;
        results.details.push("Rectangle should be a 2D object");
      }
      
      const serializedRect = await serialize(testRectID);
      await deserialize(serializedRect, destRectID);
      
      if (!library[testRectID] || !library[destRectID]) {
        results.success = false;
        results.details.push("Failed to serialize/deserialize rectangle: objects not found in library");
      } else {
        // Test parametric properties are preserved
        const originalRect = library[testRectID].geometry[0];
        const deserializedRect = library[destRectID].geometry[0];
        
        // Check if the shapes have similar properties
        if (Math.abs(originalRect.boundingBox.width - deserializedRect.boundingBox.width) > 0.1 ||
            Math.abs(originalRect.boundingBox.height - deserializedRect.boundingBox.height) > 0.1) {
          results.success = false;
          results.details.push("Rectangle dimensions not preserved during serialization/deserialization");
        } else {
          results.details.push("Successfully serialized and deserialized a rectangle (2D sketch) with parametric properties preserved");
        }
      }
      
      // Test 3: Assembly of 2D objects (combination of shapes)
      const test2DAssemblyID = generateUniqueID();
      const dest2DAssemblyID = generateUniqueID();
      
      await assembly([testCircleID, testRectID], test2DAssemblyID);
      
      // Verify this is a 2D assembly
      if (is3D(library[test2DAssemblyID])) {
        results.success = false;
        results.details.push("2D assembly should be identified as 2D");
      }
      
      const serialized2DAssembly = await serialize(test2DAssemblyID);
      await deserialize(serialized2DAssembly, dest2DAssemblyID);
      
      if (!library[test2DAssemblyID] || !library[dest2DAssemblyID]) {
        results.success = false;
        results.details.push("Failed to serialize/deserialize 2D assembly: objects not found in library");
      } else {
        // Check if the assembly has the correct number of components
        if (library[test2DAssemblyID].geometry.length !== library[dest2DAssemblyID].geometry.length) {
          results.success = false;
          results.details.push("2D assembly component count not preserved during serialization/deserialization");
        } else {
          results.details.push("Successfully serialized and deserialized a 2D assembly with structure preserved");
        }
      }
      
      // Test 4: Extruded shape (3D object)
      const testExtrudeID = generateUniqueID();
      const destExtrudeID = generateUniqueID();
      
      await extrude(testExtrudeID, testRectID, 5);
      
      // Verify this is a 3D object
      if (!is3D(library[testExtrudeID])) {
        results.success = false;
        results.details.push("Extruded shape should be a 3D object");
      }
      
      const serializedExtrude = await serialize(testExtrudeID);
      await deserialize(serializedExtrude, destExtrudeID);
      
      if (!library[testExtrudeID] || !library[destExtrudeID]) {
        results.success = false;
        results.details.push("Failed to serialize/deserialize extruded shape: objects not found in library");
      } else {
        // Test parametric properties are preserved
        const originalExtrude = library[testExtrudeID].geometry[0];
        const deserializedExtrude = library[destExtrudeID].geometry[0];
        
        // Check if the shapes have similar properties
        if (Math.abs(originalExtrude.boundingBox.width - deserializedExtrude.boundingBox.width) > 0.1 ||
            Math.abs(originalExtrude.boundingBox.height - deserializedExtrude.boundingBox.height) > 0.1 ||
            Math.abs(originalExtrude.boundingBox.depth - deserializedExtrude.boundingBox.depth) > 0.1) {
          results.success = false;
          results.details.push("Extruded shape dimensions not preserved during serialization/deserialization");
        } else {
          results.details.push("Successfully serialized and deserialized an extruded shape (3D object) with parametric properties preserved");
        }
      }
      
      // Test 5: Assembly of 3D objects
      const test3DAssemblyID = generateUniqueID();
      const dest3DAssemblyID = generateUniqueID();
      
      // Create another 3D object
      const testExtrude2ID = generateUniqueID();
      await extrude(testExtrude2ID, testCircleID, 5);
      
      await assembly([testExtrudeID, testExtrude2ID], test3DAssemblyID);
      
      // Verify this is a 3D assembly
      if (!is3D(library[test3DAssemblyID])) {
        results.success = false;
        results.details.push("3D assembly should be identified as 3D");
      }
      
      const serialized3DAssembly = await serialize(test3DAssemblyID);
      await deserialize(serialized3DAssembly, dest3DAssemblyID);
      
      if (!library[test3DAssemblyID] || !library[dest3DAssemblyID]) {
        results.success = false;
        results.details.push("Failed to serialize/deserialize 3D assembly: objects not found in library");
      } else {
        // Check if the assembly has the correct number of components
        if (library[test3DAssemblyID].geometry.length !== library[dest3DAssemblyID].geometry.length) {
          results.success = false;
          results.details.push("3D assembly component count not preserved during serialization/deserialization");
        } else {
          results.details.push("Successfully serialized and deserialized a 3D assembly with structure preserved");
        }
      }
      
      // Test 6: Operations on deserialized objects (validate they remain parametric)
      const operationTestID = generateUniqueID();
      
      try {
        // Try to perform a Boolean operation on the deserialized geometry
        await extrude(operationTestID, destCircleID, 10);
        
        if (!library[operationTestID] || !is3D(library[operationTestID])) {
          results.success = false;
          results.details.push("Unable to perform operations on deserialized geometry");
        } else {
          results.details.push("Successfully performed operations on deserialized geometry, confirming parametric nature is preserved");
        }
      } catch (error) {
        results.success = false;
        results.details.push(`Failed to perform operations on deserialized geometry: ${error.message}`);
      }
      
      if (results.success) {
        console.log("All serialization tests completed successfully");
      } else {
        console.error("Some serialization tests failed", results.details);
      }
      
      return results;
    } catch (error) {
      console.error("Error in serialization test:", error);
      return { success: false, details: [error.toString()] };
    }
  });
}

// comlink is great to expose your functions within the worker as a simple API
// to your app.
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
  serialize,
  deserialize,
  testSerializeDeserialize,
});
