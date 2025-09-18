import { AbundanceLeaf, AbundanceObject, actOnLeafsSync, isLeaf } from "./util";

/**
 * Methods in this file act on the metadata of a geometry or assembly,
 * either adding new metadata properties or filtering by existing ones.
 */

/**
 * Return a copy of `geom` with the specified tag(s)
 */
function tag(geom: AbundanceObject, TAG: string[]): AbundanceObject {
  return {
    ...geom,
    tags: [...new Set([...geom.tags, ...TAG])],
  };
}

/**
 * Return a copy of `geom` with the specified color.
 * @note If the color is "#D9544D", a "keepout" tag is automatically added to the geometry
 */
function color(geom: AbundanceObject, color: string): AbundanceObject {
  return actOnLeafsSync(geom, (leaf: AbundanceLeaf) => {
    // keep out color add tag
    if (color == "#D9544D") {
      leaf.tags.push("keepout");
    }
    return {
      ...leaf,
      color: color,
      tags: [...new Set(leaf.tags)],
    };
  });
}

/**
 * Return new assembly with BOM attached.
 */
function bom(geom: AbundanceObject, BOM: string): AbundanceObject {
  return {
    ...geom,
    bom: [...(geom.bom || []), BOM],
  };
}

/**
 * Gets bom list for the given assembly
 */
function extractBomList(assembly: AbundanceObject): string[] {
  const bomList: string[] = [];
  walkAssembly(assembly, (leaf: AbundanceObject) => {
    if (leaf.bom !== undefined) {
      bomList.push(...leaf.bom);
    }
  });
  return bomList;
}

/**
 * Extracts and returns all assembly components with the given tag.
 */
function extractTag(geometry: AbundanceObject, TAG: string): AbundanceObject {
  const result = filterAssembly(geometry, (leaf) => leaf.tags.includes(TAG));
  if (result === undefined) {
    throw new Error("Tag not found");
  }
  return result;
}

/**
 * List all tags in the given assembly.
 */
function extractAllTags(geom: AbundanceObject): string[] {
  const tags: string[] = [];
  walkAssembly(geom, (leaf) => {
    tags.push(...(leaf.tags || []));
  });

  return ["Select Tag", ...new Set(tags)];
}

/**
 * Recursively extracts geometry that does NOT have "keepout" tags from an assembly or single geometry.
 * @param {Object} inputGeometry - The geometry object to filter keepout tags from
 * @returns {Object|boolean} The geometry without keepout tags, or false if all geometry has keepout tags
 */
function extractKeepOut(
  inputGeometry: AbundanceObject
): AbundanceObject | false {
  // Keepout is "strong" in that a branch with keepout removes all it's children.
  if (inputGeometry.tags.includes("keepout")) {
    return false;
  } else if (isLeaf(inputGeometry)) {
    return inputGeometry;
  } else {
    // We're on a branch which isn't tagged keepout. check the children. Drop this
    // branch if all children are keepout.
    const filteredChildren = (inputGeometry.geometry as AbundanceObject[])
      .map((child) => extractKeepOut(child))
      .filter((child) => child !== false);
    if (filteredChildren.length === 0) {
      return false;
    } else {
      return {
        ...inputGeometry,
        geometry: filteredChildren,
      };
    }
  }
}

///// Helper functions /////

/**
 * Calls action on every Branch and Leaf of assembly. Assembly is not modified.
 */
function walkAssembly(
  assembly: AbundanceObject,
  action: (leaf: AbundanceObject) => void
) {
  action(assembly);
  if (!isLeaf(assembly)) {
    (assembly.geometry as AbundanceObject[]).forEach((child) => {
      walkAssembly(child, action);
    });
  }
}

/**
 * Filters assembly to only those branches or leafs where predicate(node) is true.
 *
 * If a branch matches the predicate then all its children are included
 * even if those leafs don't themselves match the predicate.
 */
function filterAssembly(
  assembly: AbundanceObject,
  predicate: (leaf: AbundanceObject) => boolean
): AbundanceObject | undefined {
  if (predicate(assembly)) {
    return assembly;
  }
  if (isLeaf(assembly)) {
    return undefined;
  }
  const filteredChildren = (assembly.geometry as AbundanceObject[])
    .map((child) => filterAssembly(child, predicate))
    .filter((child) => child !== undefined);

  if (filteredChildren.length > 0) {
    return {
      ...assembly,
      geometry: filteredChildren,
    };
  } else {
    return undefined;
  }
}

export {
  bom, color, extractAllTags, extractBomList,
  extractKeepOut, extractTag, tag
};
