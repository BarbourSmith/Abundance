import { describe, it, expect, beforeEach } from "vitest";
import {
  putShape,
  getShape,
  shapeExists,
  deleteProjectCache,
  deleteOutdatedProjectCache,
  CACHE_VERSION,
  StoredGeometryRecord,
} from "../src/worker/indexeddbUtils";

describe("Cache Version Management", () => {
  const testProjectId = "test-project-versioning";
  const testShapeKey = "test-shape-key";
  const testSerialized = "test-serialized-data";

  beforeEach(async () => {
    // Clean up before each test
    await deleteProjectCache(testProjectId);
  });

  it("should save shapes with current version number", async () => {
    // Save a shape
    await putShape(testProjectId, testShapeKey, testSerialized, false);

    // Retrieve it directly from IndexedDB (bypassing version checks)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("AbundanceProjectCaches", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const record = await new Promise<StoredGeometryRecord | undefined>(
      (resolve, reject) => {
        const tx = db.transaction("shapes", "readonly");
        const store = tx.objectStore("shapes");
        const req = store.get([testProjectId, testShapeKey]);
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      }
    );

    // Check that the version was saved
    expect(record).toBeDefined();
    expect(record?.version).toBe(CACHE_VERSION);
    expect(record?.serialized).toBe(testSerialized);
  });

  it("should retrieve shapes with current version", async () => {
    // Save a shape with current version
    await putShape(testProjectId, testShapeKey, testSerialized, false);

    // Retrieve it
    const shape = await getShape(testProjectId, testShapeKey);

    // Should be found
    expect(shape).toBeDefined();
    expect(shape?.serialized).toBe(testSerialized);
    expect(shape?.version).toBe(CACHE_VERSION);
  });

  it("should treat shapes without version as outdated", async () => {
    // Manually insert a shape without version
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("AbundanceProjectCaches", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("shapes", "readwrite");
      const store = tx.objectStore("shapes");
      store.put({
        projectId: testProjectId,
        shapeKey: testShapeKey,
        type: "ReplicadObject",
        serialized: testSerialized,
        // Note: no version field
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    // Try to retrieve it - should return undefined (treated as outdated)
    const shape = await getShape(testProjectId, testShapeKey);
    expect(shape).toBeUndefined();

    // shapeExists should also return false
    const exists = await shapeExists(testProjectId, testShapeKey);
    expect(exists).toBe(false);
  });

  it("should treat shapes with older version as outdated", async () => {
    // Manually insert a shape with old version
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("AbundanceProjectCaches", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("shapes", "readwrite");
      const store = tx.objectStore("shapes");
      store.put({
        projectId: testProjectId,
        shapeKey: testShapeKey,
        type: "ReplicadObject",
        serialized: testSerialized,
        version: CACHE_VERSION - 1, // Old version
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    // Try to retrieve it - should return undefined (treated as outdated)
    const shape = await getShape(testProjectId, testShapeKey);
    expect(shape).toBeUndefined();

    // shapeExists should also return false
    const exists = await shapeExists(testProjectId, testShapeKey);
    expect(exists).toBe(false);
  });

  it("should delete outdated cache entries", async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("AbundanceProjectCaches", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Insert some shapes with different versions
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("shapes", "readwrite");
      const store = tx.objectStore("shapes");
      
      // Old version
      store.put({
        projectId: testProjectId,
        shapeKey: "shape1",
        type: "ReplicadObject",
        serialized: "data1",
        version: CACHE_VERSION - 1,
      });
      
      // No version
      store.put({
        projectId: testProjectId,
        shapeKey: "shape2",
        type: "ReplicadObject",
        serialized: "data2",
      });
      
      // Current version
      store.put({
        projectId: testProjectId,
        shapeKey: "shape3",
        type: "ReplicadObject",
        serialized: "data3",
        version: CACHE_VERSION,
      });
      
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    // Delete outdated entries
    const deletedCount = await deleteOutdatedProjectCache(testProjectId);
    
    // Should have deleted 2 entries (old version and no version)
    expect(deletedCount).toBe(2);

    // Current version should still exist
    const shape3 = await getShape(testProjectId, "shape3");
    expect(shape3).toBeDefined();
    expect(shape3?.serialized).toBe("data3");
  });

  it("should handle AbundanceObject type with versioning", async () => {
    const abundanceData = JSON.stringify({ type: "assembly", parts: [] });
    
    // Save an AbundanceObject
    await putShape(testProjectId, testShapeKey, abundanceData, true);

    // Retrieve it
    const shape = await getShape(testProjectId, testShapeKey);

    // Should be found with correct type and version
    expect(shape).toBeDefined();
    expect(shape?.type).toBe("AbundanceObject");
    expect(shape?.version).toBe(CACHE_VERSION);
    expect(shape?.serialized).toBe(abundanceData);
  });
});
