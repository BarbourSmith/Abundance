/**
 * Three-way merge of Abundance project files (project.abundance).
 *
 * Git merges project.abundance line by line, so two unrelated edits on nearby
 * lines conflict. This merges the JSON structurally instead: atoms are matched
 * by uniqueID, inputs by name, and connectors by their endpoints. A conflict is
 * only reported when the same value was changed differently on both sides.
 */

const ID_FIELDS = ["uniqueID", "ap1ID", "ap2ID"];

// Structural keys left out of the conflict labels shown to users
const UNLABELED_KEYS = ["allAtoms", "allConnectors", "ioValues", "ioValue"];

// An atom's position in the node editor. Moving the same atom on both sides
// doesn't change the design, so it isn't a conflict: head's position wins.
const LAYOUT_KEYS = ["x", "y"];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** JSON.stringify with sorted keys, so key order doesn't affect equality */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

const deepEqual = (a, b) => stableStringify(a) === stableStringify(b);

/** Identity of an array element, or null if it has none */
function elementKey(item) {
  if (!isPlainObject(item)) return null;
  if (item.uniqueID !== undefined) return `id:${item.uniqueID}`;
  if (item.ap1ID !== undefined && item.ap2ID !== undefined) {
    return `connector:${stableStringify(item)}`;
  }
  if (typeof item.name === "string") return `name:${item.name}`;
  return null;
}

/** Map of key -> element, or null if the array can't be merged by key */
function keyArray(array) {
  if (array === undefined) return new Map();
  if (!Array.isArray(array)) return null;
  const map = new Map();
  for (const item of array) {
    const key = elementKey(item);
    if (key === null || map.has(key)) return null;
    map.set(key, item);
  }
  return map;
}

function elementLabel(item, key) {
  if (!isPlainObject(item)) return key;
  if (item.ap1ID !== undefined) {
    return `connection ${item.ap1ID} → ${item.ap2ID} (${item.ap2Name})`;
  }
  if (item.name && item.atomType && item.name !== item.atomType) {
    return `${item.name} (${item.atomType})`;
  }
  return item.name || item.atomType || key;
}

function merge3(base, main, head, path, labels, context) {
  if (deepEqual(main, head)) return main;
  if (deepEqual(base, main)) return head;
  if (deepEqual(base, head)) return main;

  if (isPlainObject(main) && isPlainObject(head)) {
    const baseObject = isPlainObject(base) ? base : {};
    const result = {};
    const keys = [...Object.keys(main)];
    for (const key of Object.keys(head)) {
      if (!keys.includes(key)) keys.push(key);
    }
    const isAtom = "atomType" in main || "atomType" in head;
    for (const key of keys) {
      const value =
        isAtom && LAYOUT_KEYS.includes(key)
          ? deepEqual(baseObject[key], head[key])
            ? main[key]
            : head[key]
          : merge3(
              baseObject[key],
              main[key],
              head[key],
              [...path, key],
              UNLABELED_KEYS.includes(key) ? labels : [...labels, key],
              context,
            );
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  if (Array.isArray(main) && Array.isArray(head)) {
    const baseMap = keyArray(Array.isArray(base) ? base : undefined);
    const mainMap = keyArray(main);
    const headMap = keyArray(head);
    if (baseMap && mainMap && headMap) {
      const keys = [...mainMap.keys()];
      for (const key of headMap.keys()) {
        if (!mainMap.has(key)) keys.push(key);
      }
      const result = [];
      for (const key of keys) {
        const item = mainMap.get(key) ?? headMap.get(key) ?? baseMap.get(key);
        const value = merge3(
          baseMap.get(key),
          mainMap.get(key),
          headMap.get(key),
          [...path, key],
          [...labels, elementLabel(item, key)],
          context,
        );
        if (value !== undefined) result.push(value);
      }
      return result;
    }
  }

  // Changed differently on both sides
  const id = path.join("/");
  context.conflicts.push({ id, label: labels.join(" › "), base, main, head });
  return context.resolutions[id] === "main" ? main : head;
}

/** Applies fn to every atom ID reference in a project, recursively */
function visitIdFields(node, fn) {
  if (Array.isArray(node)) {
    node.forEach((item) => visitIdFields(item, fn));
  } else if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (ID_FIELDS.includes(key) && typeof value === "string") {
        node[key] = fn(value);
      } else {
        visitIdFields(value, fn);
      }
    }
  }
}

/** Map of uniqueID -> object for every object with a uniqueID */
function collectIds(node, map = new Map()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectIds(item, map));
  } else if (isPlainObject(node)) {
    if (typeof node.uniqueID === "string") map.set(node.uniqueID, node);
    Object.values(node).forEach((value) => collectIds(value, map));
  }
  return map;
}

const idNumber = (id) => {
  const match = /^id-(\d+)$/.exec(id);
  return match ? parseInt(match[1], 10) : 0;
};

/**
 * IDs come from a counter, so both sides can create different atoms with the
 * same ID. Renumbers those atoms on the head side so they don't get mixed up.
 * Returns a renumbered copy of head.
 */
function renumberCollidingIds(base, main, head) {
  const baseIds = collectIds(base);
  const mainIds = collectIds(main);
  const headIds = collectIds(head);

  let nextId =
    Math.max(
      0,
      ...[...baseIds.keys(), ...mainIds.keys(), ...headIds.keys()].map(
        idNumber,
      ),
    ) + 1;

  const remap = new Map();
  for (const [id, headObject] of headIds) {
    if (baseIds.has(id) || !mainIds.has(id)) continue;
    if (deepEqual(mainIds.get(id), headObject)) continue;
    remap.set(id, `id-${nextId++}`);
  }
  if (remap.size === 0) return head;

  const renumbered = structuredClone(head);
  visitIdFields(renumbered, (id) => remap.get(id) ?? id);
  return renumbered;
}

/**
 * Removes connectors left pointing at an atom that the merge deleted
 * (one side deleted the atom while the other wired something to it).
 */
function dropDanglingConnectors(node, deletedIds) {
  if (Array.isArray(node)) {
    node.forEach((item) => dropDanglingConnectors(item, deletedIds));
  } else if (isPlainObject(node)) {
    if (Array.isArray(node.allConnectors)) {
      node.allConnectors = node.allConnectors.filter(
        (connector) =>
          !deletedIds.has(connector.ap1ID) && !deletedIds.has(connector.ap2ID),
      );
    }
    Object.values(node).forEach((value) =>
      dropDanglingConnectors(value, deletedIds),
    );
  }
}

/**
 * Removes input values' currentEquation when it is just a number. Saves add and
 * drop these copies, and loading ignores them (see Atom.deserialize), so they
 * would otherwise look like edits.
 */
function dropNumericEquations(node) {
  if (Array.isArray(node)) {
    node.forEach(dropNumericEquations);
  } else if (isPlainObject(node)) {
    if (
      "ioValue" in node &&
      "currentEquation" in node &&
      Number.isFinite(Number(node.currentEquation))
    ) {
      delete node.currentEquation;
    }
    Object.values(node).forEach(dropNumericEquations);
  }
}

const normalize = (project) => {
  if (project === undefined) return undefined;
  const copy = structuredClone(project);
  dropNumericEquations(copy);
  return copy;
};

/**
 * Three-way merges project.abundance JSON.
 *
 * @param {object|undefined} base - Project at the merge base (undefined if the file is new on both sides)
 * @param {object} main - Project on the branch being merged into
 * @param {object} head - Project on the branch being merged
 * @param {object} [resolutions] - Conflict id -> "main" | "head". Unresolved conflicts take head's value.
 * @returns {{merged: object, conflicts: Array<{id, label, base, main, head}>}}
 */
export function mergeProjects(base, main, head, resolutions = {}) {
  base = normalize(base);
  main = normalize(main);
  head = normalize(head);
  const renumberedHead = renumberCollidingIds(base, main, head);
  const context = { conflicts: [], resolutions };
  const merged = merge3(base, main, renumberedHead, [], [], context);

  const mergedIds = collectIds(merged);
  const deletedIds = new Set(
    [
      ...collectIds(base).keys(),
      ...collectIds(main).keys(),
      ...collectIds(renumberedHead).keys(),
    ].filter((id) => !mergedIds.has(id)),
  );
  dropDanglingConnectors(merged, deletedIds);

  return { merged, conflicts: context.conflicts };
}

/** Short display text for one side of a conflict */
export function describeConflictValue(value) {
  if (value === undefined) return "(deleted)";
  if (value === null || typeof value !== "object") return String(value);
  return "(changed)";
}
