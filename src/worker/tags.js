import { isAssembly, actOnLeafs } from "./util";

/**
 * Methods in this file act on the metadata of a geometry or assembly,
 * either adding new metadata properties or filtering by existing ones.
 */

/**
 * Return a copy of `geom` with the specified tag(s)
 */
function tag(geom, TAG) {
  return {
    geometry: geom.geometry,
    bom: geom.bom,
    tags: [...TAG, ...geom.tags],
    color: geom.color,
    plane: geom.plane,
  };
}

/**
 * Return a copy of `geom` with the specified color.
 * @note If the color is "#D9544D", a "keepout" tag is automatically added to the geometry
 */
function color(geom, color) {
  return actOnLeafs(geom, (leaf) => {
    // keep out color add tag
    if (color == "#D9544D") {
      leaf.tags.push("keepout");
    }
    return {
      geometry: leaf.geometry,
      tags: [...leaf.tags],
      color: color,
      bom: leaf.bom,
      plane: leaf.plane,
    };
  });
}

/**
 * Return new assembly with BOM attached.
 */
function bom(geom, BOM) {
  if (geom.bom != []) {
    BOM = [...geom.bom, BOM];
  }
  // TODO(tristan): this drops "plane"
  return {
    geometry: geom.geometry,
    tags: [...geom.tags],
    bom: BOM,
    color: geom.color,
  };
}

/**
 * Gets bom list for the given assembly
 */
function extractBomList(assembly) {
  if (assembly.bom !== undefined) {
    return assembly.bom;
  } else {
    // TODO(tristan): shouldn't this walk the assembly tree? Shouldn't our default be an empty list?
    return false;
  }
}

/**
 * Extracts and returns all assembly components with the given tag.
 */
function extractTag(geometry, TAG) {
  let taggedGeometry = extractTags(geometry, TAG);
  if (taggedGeometry != false) {
    return {
      bom: taggedGeometry.bom,
      geometry: taggedGeometry.geometry,
      tags: taggedGeometry.tags,
      color: taggedGeometry.color,
    };
  } else {
    throw new Error("Tag not found");
  }
}

/**
 * List all tags in the given assembly.
 */
function extractAllTags(geom) {
  // Recursive helper function to collect tags
  function collectTags(geometry) {
    let tags = new Set(geometry.tags || []); // Use a Set to ensure uniqueness

    // If the geometry is an assembly, recursively collect tags from subassemblies
    if (isAssembly(geometry)) {
      geometry.geometry.forEach((subAssembly) => {
        const subTags = collectTags(subAssembly);
        subTags.forEach((tag) => tags.add(tag)); // Add tags from subassemblies
      });
    }

    return tags;
  }

  const allTags = collectTags(geom);
  let returningArray = Array.from(allTags); // Convert the Set to an array

  returningArray = ["Select Tag", ...new Set(returningArray)];
  return returningArray;
}

///// Helper functions /////

// Recursively extract geometries with the specified tag.
function extractTags(inputGeometry, TAG) {
  // TODO(tristan): this destroys the "plane" property.
  if (inputGeometry.tags.includes(TAG)) {
    return inputGeometry;
  } else if (isAssembly(inputGeometry)) {
    let geometryWithTags = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedGeometry = extractTags(subAssembly, TAG);

      if (extractedGeometry != false) {
        geometryWithTags.push(extractedGeometry);
      }
    });
    if (geometryWithTags.length > 0) {
      return {
        geometry: geometryWithTags,
        tags: inputGeometry.tags,
        color: inputGeometry.color,
        bom: inputGeometry.bom,
      };
    } else {
      return false;
    }
  } else {
    return false;
  }
}

/**
 * Recursively extracts geometry that does NOT have "keepout" tags from an assembly or single geometry.
 * @param {Object} inputGeometry - The geometry object to filter keepout tags from
 * @returns {Object|boolean} The geometry without keepout tags, or false if all geometry has keepout tags
 */
function extractKeepOut(inputGeometry) {
  if (inputGeometry.tags.includes("keepout")) {
    return false;
  } else if (isAssembly(inputGeometry)) {
    let geometryNoKeepOut = [];
    inputGeometry.geometry.forEach((subAssembly) => {
      let extractedGeometry = extractKeepOut(subAssembly, "keepout");

      if (extractedGeometry != false) {
        geometryNoKeepOut.push(extractedGeometry);
      }
    });
    if (geometryNoKeepOut.length > 0) {
      let thethingtoreturn = {
        geometry: geometryNoKeepOut,
        tags: inputGeometry.tags,
        color: inputGeometry.color,
        bom: inputGeometry.bom,
      };
      return thethingtoreturn;
    } else {
      return false;
    }
  } else {
    return inputGeometry;
  }
}

export {
  extractAllTags,
  tag,
  color,
  bom,
  extractTag,
  extractBomList,
  extractKeepOut,
};
