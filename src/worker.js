import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import { setOC, loadFont } from "replicad";
import { expose, proxy } from "comlink";
import {
  drawCircle,
  drawRectangle,
  drawPolysides,
  drawText,
  Plane,
  Vector,
  importSTEP,
  importSTL,
} from "replicad";
import { drawProjection, ProjectionCamera } from "replicad";
import shrinkWrap from "replicad-shrink-wrap";
import { addSVG, drawSVG } from "replicad-decorate";
import Fonts from "./js/fonts.js";
import { AnyNest, FloatPolygon } from "any-nest";
import { re } from "mathjs";

var library = {};

// This is the logic to load the web assembly code into replicad
let loaded = false;
const init = async () => {
  if (loaded) return Promise.resolve(true);

  const OC = await opencascade({
    locateFile: () => opencascadeWasm,
  });

  loaded = true;
  setOC(OC);

  return true;
};
const started = init();

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
      geometry: [drawCircle(diameter / 2)],
      tags: [],
      plane: newPlane,
      color: "#FF9065",
      bom: [],
    };
    return true;
  });
}

function rectangle(id, x, y) {
  return started.then(() => {
    const newPlane = new Plane().pivot(0, "Y");
    library[id] = {
      geometry: [drawRectangle(x, y)],
      tags: [],
      plane: newPlane,
      color: "#FF9065",
      bom: [],
    };
    return true;
  });
}

function regularPolygon(id, radius, numberOfSides) {
  return started.then(() => {
    const newPlane = new Plane().pivot(0, "Y");
    library[id] = {
      geometry: [drawPolysides(radius, numberOfSides)],
      tags: [],
      plane: newPlane,
      color: "#FF9065",
      bom: [],
    };
    return true;
  });
}
async function text(id, text, fontSize, fontFamily) {
  await loadFont(Fonts[fontFamily])
    .then(() => console.log("Font loaded"))
    .catch((err) => console.error("Error loading font: ", err));

  return started.then(() => {
    const newPlane = new Plane().pivot(0, "Y");

    const textGeometry = drawText(text, {
      startX: 0,
      startY: 0,
      fontSize: fontSize,
      font: fontFamily,
    });
    library[id] = {
      geometry: [textGeometry],
      tags: [],
      plane: newPlane,
      color: "#FF9065",
      bom: [],
    };
    return true;
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
      color: "#FF9065",
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

function move(targetID, inputID, x, y, z) {
  return started.then(() => {
    if (is3D(library[inputID])) {
      library[targetID] = actOnLeafs(library[inputID], (leaf) => {
        return {
          geometry: [leaf.geometry[0].clone().translate(x, y, z)],
          plane: leaf.plane,
          tags: leaf.tags,
          color: leaf.color,
          bom: leaf.bom,
        };
      });
    } else {
      library[targetID] = actOnLeafs(
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
    }
    return true;
  });
}

function rotate(targetID, inputID, x, y, z) {
  return started.then(() => {
    if (is3D(library[inputID])) {
      library[targetID] = actOnLeafs(library[inputID], (leaf) => {
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
    } else {
      library[targetID] = actOnLeafs(
        library[inputID],
        (leaf) => {
          return {
            geometry: [
              leaf.geometry[0].clone().rotate(z, [0, 0, 0], [0, 0, 1]),
            ],
            tags: leaf.tags,
            plane: leaf.plane.pivot(x, "X").pivot(y, "Y"),
            color: leaf.color,
            bom: leaf.bom,
          };
        },
        library[inputID].plane.pivot(x, "X").pivot(y, "Y")
      );
    }

    return true;
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
        color: "#FF9065",
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

//Runs the user entered code in the worker thread and returns the result.
function code(targetID, code, argumentsArray) {
  return started.then(() => {
    let keys1 = [];
    let inputValues = [];
    for (const [key, value] of Object.entries(argumentsArray)) {
      keys1.push(`${key}`);
      inputValues.push(value);
    }

    // revisit this eval/ Is this the right/safest way to do this?
    var result = eval(
      "(function(" + keys1 + ") {" + code + "}(" + inputValues + "))"
    );

    library[targetID] = result;

    //If the type of the result is a number return the number so it can be passed to the next atom
    if (typeof result === "number") {
      return result;
    } else {
      return true;
    }
  });
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
        finalGeometry = [drawProjection(fusedGeometry, "top").visible];
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
    if (fileType == "SVG") {
      let svg = library[ID].geometry[0]
        .scale(svgResolution / scaleUnit)
        .toSVG(svgResolution / scaleUnit);
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
  let STEPresult = await importSTEP(file);

  library[targetID] = {
    geometry: [STEPresult],
    tags: [],
    color: "#FF9065",
    bom: [],
  };
  return true;
}

async function importingSTL(targetID, file) {
  let STLresult = await importSTL(file);

  library[targetID] = {
    geometry: [STLresult],
    tags: [],
    color: "#FF9065",
    bom: [],
  };
  return true;
}

async function importingSVG(targetID, svg, width) {
  const baseWidth = width + width * 0.05;
  const baseShape = drawRectangle(baseWidth, baseWidth)
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
  library[targetID] = {
    geometry: [drawSVG(svgString, { width: width })],
    tags: [],
    color: "#FF9065",
    bom: [],
  };
  return true;
}

const prettyProjection = (shape) => {
  const bbox = shape.boundingBox;
  const center = bbox.center;
  const corner = [
    bbox.center[0] + bbox.width,
    bbox.center[1] - bbox.height,
    bbox.center[2] + bbox.depth,
  ];
  const camera = new ProjectionCamera(corner).lookAt(center);
  const { visible, hidden } = drawProjection(shape, camera);

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
        projectionShape = drawProjection(fusedGeometry, "top").visible;
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
  console.log(inputGeometry);
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
 *    - sheetPadding - space from the edge of the material where no parts will be placed
 *    - partPadding - space between parts in the resulting placement
 */
function layout(targetID, inputID, TAG, progressCallback, layoutConfig) {
  return started.then(() => {
    var THICKNESS_TOLLERANCE = 0.001;

    let taggedGeometry = extractTags(library[inputID], TAG);
    if (!taggedGeometry) {
      throw new Error("No Upstream Geometries Tagged for Cut");
    }
    let localId = 0;
    let shapesForLayout = [];

    // Rotate all shapes to be most cuttable.
    library[targetID] = actOnLeafs(taggedGeometry, (leaf) => {
      // For each face, consider it as the underside of the shape on the CNC bed.
      // In order to be considered, a face must be...
      //  1) a flat PLANE, not a cylander, or sphere or other curved face type.
      //  2) the thickness of the part normal to this plane must be less than or equal to
      //     the raw material thickness
      //  3) there must be no parts of the shape which protrude "below" this face
      let candidates = [];
      let hasFlatFace = false;
      let faceIndex = 0;
      leaf.geometry[0].faces.forEach((face) => {
        if (face.geomType == "PLANE") {
          hasFlatFace = true;
          let prospectiveGoem = moveFaceToCuttingPlane(leaf.geometry[0], face);
          let thickness = prospectiveGoem.boundingBox.depth;
          if (thickness < layoutConfig.thickness + THICKNESS_TOLLERANCE) {
            // Check for protrusions "below" the bottom of the raw material.
            if (
              prospectiveGoem.boundingBox.bounds[0][2] >
              -1 * THICKNESS_TOLLERANCE
            ) {
              candidates.push({
                face: face,
                geom: prospectiveGoem,
                faceIndex: faceIndex,
              });
            }
          }
        }
        faceIndex++;
      });

      let selected;
      if (candidates.length == 0) {
        if (!hasFlatFace) {
          // TODO: how to specify which upstream object? We know which leaf we're dealing with here
          // but I'm not sure how to back-track that to alerting on the relevant atom or
          // providing a user visible indication of which geom is the problem.
          throw new Error("Upstream object uncuttable, has no flat face");
        } else {
          throw new Error("Upstream object too thick for specified material");
        }
      } else if (candidates.length == 1) {
        selected = candidates[0];
      } else {
        // The candidate selection here doesn't guarantee a printable piece. In particular there
        // are shapes with overhangs which we cannot easily detect.
        // These tie-break heuristics are designed to usually pick a printable orientation for
        // this piece. (TODO) However, we should consider allowing user-modification of these
        // orientations before the packing stage.

        // Filter out faces with extra interiorWires, as these may indicate carve-outs which will
        // be unreachable on the underside of the sheet.
        let minInteriorWires = Math.min(
          ...candidates.map((c) => {
            return c.face.clone().innerWires().length;
          })
        );
        candidates = candidates.filter((c) => {
          return c.face.clone().innerWires().length === minInteriorWires;
        });
        if (candidates.length === 1) {
          selected = candidates[0];
        }

        // prefer candidates whose thickness is equal to material thickness, if any.
        let temp = candidates.filter((c) => {
          return (
            Math.abs(c.geom.boundingBox.depth - layoutConfig.thickness) <
            THICKNESS_TOLLERANCE
          );
        });
        if (temp.length > 0) {
          candidates = temp;
        }

        // Pick the largest of the remaining candidates (note: it's not trivial to calculate area, so here we
        // just compare bounding boxes)
        let maxArea = 0;
        candidates.forEach((c) => {
          if (areaApprox(c.face.UVBounds) > maxArea) {
            maxArea = areaApprox(c.face.UVBounds);
            selected = c;
          }
        });
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

    let positionsPromise = computePositions(
      shapesForLayout,
      progressCallback,
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

      library[targetID] = actOnLeafs(
        extractTags(library[targetID], TAG),
        (leaf) => {
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
              new Vector([0, 0, 0]),
              new Vector([0, 0, 1])
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
        }
      );
      return warning;
    });
  });
}

/**
 * Use the packing engine, note this is potentially time consuming step.
 */
function computePositions(shapesForLayout, progressCallback, layoutConfig) {
  const populationSize = 5;
  const nestingEngine = new AnyNest();
  const tolerance = 0.1;

  // include tolerance * 2 to ensure padding is the minimum spacing between parts.
  const configWithDefaults = nestingEngine.config({
    spacing: layoutConfig.partPadding + tolerance * 2,
    binSpacing: layoutConfig.sheetPadding,
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
      console.log(result);
      console.log(edgeStarts);
      console.log(nextEgdes);
      throw new Error(
        "Geometry errow when preparing for cutlayout. Part perimiter has an edge with: " +
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
  let cutPlaneNormal = new Vector([0, 0, -1]);

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
        partCutCopy = recursiveCut(partCutCopy, library[cuttingPart]);
      });
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

function assembly(targetID, inputIDs) {
  return started.then(() => {
    let assembly = [];
    let bomAssembly = [];

    if (inputIDs.length > 1) {
      /** Check if all inputs are solid or sketches */
      if (
        inputIDs.every((inputID) => is3D(library[inputID])) ||
        inputIDs.every((inputID) => !is3D(library[inputID]))
      ) {
        for (let i = 0; i < inputIDs.length; i++) {
          assembly.push(
            cutAssembly(library[inputIDs[i]], inputIDs.slice(i + 1), targetID)
          );
          if (library[inputIDs[i]].bom.length > 0) {
            bomAssembly.push(...library[inputIDs[i]].bom);
          }
        }
      } else {
        throw new Error(
          "Assemblies must be composed from only sketches OR only solids"
        );
      }
    } else {
      assembly.push(library[inputIDs[0]]);
      if (library[inputIDs[0]].bom.length > 0) {
        bomAssembly.push(...library[inputIDs[0]].bom);
      }
    }
    const newPlane = new Plane().pivot(0, "Y");
    library[targetID] = {
      geometry: assembly,
      plane: newPlane,
      tags: [],
      bom: bomAssembly,
    };
    return true;
  });
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
      color: "#FF9065",
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

function generateDisplayMesh(id) {
  return started.then(() => {
    if (library[id] == undefined) {
      generateDefaultMesh(id).then((result) => {
        console.log(result);
      });
      //throw new Error("ID not found in library");
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

    let finalMeshes = [];
    //Iterate through the meshArray and create final meshes with faces, edges and color to pass to display
    meshArray.forEach((meshgeometry) => {
      //Try extruding if there is no 3d shape
      if (meshgeometry.geometry.mesh == undefined) {
        const threeDShape = meshgeometry
          .sketchOnPlane(sketchPlane)
          .clone()
          .extrude(0.0001);
        return {
          faces: threeDShape.mesh(),
          edges: threeDShape.meshEdges(),
        };
      } else {
        finalMeshes.push({
          faces: meshgeometry.geometry.mesh(),
          edges: meshgeometry.geometry.meshEdges(),
          color: meshgeometry.color,
        });
      }
    });
    return finalMeshes;
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
  layout,
  output,
  molecule,
  bom,
  extractTag,
  intersect,
  assembly,
  loftShapes,
  text,
});
