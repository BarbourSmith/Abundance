// Recompute Project rebuilds a project's stored shapes, and a shape that was
// stored broken can come back different under the same id. The mesh worker,
// the 3D view and the editor's geometry check all remember shapes by id, so
// recompute has to make them forget the project's shapes too.
//
// Run: npx vitest run --config=vitest.headless.config.ts tests/recompute-forgets-geometry.test.js

import { describe, expect, it, vi } from "vitest";
import * as replicad from "replicad";
import * as workerpool from "workerpool";
import MeshWorkerURL from "../src/worker/meshWorker.ts?url&worker";
import { init, XYPlane } from "../src/worker/util.ts";
import { putShape } from "../src/worker/indexeddbUtils.ts";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { MeshLruCache } from "../src/js/displayScheduler.js";
import {
  checkAtomGeometry,
  forgetGeometryChecks,
} from "../src/js/geometryCheck.js";

const leaf = (id) => ({
  geometry: id,
  dimension: "3D",
  plane: XYPlane,
  color: "#aad7f2",
  tags: [],
  bom: [],
});

describe("the mesh worker", () => {
  it("serves a rebuilt shape once it forgets the project", async () => {
    await init();
    const pool = workerpool.pool(MeshWorkerURL, {
      maxWorkers: 1,
      workerOpts: { type: "module" },
    });
    const context = { project: `forget-mesh-${Date.now()}` };
    const volume = async () => {
      const report = await pool.exec("inspectParts", [
        leaf("part"),
        context,
        { minFeature: 0.25, budgetMs: 10000 },
      ]);
      return report.parts[0].volume;
    };
    try {
      const small = replicad.makeBox([0, 0, 0], [10, 10, 10]);
      await putShape(context.project, "part", small.serialize());
      expect(await volume()).toBe(1000);

      const large = replicad.makeBox([0, 0, 0], [20, 20, 20]);
      await putShape(context.project, "part", large.serialize());
      expect(await volume()).toBe(1000);

      await pool.exec("forgetProject", [context.project]);
      expect(await volume()).toBe(8000);
    } finally {
      await pool.terminate();
    }
  }, 60000);
});

describe("the geometry check", () => {
  /** An atom that made the part `id`. */
  function atomThatMade(id, project) {
    const value = leaf(id);
    return {
      value,
      inputs: [],
      warning: null,
      getContext: () => ({ project }),
      setGeometryWarning(message) {
        this.warning = message;
      },
    };
  }

  // Checks run one after another; forgetting another project waits for them.
  const checksDone = () => forgetGeometryChecks("no-such-project");

  it("checks a part again once it forgets the project", async () => {
    const project = `forget-checks-${Date.now()}`;
    let invalid = ["part"];
    const findInvalidParts = vi.fn(async (ids) => ({
      checked: ids,
      invalid: ids.filter((id) => invalid.includes(id)),
    }));
    GlobalVariables.pool = { proxy: async () => ({ findInvalidParts }) };

    const broken = atomThatMade("part", project);
    checkAtomGeometry(broken, broken.value);
    await checksDone();
    expect(broken.warning).toMatch(/Broken geometry/);

    // Rebuilt valid under the same id
    invalid = [];
    await forgetGeometryChecks(project);
    const rebuilt = atomThatMade("part", project);
    checkAtomGeometry(rebuilt, rebuilt.value);
    await checksDone();
    expect(findInvalidParts).toHaveBeenCalledTimes(2);
    expect(rebuilt.warning).toBeNull();
  });
});

describe("Recompute Project", () => {
  it("clears the cached shapes after the stored ones", async () => {
    const canvas = document.createElement("canvas");
    GlobalVariables.canvas = { current: canvas };
    GlobalVariables.c = canvas.getContext("2d");
    GlobalVariables.writeToDisplay = () => {};
    GlobalVariables.undoCommandStack = [];
    GlobalVariables.undoCaptureStack = null;
    GlobalVariables.currentAWSnode = { owner: "tester", repoName: "Proj" };
    const top = new Molecule({
      x: 0.5,
      y: 0.5,
      parent: null,
      uniqueID: GlobalVariables.generateUniqueID(),
      topLevel: true,
    });
    GlobalVariables.topLevelMolecule = top;
    GlobalVariables.currentMolecule = top;

    const calls = [];
    const realCad = GlobalVariables.cad;
    GlobalVariables.cad = {
      clearCache: vi.fn(async () => {
        calls.push("clearCache");
        return true;
      }),
    };
    GlobalVariables.pool = {
      exec: vi.fn(async (method) => {
        calls.push(method);
      }),
    };
    const meshes = new MeshLruCache();
    meshes.set("generateDisplayMesh|mesh", { faces: [] });
    GlobalVariables.displayScheduler = { cache: meshes };

    try {
      await top.recomputeAll(
        () => {},
        () => {},
      );
    } finally {
      GlobalVariables.cad = realCad;
    }

    expect(calls).toEqual(["clearCache", "forgetProject"]);
    expect(GlobalVariables.pool.exec).toHaveBeenCalledWith("forgetProject", [
      top.getContext().project,
    ]);
    expect(meshes.size).toBe(0);
  });
});
