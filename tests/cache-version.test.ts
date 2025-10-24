import { describe, it, expect, beforeEach } from "vitest";
import {
  putShape,
  getShape,
  deleteProjectCache,
  getProjectVersion,
  setProjectVersion,
  isProjectVersionCurrent,
  ensureProjectVersionCurrent,
  CACHE_VERSION,
} from "../src/worker/indexeddbUtils";

describe("Project-Level Cache Version Management", () => {
  const testProjectId = "test-project-versioning";
  const testShapeKey = "test-shape-key";
  const testSerialized = "test-serialized-data";

  beforeEach(async () => {
    // Clean up before each test
    await deleteProjectCache(testProjectId);
  });

  it("should get undefined version for new project", async () => {
    const version = await getProjectVersion(testProjectId);
    expect(version).toBeUndefined();
  });

  it("should set and get project version", async () => {
    await setProjectVersion(testProjectId, CACHE_VERSION);
    const version = await getProjectVersion(testProjectId);
    expect(version).toBe(CACHE_VERSION);
  });

  it("should report project as not current when version is missing", async () => {
    const isCurrent = await isProjectVersionCurrent(testProjectId);
    expect(isCurrent).toBe(false);
  });

  it("should report project as not current when version is outdated", async () => {
    await setProjectVersion(testProjectId, CACHE_VERSION - 1);
    const isCurrent = await isProjectVersionCurrent(testProjectId);
    expect(isCurrent).toBe(false);
  });

  it("should report project as current when version matches", async () => {
    await setProjectVersion(testProjectId, CACHE_VERSION);
    const isCurrent = await isProjectVersionCurrent(testProjectId);
    expect(isCurrent).toBe(true);
  });

  it("should evict entire project cache when version is outdated", async () => {
    // Create some shapes with old version
    await putShape(testProjectId, "shape1", "data1", false);
    await putShape(testProjectId, "shape2", "data2", false);
    await putShape(testProjectId, "shape3", "data3", false);
    await setProjectVersion(testProjectId, CACHE_VERSION - 1);

    // Verify shapes exist
    let shape1 = await getShape(testProjectId, "shape1");
    expect(shape1).toBeDefined();

    // Ensure version is current (should evict all)
    const wasEvicted = await ensureProjectVersionCurrent(testProjectId);
    expect(wasEvicted).toBe(true);

    // Verify all shapes are gone
    shape1 = await getShape(testProjectId, "shape1");
    const shape2 = await getShape(testProjectId, "shape2");
    const shape3 = await getShape(testProjectId, "shape3");
    expect(shape1).toBeUndefined();
    expect(shape2).toBeUndefined();
    expect(shape3).toBeUndefined();

    // Verify version is now current
    const version = await getProjectVersion(testProjectId);
    expect(version).toBe(CACHE_VERSION);
  });

  it("should not evict cache when version is already current", async () => {
    // Create shapes and set current version
    await putShape(testProjectId, "shape1", "data1", false);
    await setProjectVersion(testProjectId, CACHE_VERSION);

    // Ensure version is current (should NOT evict)
    const wasEvicted = await ensureProjectVersionCurrent(testProjectId);
    expect(wasEvicted).toBe(false);

    // Verify shape still exists
    const shape1 = await getShape(testProjectId, "shape1");
    expect(shape1).toBeDefined();
  });

  it("should evict all shapes when project has no version", async () => {
    // Create shapes without setting version (simulates old data)
    await putShape(testProjectId, "shape1", "data1", false);
    await putShape(testProjectId, "shape2", "data2", false);

    // Project should not have a version
    const versionBefore = await getProjectVersion(testProjectId);
    expect(versionBefore).toBeUndefined();

    // Ensure version is current (should evict all)
    const wasEvicted = await ensureProjectVersionCurrent(testProjectId);
    expect(wasEvicted).toBe(true);

    // Verify all shapes are gone
    const shape1 = await getShape(testProjectId, "shape1");
    const shape2 = await getShape(testProjectId, "shape2");
    expect(shape1).toBeUndefined();
    expect(shape2).toBeUndefined();

    // Verify version is now set
    const versionAfter = await getProjectVersion(testProjectId);
    expect(versionAfter).toBe(CACHE_VERSION);
  });

  it("should handle multiple projects independently", async () => {
    const project1 = "project1";
    const project2 = "project2";

    // Clean up
    await deleteProjectCache(project1);
    await deleteProjectCache(project2);

    // Set different versions for two projects
    await putShape(project1, "shape1", "data1", false);
    await setProjectVersion(project1, CACHE_VERSION);

    await putShape(project2, "shape2", "data2", false);
    await setProjectVersion(project2, CACHE_VERSION - 1);

    // Ensure version for project1 (should NOT evict)
    const wasEvicted1 = await ensureProjectVersionCurrent(project1);
    expect(wasEvicted1).toBe(false);

    // Ensure version for project2 (should evict)
    const wasEvicted2 = await ensureProjectVersionCurrent(project2);
    expect(wasEvicted2).toBe(true);

    // Verify project1 shape still exists
    const shape1 = await getShape(project1, "shape1");
    expect(shape1).toBeDefined();

    // Verify project2 shape was evicted
    const shape2 = await getShape(project2, "shape2");
    expect(shape2).toBeUndefined();

    // Clean up
    await deleteProjectCache(project1);
    await deleteProjectCache(project2);
  });
});
