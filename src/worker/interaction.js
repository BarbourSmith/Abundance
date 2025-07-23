import * as util from "./util.js";
import shrinkWrap from "replicad-shrink-wrap";
import { Plane, Solid } from "replicad";

/**
 * All methods in this file take multiple geometries and combine them in some way.
 *
 * Most methods return a singular new geometry which is the intersection/difference/fusion etc
 * of the inputs. The one notable exception is `assembly`, which returns a grouping of multiple
 * geometries which can later be separated (eg: with tags, BOM, or cut layout)
 */

/**
 * Create and return a lofted shape which blends between multiple 2D profile sketches.
 */
function loftShapes(sketches) {
  let arrayOfSketchedGeometry = [];

  sketches.forEach((sketch) => {
    if (util.is3D(sketch)) {
      throw new Error("Parts to be lofted must be sketches");
    }
    let partToLoft = digFuse(sketch);
    let sketchedpart = partToLoft.sketchOnPlane(sketch.plane);
    if (!sketchedpart.sketches) {
      arrayOfSketchedGeometry.push(sketchedpart);
    } else {
      throw new Error("Sketches to be lofted can't have interior geometries");
    }
  });
  let startGeometry = arrayOfSketchedGeometry.shift();
  const newPlane = new Plane().pivot(0, "Y");

  return {
    geometry: [startGeometry.loftWith([...arrayOfSketchedGeometry])],
    tags: [],
    plane: newPlane,
    color: util.defaultColor,
    bom: [],
  };
}

/**
 * Performs a boolean difference operation between two geometries.
 * This function subtracts the second geometry (cutter) from the first geometry (target).
 */
function difference(target, cutter) {
  if (
    (util.is3D(target) && util.is3D(cutter)) ||
    (!util.is3D(target) && !util.is3D(cutter))
  ) {
    // Process each leaf of target independently
    return util.actOnLeafs(target, (leaf) => {
      // Start with a clone of the original geometry
      let resultGeometry = leaf.geometry[0].clone();

      // Apply cuts recursively from cutter, checking bounding boxes
      resultGeometry = recursiveCut(resultGeometry, cutter);

      return {
        geometry: [resultGeometry],
        tags: leaf.tags,
        color: leaf.color,
        plane: leaf.plane,
        bom: leaf.bom,
      };
    });
  } else {
    throw new Error("Both inputs must be either 3D or 2D");
  }
}

/**
 * Creates a shrink-wrapped boundary around multiple 2D sketches and stores it in the library.
 */
function shrinkWrapSketches(sketches) {
  let BOM = [];
  if (sketches.every((sketch) => !util.is3D(sketch))) {
    let inputsToFuse = [];
    sketches.forEach((sketch) => {
      let fusedInput = digFuse(sketch);
      inputsToFuse.push(fusedInput);
      if (fusedInput.innerShape.blueprints) {
        throw new Error("Sketches to be lofted can't have interior geometries");
      }
      BOM.push(fusedInput.bom);
    });
    let geometryToWrap = chainFuse(inputsToFuse);
    const newPlane = new Plane().pivot(0, "Y");
    return {
      geometry: [shrinkWrap(geometryToWrap, 50)],
      tags: [],
      color: util.defaultColor,
      plane: newPlane,
      bom: BOM,
    };
  } else {
    throw new Error("All inputs must be sketches");
  }
}

/**
 * Return the intersection between shape1 and shape2.
 */
function intersect(shape1, shape2) {
  return util.actOnLeafs(shape1, (leaf) => {
    const shapeToIntersectWith = digFuse(shape2);
    const newGeom = leaf.geometry[0].clone().intersect(shapeToIntersectWith);
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
 * Return the boolean union between all entries in shapes.
 */
function fusion(shapes) {
  let fusedGeometry = [];
  let bomAssembly = [];
  const all2D = shapes.every((shape) => !util.is3D(shape));
  const all3D = shapes.every((shape) => util.is3D(shape));
  if (!all2D && !all3D) {
    throw new Error(
      "Fusion must be composed from only sketches OR only solids"
    );
  }

  shapes.forEach((shape) => {
    fusedGeometry.push(digFuse(shape));
    if (shape.bom.length > 0) {
      bomAssembly.push(...shape.bom);
    }
  });
  const newPlane = new Plane().pivot(0, "Y");
  return {
    geometry: [chainFuse(fusedGeometry)],
    tags: [],
    bom: bomAssembly,
    plane: newPlane,
    color: util.defaultColor,
  };
}

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(geometries) {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    throw new Error("inputIDs must be a non-empty array");
  }

  let assembly = [];
  let bomAssembly = [];

  if (geometries.length > 1) {
    const all3D = geometries.every((geom) => util.is3D(geom));
    const all2D = geometries.every((geom) => !util.is3D(geom));

    if (all3D || all2D) {
      for (let i = 0; i < geometries.length; i++) {
        const geometry = geometries[i];
        assembly.push(cutAssembly(geometry, geometries.slice(i + 1)));
        if (geometry.bom.length > 0) {
          bomAssembly.push(...geometry.bom);
        }
      }
    } else {
      console.trace("assembly error. inputs: " + geometries);
      throw new Error(
        "Assemblies must be composed from only sketches OR only solids"
      );
    }
  } else {
    const geometry = geometries[0];
    assembly.push(geometry);
    if (geometry.bom.length > 0) {
      bomAssembly.push(...geometry.bom);
    }
  }

  const newPlane = new Plane().pivot(0, "Y");
  // TODO(tristan): color isn't defined at the top level here. is that a problem?
  return {
    geometry: assembly,
    plane: newPlane,
    tags: [],
    bom: bomAssembly,
  };
}

//// Helper Functions ////

/**
 * Performs a chain fusion operation on an array of geometries.
 * @param {Array} chain - Array of geometry objects to fuse together sequentially
 * @returns {Object} The resulting fused geometry
 * @throws {Error} Throws an error if the fusion operation fails
 */
function chainFuse(chain) {
  try {
    let fused = chain[0].clone();
    for (let i = 1; i < chain.length; i++) {
      fused = fused.fuse(chain[i]);
    }
    return fused;
  } catch (e) {
    console.log(e);
    throw new Error("Fusion failed", e);
  }
}

/**
 * Recursively digs through an assembly and fuses all leaf geometries into a single geometry.
 * @param {Object} assembly - The assembly or leaf geometry to process
 * @returns {Object} A single fused geometry combining all leaves in the assembly
 */
function digFuse(assembly) {
  var flattened = [];

  if (util.isAssembly(assembly)) {
    assembly.geometry.forEach((subAssembly) => {
      if (!util.isAssembly(subAssembly)) {
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

/**
 * Performs a boolean cut operation on an assembly or part with one or more cutting geometries.
 *
 * @param {Object} partToCut - The library object (part or assembly) that will be cut
 * @param {Object[]} cuttingParts - Array of geometries that will cut the part
 * @returns {Object} - A new object containing either a single cut part or an assembly of cut parts
 *
 * This function handles cutting operations on complex hierarchical structures:
 * - If partToCut is a simple part, it applies all cutting geometries to it sequentially
 * - If partToCut is an assembly, it recursively processes each leaf in the assembly tree
 * - Maintains the original hierarchy, tags, colors, and metadata
 * - Avoids unnecessary operations by checking bounding box intersections
 * - Preserves the original assembly structure while applying cuts
 */
function cutAssembly(partToCut, cuttingParts) {
  try {
    //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
    if (util.isAssembly(partToCut)) {
      let assemblyToCut = partToCut.geometry;
      let assemblyCut = [];
      assemblyToCut.forEach((part) => {
        // make new assembly from cut parts
        assemblyCut.push(cutAssembly(part, cuttingParts));
      });

      //returns new assembly that has been cut
      const newAssembly = {
        //TODO(tristan): Shouldn't we be copying color and plane here?
        geometry: assemblyCut,
        tags: partToCut.tags,
        bom: partToCut.bom,
      };
      return newAssembly;
    } else {
      // if part to cut is wire geometry, return it unchanged (wires should pass through assemblies)
      if (util.isWireGeometry(partToCut)) {
        return partToCut;
      }

      // if part to cut is a single part send to cutting function with cutting parts
      var partCutCopy = partToCut.geometry[0];
      cuttingParts.forEach((cuttingPart) => {
        // for each cutting part cut the part
        partCutCopy = recursiveCut(partCutCopy, cuttingPart);
      });
      /*   if the part is a compound return each solid as a new assembly */
      function getSolids(compound) {
        return Array.from(
          util.replicad.iterTopo(compound.wrapped, "solid"),
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
          return {
            geometry: newAssembly,
            tags: partToCut.tags,
            color: partToCut.color,
            bom: partToCut.bom,
            plane: partToCut.plane,
          };
        }
      }
      // return new cut part
      return {
        geometry: [partCutCopy],
        tags: partToCut.tags,
        color: partToCut.color,
        bom: partToCut.bom,
        plane: partToCut.plane,
      };
    }
  } catch (e) {
    console.log(e);
    throw new Error("Cut Assembly failed", e);
  }
}

/**
 * Recursively applies boolean cutting operations between geometries with optimization.
 *
 * @param {Object} partToCut - The geometry object to be cut
 * @param {Object} cuttingPart - The library object (may be assembly) used to cut the part
 * @returns {Object} - The resulting geometry after all applicable cuts have been performed
 *
 * This function:
 * - Recursively processes assemblies, applying cuts only when necessary
 * - Performs bounding box intersection checks to skip non-intersecting geometries
 * - Handles nested assemblies by traversing the entire tree of cutting geometries
 * - Optimizes performance by avoiding cuts with geometries that cannot intersect
 * - Preserves the structure of both the target and cutting geometries
 *
 * The function is a core part of the boolean difference system and is designed
 * to efficiently handle complex hierarchical structures.
 */
function recursiveCut(partToCut, cuttingPart) {
  try {
    let cutGeometry = partToCut;

    // Wire geometry should not participate in cutting operations
    if (util.isWireGeometry({ geometry: [partToCut] })) {
      return partToCut; // Wire parts should pass through unchanged
    }

    // if cutting part is an assembly pass back into the function to be cut by each part in that assembly
    if (util.isAssembly(cuttingPart)) {
      for (let i = 0; i < cuttingPart.geometry.length; i++) {
        // Skip cutting with wire geometry
        if (!util.isWireGeometry(cuttingPart.geometry[i])) {
          cutGeometry = recursiveCut(cutGeometry, cuttingPart.geometry[i]);
        }
      }
      return cutGeometry;
    } else {
      // Skip cutting if the cutting part is wire geometry
      if (util.isWireGeometry(cuttingPart)) {
        return partToCut;
      }

      //If the shapes don't overlap, we don't need to cut them
      if (partToCut.boundingBox.isOut(cuttingPart.geometry[0].boundingBox)) {
        return partToCut;
      }
      // cut and return part
      else {
        let cutPart;
        cutPart = partToCut.cut(cuttingPart.geometry[0]);
        return cutPart;
      }
    }
  } catch (e) {
    console.log(e);
    throw new Error("Recursive Cut failed", e);
  }
}

export {
  loftShapes,
  difference,
  shrinkWrapSketches,
  intersect,
  fusion,
  assembly,
  digFuse,
  cutAssembly,
};
