import { proxy } from "comlink";
import { PlacementWrapper, PolygonPacker } from "polygon-packer";
import type { DisplayCallback } from "polygon-packer/src/types";
import { Drawing, Face, Shape3D } from "replicad";
import { extractKeepOut } from "./tags";
import { RequestContext } from "./geometryProvider";
import type { AbundanceLeaf, AbundanceObject } from "./util";
import * as util from "./util";
import shrinkWrap from "replicad-shrink-wrap";
import * as replicad from "replicad";

type SimpleXY = { x: number; y: number };

type OrientationConfig = {
  units: "MM" | "inches";
};

type Orientation = {
  downwardFaceIndex: number;
};

type LayoutConfig = {
  width: number;
  height: number;
  partPadding: number;
  units?: string;
  rotations: number;
};

type Placement = {
  id: number | string;
  rotate: number;
  translate: SimpleXY;
};

type ShapeForLayout = {
  id: number | string;
  shape: any; // Replace 'any' with the actual face type if available
};

type OrientationCandidate = {
  face: Face;
  offset: number;
  faceIndex: number;
  thickness: number;
  innerWires: number;
};

const rotateMemoCache = new Map<
  string,
  [AbundanceObject, ShapeForLayout[], string]
>();

/**
 * Explicitly clear the rotate memoization cache to free up memory in worker
 * Called periodically to prevent memory accumulation with multiple CutLayout computations
 */
function clearRotateCache() {
  // Dispose of any Three.js resources if they exist
  rotateMemoCache.forEach((value) => {
    // The cache stores [AbundanceObject, ShapeForLayout[], string]
    // No explicit disposal needed here as the objects will be garbage collected
  });
  rotateMemoCache.clear();
}

async function orient(
  assembly: AbundanceObject,
  orientationConfig: OrientationConfig,
  context: RequestContext,
): Promise<[AbundanceObject, Orientation[]]> {
  console.log("orient called.");
  const orientations: Orientation[] = await rotateForLayout(assembly, context);
  console.log("picked orientations: ", orientations);
  const orientedAssembly = await displayOrientation(
    assembly,
    orientations,
    orientationConfig,
    context,
  );
  return [orientedAssembly, orientations];
}

async function displayOrientation(
  assembly: AbundanceObject,
  orientations: Orientation[],
  orientationConfig: OrientationConfig,
  context: RequestContext,
): Promise<AbundanceObject> {
  console.log("displayOrientation called.");
  const getCacheId = (geom: string, index: number) => {
    return "faceToXY-" + index + "-" + geom;
  };
  const padding = 1; //orientationConfig.units === "MM" ? 25 : 1;

  const bottomLeftTarget = { x: 0, y: 0 };
  let index = 0;
  const result = util.actOnLeafs(assembly, async (leaf: AbundanceLeaf) => {
    if (!util.is3D(leaf)) {
      return leaf;
    }
    let targetFaceIndex = orientations[index].downwardFaceIndex;
    index++;
    const batchId = getCacheId(leaf.geometry, targetFaceIndex);

    // Extra batching logic to ensure that we can get cache hits on the "addSingular" operation below.
    const cachedResultOrContext: AbundanceObject | RequestContext =
      await util.geometryProvider!.startBatchOperation(context, batchId);
    if (util.isAbundanceObject(cachedResultOrContext)) {
      bottomLeftTarget.x =
        (cachedResultOrContext.boundingBox?.max[0] || 0) + padding; // Update bottomLeftTarget for next leaf
      return cachedResultOrContext as AbundanceLeaf; // Return cached result if available
    }
    const geom = (await util.geometryProvider!.get(
      leaf.geometry,
      cachedResultOrContext,
    )) as Shape3D;
    targetFaceIndex = targetFaceIndex % geom.faces.length; // Ensure the index is within bounds

    let result = moveFaceToCuttingPlane(geom, geom.faces[targetFaceIndex]);

    // Translate and rotate so we accumulate a nonoverlapping stack
    let bbox = result.boundingBox;
    if (bbox.width > bbox.height) {
      result = result.rotate(90, [0, 0, 0], [0, 0, 1]);
    }
    bbox = result.boundingBox;
    result = result.translate(
      bottomLeftTarget.x - bbox.bounds[0][0],
      bottomLeftTarget.y - bbox.bounds[0][1],
      0,
    );
    bbox = result.boundingBox;
    bottomLeftTarget.x += bbox.width + padding;

    leaf.boundingBox = { min: bbox.bounds[0], max: bbox.bounds[1] };
    leaf.geometry = await util.geometryProvider!.addSingularToCache(
      result,
      cachedResultOrContext,
      "faceToXY-",
      [targetFaceIndex, leaf.geometry],
    );
    await util.geometryProvider!.endBatchOperation(cachedResultOrContext, leaf);

    return leaf as AbundanceLeaf;
  });
  return result;
}

async function layout(
  assembly: AbundanceObject,
  progressCallback: (progress: number, cancelCallback: () => void) => void,
  warningCallback: (msg: string) => void,
  placementsCallback: (placements: Placement[][]) => void,
  layoutConfig: LayoutConfig,
  context: RequestContext,
  previousPlacements: Placement[][] | undefined = undefined,
): Promise<[AbundanceObject, Placement[][]]> {
  checkConfig(layoutConfig);
  const [assemblyWithMetadata, shapesForLayout] = await prepShapesForLayout(
    assembly,
    context,
  );

  const positionsPromise = computePositions(
    shapesForLayout,
    progressCallback,
    placementsCallback,
    layoutConfig,
    previousPlacements,
  );
  return positionsPromise.then(async (positions) => {
    //This does the actual layout of the parts.
    const layedOutAssembly = await applyLayout(
      assemblyWithMetadata,
      positions,
      layoutConfig,
      context,
    );

    if (positions.length == 0) {
      // This should not happen anymore since we provide default placements,
      // but keep this as a safety check
      console.warn("Unexpected: received empty positions array");
      return [assembly, []];
    } else {
      const unplacedParts = shapesForLayout.length - positions.flat().length;
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
 * Returns both the result and the rotatedAssembly for caching purposes
 */
async function displayLayout(
  assembly: AbundanceObject,
  positions: Placement[][],
  warningCallback: (msg: string) => void,
  layoutConfig: LayoutConfig,
  context: RequestContext,
): Promise<AbundanceObject> {
  const result = await applyLayout(assembly, positions, layoutConfig, context);
  console.log(result);
  return result;
}

/**
 * Creates default placements for all parts in the assembly and displays them.
 * All parts are placed at (0, 0) with 0° rotation.
 * Returns both the displayed layout and the default placements.
 * @param assembly - The assembly to create default placements for
 * @param warningCallback - Callback for warnings
 * @param layoutConfig - Layout configuration
 * @param context - Request context
 * @returns Promise resolving to [displayedLayout, defaultPlacements]
 */
async function createAndDisplayDefaultLayout(
  assembly: AbundanceObject,
  warningCallback: (msg: string) => void,
  layoutConfig: LayoutConfig,
  context: RequestContext,
): Promise<[AbundanceObject, Placement[][]]> {
  const [assemblyWithMetadata, shapesForLayout] = await prepShapesForLayout(
    assembly,
    context,
  );
  const defaultPlacements = createDefaultPlacements(
    shapesForLayout,
    layoutConfig,
  );
  const displayedLayout = await applyLayout(
    assemblyWithMetadata,
    defaultPlacements,
    layoutConfig,
    context,
  );
  return [displayedLayout, defaultPlacements];
}

function shrinkWrapForBoundary(drawing: Drawing): SimpleXY[] {
  const wrapped = shrinkWrap(drawing, 50).sketchOnPlane();
  if (wrapped instanceof replicad.Sketches) {
    throw Error(
      "Disjoint parts not always supported. Failed to shrinkwrap a disjoint input",
    );
  }
  return faceToPolygon(wrapped.face());
}

function faceToPolygon(face: Face) {
  const mesh = face
    .clone()
    .outerWire()
    .meshEdges({ tolerance: 0.2, angularTolerance: 0.5 }); //The tolerance here is described in the conversation here https://github.com/BarbourSmith/Abundance/pull/173

  return preparePoints(mesh, 0.2 / 100);
}

function projectAndWrapBoundary(shape: Shape3D): SimpleXY[] | undefined {
  let projection;
  try {
    projection = replicad.drawProjection(shape, "XY");
  } catch (err) {
    console.error("Failed to generate projection", err);
    return undefined;
  }
  try {
    return shrinkWrapForBoundary(projection.visible);
  } catch (err) {
    console.error("Failed to shrinkwrap projection: ", err);
    return undefined;
  }
}

function boundingBoxAsBoundary(shape: Shape3D): SimpleXY[] {
  const bounds = shape.boundingBox.bounds;
  return [
    { x: bounds[0][0], y: bounds[0][1] },
    { x: bounds[0][0], y: bounds[1][1] },
    { x: bounds[1][0], y: bounds[1][1] },
    { x: bounds[1][0], y: bounds[0][1] },
  ];
}

async function prepShapesForLayout(
  assembly: AbundanceObject,
  context: RequestContext,
): Promise<[AbundanceObject, ShapeForLayout[]]> {
  const facefinder = new replicad.FaceFinder().inPlane("XY");

  const result = [] as ShapeForLayout[];
  assembly = await util.actOnLeafs(assembly, async (leaf: AbundanceLeaf) => {
    if (util.is2D(leaf)) {
      const geom = (await util.geometryProvider!.get(
        leaf.geometry,
        context,
      )) as Drawing;
      const sketched = geom.sketchOnPlane();
      const boundary =
        sketched instanceof replicad.Sketches
          ? shrinkWrapForBoundary(geom) // if disjoint shapes, shrinkwrap them all
          : faceToPolygon(sketched.face());
      result.push({ id: leaf.geometry, shape: boundary });
      return leaf;
    } else if (util.is3D(leaf)) {
      const geom = (await util.geometryProvider!.get(
        leaf.geometry,
        context,
      )) as Shape3D;
      // query for face in XY plane.
      const faces = facefinder.find(geom);
      let boundary;
      if (faces.length === 1) {
        // Happy case, a single face on the XY plane. Use it's boundary.
        boundary = faceToPolygon(faces[0]);
      } else {
        // Either too many faces or none at all. In either case fall back to the
        // projected boundary of this part.
        boundary = projectAndWrapBoundary(geom);
        if (boundary === undefined) {
          // Fall back further to a bounding box rectangle
          boundary = boundingBoxAsBoundary(geom);
        }
      }
      result.push({ id: leaf.geometry, shape: boundary }); // Just pick the first one for now.
      return leaf;
    }
  });
  return [assembly, result];
}

/**
 * Pick orientations for each part in the assembly. Return the index of the face which should
 * be down on the XY plane.
 */
async function rotateForLayout(
  assembly: AbundanceObject,
  context: RequestContext,
): Promise<Orientation[]> {
  // Filter out keepout geometry before any processing
  const filteredAssembly = extractKeepOut(assembly);
  if (!filteredAssembly) {
    throw new Error("No geometry to layout after keepout geometry is excluded");
  }

  // Compute rotated positions for this layout.
  const THICKNESS_TOLLERANCE = 0.001;

  const orientations: Orientation[] = [];
  await util.actOnLeafs(filteredAssembly, async (leaf: AbundanceLeaf) => {
    let geom = await util.geometryProvider!.get(leaf.geometry, context);
    if (util.is2D(leaf)) {
      // drawings get stuck onto the XY plane. No other rotation needed.
      leaf.plane = util.XYPlane;
      return leaf;
    }
    if (!util.is3D(leaf)) {
      leaf.tags.push("unorientable");
      return leaf;
    }
    // Now just dealing with 3d shapes.

    geom = geom as Shape3D;

    // Go through largest faces first. They're usually going to be the best candidates.
    const orderedFaces = geom.faces
      .slice()
      .map((face, index) => ({
        f: face,
        i: index,
        area: areaApprox(face.clone().UVBounds),
      }))
      .sort((a, b) => b.area - a.area);

    const filtered = orderedFaces.filter(
      ({ f: face }) => face.geomType == "PLANE",
    );
    if (filtered.length == 0) {
      // No planar faces... just take a wild guess using the largest face.
      orientations.push({ downwardFaceIndex: orderedFaces[0].i });
      return leaf;
    }

    let prefilter: ((otherFace: Face) => boolean) | undefined = undefined;
    let bestCandidate: OrientationCandidate | undefined = undefined;

    filtered.forEach(({ f: face, i: originalIndex }) => {
      if (prefilter != undefined && !prefilter(face)) {
        return;
      }

      const prospectiveGoem = moveFaceToCuttingPlane(geom, face);

      // For first few largest faces we might generate a prefilter.
      const thickness = prospectiveGoem.boundingBox.depth;
      if (
        prefilter == undefined &&
        prospectiveGoem.boundingBox.width > thickness * 2 &&
        prospectiveGoem.boundingBox.height > thickness * 2
      ) {
        console.log(
          "creating prefilter for face " +
            originalIndex +
            " normal to: " +
            face.normalAt().toString(),
        );
        const norm = face.normalAt();
        prefilter = (otherFace: Face) => {
          // Only consider faces that are nearly parallel to the current face
          return Math.abs(otherFace.clone().normalAt().dot(norm)) > 0.99;
        };
      }

      const faceProps: OrientationCandidate = {
        face: face,
        faceIndex: originalIndex,
        offset: -1 * prospectiveGoem.boundingBox.bounds[0][2],
        thickness: prospectiveGoem.boundingBox.depth,
        innerWires: face.innerWires().length,
      };

      const inTollerance = (a: number, b: number) => {
        return Math.abs(a - b) < THICKNESS_TOLLERANCE;
      };

      // compare faceProps to the best we've found so far
      if (bestCandidate == undefined) {
        bestCandidate = faceProps;
        console.log("best candidate set to ", faceProps);
      } else {
        if (!inTollerance(bestCandidate.offset, faceProps.offset)) {
          if (faceProps.offset < bestCandidate.offset) {
            console.log("best candidate update due to offset ", faceProps);
            bestCandidate = faceProps;
          }
          return;
        }

        if (!inTollerance(bestCandidate.thickness, faceProps.thickness)) {
          if (faceProps.thickness < bestCandidate.thickness) {
            console.log("best candidate update due to thickness ", faceProps);
            bestCandidate = faceProps;
          }
          return;
        }

        if (faceProps.innerWires < bestCandidate.innerWires) {
          console.log("best candidate update due to inner wires ", faceProps);
          bestCandidate = faceProps;
          return;
        }

        // else no change.
      }
    });

    if (bestCandidate == undefined) {
      // This should be impossible.
      throw new Error("Failed to find a suitable face for layout");
    }

    orientations.push({ downwardFaceIndex: bestCandidate.faceIndex });
    return leaf;
  });

  return orientations;
}

/**
 * Apply the transformations to the geometry to apply the layout
 */
async function applyLayout(
  rotatedAssembly: AbundanceObject,
  positions: Placement[][],
  layoutConfig: LayoutConfig,
  context: RequestContext,
): Promise<AbundanceObject> {
  let index = 0;
  const result = util.actOnLeafs(
    rotatedAssembly,
    async (leaf: AbundanceLeaf) => {
      let transform;
      let sheetNumber = 0;
      const leafID = index;
      index++;
      for (let sheet = 0; sheet < positions.length; sheet++) {
        const candidates = positions[sheet].filter(
          (transform) => transform.id == leafID,
        );
        if (candidates.length == 1) {
          transform = candidates[0];
          sheetNumber = sheet;
          break;
        } else if (candidates.length > 1) {
          console.warn("Found more than one transformation for same id");
        }
      }
      if (transform == undefined) {
        console.warn("did not find transform for id: " + leafID);
        return leaf;
      }
      // apply rotation first. All rotations are around (0, 0, 0)
      // Additionally, shift by sheet-index * sheet height so that multiple
      // sheet layouts are spaced out from one another.
      // use cache for these operations since rotation+movement pairs often
      // recur between layouts.
      let newGeom = await util.geometryProvider!.rotate(
        leaf.geometry,
        0,
        0,
        transform.rotate,
        context,
      );
      // Center the first sheet at origin, width along y axis, subsequent sheets offset in +y
      // For first sheet (sheetNumber==0), offset by -width/2, -height/2 to center at (0,0)
      // For others, offset by +sheetNumber * (layoutConfig.height + spacing) in y
      const spacing = 10; // Spacing between sheets in mm, this is arbitrary and only for visual clarity in the UI, it doesn't affect the actual nesting layout.
      const yOffset = sheetNumber * (layoutConfig.height + spacing);
      newGeom = await util.geometryProvider!.move(
        newGeom,
        transform.translate.x - layoutConfig.width / 2,
        transform.translate.y - layoutConfig.height / 2 + yOffset,
        0,
        context,
      );

      return {
        ...leaf,
        geometry: newGeom,
        referencePoint: undefined,
        tags: [...(leaf.tags || []), `sheet:${sheetNumber}`],
      };
    },
  );

  return result;
}

function checkConfig(layoutConfig: LayoutConfig) {
  if (layoutConfig.width <= 0 || layoutConfig.height <= 0) {
    throw new Error("Sheet width and height must be greater than zero.");
  }
  if (layoutConfig.rotations < 1 || !Number.isInteger(layoutConfig.rotations)) {
    throw new Error("Orientations must be an integer of 1 or more.");
  }
}

/**
 * Converts a shape array of {x, y} points to a Float32Array format for polygon packing.
 * @param {Array} shape - Array of point objects with x and y properties
 * @returns {Float32Array} Float32Array containing points as [x1, y1, x2, y2, ...] with the polygon closed
 * @throws {Error} Throws an error if any points contain NaN values
 */
function asFloat32(shape: SimpleXY[]): Float32Array {
  const points = new Float32Array(shape.length * 2 + 2);
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
      "NaN points in Float32Array from: " + JSON.stringify(shape),
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
function createDefaultPlacements(
  shapesForLayout: ShapeForLayout[],
  layoutConfig: LayoutConfig,
): Placement[][] {
  // Center default placements in the middle of the sheet
  const centerX = layoutConfig.width / 2;
  const centerY = layoutConfig.height / 2;
  const defaultSheet = shapesForLayout.map((shape) => ({
    id: shape.id,
    rotate: 0,
    translate: { x: centerX, y: centerY },
  }));
  return [defaultSheet]; // Return as a single sheet
}

/**
 * Use the packing engine, this is potentially time consuming step.
 */
function computePositions(
  shapesForLayout: ShapeForLayout[],
  progressCallback: (progress: number, cancel: () => void) => void,
  placementsCallback: (placements: Placement[][]) => void,
  layoutConfig: LayoutConfig,
  previousPlacements: Placement[][] | undefined = undefined,
): Promise<Placement[][]> {
  const tolerance = 0.2;
  const runtimeMs = 30000; // Reduced from 120000 (2 min) to 30 sec to prevent long-running workers
  const config = {
    curveTolerance: 0.1,
    spacing: layoutConfig.partPadding + tolerance * 2,
    rotations: layoutConfig.rotations,
    populationSize: 8,
    mutationRate: 50,
    useHoles: false,
  };
  // from the mesh format of [x1, y1, z1, x2, y2, z2, ...] to FloatPolygon friendly format of
  // [{x: x1, y: y1}, {x: x2, y: y2}...]
  console.trace("shapesForLayout: ", shapesForLayout);
  const polygons = shapesForLayout.map((shape) => {
    return asFloat32(shape.shape);
  });

  // Clockwise winding direction appears to matter here for the current packing algo.
  const bin = asFloat32([
    { x: 0, y: 0 },
    { x: 0, y: layoutConfig.height },
    { x: layoutConfig.width, y: layoutConfig.height },
    { x: layoutConfig.width, y: 0 },
  ]);

  const packer = new PolygonPacker();

  let progressCallbackCounter = 0;
  const callbackFunction = (num: any) => {
    // Forward to the UI thread along with a cancelation handle.
    // Expect a call every 0.1 seconds for this method.
    // Unclear what the num argument is supposed to represent
    progressCallbackCounter++;
    progressCallback(
      0.1 + 0.9 * ((progressCallbackCounter * 100) / runtimeMs),
      proxy(() => {
        packer.stop(true);
      }),
    );
  };

  const result = new Promise((resolve, reject) => {
    // See https://github.com/yuriilychak/SVGnest/blob/6ed19cf44cb458b11d7ae4abf1868a513c53420a/packages/polygon-packer/src/types.ts#L31
    let callbackCounter = 0;
    let bestPlacement: Placement[][] | undefined = undefined;
    const displayCallback: DisplayCallback = (
      placementsData,
      placementPercentage,
      placedParts,
      partCount,
    ) => {
      callbackCounter++;
      if (placedParts > 0) {
        const placements = translatePlacements(
          placementsData,
          placedParts,
          partCount,
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
        previousPlacements,
      );

      setTimeout(() => {
        if (bestPlacement != undefined) {
          packer.stop(true);
          resolve(bestPlacement as Placement[][]);
        } else {
          packer.stop(true);
          const defaultPlacements = createDefaultPlacements(
            shapesForLayout,
            layoutConfig,
          );
          resolve(defaultPlacements);
        }
      }, runtimeMs);
    } catch (err) {
      console.error("error in nesting engine: " + err);
      packer.stop(true);
      const defaultPlacements = createDefaultPlacements(
        shapesForLayout,
        layoutConfig,
      );
      resolve(defaultPlacements);
    }
  });
  // TODO: I'm not sure why this cast is required.
  return result as Promise<Placement[][]>;
}

/**
 *
 * @param {} placement
 * @returns List of placements as expected by applyLayout
 *  ie. a list of list of transforms, where each entry in the outer list is for 1 sheet's worth of placement
 *  Each transform follows the structure: {id: "part_id", rotate: degrees, translate: {x: x, y: y}}
 */

function translatePlacements(
  placement: any,
  placedParts: number,
  partCount: number,
): Placement[][] {
  const placements = new PlacementWrapper(
    placement.placementsData,
    placement.angleSplit,
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
function preparePoints(mesh: any, tolerance: number): SimpleXY[] {
  // Unfortunately the "edges" of this mesh aren't always in sequential order. Here we re-sort them so we can
  // provide them in a winding order, ie, starting at one point and winding around the perimeter of the shape.

  // create structure for lookup of line segments by start point or end point
  let edgeStarts: {
    startPoint: SimpleXY;
    start: number;
    len: number;
    edgeId: number;
  }[] = [];
  mesh.edgeGroups.forEach((edge: any) => {
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

  const almostEqual = (p1: SimpleXY, p2: SimpleXY, t = tolerance) => {
    const x = Math.abs(p1.x - p2.x) < t;
    const y = Math.abs(p1.y - p2.y) < t;
    return x && y;
  };

  const result: SimpleXY[] = [];
  let currentEdge = edgeStarts[0];
  while (edgeStarts.length > 0) {
    // add currentEdge to result. Remember, it could be reverse direction if we matched
    // an endpoint.
    for (let i = 1; i < Math.abs(currentEdge.len); i++) {
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
        "Found a discontinuity in the perimeter of an input part.",
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
          Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2),
        );
        const distB = Math.sqrt(
          Math.pow(p1.x - p3.x, 2) + Math.pow(p1.y - p3.y, 2),
        );
        return distA - distB;
      });
      currentEdge = nextEdges[0];
    }
  }

  if (result.length < 3) {
    throw new Error(
      "Part perimiter has less than 3 points: " + JSON.stringify(result),
    );
  }
  return result;
}

function faceToCuttingPlaneTransform(face: Face): {
  degrees: number;
  point: replicad.Vector;
  axis: replicad.Vector;
  offset: number;
} {
  // There's a broken edge case in the clipper lib which gets triggered if one of the perimeter lines is
  // co-incident with the X or Y axis. Here use the center of the face to ensure the origin isn't aligned with
  // any perimeter edge of this face.
  // Try removing this once https://github.com/BarbourSmith/Abundance/issues/572 is resolved.
  const center = {
    x: (face.UVBounds.uMin + face.UVBounds.uMax) / 2,
    y: (face.UVBounds.vMin + face.UVBounds.vMax) / 2,
  };

  const pointOnSurface = face.pointOnSurface(center.x, center.y);
  const faceNormal = face.normalAt();

  // Always use "XY" plane as the cutting surface. Attempt to reorient
  // the given face so it's normal vector points down the Z axis. Down because
  // the normal vector points out of the surface of our 3d shape, and the interior
  // of the 3D shape should be placed above the XY plane.
  const targetOrientation = new util.replicad.Vector([0, 0, -1]);

  const rotationAxis = faceNormal.cross(targetOrientation);
  if (rotationAxis.Length == 0) {
    return {
      degrees: faceNormal.dot(targetOrientation) < 0 ? 180 : 0,
      point: pointOnSurface,
      axis: new util.replicad.Vector([1, 0, 0]),
      offset: -1 * pointOnSurface.z,
    };
  }

  const rotationDegrees =
    (Math.acos(
      faceNormal.dot(targetOrientation) /
        (targetOrientation.Length * faceNormal.Length),
    ) *
      360) /
    (2 * Math.PI);

  return {
    degrees: rotationDegrees,
    point: pointOnSurface,
    axis: rotationAxis,
    offset: -1 * pointOnSurface.z,
  };
}

/**
 * Moves a face to the cutting plane by rotating and translating the geometry.
 * @param {Object} geom - The geometry to transform
 * @param {Object} face - The face to align with the cutting plane
 * @returns {Object} The transformed geometry with the face aligned to the XY cutting plane
 */
function moveFaceToCuttingPlane(geom: Shape3D, face: Face): Shape3D {
  const transform = faceToCuttingPlaneTransform(face);
  return geom
    .clone()
    .rotate(transform.degrees, transform.point, transform.axis)
    .translate(0, 0, transform.offset);
}

/**
 * Calculates an approximate area from UV bounds.
 * @param {Object} bounds - The bounds object containing uMin, uMax, vMin, vMax properties
 * @returns {number} The approximate area calculated from the bounds
 */
function areaApprox(bounds: {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}): number {
  return (bounds.uMax - bounds.uMin) * (bounds.vMax - bounds.vMin);
}

export {
  clearRotateCache,
  createAndDisplayDefaultLayout,
  createDefaultPlacements,
  displayLayout,
  layout,
  orient,
  displayOrientation,
  LayoutConfig,
  Placement,
};
