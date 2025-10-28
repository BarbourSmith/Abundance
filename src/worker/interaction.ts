import { Drawing, Wire } from "replicad";
import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";
import { RequestContext, ReplicadObject } from "./geometryProvider";
import { json } from "react-router-dom";
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
  sketches: AbundanceObject[],
  context: RequestContext
): Promise<AbundanceObject> {
  await util.init();
  let sketchAndPlane = await Promise.all(
    sketches.map(async (sketch) => {
      if (util.is3D(sketch)) {
        throw new Error("Parts to be lofted must be sketches");
      }
      const result = await fuseAssembly(sketch, context);
      return {
        geometry: result.geometry,
        plane: result.plane,
      };
    })
  );

  const sketchList = sketchAndPlane.map((sp) => sp.geometry);
  const planes = sketchAndPlane.map((sp) => sp.plane);

  return {
    geometry: await util.geometryProvider!.loftSketches(
      sketchList,
      planes,
      context
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
  cutter: AbundanceObject,
  context: RequestContext
): Promise<AbundanceObject> {
  await util.init();
  if (
    (util.is3D(target) && util.is3D(cutter)) ||
    (!util.is3D(target) && !util.is3D(cutter))
  ) {
    // Process each leaf of target independently
    return util.actOnLeafs(target, async (leaf: AbundanceLeaf) => {
      return await recursiveCut(leaf, cutter, context);
    });
  } else {
    throw new Error("Both inputs must be either 3D or 2D");
  }
}

/**
 * Creates a shrink-wrapped boundary around multiple 2D sketches and stores it in the library.
 */
async function shrinkWrapSketches(
  sketches: AbundanceObject[],
  context: RequestContext
): Promise<AbundanceLeaf> {
  await util.init();
  let BOM: any[] = [];
  if (sketches.some((sketch) => util.is3D(sketch))) {
    throw new Error("Parts to be shrink wrapped must be sketches");
  }

  if (sketches.length == 0) {
    throw new Error("No sketches provided for shrink wrap");
  }

  let geometryToWrap = await fuseAssembly(sketches[0], context);
  for (let i = 1; i < sketches.length; i++) {
    let fusedInput = await fuseAssembly(sketches[i], context);
    let fusedObj = (await util.geometryProvider!.get(
      fusedInput.geometry,
      context
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
      fusedInput.geometry,
      context
    );
  }
  return {
    geometry: await util.geometryProvider!.shrinkWrapSketches(
      geometryToWrap.geometry,
      50,
      context
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
  shape2: AbundanceObject,
  context: RequestContext
): Promise<AbundanceObject> {
  await util.init();
  return util.actOnLeafs(shape1, async (leaf: AbundanceLeaf) => {
    const shapeToIntersectWith = await fuseAssembly(shape2, context);
    const resultGeom = await util.geometryProvider!.intersect(
      leaf.geometry,
      shapeToIntersectWith.geometry,
      context
    );
    if (resultGeom === undefined) {
      return undefined;
    }
    return {
      geometry: resultGeom,
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
async function fusion(
  shapes: AbundanceObject[],
  context: RequestContext
): Promise<AbundanceLeaf> {
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
  const fuseAssemblyd = await fuseAssembly(shapes[0], context);
  let fusedGeometry = fuseAssemblyd.geometry;
  let bomAssembly = shapes[0].bom ? shapes[0].bom.slice() : [];
  for (let i = 1; i < shapes.length; i++) {
    fusedGeometry = await util.geometryProvider!.fuse(
      fusedGeometry,
      (
        await fuseAssembly(shapes[i], context)
      ).geometry,
      context
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
    dimension: fuseAssemblyd.dimension,
  };
}

/*

where n is number of leafs and a is number of assemblies

Current control flow:
For each assembly do cutAssembly with all subsequent geometries

cutAssembly:
if an assembly recurse down to each part
if a leaf:
for each leaf in each input assembly - cut this leaf with that one


Runtime:
* O(n^2) for number of leafs


behavior constraints - we need to to retain assembly structures

Options:
deserialize all then do same as we've done here
fuse each assembly then cut parts with fused others
  O(a) fuses
  O(n) cuts


deserialization options:
1) deserialize into an (eg) realized assembly
2) create a higher level cache which writes results into our main cache but doesn't
   need deserialization


*/

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(
  geometries: AbundanceObject[],
  context: RequestContext
): Promise<AbundanceObject> {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    throw new Error("inputIDs must be a non-empty array");
  }
  await util.init();

  let startedBatch = false;
  if (!context.operationId) {
    const batchId = "assembly-" + util.hashString(JSON.stringify(geometries));
    const batch: RequestContext | AbundanceObject =
      await util.geometryProvider!.startBatchOperation(context, batchId);

    // Full assembly cache hit. No work to do.
    if (util.isAbundanceObject(batch)) {
      return batch;
    }

    context = batch;
    startedBatch = true;
  }

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
        assembly.push(
          await cutAssembly(geometry, geometries.slice(i + 1), context)
        );
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
  const result = {
    geometry: await Promise.all(assembly),
    plane: util.XYPlane,
    tags: [],
    color: util.defaultColor,
    bom: bomAssembly,
    dimension: all3D ? "3D" : "2D",
  };
  if (startedBatch) {
    await util.geometryProvider!.endBatchOperation(context, result);
  }

  return result;
}

//// Helper Functions ////

/**
 * Recursively digs through an assembly and fuses all leaf geometries into a single geometry.
 * @param {Object} assembly - The assembly or leaf geometry to process
 * @returns {Object} A single fused geometry combining all leaves in the assembly
 */
/**
 * Recursively digs through an assembly and fuses all leaf geometries into a single geometry.
 * @param {Object} assembly - The assembly or leaf geometry to process
 * @returns {Object} A single fused geometry combining all leaves in the assembly
 */
async function fuseAssembly(
  assembly: AbundanceObject,
  context: RequestContext
): Promise<AbundanceLeaf> {
  await util.init();
  const flattened = util.flattenAssembly(assembly);
  if (flattened.length === 0) {
    throw new Error("No geometries found in assembly");
  }
  // TODO: should be union of tags and bom?
  return {
    ...assembly,
    geometry: await util.geometryProvider!.assemblyFuse(assembly, context),
    dimension: flattened[0].dimension,
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
  cuttingParts: AbundanceObject[],
  context: RequestContext
): Promise<AbundanceObject> {
  await util.init();

  //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
  if (util.isAssembly(partToCut)) {
    let assemblyToCut = partToCut.geometry;
    let assemblyCut: any[] = [];
    for (const part of assemblyToCut) {
      // make new assembly from cut parts
      assemblyCut.push(await cutAssembly(part, cuttingParts, context));
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
      partCutCopy = await recursiveCut(partCutCopy, cuttingPart, context);
    }
    // return new cut part, expand compound solid if it was cut into disconnected
    // parts
    return splitCompSolid(partCutCopy, context);
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
  cuttingParts: AbundanceObject,
  context: RequestContext
): Promise<AbundanceLeaf> {
  if (util.isWireGeometry(partToCut)) {
    return partToCut;
  }

  let resultGeomId: string = partToCut.geometry;
  for (const cuttingPart of util.flattenAssembly(cuttingParts)) {
    let toCutGeom = await util.geometryProvider!.get(resultGeomId, context);
    if (partToCut.dimension != cuttingPart.dimension) {
      continue;
      // skip this leaf. can't cut 2D with 3D or vice versa
    }
    const cuttingPartGeom = await util.geometryProvider!.get(
      cuttingPart.geometry,
      context
    );
    // @ts-ignore
    if (toCutGeom.boundingBox.isOut(cuttingPartGeom.boundingBox)) {
      continue;
      // skip this leaf. bounding boxes don't intersect
    }

    resultGeomId = await util.geometryProvider!.cut(
      resultGeomId,
      cuttingPart.geometry,
      context
    );
  }
  const result = {
    ...partToCut,
    geometry: resultGeomId,
  };
  return result;
}

async function splitCompSolid(
  part: AbundanceLeaf,
  context: RequestContext
): Promise<AbundanceObject> {
  const subPartIds = await util.geometryProvider!.expandCompoundShape(
    part.geometry,
    context
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
  fuseAssembly,
  fusion,
  intersect,
  loftShapes,
  shrinkWrapSketches,
};
