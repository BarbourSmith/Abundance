import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import { setOC } from "replicad";
import { expose } from "comlink";
import {
  drawCircle,
  drawRectangle,
  drawPolysides,
  Plane,
  Vector,
  importSTEP,
  importSTL,
} from "replicad";
import { drawProjection, ProjectionCamera } from "replicad";
import shrinkWrap from "replicad-shrink-wrap";

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

function loftShapes(targetID, inputsIDs) {
  return started.then(() => {
    let arrayOfSketchedGeometry = [];

    inputsIDs.forEach((inputID) => {
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
        let leafCenter = leaf.geometry[0].boundingBox.center;
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
      library[targetID] = {
        geometry: [shrinkWrap(geometryToWrap, 50)],
        tags: [],
        color: "#FF9065",
        plane: "XY",
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
    const newPlane = new Plane().pivot(0, "Y");

    library[targetID] = result;

    return true;
  });
}

function color(targetID, inputID, color) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[inputID], (leaf) => {
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
    let fusedGeometry = digFuse(library[inputID]);
    let displayColor =
      fileType == "STL"
        ? "#91C8D5"
        : fileType == "STEP"
        ? "#ACAFDD"
        : "#3C3C3C";
    let finalGeometry;
    if (fileType == "SVG") {
      /** Fuses input geometry, draws a top view projection*/
      finalGeometry = [drawProjection(fusedGeometry, "top").visible];
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
function downExport(ID, fileType) {
  return started.then(() => {
    if (fileType == "SVG") {
      let svg = library[ID].geometry[0].toSVG();
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
  };
  return true;
}

async function importingSTL(targetID, file) {
  let STLresult = await importSTL(file);

  library[targetID] = {
    geometry: [STLresult],
    tags: [],
    color: "#FF9065",
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

// Functions like Extracttags() but takes color as input
function extractColors(inputGeometry, color) {
  if (inputGeometry.color == color) {
    return inputGeometry;
  } else if (isAssembly(inputGeometry)) {
    let geometryWithColor = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedGeometry = extractColors(subAssembly, color);

      if (extractedGeometry != false) {
        geometryWithColor.push(extractedGeometry);
      }
    });

    if (geometryWithColor.length > 0) {
      let thethingtoreturn = {
        geometry: geometryWithColor,
        tags: inputGeometry.tags,
        color: color,
      };
      return thethingtoreturn;
    } else {
      return false;
    }
  } else {
    return false;
  }
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

function layout(targetID, inputID, TAG, materialThickness, spacing) {
  return started.then(() => {
    var THICKNESS_TOLLERANCE = 0.001;

    let taggedGeometry = extractTags(library[inputID], TAG);
    if (!taggedGeometry) {
      throw new Error("No Upstream Geometries Tagged for Cut");
    }

    // The 2D underside shapes to use for nesting layout, paired with ids.
    let shapesForLayout = [];
    let localId = 0;

    // Rotate all shapes to be most cuttable.
    library[inputID] = actOnLeafs(taggedGeometry, (leaf) => {
      // For each face, consider it as the underside of the shape on the CNC bed.
      // In order to be considered, a face must be...
      //  1) a flat PLANE, not a cylander, or sphere or other curved face type.
      //  2) the thickness of the part normal to this plane must be less than or equal to
      //     the raw material thickness
      //  3) there must be no parts of the shape which protrude "below" this face
      let candidates = [];
      let hasFlatFace = false;
      leaf.geometry[0].faces.forEach((face) => {
        if (face.geomType == "PLANE") {
          hasFlatFace = true;
          let prospectiveGoem = moveFaceToCuttingPlane(leaf.geometry[0], face);
          let thickness = prospectiveGoem.boundingBox.depth;
          if (thickness < materialThickness + THICKNESS_TOLLERANCE) {
            // Check for protrusions "below" the bottom of the raw material.
            if (
              prospectiveGoem.boundingBox.bounds[0][2] >
              -1 * THICKNESS_TOLLERANCE
            ) {
              candidates.push({
                face: face,
                geom: prospectiveGoem,
              });
            }
          }
        }
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
            Math.abs(c.geom.boundingBox.depth - materialThickness) <
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

      shapesForLayout.push({id: localId, shape: selected.face});
      localId += 1;

      return newLeaf;
    });

    // Compute target positions and relative rotations for our shapes to put them
    // in a good packing.
    let packedPositions = computePositions(shapesForLayout, spacing);
    
    // apply transforms to move our shapes.
    library[targetID] = actOnLeafs(extractTags(library[inputID], TAG), (leaf) => {
      let transform = packedPositions.filter((transform) => transform.id == leaf.id)[0];
      // apply rotation first, rotate around the referencePoint so we don't mess up the translation
      let newGeom = leaf.geometry[0].clone()
        .rotate(transform.rotation, leaf.referencePoint, new Vector([0,0,1]));

      // compute and apply the translation to our target position
      let translation = transform.targetPosition.sub(leaf.referencePoint);
      newGeom = newGeom.translate(translation.x, translation.y, 0);

      return {
        geometry: [newGeom],
        tags: leaf.tags,
        color: leaf.color,
        plane: leaf.plane,
        bom: leaf.bom,
      }
    });

    return true;
  });
}

/**
 * A bad packing algorithm currently standing in for something more sophisticated.
 * I think this is the API we want in terms of computing the layout using faces then returning a set of
 * transformations that move our parts to their nested positions.
 * TODO:
 *  * replace with a better nesting algo
 *  * pass in the spacing between shapes
 *  * pass in the material dimensions / shape
 *  * P2 generate and output the remaining shape of the material for re-use in subsequent prints
 */
function computePositions(shapesForLayout, spacing) {
  let transforms = [];
  let lateralOffset = 0;
  shapesForLayout.forEach((shape) => {
    let face = shape.shape;
    // rotate for minimum width
    var minWidth = face.boundingBox.width;
    var degrees = 0;
    for (var i = 0; i < 180; i++) {
      var width = face.clone().rotate(i).boundingBox.width;
      if (width < minWidth) {
        minWidth = width;
        degrees = i;
      }
    }
    face = face.rotate(degrees);
    let targetPosition = new Vector([lateralOffset + 0.5 * face.boundingBox.width, 0.5 * face.boundingBox.height, 0]);

    transforms.push({id: shape.id, targetPosition: targetPosition, rotation: degrees});
    lateralOffset += face.boundingBox.width + spacing;
  });
  return transforms;
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
function cutAssembly(partToCut, cuttingParts, assemblyID, index) {
  try {
    //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
    if (isAssembly(partToCut)) {
      let assemblyToCut = partToCut.geometry;
      let assemblyCut = [];
      assemblyToCut.forEach((part) => {
        // make new assembly from cut parts
        assemblyCut.push(
          cutAssembly(part, cuttingParts, assemblyID, assemblyID)
        );
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
    console.error("Recursive Cut failed", partToCut);
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
            cutAssembly(
              library[inputIDs[i]],
              inputIDs.slice(i + 1),
              targetID,
              i
            )
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
      transformedAssembly.push(actOnLeafs(subAssembly, action));
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
    console.error(chain);
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

function generateDisplayMesh(id) {
  return started.then(() => {
    console.log(library[id]);
    if (library[id] == undefined) {
      throw new Error("ID not found in library");
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
});
