// Regression tests for GeometryProvider batch-operation concurrency.
//
// Many identical sub-assemblies (e.g. repeated bolts) hash to the SAME
// content-based batch id and get dispatched concurrently. Previously the
// second concurrent `startBatchOperation` for an in-flight id threw
// "Batch operation with id ... already exists", cascading the whole branch
// to error/upstream_error. These tests verify that concurrent identical
// batches now share the first one's result, and that a failed batch lets a
// later caller retry cleanly.

import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests exercise only the batch bookkeeping (no geometry), so stub the
// heavy replicad packages to keep the module loadable in a plain node env.
vi.mock("replicad-shrink-wrap", () => ({ default: () => {} }));
vi.mock("replicad", () => ({
  GCWithScope: () => () => {},
  measureVolume: () => 0,
}));

// In-memory stand-in for the IndexedDB shape store so we don't need a browser
// or WASM. Keyed by `${projectId}::${shapeKey}`.
const { store } = vi.hoisted(() => ({ store: new Map() }));

vi.mock("../src/worker/indexeddbUtils", () => ({
  getShape: async (projectId, shapeKey) =>
    store.get(`${projectId}::${shapeKey}`),
  putShape: async (
    projectId,
    shapeKey,
    serialized,
    isAbundanceObject = false,
  ) => {
    store.set(`${projectId}::${shapeKey}`, {
      projectId,
      shapeKey,
      type: isAbundanceObject ? "AbundanceObject" : "ReplicadObject",
      serialized,
    });
  },
  shapeExists: async (projectId, shapeKey) =>
    store.has(`${projectId}::${shapeKey}`),
  getBinary: async () => undefined,
  putBinary: async () => {},
  getPairCache: async () => undefined,
  putPairCache: async () => {},
  deleteProjectCache: async () => {},
  getAllProjectIds: async () => [],
  filter: async () => {},
}));

import { GeometryProvider } from "../src/worker/geometryProvider";

describe("GeometryProvider batch-operation concurrency", () => {
  let gp;
  const context = { project: "test" };

  beforeEach(() => {
    store.clear();
    gp = new GeometryProvider(false);
  });

  it("shares a result between concurrent identical batches instead of throwing", async () => {
    const result = { __cached: true, geometry: [] };

    // Kick off two identical batches concurrently. The first wins and returns
    // a fresh RequestContext; the second must wait (not throw).
    const p1 = gp.startBatchOperation(context, "same-hash", true);
    const p2 = gp.startBatchOperation(context, "same-hash", true);

    const b1 = await p1;
    expect(b1.operationId).toBe("batch-same-hash");
    expect(b1).not.toHaveProperty("__cached");

    // p2 should still be pending until the first batch ends.
    await gp.endBatchOperation(b1, result);

    const b2 = await p2;
    // The second caller reuses the first batch's cached assembly.
    expect(b2).toMatchObject({ __cached: true });
    expect(b2).not.toHaveProperty("operationId");
  });

  it("lets a later caller retry after a failed batch (no stuck 'already exists')", async () => {
    const b1 = await gp.startBatchOperation(context, "fail-hash", true);
    expect(b1.operationId).toBe("batch-fail-hash");

    // Simulate a failed batch: cleanup without caching any result.
    gp.cleanupBatchWithoutCaching(b1);

    // A subsequent start must NOT throw and must hand back a fresh context.
    const b2 = await gp.startBatchOperation(context, "fail-hash", true);
    expect(b2.operationId).toBe("batch-fail-hash");
    expect(b2).not.toHaveProperty("__cached");
  });

  it("re-runs the batch when the in-flight one fails without caching", async () => {
    const p1 = gp.startBatchOperation(context, "race-fail", true);
    const p2 = gp.startBatchOperation(context, "race-fail", true);

    const b1 = await p1;
    expect(b1.operationId).toBe("batch-race-fail");

    // First batch fails -> nothing cached. The waiting second caller should
    // fall through and run the batch itself rather than getting a stale error.
    gp.cleanupBatchWithoutCaching(b1);

    const b2 = await p2;
    expect(b2.operationId).toBe("batch-race-fail");
    expect(b2).not.toHaveProperty("__cached");
  });

  it("lets several waiters re-run a failed batch one at a time", async () => {
    // Identical code atoms (e.g. copies of one GitHub molecule given the same
    // inputs) share a batch id. When the first run failed, every waiter woke
    // at once: the first restarted the batch and the rest threw "already
    // exists", hiding the real error.
    const p1 = gp.startBatchOperation(context, "multi-fail", true);
    const p2 = gp.startBatchOperation(context, "multi-fail", true);
    const p3 = gp.startBatchOperation(context, "multi-fail", true);

    const b1 = await p1;
    gp.cleanupBatchWithoutCaching(b1);

    // Exactly one waiter re-runs it; the other keeps waiting.
    const second = await Promise.race([p2, p3]);
    expect(second.operationId).toBe("batch-multi-fail");
    const other =
      second === (await Promise.race([p2, Promise.resolve(null)])) ? p3 : p2;
    let otherSettled = false;
    other.then(() => (otherSettled = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(otherSettled).toBe(false);

    // The re-run fails too, so the last waiter runs it as well.
    gp.cleanupBatchWithoutCaching(second);
    const third = await other;
    expect(third.operationId).toBe("batch-multi-fail");
    expect(third).not.toHaveProperty("__cached");
  });

  it("hands the re-run's result to the remaining waiters", async () => {
    const result = { __cached: true, geometry: [] };
    const p1 = gp.startBatchOperation(context, "multi-retry", true);
    const p2 = gp.startBatchOperation(context, "multi-retry", true);
    const p3 = gp.startBatchOperation(context, "multi-retry", true);

    const b1 = await p1;
    gp.cleanupBatchWithoutCaching(b1);

    const second = await Promise.race([p2, p3]);
    expect(second.operationId).toBe("batch-multi-retry");
    await gp.endBatchOperation(second, result);

    const [r2, r3] = await Promise.all([p2, p3]);
    const cachedOne = r2 === second ? r3 : r2;
    expect(cachedOne).toMatchObject({ __cached: true });
    expect(cachedOne).not.toHaveProperty("operationId");
  });

  it("returns the cached assembly immediately on a warm second call", async () => {
    const result = { __cached: true, geometry: [] };
    const b1 = await gp.startBatchOperation(context, "warm-hash", true);
    await gp.endBatchOperation(b1, result);

    // Now the assembly is persisted; a fresh start should short-circuit.
    const cached = await gp.startBatchOperation(context, "warm-hash", true);
    expect(cached).toMatchObject({ __cached: true });
    expect(cached).not.toHaveProperty("operationId");
  });
});
