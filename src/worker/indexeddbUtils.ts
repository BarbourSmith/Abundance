export type DataType = "ReplicadObject" | "AbundanceObject";
export type StoredGeometryRecord = {
  projectId: string;
  shapeKey: string;
  type: DataType;
  serialized: string; // Your serialized data
};

const DB_NAME = "AbundanceProjectCaches";
const DB_VERSION = 3;
const STORE_NAME = "shapes";

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
      store.createIndex("projectIdAndType", ["projectId", "type"], {
        unique: false,
      });
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
  isAbundanceObject: boolean = false,
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
  shapeKey: string,
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
  shapeKey: string,
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
  shapeKey: string,
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

/**
 * Filter entries in a project based on the given predicate. Predicate returns false
 * to remove an entry, true to retain.
 *
 * @param projectId within which entries will be filtered
 * @param type DataType to filter, either "ReplicadObject" or "AbundanceObject", not both.
 * @param predicate function which takes the shapeKey. Return true to retain
 *     this entry, false to delete. If includeValues is true, the value will also be provided
 *     to the predicate.
 * @param includeValues if true, the value will be fetched and provided to the predicate.
 *     WARNING: includeValues=true will be ~4x slower than includeValues=false.
 * @returns async - the number of deleted entries
 */
export async function filter(
  projectId: string,
  type: DataType,
  predicate: (shapeKey: string, value?: StoredGeometryRecord) => boolean,
  includeValues: boolean = false,
): Promise<number> {
  const startTime = performance.now();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("projectIdAndType");
    // Performance note: using openKeyCursor is more efficient than openCursor when we only need keys
    // Empirically, similar batch deletes using openCursor and cursor.delete took about 4x longer.
    // This is likely due to the large size of our serialized data blobs.

    const indexer = IDBKeyRange.only([projectId, type]);
    const request = includeValues
      ? index.openCursor(indexer)
      : index.openKeyCursor(indexer);

    let deletedCount = 0;
    let retained = 0;
    request.onsuccess = (event) => {
      const cursor = (
        event.target as IDBRequest<IDBCursorWithValue | IDBCursor>
      ).result;
      if (cursor) {
        const entryKey = cursor.primaryKey as [string, string];
        const retain = includeValues
          ? predicate(entryKey[1], (cursor as IDBCursorWithValue).value)
          : predicate(entryKey[1]);
        if (!retain) {
          if (includeValues) {
            cursor.delete();
          } else {
            store.delete(cursor.primaryKey as [string, string]);
          }
          deletedCount++;
        } else {
          retained++;
        }
        cursor.continue();
      } else {
        console.debug(
          `Deleted ${deletedCount} shapes from project ${projectId}. retained ${retained}. took ${
            performance.now() - startTime
          } ms.`,
        );
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

export async function deleteProjectCache(projectId: string): Promise<void> {
  await filter(projectId, "ReplicadObject", () => false, false);
  await filter(projectId, "AbundanceObject", () => false, false);
  return;
}
