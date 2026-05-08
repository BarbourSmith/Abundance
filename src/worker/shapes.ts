import Fonts from "../js/fonts.js";
import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";
import { RequestContext } from "./geometryProvider";

/**
 * Methods in this file create a new geometry from non-geometric inputs. Eg:
 * create a circle from a diameter. Almost all projects will start with
 * these methods.
 */

/**
 * Creates a circle geometry with the specified diameter and stores it in the library.
 * @param {number} diameter - The diameter of the circle
 * @returns Assembly containing a circle on the XY plane
 */
async function circle(
  diameter: number,
  context: RequestContext,
): Promise<AbundanceLeaf> {
  await util.init();
  return {
    geometry: await util.geometryProvider!.drawCircle(diameter / 2, context),
    dimension: "2D",
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
  };
}

/**
 * Creates a rectangle geometry with the specified dimensions and stores it in the library.
 * @param {number} x - The width of the rectangle
 * @param {number} y - The height of the rectangle
 * @returns Assembly containing a rectangle on the XY plane
 */
async function rectangle(
  x: number,
  y: number,
  context: RequestContext,
): Promise<AbundanceLeaf> {
  await util.init();
  return {
    geometry: await util.geometryProvider!.drawRectangle(x, y, context),
    dimension: "2D",
    plane: util.XYPlane,
    color: util.defaultColor,
    tags: [],
    bom: [],
  };
}

/**
 * Creates a regular polygon geometry with the specified radius and number of sides, and stores it in the library.
 * @param {number} radius - The radius of the polygon (distance from center to vertex)
 * @param {number} numberOfSides - The number of sides of the polygon
 * @returns Assembly containing a regular polygon on the XY plane
 */
async function regularPolygon(
  radius: number,
  numberOfSides: number,
  context: RequestContext,
): Promise<AbundanceLeaf> {
  if (numberOfSides < 3) {
    throw new Error("Number of sides must be at least 3 for a polygon.");
  }
  if (numberOfSides % 1.0 !== 0) {
    throw new Error("Number of sides must be an integer.");
  }
  await util.init();
  return {
    geometry: await util.geometryProvider!.drawPolysides(
      radius,
      numberOfSides,
      context,
    ),
    dimension: "2D",
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
  };
}

/**
 * Creates text geometry with each letter as a separate element in an assembly.
 * This prevents issues with overlapping letters in cursive fonts and allows proper handling
 * of each character independently.
 *
 * Spaces are handled specially: they don't create geometry but do affect the positioning
 * of subsequent characters.
 *
 * @param {string} text - The text content to be rendered
 * @param {number} fontSize - The size of the font
 * @param {string} fontFamily - The font family to use for rendering the text
 * @returns {Promise<AbundanceObject>} Promise of an Assembly containing one leaf per character
 * @throws {Error} Throws an error if the font fails to load
 */
async function textGeom(
  text: string,
  fontSize: number,
  fontFamily: string,
  context: RequestContext,
): Promise<AbundanceObject> {
  await util.init();
  await util.replicad.loadFont(
    Fonts[fontFamily as keyof typeof Fonts],
    fontFamily,
  );

  // Handle empty string - return empty assembly
  if (!text || text.length === 0) {
    return {
      geometry: [],
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
  }

  const textOptions = {
    startX: 0,
    startY: 0,
    fontSize: fontSize,
    fontFamily: fontFamily,
  };

  // Split text into individual characters (using Array.from for proper Unicode handling)
  const characters = Array.from(text);
  const letterGeometries: AbundanceLeaf[] = [];

  // Process each character
  // Note: This algorithm creates O(n²) geometry calls for n characters, but the
  // GeometryProvider caches all geometries, so we only compute each unique substring once.
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];

    // Skip spaces - they don't create geometry but affect positioning
    // The space is still included in the substring calculation (line below) so that
    // subsequent characters are positioned correctly with the space taken into account.
    if (char === " ") {
      continue;
    }

    // Generate substring from start to current position to get accurate bounding box
    const substring = text.substring(0, i + 1);

    // Create geometry for the substring to get its bounding box
    const substringGeomId = await util.geometryProvider!.drawText(
      substring,
      textOptions,
      context,
    );

    // Create geometry for just this single character at origin
    const singleCharGeomId = await util.geometryProvider!.drawText(
      char,
      textOptions,
      context,
    );

    // Get bounding boxes
    const substringGeom = await util.geometryProvider!.get(
      substringGeomId,
      context,
    );
    const singleCharGeom = await util.geometryProvider!.get(
      singleCharGeomId,
      context,
    );

    const substringBBox = substringGeom.boundingBox;
    const singleCharBBox = singleCharGeom.boundingBox;

    // Calculate the offset: move the character so its right edge aligns with the substring's right edge
    // The substring right edge is at bbox max x
    const substringRightEdge = substringBBox.bounds[1][0];
    const charRightEdge = singleCharBBox.bounds[1][0];

    // Calculate how much to move the character to the right
    const xOffset = substringRightEdge - charRightEdge;

    // Move the single character to its proper position
    const movedGeomId = await util.geometryProvider!.move(
      singleCharGeomId,
      xOffset,
      0,
      0,
      context,
    );

    letterGeometries.push({
      geometry: movedGeomId,
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    });
  }

  if (letterGeometries.length === 1) {
    // If there's only one character, return it directly as a leaf instead of an assembly
    return letterGeometries[0];
  } else {
    // Return as assembly (branch) with each letter as a separate leaf
    return {
      geometry: letterGeometries,
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
  }
}

export { circle, rectangle, regularPolygon, textGeom as text };
