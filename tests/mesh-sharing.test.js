// The mesh worker meshes each stored shape once. Moved and rotated copies of
// it (lazy transform ids) share that mesh and each carry a transform, which
// the 3D view and the other readers apply with three.js.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/mesh-sharing.test.js

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as replicad from "replicad";
import * as workerpool from "workerpool";
import { Box3, Vector3 } from "three";
import MeshWorkerURL from "../src/worker/meshWorker.ts?url&worker";
import { init, XYPlane } from "../src/worker/util.ts";
import { putShape } from "../src/worker/indexeddbUtils.ts";
import {
  rotationXYZ,
  transformId,
  translation,
} from "../src/worker/lazyTransform.ts";
import {
  buildDisplayGeometries,
  transformMatrix,
} from "../src/js/displayMeshGeometry.js";
import { estimateSize } from "../src/js/meshCache.js";

const leaf = (id, extra = {}) => ({
  geometry: id,
  dimension: "3D",
  plane: XYPlane,
  color: "#aad7f2",
  tags: [],
  bom: [],
  ...extra,
});
const assembly = (...leaves) => ({
  geometry: leaves,
  dimension: "3D",
  plane: XYPlane,
  tags: [],
});

/** A shape with no symmetry, so a wrong rotation changes where it lands. */
function lopsided() {
  return replicad
    .makeBaseBox(40, 20, 10)
    .translate(5, 3, 1)
    .fuse(replicad.makeBaseBox(6, 6, 30).translate(20, 9, 0));
}

/** The box around a part's triangles once placed with its transform. */
function placedBox(part) {
  const box = new Box3();
  const matrix = transformMatrix(part.transform);
  const v = part.faces.vertices;
  for (let i = 0; i < v.length; i += 3) {
    const p = new Vector3(v[i], v[i + 1], v[i + 2]);
    box.expandByPoint(matrix ? p.applyMatrix4(matrix) : p);
  }
  return box;
}

function expectBoxClose(box, [min, max]) {
  for (const [i, axis] of ["x", "y", "z"].entries()) {
    expect(box.min[axis]).toBeCloseTo(min[i], 1);
    expect(box.max[axis]).toBeCloseTo(max[i], 1);
  }
}

describe("display meshes of moved copies", () => {
  let pool;
  const context = { project: `mesh-sharing-${Date.now()}` };

  beforeAll(async () => {
    await init();
    pool = workerpool.pool(MeshWorkerURL, {
      maxWorkers: 1,
      workerOpts: { type: "module" },
    });
    await putShape(context.project, "part", lopsided().serialize());
  }, 60000);

  afterAll(async () => {
    await pool?.terminate();
  });

  it("meshes the shape once and places each copy with a transform", async () => {
    const move = translation(100, -20, 7);
    const turn = rotationXYZ(30, 45, 60);
    const moved = transformId("part", move);
    const turned = transformId(moved, turn);
    const { mesh } = await pool.exec("generateDisplayMesh", [
      assembly(leaf("part"), leaf(moved), leaf(turned)),
      context,
    ]);

    expect(mesh).toHaveLength(3);
    // One set of triangles, still shared after crossing from the worker
    expect(mesh[1].faces).toBe(mesh[0].faces);
    expect(mesh[2].faces).toBe(mesh[0].faces);
    expect(mesh[2].edges).toBe(mesh[0].edges);
    expect(mesh[0].faces.vertices).toBeInstanceOf(Float32Array);
    expect(mesh[0].faces.triangles).toBeInstanceOf(Uint32Array);
    expect(mesh[0].edges.lines).toBeInstanceOf(Float32Array);

    expect(mesh[0].transform).toBeUndefined();
    expect(mesh[1].transform.position).toEqual([100, -20, 7]);

    // Placed with three.js, each copy lands where replicad's own transforms
    // put the shape.
    const eager = lopsided()
      .translate(100, -20, 7)
      .rotate(30, [0, 0, 0], [1, 0, 0])
      .rotate(45, [0, 0, 0], [0, 1, 0])
      .rotate(60, [0, 0, 0], [0, 0, 1]);
    expectBoxClose(placedBox(mesh[0]), lopsided().boundingBox.bounds);
    expectBoxClose(
      placedBox(mesh[1]),
      lopsided().translate(100, -20, 7).boundingBox.bounds,
    );
    expectBoxClose(placedBox(mesh[2]), eager.boundingBox.bounds);

    expect(mesh.every((m) => m.cameraZoom === mesh[0].cameraZoom)).toBe(true);
    expect(mesh[0].cameraZoom).toBeGreaterThan(0);
  }, 60000);

  it("gives face selection meshes in the shape's own coordinates", async () => {
    const moved = transformId("part", translation(500, 0, 0));
    const [plain, placed] = await Promise.all([
      pool.exec("generatePerFaceMeshes", [leaf("part"), context]),
      pool.exec("generatePerFaceMeshes", [leaf(moved), context]),
    ]);
    expect(placed[0].length).toBe(plain[0].length);
    expect(Array.from(placed[0][0].faces.vertices)).toEqual(
      Array.from(plain[0][0].faces.vertices),
    );
  }, 60000);

  it("sends sketches already in place", async () => {
    await putShape(
      context.project,
      "sketch",
      replicad.drawRectangle(10, 20).serialize(),
    );
    const moved = transformId("sketch", translation(50, 0, 0));
    const { mesh } = await pool.exec("generateDisplayMesh", [
      assembly(leaf("sketch", { dimension: "2D" }), leaf(moved, { dimension: "2D" })),
      context,
    ]);
    expect(mesh).toHaveLength(2);
    expect(mesh[1].transform).toBeUndefined();
    expect(mesh[1].faces).not.toBe(mesh[0].faces);
    const x = (m) => placedBox(m).getCenter(new Vector3()).x;
    expect(x(mesh[1]) - x(mesh[0])).toBeCloseTo(50, 3);
  }, 60000);

  it("meshes a rebuilt shape again once it forgets the project", async () => {
    const project = `${context.project}-rebuilt`;
    const show = async () =>
      (
        await pool.exec("generateDisplayMesh", [
          assembly(leaf("box")),
          { project },
        ])
      ).mesh[0];
    await putShape(project, "box", replicad.makeBox([0, 0, 0], [10, 10, 10]).serialize());
    expect(placedBox(await show()).max.x).toBeCloseTo(10, 3);

    await putShape(project, "box", replicad.makeBox([0, 0, 0], [20, 20, 20]).serialize());
    expect(placedBox(await show()).max.x).toBeCloseTo(10, 3);

    await pool.exec("forgetProject", [project]);
    expect(placedBox(await show()).max.x).toBeCloseTo(20, 3);
  }, 60000);
});

describe("buildDisplayGeometries", () => {
  const faces = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    triangles: new Uint32Array([0, 1, 2]),
    faceGroups: [{ start: 0, count: 3, faceId: 1 }],
  };
  const edges = {
    lines: new Float32Array([0, 0, 0, 1, 0, 0]),
    edgeGroups: [{ start: 0, count: 2, edgeId: 1 }],
  };
  const at = (x) => ({ position: [x, 0, 0], quaternion: [0, 0, 0, 1] });

  it("builds one geometry for parts that share a mesh", () => {
    const { parts, dispose } = buildDisplayGeometries([
      { faces, edges, color: "red" },
      { faces, edges, color: "blue", transform: at(5) },
      { faces: { ...faces }, edges, color: "green" },
    ]);
    expect(parts[1].body).toBe(parts[0].body);
    expect(parts[1].lines).toBe(parts[0].lines);
    expect(parts[2].body).not.toBe(parts[0].body);
    expect(parts[1].transform).toEqual(at(5));
    // Typed arrays are used without a copy
    expect(parts[0].body.getAttribute("position").array).toBe(faces.vertices);
    dispose();
  });

  it("accepts the plain arrays of an atom's meshOverride", () => {
    const { parts, dispose } = buildDisplayGeometries([
      {
        faces: {
          vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [],
          triangles: [0, 1, 2],
        },
        vertexColors: [1, 0, 0, 1, 0, 0, 1, 0, 0],
        color: "red",
      },
    ]);
    expect(parts[0].body.index.count).toBe(3);
    expect(parts[0].body.getAttribute("color").count).toBe(3);
    expect(parts[0].hasVertexColors).toBe(true);
    dispose();
  });
});

describe("estimateSize", () => {
  it("counts a mesh shared by several parts once", () => {
    const faces = { vertices: new Float32Array(300) };
    const one = estimateSize([{ faces }]);
    expect(estimateSize([{ faces }, { faces }, { faces }])).toBe(one);
  });
});
