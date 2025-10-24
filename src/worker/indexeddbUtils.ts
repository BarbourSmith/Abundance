/**
 * IndexedDB utilities for caching geometry and Abundance objects.
 * 
 * CACHE VERSIONING SYSTEM:
 * ------------------------
 * Each project has a single version number (CACHE_VERSION) that tracks the format
 * of serialized data. This allows the system to automatically invalidate outdated
 * cache entries when the serialization format or geometry computation changes.
 * 
 * How it works:
 * - Each project stores its version as a metadata record with shapeKey "__version__"
 * - When a project is first accessed, its version is checked against CACHE_VERSION
 * - If the project version is outdated or missing, ALL shapes in that project are evicted
 * - Operations then proceed as cache misses, rebuilding the cache with the new version
 * 
 * To invalidate all existing caches:
 * - Increment CACHE_VERSION constant below
 * - All projects with older versions will have their entire cache evicted
 * - This happens automatically on first access to each project
 * 
 * This ensures users don't get errors from incompatible cached data after updates.
 */

export type StoredGeometryRecord = {
  projectId: string;
  shapeKey: string;
  type: "ReplicadObject" | "AbundanceObject";
  serialized: string; // Your serialized data
};

const DB_NAME = "AbundanceProjectCaches";
const DB_VERSION = 2;
const STORE_NAME = "shapes";
const VERSION_KEY = "__version__"; // Special key for storing project version

// Current cache format version - increment this when making breaking changes
// to the serialization format or geometry computation
export const CACHE_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, {
        keyPath: ["projectId", "shapeKey"],
      });
      store.createIndex("projectId", "projectId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Returns a Set of all distinct projectIds present in the IndexedDB shapes store.
 */
export async function getAllProjectIds(): Promise<Set<string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("projectId");
    const projectIds = new Set<string>();
    const req = index.openKeyCursor();

    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        projectIds.add(cursor.key as string);
        cursor.continue();
      } else {
        db.close();
        resolve(projectIds);
      }
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function putShape(
  projectId: string,
  shapeKey: string,
  serializedShape: string,
  isAbundanceObject: boolean = false
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      projectId: projectId,
      shapeKey: shapeKey,
      type: isAbundanceObject ? "AbundanceObject" : "ReplicadObject",
      serialized: serializedShape,
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
}

export async function getShape(
  projectId: string,
  shapeKey: string
): Promise<StoredGeometryRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get([projectId, shapeKey]);
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Deletes a single shape from the IndexedDB cache for a given project and shapeKey.
 * @param projectId - The project ID
 * @param shapeKey - The shape key (ID)
 */
export async function deleteShape(
  projectId: string,
  shapeKey: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete([projectId, shapeKey]);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function shapeExists(
  projectId: string,
  shapeKey: string
): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.count([projectId, shapeKey]);
    req.onsuccess = () => {
      db.close();
      resolve(req.result > 0);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteProjectCache(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("projectId");
    const request = index.openKeyCursor(IDBKeyRange.only(projectId));
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        store.delete(cursor.primaryKey as [string, string]);
        cursor.continue();
      } else {
        db.close();
        resolve();
      }
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Gets the cache version for a project.
 * Returns undefined if the project has no version set (i.e., created before versioning).
 */
export async function getProjectVersion(projectId: string): Promise<number | undefined> {
  const versionRecord = await getShape(projectId, VERSION_KEY);
  if (versionRecord) {
    return parseInt(versionRecord.serialized, 10);
  }
  return undefined;
}

/**
 * Sets the cache version for a project.
 */
export async function setProjectVersion(projectId: string, version: number): Promise<void> {
  await putShape(projectId, VERSION_KEY, version.toString(), false);
}

/**
 * Checks if a project's cache version is current.
 * Returns true if version matches CACHE_VERSION, false otherwise.
 */
export async function isProjectVersionCurrent(projectId: string): Promise<boolean> {
  const projectVersion = await getProjectVersion(projectId);
  return projectVersion === CACHE_VERSION;
}

/**
 * Ensures a project's cache is valid. If the project has an outdated version
 * or no version, all cache entries for that project are evicted and the version
 * is updated to the current CACHE_VERSION.
 * 
 * This should be called when a project is first accessed (e.g., in updateLRU).
 * Returns true if the cache was evicted, false if it was already current.
 */
export async function ensureProjectVersionCurrent(projectId: string): Promise<boolean> {
  const isCurrent = await isProjectVersionCurrent(projectId);
  
  if (!isCurrent) {
    console.log(`Project ${projectId} has outdated cache version, evicting all entries`);
    await deleteProjectCache(projectId);
    await setProjectVersion(projectId, CACHE_VERSION);
    return true; // Cache was evicted
  }
  
  return false; // Cache was already current
}
