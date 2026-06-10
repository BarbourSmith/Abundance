import { BoundingBox, Drawing } from "replicad";
import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";
import { RequestContext } from "./geometryProvider";
import { extractKeepOut } from "./tags";
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
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  const loftArgsDeep = await Promise.all(
    sketches.map(async (geom, index) => {
      if (util.is3D(geom)) {
        throw new Error("Parts to be lofted must be sketches");
      }
      if (util.is2D(geom)) {
        // Drawing assemblies should be fused before lofting.
        const result = await fuseAssembly(geom, context);
        return {
          type: "sketch",
          geometry: result.geometry,
          plane: result.plane,
        };
      }
      // Wires and points
      if (util.isWireGeometry(geom) || util.isPoint3D(geom)) {
        return util.flattenAssembly(geom).map((leaf) => {
          return {
            type: util.isPoint3D(leaf) ? "point" : "wire",
            geometry: leaf.geometry,
            plane: leaf.plane,
          };
        });
      }
      throw new Error("Unsupported geometry type for lofting. input #" + index);
    }),
  );

  const sketchAndPlane = loftArgsDeep.flat();
  // Structural checks. Not all mixtures of inputs are allowed.
  if (
    sketchAndPlane.some((sp) => sp.type === "wire") &&
    sketchAndPlane.some((sp) => sp.type === "sketch")
  ) {
    throw new Error("Cannot loft a mixture of wires and sketches");
  }

  // Points act as breaks in the loft structure since replicad only supports
  // point as the start/end of a loft. We try to handle this invisibly for users.
  const loftSegments: {
    type: string;
    geometry: string;
    plane: util.SimplePlane;
  }[][] = [];
  loftSegments.push([sketchAndPlane[0]]);
  for (let i = 1; i < sketchAndPlane.length; i++) {
    loftSegments[loftSegments.length - 1].push(sketchAndPlane[i]);
    if (sketchAndPlane[i].type === "point" && i != sketchAndPlane.length - 1) {
      // A point not at the start or end of the loft arg list.
      loftSegments.push([sketchAndPlane[i]]);
    }
  }

  const results = [];
  for (const segment of loftSegments) {
    // Structure check
    if (segment.every((g) => g.type === "point")) {
      throw new Error(
        "Loft cannot have consecutive points with no sketches/wires in between",
      );
    }

    const startPoint = segment[0].type == "point" ? segment[0] : undefined;
    const endpoint =
      segment[segment.length - 1].type == "point"
        ? segment[segment.length - 1]
        : undefined;
    const targets = segment.filter((g) => g.type !== "point");
    let geometry;
    if (targets[0].type === "wire") {
      geometry = await util.geometryProvider!.loftWires(
        targets.map((t) => t.geometry),
        startPoint ? startPoint.geometry : undefined,
        endpoint ? endpoint.geometry : undefined,
        context,
      );
    } else {
      geometry = await util.geometryProvider!.loftSketches(
        targets.map((t) => t.geometry),
        targets.map((t) => t.plane),
        startPoint ? startPoint.geometry : undefined,
        endpoint ? endpoint.geometry : undefined,
        context,
      );
    }
    results.push({
      geometry: geometry,
      dimension: "3D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    });
  }
  if (results.length === 1) {
    return results[0] as AbundanceObject;
  }
  return assembly(results as AbundanceObject[], context);
}

/**
 * Performs a boolean difference operation between two geometries.
 * This function subtracts the second geometry (cutter) from the first geometry (target).
 */
async function difference(
  target: AbundanceObject,
  cutter: AbundanceObject,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  if (util.isWireGeometry(target) || util.isPoint3D(target)) {
    throw new Error(
      "difference() target must be a 3D solid or 2D sketch, not Wire or Point3D.",
    );
  }
  if (util.isWireGeometry(cutter) || util.isPoint3D(cutter)) {
    throw new Error(
      "difference() cutter must be a 3D solid or 2D sketch, not Wire or Point3D.",
    );
  }

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
  context: RequestContext,
): Promise<AbundanceLeaf> {
  await util.init();
  const BOM: any[] = [];
  if (
    sketches.some(
      (sketch) => util.isWireGeometry(sketch) || util.isPoint3D(sketch),
    )
  ) {
    throw new Error(
      "Parts to be shrink wrapped must be 2D sketches, not Wire or Point3D.",
    );
  }
  if (sketches.some((sketch) => util.is3D(sketch))) {
    throw new Error("Parts to be shrink wrapped must be sketches");
  }

  if (sketches.length == 0) {
    throw new Error("No sketches provided for shrink wrap");
  }

  const geometryToWrap = await fuseAssembly(sketches[0], context);
  for (let i = 1; i < sketches.length; i++) {
    const fusedInput = await fuseAssembly(sketches[i], context);
    const fusedObj = (await util.geometryProvider!.get(
      fusedInput.geometry,
      context,
    )) as Drawing;
    //@ts-expect-error - ignore access of private innerShape field
    if (fusedObj.innerShape && fusedObj.innerShape.blueprints) {
      throw new Error(
        "Sketches to be shrink wrapped can't have interior geometries",
      );
    }
    BOM.push(fusedInput.bom);
    geometryToWrap.geometry = await util.geometryProvider!.fuse(
      geometryToWrap.geometry,
      fusedInput.geometry,
      context,
    );
  }
  return {
    geometry: await util.geometryProvider!.shrinkWrapSketches(
      geometryToWrap.geometry,
      50,
      context,
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
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  if (
    util.isWireGeometry(shape1) ||
    util.isPoint3D(shape1) ||
    util.isWireGeometry(shape2) ||
    util.isPoint3D(shape2)
  ) {
    throw new Error(
      "intersect() requires 3D solids or 2D sketches, not Wire or Point3D.",
    );
  }

  return util.actOnLeafs(shape1, async (leaf: AbundanceLeaf) => {
    const shapeToIntersectWith = await fuseAssembly(shape2, context);
    const resultGeom = await util.geometryProvider!.intersect(
      leaf.geometry,
      shapeToIntersectWith.geometry,
      context,
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
  context: RequestContext,
): Promise<AbundanceLeaf> {
  await util.init();

  // Filter out keepout geometries from all shapes
  const filteredShapes = shapes
    .map((shape) => extractKeepOut(shape))
    .filter((shape) => shape !== false) as AbundanceObject[];

  if (filteredShapes.length === 0) {
    throw new Error("All input shapes to fusion are keepout geometry");
  }

  for (const shape of filteredShapes) {
    if (util.isWireGeometry(shape) || util.isPoint3D(shape)) {
      throw new Error(
        "fusion() requires 3D solids or 2D sketches, not Wire or Point3D.",
      );
    }
  }
  const all2D = filteredShapes.every((shape) => !util.is3D(shape));
  const all3D = filteredShapes.every((shape) => util.is3D(shape));
  if (!all2D && !all3D) {
    throw new Error(
      "Fusion must be composed from only sketches OR only solids",
    );
  }

  if (filteredShapes.length === 0) {
    throw new Error("No shapes provided for fusion");
  }
  const fuseAssemblyd = await fuseAssembly(filteredShapes[0], context);
  let fusedGeometry = fuseAssemblyd.geometry;
  const bomAssembly = filteredShapes[0].bom
    ? filteredShapes[0].bom.slice()
    : [];
  for (let i = 1; i < filteredShapes.length; i++) {
    fusedGeometry = await util.geometryProvider!.fuse(
      fusedGeometry,
      (await fuseAssembly(filteredShapes[i], context)).geometry,
      context,
    );
    bomAssembly.push(...(filteredShapes[i].bom || []));
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

/**
 * A function which takes in an array of target geometries and forms them into an assembly
 * Geometries will cut all geometries below them in the list to make sure that no parts intersect
 * If the targetID is defined, the assembly will be stored in the library under that ID, otherwise it will be returned
 */
async function assembly(
  geometries: AbundanceObject[],
  context: RequestContext,
): Promise<AbundanceObject> {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    throw new Error("inputIDs must be a non-empty array");
  }

  // Assembly of a singleton is a no-op. Return the leaf as the result.
  if (geometries.length == 1) {
    return geometries[0];
  }

  // Dimension assertions:
  // Allowed inputs -> all 2d, all 3d, or just wires/points
  const all3D = geometries.every((geom) => util.is3D(geom));
  const all2D = geometries.every((geom) => util.is2D(geom));
  const allWireOrPoint = geometries.every(
    (geom) => util.isWireGeometry(geom) || util.isPoint3D(geom),
  );
  if (!(all2D || all3D || allWireOrPoint)) {
    throw new Error(
      "Input geometries must be all 2D, all 3D, or just wires/points.",
    );
  }
  // Fast return if all points or wires.
  if (allWireOrPoint) {
    return util.assemblyOf(geometries);
  }
  if (!(all2D || all3D)) {
    throw new Error(
      "Input geometries must be all 2D or all 3D (unless they are wires/points).",
    );
  }

  await util.init();

  // Pre-emptively compute bounding boxes for all input geometries.
  geometries = await Promise.all(
    geometries.map((geometry) =>
      util.withAssemblyBoundingBoxes(geometry, context),
    ),
  );
  const insideOtherBatch = !!context.operationId;
  if (!insideOtherBatch) {
    const batchId = "assembly-" + util.hashString(JSON.stringify(geometries));
    const batch: RequestContext | AbundanceObject =
      await util.geometryProvider!.startBatchOperation(context, batchId);

    // Full assembly cache hit. No work to do, but update nonReplicadSerialized if needed.
    if (util.isAbundanceObject(batch)) {
      const batchWithBounds = batch.boundingBox
        ? batch
        : await util.withAssemblyBoundingBoxes(batch, context);
      // Gather all nonReplicadSerialized and bom from input geometries
      const nonReplicadGeoms: any[] = [];
      const bomAssembly: any[] = [];
      for (const geometry of geometries) {
        if (
          Array.isArray(geometry.nonReplicadSerialized) &&
          geometry.nonReplicadSerialized.length > 0
        ) {
          nonReplicadGeoms.push(...geometry.nonReplicadSerialized);
        }
        if (Array.isArray(geometry.bom) && geometry.bom.length > 0) {
          bomAssembly.push(...geometry.bom);
        }
      }
      // Always update to reflect current state, even if empty
      batchWithBounds.nonReplicadSerialized = nonReplicadGeoms;
      batchWithBounds.bom = bomAssembly;
      return batchWithBounds;
    }

    // cache miss on the batch operation.
    context = batch;
  }

  // The general case of a cache miss assembly operation.
  const assembly: AbundanceObject[] = [];

  // Each geometry is cut by all following geometries.
  // TODO: test if this is faster working back-to-front or front-to-back.
  for (let i = 0; i < geometries.length - 1; i++) {
    const geometry = geometries[i];
    assembly.push(
      await cutAssembly(geometry, geometries.slice(i + 1), context),
    );
  }
  assembly.push(geometries[geometries.length - 1]); // Final entry is always unmodified.

  // Build the initial assembly object with all children already having bounds
  const assemblyObject: AbundanceObject = util.assemblyOf(
    await Promise.all(assembly),
  );

  // Safety check with recursive validation disabled (forceRecompute=false)
  // Since we've already computed bounds eagerly, this will detect our computed bounds
  // and return immediately without recursive traversal
  const result = await util.withAssemblyBoundingBoxes(
    assemblyObject,
    context,
    false, // forceRecompute=false, so it skips unnecessary recursion
  );
  if (!insideOtherBatch) {
    console.trace("Ending batch operation with id " + context.operationId);
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
  context: RequestContext,
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
 * This function assumes that partToCut an cuttingParts are of the same dimensionality,
 * either all 2D or all 3D.
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
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();

  //If the partToCut is an assembly pass each part back into cutAssembly function to be cut separately
  if (util.isAssembly(partToCut)) {
    const partsAfterCut: AbundanceObject[] = [];
    for (const part of partToCut.geometry) {
      // make new assembly from cut parts
      partsAfterCut.push(await cutAssembly(part, cuttingParts, context));
    }

    const newAssembly = util.computeAssemblyBounds({
      ...partToCut, // Retain metadata from original assembly top-level branch.
      geometry: partsAfterCut,
    });
    return newAssembly;
  } else {
    // Part to cut is a single leaf.
    let partCutCopy = partToCut;
    for (const cuttingPart of cuttingParts) {
      // Check if bounding boxes overlap before attempting cut
      // If they don't overlap, skip the cut operation entirely
      if (util.boundsOverlap(partToCut.boundingBox, cuttingPart.boundingBox)) {
        // for each cutting part cut the part
        partCutCopy = await recursiveCut(partCutCopy, cuttingPart, context);
      } else {
        // Bounding boxes don't overlap - skipping cut operation
        console.log(
          "⏭️ Skipping cut operation (non-overlapping bounding boxes)",
        );
      }
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
  context: RequestContext,
): Promise<AbundanceLeaf> {
  let resultGeomId: string = partToCut.geometry;

  // TODO: traversing leafs in this way isn't optimal for bounding box
  // checks since we could find an entire branch of the assembly which doesn't
  // intersect bounding box. This is simpler implemenation but may someday warrant
  // a change.
  for (const cuttingPart of util.flattenAssembly(cuttingParts)) {
    // --- Coplanarity check for 2D shapes ---
    if (
      partToCut.dimension === "2D" &&
      cuttingPart.dimension === "2D" &&
      partToCut.plane &&
      cuttingPart.plane
    ) {
      // Compare normals (should be parallel) and origins (should be on the same plane)=
      if (!util.coPlanar(partToCut.plane, cuttingPart.plane)) {
        continue; // skip: not coplanar
      }
    }

    // Bounding box check.
    if (!util.boundsOverlap(partToCut.boundingBox, cuttingPart.boundingBox)) {
      continue; // skip: bounding boxes don't overlap
    }

    resultGeomId = await util.geometryProvider!.cut(
      resultGeomId,
      cuttingPart.geometry,
      context,
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
  context: RequestContext,
): Promise<AbundanceObject> {
  const subPartIds = await util.geometryProvider!.expandCompoundShape(
    part.geometry,
    context,
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
