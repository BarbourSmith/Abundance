import { PolygonPacker, PlacementWrapper } from "polygon-packer";
import { Plane, Solid, Wire } from "replicad";
import * as util from "./util.js";
import { proxy } from "comlink"; // TODO: this should ideally be moved to worker somehow

function layout(
  assembly,
  progressCallback,
  warningCallback,
  placementsCallback,
  layoutConfig,
  previousPlacements = null
) {
  var [rotatedAssembly, shapesForLayout] = rotateForLayout(
    assembly,
    layoutConfig,
    warningCallback
  );

  let positionsPromise = computePositions(
    shapesForLayout,
    progressCallback,
    placementsCallback,
    layoutConfig,
    previousPlacements
  );
  return positionsPromise.then((positions) => {
    //This does the actual layout of the parts.
    const layedOutAssembly = applyLayout(
      rotatedAssembly,
      positions,
      layoutConfig
    );

    if (positions.length == 0) {
      // This should not happen anymore since we provide default placements,
      // but keep this as a safety check
      console.warn("Unexpected: received empty positions array");
      return [rotatedAssembly, []];
    } else {
      let unplacedParts = shapesForLayout.length - positions.flat().length;
      if (unplacedParts > 0) {
        const warning =
          unplacedParts +
          " parts are too big to fit on this sheet size. Failed layout for " +
          unplacedParts +
          " part(s)";
        warningCallback(warning);
      }
    }

    return [layedOutAssembly, positions];
  });
}

/**
 * Lay the input geometry flat and apply the transformations to display it
 */
function displayLayout(assembly, positions, warningCallback, layoutConfig) {
  const [rotatedAssembly, shapesForLayout] = rotateForLayout(
    assembly,
    layoutConfig,
    warningCallback
  );

  return applyLayout(rotatedAssembly, positions, layoutConfig);
}

/**
 * Rotates and moves all leafs into an orientation which can be fed into
 * the nesting algorithm.
 *
 * Specific criteria of this pre-layout step are as follows:
 * 1) rotate the part such that the best possible face is aligned with the XY plane.
 *    Criteria for the best face are as follows (in order):
 *    a) face must be flat (eg: not the edge of a cylinder)
 *    b) face must have no protrusions below the XY plane
 *    c) face must be within the (inferred) thickness of the material
 *    d) face should have minimal number of interior voids and have the largest bounding box
 */
function rotateForLayout(assembly, layoutConfig, warningCallback) {
  var THICKNESS_TOLLERANCE = 0.001;

  function equalThickness(a, b) {
    return Math.abs(a - b) < THICKNESS_TOLLERANCE;
  }

  // Get geometry and remove any empty leafs.
  let geometryToLayout = util.actOnLeafs(assembly, (leaf) => {
    if (leaf.geometry.length > 0 && leaf.geometry[0].faces.length > 0) {
      return leaf;
    } else {
      return undefined;
    }
  });

  let localId = 0;
  let shapesForLayout = [];

  // Algo overview:
  // collect all prospective orientations for all parts
  // come up with a best-guess material thickness or n/a
  // select among candidates for each part based on either good fit to the
  //    estimated material thickness, or just take thinnest orientation.

  // get candidates as {leaf_id: "abc", [candidate 1, candidate 2 etc]}
  const all_candidates = {};
  const intermediate = util.actOnLeafs(geometryToLayout, (leaf) => {
    // For each face, consider it as the underside of the shape on the CNC bed.
    // In order to be considered, a face must be...
    //  1) a flat PLANE, not a cylinder, or sphere or other curved face type.
    //  2) there must be no parts of the shape which protrude "below" this face
    const candidates = [];
    let faceIndex = 0;
    leaf.geometry[0].faces.forEach((face) => {
      let prospectiveGoem = moveFaceToCuttingPlane(leaf.geometry[0], face);
      let offset = 0;
      if (
        prospectiveGoem.boundingBox.bounds[0][2] <
        -1 * THICKNESS_TOLLERANCE
      ) {
        // this face causes protrusions below the XY plane, move the prospective geometry so that
        // all points are above the XY plane. Record this movement, since it's a red flag for
        // this candidate.
        offset = -1 * prospectiveGoem.boundingBox.bounds[0][2];
        prospectiveGoem = prospectiveGoem.translate(0, 0, offset);
      }
      candidates.push({
        face: face,
        offset: offset,
        geom: prospectiveGoem,
        faceIndex: faceIndex,
        thickness: prospectiveGoem.boundingBox.depth,
      });
      faceIndex++;
    });

    all_candidates[localId] = candidates;
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
    const LARGEST_PLAUSIBLE_STOCK = layoutConfig.units == "MM" ? 25.4 : 1;
    const min_thickness_per_part = Object.values(all_candidates).map((s) =>
      Math.min(...s.map((c) => c.thickness))
    );
    if (
      Math.max(...min_thickness_per_part) <=
      LARGEST_PLAUSIBLE_STOCK + THICKNESS_TOLLERANCE
    ) {
      material_thickness = Math.max(...min_thickness_per_part);
    }
  }

  const layoutWarnList = [];

  const rotatedAssembly = util.actOnLeafs(intermediate, (leaf) => {
    let candidates = all_candidates[leaf.id];
    if (candidates == undefined || candidates.length == 0) {
      // This should be impossible.
      throw new Error("Failed to filter unplacable part. id: " + leaf.id);
    }
    let selected;
    if (candidates.length == 1) {
      selected = candidates[0];
    } else {
      // For each candidate generate a descriptive struct with the properties we care about.
      // namely:
      //  - is planar face
      //  - offset (how much the of the object is below the face)
      //  - thickness
      //  - area (approx)
      //  - number of interior wires (if any)
      const scores = candidates.map((c, index) => {
        return {
          candidate_index: index,
          is_planar: c.face.geomType == "PLANE",
          offset: c.offset,
          thickness: c.thickness,
          area: areaApprox(c.face.UVBounds),
          interiorWires: c.face.clone().innerWires().length,
        };
      });

      // Sort in order of preference (scores[0] being best).
      scores.sort((a, b) => {
        // Planar faces are preferred because typical cnc machines won't be able to reach the
        // underside face to make cuts.
        if (a.is_planar != b.is_planar) {
          return a.is_planar ? -1 : 1; // prefer planar faces
        }

        // offset == 0 is preferred since it means our face is flush with the xy plane.
        if (a.offset != b.offset) {
          return a.offset - b.offset; // prefer candidates with no offset
        }

        // Next, prefer thickness that matches material if possible, else pick thinnest
        // orientation. Or defer if thickness is equal.
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
      });
      selected = candidates[scores[0].candidate_index];
    }
    if (
      selected.face.geomType != "PLANE" ||
      selected.offset > THICKNESS_TOLLERANCE
    ) {
      layoutWarnList.push(leaf.id);
    }
    //move so center of bounding box is at (0, 0, 0)
    const boundingBoxCenter = selected.geom.boundingBox.center;
    const newGeom = selected.geom
      .clone()
      .translate(-1 * boundingBoxCenter[0], -1 * boundingBoxCenter[1], 0);

    let newLeaf = {
      geometry: [newGeom],
      id: leaf.id,
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
      id: leaf.id,
      shape: newLeaf.geometry[0].faces[selected.faceIndex],
    });

    return newLeaf;
  });

  // If we have a warning, pass it to the callback
  if (layoutWarnList.length > 0 && warningCallback) {
    warningCallback(
      `Part(s) ${layoutWarnList.join(
        ", "
      )} have no orientation suitable for layout.`
    );
  }

  return [rotatedAssembly, shapesForLayout];
}

/**
 * Apply the transformations to the geometry to apply the layout
 */
function applyLayout(rotatedAssembly, positions, layoutConfig) {
  return util.actOnLeafs(rotatedAssembly, (leaf) => {
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
        new util.replicad.Vector([0, 0, 0]),
        new util.replicad.Vector([0, 0, 1])
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
      id: leaf.id,
    };
  });
}

/**
 * Converts a shape array of {x, y} points to a Float64Array format for polygon packing.
 * @param {Array} shape - Array of point objects with x and y properties
 * @returns {Float64Array} Float64Array containing points as [x1, y1, x2, y2, ...] with the polygon closed
 * @throws {Error} Throws an error if any points contain NaN values
 */
function asFloat64(shape) {
  const points = new Float64Array(shape.length * 2 + 2);
  let i = 0;
  shape.forEach((point) => {
    points[i] = point.x;
    points[i + 1] = point.y;
    i += 2;
  });
  points[i] = shape[0].x;
  points[i + 1] = shape[0].y; // close the polygon

  if (points.filter((c) => !Number.isFinite(c)).length > 0) {
    throw new Error(
      "NaN points in Float64Array from: " + JSON.stringify(shape)
    );
  }

  return points;
}

/**
 * Creates a default placement for all parts at position (0,0) with 0° rotation.
 * This is used as a fallback when the packing algorithm fails to find any placement.
 * @param {Array} shapesForLayout - Array of shapes to create default placements for
 * @returns {Array} Default placements with all parts at origin
 */
function createDefaultPlacements(shapesForLayout) {
  const defaultSheet = shapesForLayout.map((shape) => ({
    id: shape.id,
    rotate: 0,
    translate: { x: 0, y: 0 },
  }));
  return [defaultSheet]; // Return as a single sheet
}

/**
 * Use the packing engine, this is potentially time consuming step.
 */
function computePositions(
  shapesForLayout,
  progressCallback,
  placementsCallback,
  layoutConfig,
  previousPlacements = null
) {

  const tolerance = 0.2;
  const runtimeMs = 120000;
  const config = {
    curveTolerance: 0.1,
    spacing: layoutConfig.partPadding + tolerance * 2,
    rotations: 12,
    populationSize: 8,
    mutationRate: 50,
    useHoles: false,
  };
  // from the mesh format of [x1, y1, z1, x2, y2, z2, ...] to FloatPolygon friendly format of
  // [{x: x1, y: y1}, {x: x2, y: y2}...]
  const polygons = shapesForLayout.map((shape, index) => {
    let face = shape.shape;
    const mesh = face
      .clone()
      .outerWire()
      .meshEdges({ tolerance: tolerance, angularTolerance: 0.5 }); //The tolerance here is described in the conversation here https://github.com/BarbourSmith/Abundance/pull/173

    const prepared = preparePoints(mesh, tolerance / 100);
    const result = asFloat64(prepared);
    return result;
  });

  // Clockwise winding direction appears to matter here for the current packing algo.
  const bin = asFloat64([
    { x: 0, y: 0 },
    { x: 0, y: layoutConfig.height },
    { x: layoutConfig.width, y: layoutConfig.height },
    { x: layoutConfig.width, y: 0 },
  ]);

  const packer = new PolygonPacker();

  let progressCallbackCounter = 0;
  const callbackFunction = (num) => {
    // Forward to the UI thread along with a cancelation handle.
    // Expect a call every 0.1 seconds for this method.
    // Unclear what the num argument is supposed to represent
    progressCallbackCounter++;
    progressCallback(
      0.1 + 0.9 * ((progressCallbackCounter * 100) / runtimeMs),
      proxy(() => {
        packer.stop(false);
      })
    );
  };

  const result = new Promise((resolve, reject) => {
    // See https://github.com/yuriilychak/SVGnest/blob/6ed19cf44cb458b11d7ae4abf1868a513c53420a/packages/polygon-packer/src/types.ts#L31
    let callbackCounter = 0;
    let bestPlacement = null;
    const displayCallback = (
      placementsData,
      placementPercentage,
      placedParts,
      partCount
    ) => {
      callbackCounter++;
      if (placedParts > 0) {
        let placements = translatePlacements(
          placementsData,
          placedParts,
          partCount
        );

        placementsCallback(placements);
        bestPlacement = placements;
      }
    };

    try {
      packer.start(
        config,
        polygons,
        bin,
        callbackFunction,
        displayCallback,
        previousPlacements
      );

      setTimeout(() => {
        console.log("Timeout reached. Stopping packer.");
        if (bestPlacement != null) {
          packer.stop(true);
          resolve(bestPlacement);
        } else {
          packer.stop(true);
          console.log("No placement found within time limit, using default placement at origin.");
          const defaultPlacements = createDefaultPlacements(shapesForLayout);
          resolve(defaultPlacements);
        }
      }, runtimeMs);
    } catch (err) {
      console.log("error in nesting engine: " + err);
      packer.stop(true);
      console.log("Using default placement at origin due to packing error.");
      const defaultPlacements = createDefaultPlacements(shapesForLayout);
      resolve(defaultPlacements);
    }
  });
  return result;
}

/**
 *
 * @param {} placement
 * @returns List of placements as expected by applyLayout
 *  ie. a list of list of transforms, where each entry in the outer list is for 1 sheet's worth of placement
 *  Each transform follows the structure: {id: "part_id", rotate: degrees, translate: {x: x, y: y}}
 */

function translatePlacements(placement, placedParts, partCount) {
  const placements = new PlacementWrapper(
    placement.placementsData,
    placement.angleSplit
  );
  console.log(
    "new placement received. " +
      placedParts +
      " of " +
      partCount +
      " parts placed. score: " +
      placement.placementsData[0]
  );

  const result = [];
  for (let i = 0; i < placements.placementCount; i++) {
    const sheet = [];
    placements.bindPlacement(i);
    for (let j = 0; j < placements.size; j++) {
      placements.bindData(j);
      sheet.push({
        id: placements.id,
        rotate: placements.rotation,
        translate: { x: placements.x, y: placements.y },
      });
    }
    result.push(sheet);
  }

  return result;
}

/**
 * Converts mesh edge data to a polygon-friendly format with proper winding order.
 * @param {Object} mesh - The mesh object containing edge groups and line data
 * @param {number} tolerance - The tolerance for determining if points are equal
 * @returns {Array} Array of {x, y} points in proper winding order
 * @throws {Error} Throws an error if geometry has inconsistent edge continuations
 */
function preparePoints(mesh, tolerance) {
  // Unfortunately the "edges" of this mesh aren't always in sequential order. Here we re-sort them so we can
  // provide them in a winding order, ie, starting at one point and winding around the perimeter of the shape.

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

  const almostEqual = (p1, p2, t = tolerance) => {
    const x = Math.abs(p1.x - p2.x) < t;
    const y = Math.abs(p1.y - p2.y) < t;
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
      const nextPoint = { x: mesh.lines[index], y: mesh.lines[index + 1] };
      if (
        result.length == 0 ||
        !almostEqual(result[result.length - 1], nextPoint)
      ) {
        result.push(nextPoint);
      }
    }

    // Remove this edge and it's inverse from the lookup table.
    edgeStarts = edgeStarts.filter((edge) => {
      return edge.edgeId != currentEdge.edgeId;
    });
    if (edgeStarts.length == 0) {
      break;
    }

    // else find next edge which starts where current result ends.
    const nextEdges = edgeStarts.filter((edge) => {
      return almostEqual(result[result.length - 1], edge.startPoint);
    });
    if (nextEdges.length == 0) {
      throw new Error(
        "Found a discontinuity in the perimeter of an input part."
      );
    } else if (nextEdges.length == 1) {
      currentEdge = nextEdges[0];
    } else {
      // nextEdges.length > 1
      console.warn("Multiple edges starting at seemingly the same point.");
      nextEdges.sort((a, b) => {
        const p1 = result[result.length - 1];
        const p2 = a.startPoint;
        const p3 = b.startPoint;
        const distA = Math.sqrt(
          Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)
        );
        const distB = Math.sqrt(
          Math.pow(p1.x - p3.x, 2) + Math.pow(p1.y - p3.y, 2)
        );
        return distA - distB;
      });
      currentEdge = nextEdges[0];
    }
  }

  if (result.length < 3) {
    throw new Error(
      "Part perimiter has less than 3 points: " + JSON.stringify(result)
    );
  }
  return result;
}

/**
 * Moves a face to the cutting plane by rotating and translating the geometry.
 * @param {Object} geom - The geometry to transform
 * @param {Object} face - The face to align with the cutting plane
 * @returns {Object} The transformed geometry with the face aligned to the XY cutting plane
 */
function moveFaceToCuttingPlane(geom, face) {
  // There's a broken edge case in the clipper lib which gets triggered if one of the perimeter lines is
  // co-incident with the X or Y axis. Here use the center of the face to ensure the origin isn't aligned with
  // any perimeter edge of this face.
  // Try removing this once https://github.com/BarbourSmith/Abundance/issues/572 is resolved.
  let center = {
    x: (face.UVBounds.uMin + face.UVBounds.uMax) / 2,
    y: (face.UVBounds.vMin + face.UVBounds.vMax) / 2,
  };

  let pointOnSurface = face.pointOnSurface(center.x, center.y);
  let faceNormal = face.normalAt();

  // Always use "XY" plane as the cutting surface. Attempt to reorient
  // the given face so it's normal vector points down the Z axis. Down because
  // the normal vector points out of the surface of our 3d shape, and the interior
  // of the 3D shape should be placed above the XY plane.
  let targetOrientation = new util.replicad.Vector([0, 0, -1]);

  let rotationAxis = faceNormal.cross(targetOrientation);
  if (rotationAxis.Length == 0) {
    if (faceNormal.dot(targetOrientation) < 0) {
      // Face points upward but is otherwise parallel to cut plane. flip 180 around x axis.
      geom = geom
        .clone()
        .rotate(180, pointOnSurface, new util.replicad.Vector([1, 0, 0]));
    }

    // Face already parallel to cut plane and on underside of the shape.
    return geom.clone().translate(0, 0, -1 * pointOnSurface.z);
  }

  let rotationDegrees =
    (Math.acos(
      faceNormal.dot(targetOrientation) /
        (targetOrientation.Length * faceNormal.Length)
    ) *
      360) /
    (2 * Math.PI);

  return geom
    .clone()
    .rotate(rotationDegrees, pointOnSurface, rotationAxis)
    .translate(0, 0, -1 * pointOnSurface.z);
}

/**
 * Calculates an approximate area from UV bounds.
 * @param {Object} bounds - The bounds object containing uMin, uMax, vMin, vMax properties
 * @returns {number} The approximate area calculated from the bounds
 */
function areaApprox(bounds) {
  return (bounds.uMax - bounds.uMin) * (bounds.vMax - bounds.vMin);
}

export { layout, displayLayout, createDefaultPlacements };
