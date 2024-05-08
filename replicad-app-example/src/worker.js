import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import { setOC } from "replicad";
import { expose } from "comlink";
import { drawCircle, drawRectangle, drawPolysides, Plane } from "replicad";
import { drawProjection } from "replicad";
// We import our model as a simple function
import { drawBox } from "./cad";
import { i, re } from "mathjs";

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

function createMesh(thickness) {
  return started.then(() => {
    // This is how you get the data structure that the replica-three-helper
    // can synchronize with three BufferGeometry
    // will probably use eventually to fi
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
    };
    return true;
  });
}

function loftShapes(targetID, inputsIDs) {
  return started.then(() => {
    let startPlane = library[inputsIDs[0]].plane;
    let arrayOfSketchedGeometry = [];
    inputsIDs.forEach((inputID) => {
      arrayOfSketchedGeometry.push(
        library[inputID].geometry[0].sketchOnPlane(library[inputID].plane)
      );
    });
    let startGeometry = arrayOfSketchedGeometry.shift();
    library[targetID] = {
      geometry: [startGeometry.loftWith([...arrayOfSketchedGeometry])],
      tags: [],
      plane: startPlane,
      color: library[inputsIDs[0]].color,
    };
    return true;
  });
}

function extrude(targetID, inputID, height) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[inputID], (leaf) => {
      return {
        geometry: [
          leaf.geometry[0].sketchOnPlane(leaf.plane).clone().extrude(height),
        ],
        tags: leaf.tags,
        plane: leaf.plane,
        color: leaf.color,
      };
    });
    return true;
  });
}

/* function to check if shape has mesh, not for with assemblies yet since we can't assemble drawings*/
function is3D(input) {
  // if it's an assembly assume it's 3d since our assemblies don't work for drawings right now
  if (isAssembly(input)) {
    return true;
  } else if (input.geometry[0].mesh !== undefined) {
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
          color: library[inputID].color,
        };
      });
    } else {
      library[targetID] = {
        geometry: [library[inputID].geometry[0].translate([x, y])],
        tags: [],
        plane: library[inputID].plane.translate([0, 0, z]),
        color: library[inputID].color,
      };
    }
    return true;
  });
}

function rotate(targetID, inputID, x, y, z, pivot) {
  return started.then(() => {
    if (is3D(library[inputID])) {
      library[targetID] = actOnLeafs(library[inputID], (leaf) => {
        let leafCenter = leaf.geometry[0].boundingBox.center;
        return {
          geometry: [
            leaf.geometry[0]
              .clone()
              .rotate(x, pivot, [1, 0, 0])
              .rotate(y, pivot, [0, 1, 0])
              .rotate(z, pivot, [0, 0, 1]),
          ],
          tags: leaf.tags,
          plane: leaf.plane,
          color: leaf.color,
        };
      });
    } else {
      //might need to establish a way to let it pick the direction of rotation
      library[targetID] = actOnLeafs(library[inputID], (leaf) => {
        return {
          geometry: [leaf.geometry[0].clone().rotate(z, pivot, [0, 0, 1])],
          tags: leaf.tags,
          plane: leaf.plane.pivot(x, "X").pivot(y, "Y"),
          color: leaf.color,
        };
      });
    }

    return true;
  });
}

function cut(targetID, input1ID, input2ID) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[input1ID], (leaf) => {
      const cutTemplate = flattenRemove2DandFuse(library[input2ID]);
      return {
        geometry: [leaf.geometry[0].clone().cut(cutTemplate)],
        tags: leaf.tags,
        color: leaf.color,
      };
    });
    return true;
  });
}

function intersect(targetID, input1ID, input2ID) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[input1ID], (leaf) => {
      const shapeToIntersectWith = flattenRemove2DandFuse(library[input2ID]);
      return {
        geometry: [leaf.geometry[0].clone().intersect(shapeToIntersectWith)],
        tags: leaf.tags,
        color: leaf.color,
      };
    });
    return true;
  });
}

function tag(targetID, inputID, TAG) {
  return started.then(() => {
    library[targetID] = {
      geometry: library[inputID].geometry,
      tags: [TAG, ...library[inputID].tags],
      color: library[inputID].color,
    };
    return true;
  });
}

function color(targetID, inputID, color) {
  return started.then(() => {
    library[targetID] = {
      geometry: library[inputID].geometry,
      tags: [color, ...library[inputID].tags],
      color: color,
    };
    return true;
  });
}

function pattern(targetID, inputID, x, number) {
  return started.then(() => {
    const polarCopies = (shape, count, radius) => {
      const base = shape.clone().translate(0, radius);
      const angle = 360 / count;

      const copies = [];
      for (let i = 0; i < count; i++) {
        copies.push(base.clone().rotate(i * angle));
      }
      let fusedPattern = chainFuse(copies);
      return fusedPattern;
    };
    console.log(library[inputID]);

    library[targetID] = {
      geometry: [polarCopies(library[inputID].geometry[0], 5, 12)],
      tags: [...library[inputID].tags],
      color: library[inputID].color,
    };
    console.log(library[targetID]);
    return true;
  });
}

function bom(targetID, inputID, TAG, BOM) {
  return started.then(() => {
    library[targetID] = {
      geometry: library[inputID].geometry,
      tags: [TAG, ...library[inputID].tags],
      bom: BOM,
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
      throw new Error("input ID is undefined");
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
function extractBom(inputID, TAG) {
  let taggedBoms = [];
  // only try to get tags if library entry for molecule exists
  if (library[inputID]) {
    taggedBoms = extractBoms(library[inputID], TAG);
    return taggedBoms;
  }
}

/** Fuses input geometry, draws a top view projection and turns drawing into sketch */
function getSVG(targetID, inputID) {
  return started.then(() => {
    // Fuse geometry and then blob it
    let fusedGeometry = flattenRemove2DandFuse(library[inputID]);
    let topProjection = [
      drawProjection(fusedGeometry, "top").visible.sketchOnPlane(),
    ];
    library[targetID] = { geometry: topProjection, tags: [] };
    return true;
  });
}

/** Creates SVG when download button is clicked */
function downSVG(targetID, inputID) {
  return started.then(() => {
    // Fuse geometry and then blob it
    let fusedGeometry = flattenRemove2DandFuse(library[inputID]);
    let topProjection = [drawProjection(fusedGeometry, "top").visible];
    let svg = topProjection[0].toSVG();
    return svg;
  });
}

/** STL*/
function getStl(targetID, inputID) {
  return started.then(() => {
    // Fuse geometry and then blob it
    let fusedGeometry = flattenRemove2DandFuse(library[inputID]);
    library[targetID] = {
      geometry: [fusedGeometry.clone().blobSTL()],
    };
    return library[targetID].geometry[0];
  });
}

/** STEP*/
function getStep(targetID, inputID) {
  return started.then(() => {
    // Fuse geometry and then blob it
    let fusedGeometry = flattenRemove2DandFuse(library[inputID]);
    library[targetID] = {
      geometry: [fusedGeometry.clone().blobSTEP()],
    };
    return library[targetID].geometry[0];
  });
}

function extractBoms(inputGeometry, TAG) {
  if (inputGeometry.tags.includes(TAG)) {
    return [inputGeometry.bom];
  } else if (
    inputGeometry.geometry.length > 1 &&
    inputGeometry.geometry[0].geometry != undefined
  ) {
    let bomArray = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedBoms = extractBoms(subAssembly, TAG);
      if (extractedBoms != false) {
        bomArray.push(extractedBoms);
      }
    });
    return bomArray;
  } else {
    return false;
  }
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
      };
      return thethingtoreturn;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function layout(targetID, inputID, TAG, spacing) {
  return started.then(() => {
    let taggedGeometry = extractTags(library[inputID], TAG);
    library[targetID] = actOnLeafs(taggedGeometry, (leaf) => {
      /** Angle to rotate in x and y plane */
      let rotatiX = 0;
      let rotatiY = 0;
      /** Objects with angle height pairs in x and y plane */
      let heightAngleX = [];
      let heightAngleY = [];
      /** Sorts through key value pairs and returns pair with min value */
      const maxMinVal = (obj) => {
        const sortedEntriesByVal = Object.entries(obj).sort(
          ([, v1], [, v2]) => v1 - v2
        );

        return sortedEntriesByVal[0];
      };
      /** Checks for lowest possible height by rotating on x */
      for (let i = -1; i > -90; i--) {
        heightAngleX[i] = leaf.geometry[0]
          .clone()
          .rotate(i, [0, 0, 0], [1, 0, 0]).boundingBox.depth;
      }

      rotatiX = Number(maxMinVal(heightAngleX)[0]);

      /** Checks for lowest possible height by rotating on x and then on y*/

      for (let i = -1; i > -90; i--) {
        heightAngleY[i] = leaf.geometry[0]
          .clone()
          .rotate(rotatiX, [0, 0, 0], [1, 0, 0])
          .rotate(i, [0, 0, 0], [0, 1, 0]).boundingBox.depth;
      }
      rotatiY = Number(maxMinVal(heightAngleY)[0]);

      /** Returns rotated geometry */
      return {
        geometry: [
          leaf.geometry[0]
            .clone()
            .rotate(rotatiX, [0, 0, 0], [1, 0, 0])
            .rotate(rotatiY, [0, 0, 0], [0, 1, 0]),
        ],
        tags: leaf.tags,
      };
    });
    return true;
  });
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
  //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
  if (isAssembly(partToCut)) {
    let assemblyToCut = partToCut.geometry;
    let assemblyCut = [];
    assemblyToCut.forEach((part) => {
      // make new assembly from cut parts
      assemblyCut.push(cutAssembly(part, cuttingParts, assemblyID, assemblyID));
    });
    let subID = assemblyID * 10 + index + Math.random(100); // needs to be randomized?
    //returns new assembly that has been cut
    library[subID] = {
      geometry: assemblyCut,
      tags: partToCut.tags,
      color: partToCut.color,
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
    let newID = assemblyID * 10 + index;
    library[newID] = {
      geometry: [partCutCopy],
      tags: partToCut.tags,
      color: partToCut.color,
    };

    return library[newID];
  }
}
/** Recursive function that gets passed a solid to cut and a library object that cuts it */
function recursiveCut(partToCut, cuttingPart) {
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
}

function assembly(targetID, inputIDs) {
  return started.then(() => {
    let assembly = [];
    if (inputIDs.length > 1) {
      for (let i = 0; i < inputIDs.length; i++) {
        assembly.push(
          cutAssembly(library[inputIDs[i]], inputIDs.slice(i + 1), targetID, i)
        );
      }
    } else {
      assembly.push(library[inputIDs[0]]);
    }
    library[targetID] = { geometry: assembly, tags: [] };
    return true;
  });
}

//Action is a function which takes in a leaf and returns a new leaf which has had the action applied to it
function actOnLeafs(assembly, action) {
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
    return { geometry: transformedAssembly, tags: assembly.tags };
  }
}

function flattenAssembly(assembly) {
  var flattened = [];
  //This is a leaf
  if (
    assembly.geometry.length == 1 &&
    assembly.geometry[0].geometry == undefined
  ) {
    flattened.push(assembly.geometry[0]);
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
  let fused = chain[0].clone();
  for (let i = 1; i < chain.length; i++) {
    fused = fused.fuse(chain[i]);
  }
  return fused;
}

function flattenRemove2DandFuse(chain) {
  let flattened = flattenAssembly(chain);

  //Here we need to remove anything which isn't already 3D
  let cleanedGeometry = [];

  flattened.forEach((pieceOfGeometry) => {
    if (pieceOfGeometry.mesh != undefined) {
      cleanedGeometry.push(pieceOfGeometry);
    }
  });

  return chainFuse(cleanedGeometry);
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
  "Keep Out": "Keep Out",
};

function generateDisplayMesh(id) {
  return started.then(() => {
    // if there's a different plane than XY sketch there
    let sketchPlane = "XY";
    if (library[id].plane != undefined) {
      sketchPlane = library[id].plane;
    }
    console.log(library[id]);
    let colorGeometry;
    let meshArray = [];
    // Iterate through all the color options and see what geometry matches
    Object.values(colorOptions).forEach((color) => {
      colorGeometry = extractColors(library[id], color);

      if (colorGeometry != false) {
        //Flatten the assembly to remove hierarchy
        const flattened = flattenAssembly(colorGeometry);
        //Here we need to extrude anything which isn't already 3D
        var cleanedGeometry = [];
        flattened.forEach((pieceOfGeometry) => {
          if (pieceOfGeometry.mesh == undefined) {
            cleanedGeometry.push(
              pieceOfGeometry.sketchOnPlane(sketchPlane).clone().extrude(0.0001)
            );
          } else {
            cleanedGeometry.push(pieceOfGeometry);
          }
        });
        let geometry = chainFuse(cleanedGeometry);
        // Make an array that contains the color and the flattened/cleaned/fused geometry
        meshArray.push({ color: color, geometry: geometry });
      }
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
  createMesh,
  circle,
  color,
  downSVG,
  regularPolygon,
  rectangle,
  generateDisplayMesh,
  extrude,
  extractBom,
  getSVG,
  getStl,
  getStep,
  move,
  rotate,
  cut,
  tag,
  layout,
  output,
  molecule,
  pattern,
  bom,
  extractTag,
  intersect,
  assembly,
  loftShapes,
});
