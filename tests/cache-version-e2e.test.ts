import { describe, it, expect } from "vitest";
import {
  putShape,
  getShape,
  CACHE_VERSION,
  deleteProjectCache,
} from "../src/worker/indexeddbUtils";

describe("End-to-End Cache Versioning Validation", () => {
  const projectId = "e2e-version-test";
  
  it("should demonstrate complete version lifecycle", async () => {
    // Clean start
    await deleteProjectCache(projectId);
    
    // Step 1: Save a new geometry with current version
    const shapeKey = "test-geometry";
    const serializedData = "test-geometry-data";
    await putShape(projectId, shapeKey, serializedData, false);
    
    // Step 2: Verify it can be retrieved
    let retrieved = await getShape(projectId, shapeKey);
    expect(retrieved).toBeDefined();
    expect(retrieved?.version).toBe(CACHE_VERSION);
    expect(retrieved?.serialized).toBe(serializedData);
    console.log(`✓ Saved geometry with version ${CACHE_VERSION}`);
    
    // Step 3: Simulate an old version by manually inserting outdated data
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("AbundanceProjectCaches", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const oldShapeKey = "old-geometry";
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("shapes", "readwrite");
      const store = tx.objectStore("shapes");
      store.put({
        projectId: projectId,
        shapeKey: oldShapeKey,
        type: "ReplicadObject",
        serialized: "old-data",
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
    
    // Step 4: Verify old version is treated as cache miss
    retrieved = await getShape(projectId, oldShapeKey);
    expect(retrieved).toBeUndefined();
    console.log("✓ Old version geometry treated as cache miss");
    
    // Step 5: Verify current version still accessible
    retrieved = await getShape(projectId, shapeKey);
    expect(retrieved).toBeDefined();
    expect(retrieved?.version).toBe(CACHE_VERSION);
    console.log("✓ Current version geometry still accessible");
    
    // Clean up
    await deleteProjectCache(projectId);
    console.log("✓ Cache versioning lifecycle complete!");
  });
  
  it("should handle AbundanceObject versioning", async () => {
    await deleteProjectCache(projectId);
    
    // Save an AbundanceObject
    const assemblyData = JSON.stringify({
      geometry: [],
      plane: { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0] },
      dimension: "3D",
      color: "red",
      tags: [],
      bom: [],
    });
    
    await putShape(projectId, "assembly-1", assemblyData, true);
    
    // Retrieve and verify
    const retrieved = await getShape(projectId, "assembly-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.type).toBe("AbundanceObject");
    expect(retrieved?.version).toBe(CACHE_VERSION);
    console.log("✓ AbundanceObject saved with version");
    
    await deleteProjectCache(projectId);
  });
  
  it("should demonstrate version increment scenario", async () => {
    await deleteProjectCache(projectId);
    
    // Simulate scenario where we have shapes from "old" version
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("AbundanceProjectCaches", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    // Insert multiple shapes with old version
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("shapes", "readwrite");
      const store = tx.objectStore("shapes");
      
      for (let i = 0; i < 5; i++) {
        store.put({
          projectId: projectId,
          shapeKey: `shape-${i}`,
          type: "ReplicadObject",
          serialized: `data-${i}`,
          version: CACHE_VERSION - 1, // Simulating old version
        });
      }
      
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    
    console.log("✓ Inserted 5 shapes with old version");
    
    // All should be treated as cache misses
    for (let i = 0; i < 5; i++) {
      const retrieved = await getShape(projectId, `shape-${i}`);
      expect(retrieved).toBeUndefined();
    }
    
    console.log("✓ All old version shapes treated as cache misses");
    console.log("✓ This simulates what happens when CACHE_VERSION is incremented");
    
    await deleteProjectCache(projectId);
  });
});
