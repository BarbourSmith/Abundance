import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import opencascadeWasm from "replicad-opencascadejs/src/replicad_single.wasm?url";
import { setOC, sketchPolysides } from "replicad";
import { expose } from "comlink";
import { sketchCircle, sketchRectangle, loft } from "replicad";

// We import our model as a simple function
import { drawBox } from "./cad";

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

function createBlob(thickness) {
  // note that you might want to do some caching for more complex models
  return started.then(() => {
    return drawBox(thickness).blobSTEP();
  });
}

function createMesh(thickness) {
  return started.then(() => {
    const box = drawBox(thickness);
    // This is how you get the data structure that the replica-three-helper
    // can synchronize with three BufferGeometry
    return {
      faces: box.mesh(),
      edges: box.meshEdges(),
    };
  });
}

function circle(id, diameter) {
  return started.then(() => {
    library[id] = { geometry: [sketchCircle(diameter / 2)], tags: [] };
    return true;
  });
}

function rectangle(id, x, y) {
  return started.then(() => {
    library[id] = { geometry: [sketchRectangle(x, y)], tags: [] };
    return true;
  });
}

function regularPolygon(id, radius, numberOfSides) {
  return started.then(() => {
    library[id] = {
      geometry: [sketchPolysides(radius, numberOfSides)],
      tags: [],
    };
    return true;
  });
}

function loftShapes(targetID, inputID1, inputID2) {
  return started.then(() => {
    library[targetID] = loft(
      library[inputID1].geometry,
      library[inputID2].geometry
    );
    return true;
  });
}

function extrude(targetID, inputID, height) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[inputID], (leaf) => {
      return {
        geometry: [leaf.geometry[0].clone().extrude(height)],
        tags: leaf.tags,
      };
    });
    return true;
  });
}

function move(targetID, inputID, x, y, z) {
  return started.then(() => {
    library[targetID] = actOnLeafs(library[inputID], (leaf) => {
      return {
        geometry: [leaf.geometry[0].clone().translate(x, y, z)],
        tags: leaf.tags,
      };
    });
    return true;
  });
}

function rotate(targetID, inputID, x, y, z) {
  return started.then(() => {
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
      };
    });
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
    };
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
    library[targetID] = {
      geometry: taggedGeometry.geometry,
      tags: taggedGeometry.tags,
    };
    return true;
  });
}

/** Function that extracts geometry with BOM tags and returns bomItems*/
function extractBom(inputID, TAG) {
  // only try to get tags if library entry for molecule exists
  if (library[inputID]) {
    let taggedBoms = extractBoms(library[inputID], TAG);
    return taggedBoms;
  }
}

function extractBoms(inputGeometry, TAG) {
  if (inputGeometry.tags.includes(TAG)) {
    return inputGeometry.bom;
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

function extractTags(inputGeometry, TAG) {
  if (inputGeometry.tags.includes(TAG)) {
    return inputGeometry;
  } else if (
    inputGeometry.geometry.length > 1 &&
    inputGeometry.geometry[0].geometry != undefined
  ) {
    let geometryWithTags = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedGeometry = extractTags(subAssembly, TAG);
      if (extractedGeometry != false) {
        geometryWithTags.push(extractedGeometry);
      }
    });
    let thethingtoreturn = {
      geometry: geometryWithTags,
      tags: inputGeometry.tags,
    };
    return thethingtoreturn;
  } else {
    return false;
  }
}

function layout(targetID, inputID, TAG, spacing) {
  return started.then(() => {
    let taggedGeometry = extractTags(library[inputID], TAG);
    library[targetID] = actOnLeafs(taggedGeometry, (leaf) => {
      return {
        /** I'm assumming we are going to try to translate everything for the layout, I don't know how
         * to translate to a point without having a defined plane  */
        geometry: [leaf.geometry[0].clone().translate(-10, 0, 0)],
        tags: leaf.tags,
      };
    });
    /*library[targetID] = {
      geometry: taggedGeometry.geometry,
      tags: taggedGeometry.tags,
    };*/
    return true;
  });
}

function assembly(targetID, inputIDs) {
  return started.then(() => {
    const assembly = [];
    for (let i = 0; i < inputIDs.length; i++) {
      assembly.push(library[inputIDs[i]]);
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

function generateDisplayMesh(id) {
  return started.then(() => {
    //Flatten the assembly to remove heirarcy

    const flattened = flattenAssembly(library[id]);

    //Here we need to extrude anything which isn't already 3D
    var cleanedGeometry = [];
    flattened.forEach((pieceOfGeometry) => {
      if (pieceOfGeometry.mesh == undefined) {
        cleanedGeometry.push(pieceOfGeometry.clone().extrude(0.0001));
      } else {
        cleanedGeometry.push(pieceOfGeometry);
      }
    });

    let geometry = chainFuse(cleanedGeometry);
    console.log(geometry);

    //Try extruding if there is no 3d shape
    if (geometry.mesh == undefined) {
      const threeDShape = geometry.clone().extrude(0.0001);
      return {
        faces: threeDShape.mesh(),
        edges: threeDShape.meshEdges(),
      };
    } else {
      return {
        faces: geometry.mesh(),
        edges: geometry.meshEdges(),
      };
    }
  });
}

// comlink is great to expose your functions within the worker as a simple API
// to your app.
expose({
  createBlob,
  createMesh,
  circle,
  regularPolygon,
  rectangle,
  generateDisplayMesh,
  extrude,
  extractBom,
  move,
  rotate,
  cut,
  tag,
  layout,
  bom,
  extractTag,
  intersect,
  assembly,
  loftShapes,
});
