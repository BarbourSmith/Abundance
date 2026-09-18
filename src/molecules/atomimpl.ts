/**
 * Colours selected faces of the input assembly by discrete Gaussian
 * curvature: red for concave (negative curvature), blue for convex
 * (positive curvature), white for flat/neutral, darker as curvature grows
 * more severe.
 *
 * Uses whichever faces are selected on `surface` (via a faceselect input);
 * if none are selected, every face of the assembly is coloured.
 *
 *   curvatureScale — absolute curvature magnitude (1/length², in the
 *                    model's own units) at which a colour fully saturates.
 *                    Tune per model scale: small parts with tight fillets
 *                    need a larger value, large gently-curved parts need a
 *                    smaller one.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function run(surface: Assembly, curvatureScale: number = 0.01): Assembly[] {
  if (!surface) {
    throw new Error("Gaussian curvature: missing required geometry input.");
  }
  if (!Number.isFinite(curvatureScale) || curvatureScale <= 0) {
    throw new Error(
      "Gaussian curvature: curvatureScale must be a positive number.",
    );
  }

  const noneSelected = surface.getSelectedFaces().length === 0;
  const facesToProcess: replicad.Face[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (surface as any).onLeafs((leaf: any) => {
    if (leaf.geometry instanceof replicad.Drawing) {
      console.warn("Gaussian curvature: drawings have no faces, skipping");
      return leaf;
    }
    if (noneSelected) {
      facesToProcess.push(
        ...(leaf.geometry instanceof replicad.Face
          ? [leaf.geometry]
          : leaf.geometry.faces),
      );
    } else if (leaf.selection?.faces && leaf.selection.faces.length > 0) {
      facesToProcess.push(
        ...leaf.selection.faces.map((idx: number) => leaf.geometry.faces[idx]),
      );
    }
    return leaf;
  });

  if (facesToProcess.length === 0) {
    throw new Error("Gaussian curvature: input has no faces to visualize.");
  }

  return facesToProcess.map(
    (face) =>
      new Assembly({
        geometry: face,
        color: "#5B9BD5",
        tags: ["heatmap:gaussian-curvature"],
        metadata: {
          meshOverride: buildCurvatureMeshOverride(face, curvatureScale),
        },
      }),
  );
}

// ─── meshOverride baking ──────────────────────────────────────────────────
//
// Tessellates the face at a fixed, coarse tolerance, then computes discrete
// Gaussian curvature at every mesh vertex via the angle-defect method: for
// each vertex, sum the interior angles of its adjacent triangles and compare
// against 2π (or π on the mesh boundary); the deficit divided by the local
// (mixed/Voronoi) area is the curvature estimate.
//
// Colour is baked flat per triangle (averaging its 3 corner curvatures) and
// applied to a de-duplicated "triangle soup" copy of the mesh — each
// triangle gets its own unshared vertices — so the renderer's per-vertex
// colour interpolation can't blend two different triangles' colours across
// a shared corner and produce a gradient within a single triangle.

function buildCurvatureMeshOverride(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  face: any,
  curvatureScale: number,
) {
  const faces = face.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
  const edges = face.meshEdges({ tolerance: 0.1, angularTolerance: 0.3 });

  const { vertices, triangles } = faces;
  const numVerts = vertices.length / 3;
  const angleSum = new Float64Array(numVerts);
  const areaSum = new Float64Array(numVerts);
  const edgeTriCount = new Map<string, number>();
  const neighbors: Set<number>[] = Array.from(
    { length: numVerts },
    () => new Set(),
  );

  const px = (i: number) => vertices[i * 3];
  const py = (i: number) => vertices[i * 3 + 1];
  const pz = (i: number) => vertices[i * 3 + 2];

  const angleAt = (a: number, b: number, c: number): number => {
    const abx = px(b) - px(a),
      aby = py(b) - py(a),
      abz = pz(b) - pz(a);
    const acx = px(c) - px(a),
      acy = py(c) - py(a),
      acz = pz(c) - pz(a);
    const abLen = Math.hypot(abx, aby, abz);
    const acLen = Math.hypot(acx, acy, acz);
    if (abLen === 0 || acLen === 0) return 0;
    const cos = (abx * acx + aby * acy + abz * acz) / (abLen * acLen);
    return Math.acos(Math.min(1, Math.max(-1, cos)));
  };

  const edgeKey = (i: number, j: number) => (i < j ? `${i}_${j}` : `${j}_${i}`);

  const numTriangles = triangles.length / 3;
  for (let t = 0; t < numTriangles; t++) {
    const i0 = triangles[t * 3];
    const i1 = triangles[t * 3 + 1];
    const i2 = triangles[t * 3 + 2];

    const abx = px(i1) - px(i0),
      aby = py(i1) - py(i0),
      abz = pz(i1) - pz(i0);
    const acx = px(i2) - px(i0),
      acy = py(i2) - py(i0),
      acz = pz(i2) - pz(i0);
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const area = 0.5 * Math.hypot(cx, cy, cz);

    angleSum[i0] += angleAt(i0, i1, i2);
    angleSum[i1] += angleAt(i1, i2, i0);
    angleSum[i2] += angleAt(i2, i0, i1);
    areaSum[i0] += area / 3;
    areaSum[i1] += area / 3;
    areaSum[i2] += area / 3;

    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ] as const) {
      const key = edgeKey(a, b);
      edgeTriCount.set(key, (edgeTriCount.get(key) ?? 0) + 1);
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  }

  // Vertices touched by an edge that borders only one triangle sit on the
  // face's trimmed boundary. The angle-defect formula only measures
  // curvature correctly for vertices fully surrounded by triangles (a full
  // 2π turn); at a boundary vertex the angle sum is just the mesh's local
  // corner angle, which has nothing to do with surface curvature (e.g. a
  // flat rectangular face's corners would read as sharply convex). Instead,
  // boundary vertices inherit curvature from their interior neighbors, and
  // default to 0 (flat) when the face has no interior vertices at all — as
  // happens for a coarsely-tessellated flat face like a cube side.
  const isBoundary = new Uint8Array(numVerts);
  for (const [key, count] of edgeTriCount) {
    if (count === 1) {
      const [a, b] = key.split("_").map(Number);
      isBoundary[a] = 1;
      isBoundary[b] = 1;
    }
  }

  const k = new Float64Array(numVerts);
  for (let v = 0; v < numVerts; v++) {
    if (isBoundary[v]) continue;
    const area = areaSum[v];
    k[v] = area > 0 ? (2 * Math.PI - angleSum[v]) / area : 0;
  }
  for (let v = 0; v < numVerts; v++) {
    if (!isBoundary[v]) continue;
    let sum = 0;
    let count = 0;
    for (const n of neighbors[v]) {
      if (!isBoundary[n]) {
        sum += k[n];
        count++;
      }
    }
    k[v] = count > 0 ? sum / count : 0;
  }

  const [r0, g0, b0] = hexToRgb("#ffffff");
  const [rConcave, gConcave, bConcave] = hexToRgb("#ff0000");
  const [rConvex, gConvex, bConvex] = hexToRgb("#0000ff");

  const curvatureToColor = (curvature: number): [number, number, number] => {
    let t = curvature / curvatureScale;
    if (t < -1) t = -1;
    else if (t > 1) t = 1;
    const mag = Math.abs(t);
    const [rBase, gBase, bBase] =
      t < 0 ? [rConcave, gConcave, bConcave] : [rConvex, gConvex, bConvex];
    const darken = 1 - 0.4 * mag;
    return [
      (r0 + (rBase - r0) * mag) * darken,
      (g0 + (gBase - g0) * mag) * darken,
      (b0 + (bBase - b0) * mag) * darken,
    ];
  };

  const { normals } = faces;
  const hasNormals =
    Array.isArray(normals) && normals.length === vertices.length;
  const flatVertices: number[] = new Array(numTriangles * 9);
  const flatNormals: number[] | undefined = hasNormals
    ? new Array(numTriangles * 9)
    : undefined;
  const flatTriangles: number[] = new Array(numTriangles * 3);
  const vertexColors: number[] = new Array(numTriangles * 9);

  for (let t = 0; t < numTriangles; t++) {
    const corners = [
      triangles[t * 3],
      triangles[t * 3 + 1],
      triangles[t * 3 + 2],
    ];
    const [r, g, b] = curvatureToColor(
      (k[corners[0]] + k[corners[1]] + k[corners[2]]) / 3,
    );
    for (let c = 0; c < 3; c++) {
      const src = corners[c];
      const dst = t * 3 + c;
      flatVertices[dst * 3] = vertices[src * 3];
      flatVertices[dst * 3 + 1] = vertices[src * 3 + 1];
      flatVertices[dst * 3 + 2] = vertices[src * 3 + 2];
      if (flatNormals) {
        flatNormals[dst * 3] = normals[src * 3];
        flatNormals[dst * 3 + 1] = normals[src * 3 + 1];
        flatNormals[dst * 3 + 2] = normals[src * 3 + 2];
      }
      flatTriangles[dst] = dst;
      vertexColors[dst * 3] = r;
      vertexColors[dst * 3 + 1] = g;
      vertexColors[dst * 3 + 2] = b;
    }
  }

  return {
    faces: {
      ...faces,
      vertices: flatVertices,
      triangles: flatTriangles,
      ...(flatNormals ? { normals: flatNormals } : {}),
    },
    edges,
    // Plain array (not Float32Array) so metadata.meshOverride survives the
    // JSON round-trip in cacheAssemblyStructure/getAssembly. Renderer wraps
    // back into a typed array when constructing the BufferAttribute.
    vertexColors,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
