export type StoredGeometryRecord = {
  projectId: string;
  shapeKey: string;
  type: "ReplicadObject" | "AbundanceObject";
  serialized: string; // Your serialized data
  version?: number; // Cache format version
};

const DB_NAME = "AbundanceProjectCaches";
const DB_VERSION = 2;
const STORE_NAME = "shapes";

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
      const record = req.result as StoredGeometryRecord | undefined;
      
      // If record exists but has no version or an outdated version, treat it as missing
      if (record && (record.version === undefined || record.version < CACHE_VERSION)) {
        console.log(`Cache entry for ${projectId}/${shapeKey} has outdated version ${record.version}, treating as cache miss`);
        resolve(undefined);
      } else {
        resolve(record);
      }
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
    const req = store.get([projectId, shapeKey]);
    req.onsuccess = () => {
      db.close();
      const record = req.result as StoredGeometryRecord | undefined;
      
      // Only consider the shape to exist if it has the current version
      if (record && (record.version === undefined || record.version < CACHE_VERSION)) {
        console.log(`Cache entry for ${projectId}/${shapeKey} has outdated version ${record.version}, treating as non-existent`);
        resolve(false);
      } else {
        resolve(!!record);
      }
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
 * Deletes all cache entries for a project that have outdated versions.
 * This is useful for cleaning up after a version upgrade.
 */
export async function deleteOutdatedProjectCache(projectId: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("projectId");
    const request = index.openCursor(IDBKeyRange.only(projectId));
    let deletedCount = 0;
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value as StoredGeometryRecord;
        if (record.version === undefined || record.version < CACHE_VERSION) {
          store.delete(cursor.primaryKey as [string, string]);
          deletedCount++;
        }
        cursor.continue();
      } else {
        db.close();
        resolve(deletedCount);
      }
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
