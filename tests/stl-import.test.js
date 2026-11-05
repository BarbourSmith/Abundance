// STL import through replicad. Uses the real OpenCascade WASM.
import * as replicad from "replicad";
import { importingSTL, readSTLAsSolid } from "../src/worker/worker.ts";
import { init } from "../src/worker/util.ts";
import stlText from "./fixtures/tapered-tray-ascii.stl?raw";

describe("importingSTL", () => {
  beforeAll(async () => {
    await init();
  });

  it("imports a closed ASCII STL as a 3D solid", async () => {
    const file = new File([stlText], "tapered-tray.stl");
    const result = await importingSTL(file, { project: "test" });
    expect(result.dimension).toBe("3D");
    expect(result.geometry).toBeTruthy();
  });

  // The STL reader in replicad-opencascadejs 1.0 returns loose triangles,
  // which replicad.importSTL can't cast to a shell. They must be sewn.
  it("sews the triangles into one solid with coplanar faces merged", async () => {
    const shape = await readSTLAsSolid(new Blob([stlText]));
    expect(shape).toBeInstanceOf(replicad.Solid);
    // 4 tapered sides + top + bottom once coplanar triangles merge
    expect(shape.faces).toHaveLength(6);
    const [min, max] = shape.boundingBox.bounds;
    expect(min[0]).toBeCloseTo(-2.5, 5);
    expect(max[1]).toBeCloseTo(3.5, 5);
    expect(max[2]).toBeCloseTo(2, 5);
    // Frustum between a 4x5 base at z=0 and a 5x7 top at z=2
    const a1 = 20,
      a2 = 35,
      h = 2;
    const expected = (h / 6) * (a1 + a2 + 4 * (4.5 * 6));
    expect(replicad.measureVolume(shape)).toBeCloseTo(expected, 4);
  });

  it("reads binary STL files too", async () => {
    // Re-encode the ASCII fixture's triangles as a binary STL
    const facets = [...stlText.matchAll(/outer loop([\s\S]*?)endloop/g)].map(
      (m) => [...m[1].matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)],
    );
    const buffer = new ArrayBuffer(84 + facets.length * 50);
    const view = new DataView(buffer);
    view.setUint32(80, facets.length, true);
    facets.forEach((vertices, i) => {
      let offset = 84 + i * 50 + 12; // skip the normal
      for (const v of vertices) {
        for (const n of v.slice(1, 4)) {
          view.setFloat32(offset, Number(n), true);
          offset += 4;
        }
      }
    });
    const shape = await readSTLAsSolid(new Blob([buffer]));
    expect(shape).toBeInstanceOf(replicad.Solid);
    expect(shape.faces).toHaveLength(6);
  });
});
