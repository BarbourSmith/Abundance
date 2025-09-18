import { Drawing } from "replicad";
import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";

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
async function loftShapes(
  sketches: AbundanceObject[]
): Promise<AbundanceObject> {
  await util.init();
  let arrayOfSketchedGeometry = await Promise.all(
    sketches.map(async (sketch) => {
      if (util.is3D(sketch)) {
        throw new Error("Parts to be lofted must be sketches");
      }
      let partToLoft = await digFuse(sketch);
      let partObj = (await util.geometryProvider!.get(
        partToLoft.geometry
      )) as Drawing;
      let sketchedpart = partObj.sketchOnPlane(
        util.asReplicadPlane(sketch.plane)
      );
      if (!("sketches" in sketchedpart)) {
        return sketchedpart;
      } else {
        throw new Error("Sketches to be lofted can't have interior geometries");
      }
    })
  );
  let startGeometry = arrayOfSketchedGeometry.shift();
  if (startGeometry === undefined) {
    throw new Error("No sketches provided for loft");
  }

  return {
    geometry: await util.geometryProvider!.addSingularToCache(
      startGeometry.loftWith([...arrayOfSketchedGeometry], {})
    ),
    dimension: "3D",
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
  };
}

/**
 * Performs a boolean difference operation between two geometries.
 * This function subtracts the second geometry (cutter) from the first geometry (target).
 */
async function difference(
  target: AbundanceObject,
  cutter: AbundanceObject
): Promise<AbundanceObject> {
  await util.init();
  if (
    (util.is3D(target) && util.is3D(cutter)) ||
    (!util.is3D(target) && !util.is3D(cutter))
  ) {
    // Process each leaf of target independently
    return util.actOnLeafs(target, async (leaf: AbundanceLeaf) => {
      return await recursiveCut(leaf, cutter);
    });
  } else {
    throw new Error("Both inputs must be either 3D or 2D");
  }
}

/**
 * Creates a shrink-wrapped boundary around multiple 2D sketches and stores it in the library.
 */
async function shrinkWrapSketches(
  sketches: AbundanceObject[]
): Promise<AbundanceLeaf> {
  await util.init();
  let BOM: any[] = [];
  if (sketches.some((sketch) => util.is3D(sketch))) {
    throw new Error("Parts to be shrink wrapped must be sketches");
  }

  if (sketches.length == 0) {
    throw new Error("No sketches provided for shrink wrap");
  }

  let geometryToWrap = await digFuse(sketches[0]);
  for (let i = 1; i < sketches.length; i++) {
    let fusedInput = await digFuse(sketches[i]);
    let fusedObj = (await util.geometryProvider!.get(
      fusedInput.geometry
    )) as Drawing;
    //@ts-ignore - ignore access of private innerShape field
    if (fusedObj.innerShape && fusedObj.innerShape.blueprints) {
      throw new Error(
        "Sketches to be shrink wrapped can't have interior geometries"
      );
    }
    BOM.push(fusedInput.bom);
    geometryToWrap.geometry = await util.geometryProvider!.fuse(
      geometryToWrap.geometry,
      fusedInput.geometry
    );
  }
  return {
    geometry: await util.geometryProvider!.shrinkWrapSketches(
      geometryToWrap.geometry,
      50
    ),
    dimension: "2D",
    tags: [],
    color: util.defaultColor,
    plane: util.XYPlane,
    bom: BOM,
  };
}

/**
 * Return the intersection between shape1 and shape2.
 */
async function intersect(
  shape1: AbundanceObject,
  shape2: AbundanceObject
): Promise<AbundanceObject> {
  await util.init();
  return util.actOnLeafs(shape1, async (leaf: AbundanceLeaf) => {
    const shapeToIntersectWith = await digFuse(shape2);
    return {
      geometry: await util.geometryProvider!.intersect(
        leaf.geometry,
        shapeToIntersectWith.geometry
      ),
      tags: leaf.tags,
      color: leaf.color,
      plane: leaf.plane,
      bom: leaf.bom,
      dimension: leaf.dimension,
    };
  });
}

/**
 * Return the boolean union between all entries in shapes.
 */
async function fusion(shapes: AbundanceObject[]): Promise<AbundanceLeaf> {
  await util.init();
  const all2D = shapes.every((shape) => !util.is3D(shape));
  const all3D = shapes.every((shape) => util.is3D(shape));
  if (!all2D && !all3D) {
    throw new Error(
      "Fusion must be composed from only sketches OR only solids"
    );
  }

  if (shapes.length === 0) {
    throw new Error("No shapes provided for fusion");
  }
  const digFused = await digFuse(shapes[0]);
  let fusedGeometry = digFused.geometry;
  let bomAssembly = shapes[0].bom ? shapes[0].bom.slice() : [];
  for (let i = 1; i < shapes.length; i++) {
    fusedGeometry = await util.geometryProvider!.fuse(
      fusedGeometry,
      (
        await digFuse(shapes[i])
      ).geometry
    );
    bomAssembly.push(...(shapes[i].bom || []));
  }
  return {
    // TODO: requires a real fix.
    geometry: fusedGeometry,
    tags: [],
    bom: bomAssembly,
    plane: util.XYPlane,
    color: util.defaultColor,
    dimension: digFused.dimension,
  };
}

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(
  geometries: AbundanceObject[]
): Promise<AbundanceObject> {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    throw new Error("inputIDs must be a non-empty array");
  }
  await util.init();

  let assembly: AbundanceObject[] = [];
  let bomAssembly: any[] = [];

  let all3D = false;
  let all2D = false;
  if (geometries.length > 1) {
    all3D = geometries.every((geom) => util.is3D(geom));
    all2D = geometries.every((geom) => !util.is3D(geom));

    if (all3D || all2D) {
      for (let i = 0; i < geometries.length; i++) {
        const geometry = geometries[i];
        assembly.push(await cutAssembly(geometry, geometries.slice(i + 1)));
        if (geometry.bom && geometry.bom.length > 0) {
          bomAssembly.push(...geometry.bom);
        }
      }
    } else {
      throw new Error(
        "Assemblies must be composed from only sketches OR only solids"
      );
    }
  } else {
    const geometry = geometries[0];
    assembly.push(geometry);
    if (geometry.bom) {
      bomAssembly.push(...geometry.bom);
    }
  }

  return {
    geometry: assembly,
    plane: util.XYPlane,
    tags: [],
    color: util.defaultColor,
    bom: bomAssembly,
    dimension: all3D ? "3D" : "2D",
  };
}

//// Helper Functions ////

/**
 * Recursively digs through an assembly and fuses all leaf geometries into a single geometry.
 * @param {Object} assembly - The assembly or leaf geometry to process
 * @returns {Object} A single fused geometry combining all leaves in the assembly
 */
async function digFuse(assembly: AbundanceObject): Promise<AbundanceLeaf> {
  await util.init();
  var flattened = util.flattenAssembly(assembly);
  if (flattened.length === 0) {
    throw new Error("No geometries found to fuse");
  }
  let result = flattened[0].geometry;
  for (let i = 1; i < flattened.length; i++) {
    result = await util.geometryProvider!.fuse(result, flattened[i].geometry);
  }
  // TODO(tristan): should this be the union of all tags on all leafs?
  return {
    geometry: result,
    dimension: flattened[0].dimension,
    tags: assembly.tags,
    plane: assembly.plane,
    color: assembly.color,
    bom: assembly.bom,
  };
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
async function cutAssembly(
  partToCut: AbundanceObject,
  cuttingParts: AbundanceObject[]
): Promise<AbundanceObject> {
  await util.init();
  try {
    //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
    if (util.isAssembly(partToCut)) {
      let assemblyToCut = partToCut.geometry;
      let assemblyCut: any[] = [];
      for (const part of assemblyToCut) {
        // make new assembly from cut parts
        assemblyCut.push(await cutAssembly(part, cuttingParts));
      }

      //returns new assembly that has been cut
      const newAssembly = {
        geometry: assemblyCut,
        tags: partToCut.tags,
        bom: partToCut.bom,
        plane: partToCut.plane,
        color: partToCut.color,
      };
      return newAssembly;
    } else {
      // if part to cut is wire geometry, return it unchanged (wires should pass through assemblies)
      if (util.isWireGeometry(partToCut)) {
        return partToCut;
      }

      // if part to cut is a single part send to cutting function with cutting parts
      let partCutCopy = partToCut;
      for (const cuttingPart of cuttingParts) {
        // for each cutting part cut the part
        partCutCopy = await recursiveCut(partCutCopy, cuttingPart);
      }
      // return new cut part, expand compound solid if it was cut into disconnected
      // parts
      return splitCompSolid(partCutCopy);
    }
  } catch (e: any) {
    console.log(e);
    console.log(e.trace);
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
async function recursiveCut(
  partToCut: AbundanceLeaf,
  cuttingParts: AbundanceObject
): Promise<AbundanceLeaf> {
  if (util.isWireGeometry(partToCut)) {
    return partToCut;
  }

  let resultGeomId: string = partToCut.geometry;
  for (const cuttingPart of util.flattenAssembly(cuttingParts)) {
    let toCutGeom = await util.geometryProvider!.get(resultGeomId);
    if (partToCut.dimension != cuttingPart.dimension) {
      continue;
      // skip this leaf. can't cut 2D with 3D or vice versa
    }
    const cuttingPartGeom = await util.geometryProvider!.get(
      cuttingPart.geometry
    );
    // @ts-ignore
    if (toCutGeom.boundingBox.isOut(cuttingPartGeom.boundingBox)) {
      continue;
      // skip this leaf. bounding boxes don't intersect
    }

    resultGeomId = await util.geometryProvider!.cut(
      resultGeomId,
      cuttingPart.geometry
    );
  }
  const result = {
    ...partToCut,
    geometry: resultGeomId,
  };
  return result;
}

async function splitCompSolid(part: AbundanceLeaf): Promise<AbundanceObject> {
  const subPartIds = await util.geometryProvider!.expandCompoundShape(
    part.geometry
  );
  if (subPartIds.length <= 1) {
    return part;
  }

  const resultGeoms = [];
  for (const id of subPartIds) {
    resultGeoms.push({
      geometry: id,
      tags: part.tags,
      color: part.color,
      bom: part.bom,
      plane: part.plane,
      dimension: part.dimension,
    });
  }
  return {
    geometry: resultGeoms,
    tags: part.tags,
    color: part.color,
    bom: part.bom,
    plane: part.plane,
  };
}

export {
  assembly,
  cutAssembly,
  difference,
  digFuse,
  fusion,
  intersect,
  loftShapes,
  shrinkWrapSketches,
};
