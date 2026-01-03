import Fonts from "../js/fonts.js";
import * as util from "./util";
import { AbundanceLeaf, AbundanceObject } from "./util";
import { RequestContext } from "./geometryProvider";

// Average character width as a ratio of fontSize when bounding box is not available
const AVERAGE_CHAR_WIDTH_RATIO = 0.6;

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
  context: RequestContext
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
  context: RequestContext
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
  context: RequestContext
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
      context
    ),
    dimension: "2D",
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
  };
}

/**
 * Creates text geometry with the specified text, font size, and font family, and stores it in the library.
 * @param {string} text - The text content to be rendered
 * @param {number} fontSize - The size of the font
 * @param {string} fontFamily - The font family to use for rendering the text
 * @returns {Promise<AbundanceObject>} Promise of an Assembly containing individual letter geometries on the XY plane
 * @throws {Error} Throws an error if the font fails to load
 */
async function textGeom(
  text: string,
  fontSize: number,
  fontFamily: string,
  context: RequestContext
): Promise<AbundanceObject> {
  await util.init();
  await util.replicad.loadFont(
    Fonts[fontFamily as keyof typeof Fonts],
    fontFamily
  );
  
  // Handle empty string case
  if (text.length === 0) {
    return {
      geometry: [],
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
  }
  
  // Create an array to hold each letter's geometry
  const letterGeometries: AbundanceLeaf[] = [];
  let currentX = 0;
  
  // Process each character individually
  // Note: We draw each letter at origin and translate them to avoid issues with batch operations
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Draw the individual character at origin (0, 0)
    const charGeometry = await util.geometryProvider!.drawText(
      char,
      {
        startX: 0,
        startY: 0,
        fontSize: fontSize,
        fontFamily: fontFamily,
      },
      context
    );
    
    // Get the bounding box to determine character width
    const drawing = await util.geometryProvider!.get(charGeometry, context);
    let charWidth = fontSize * AVERAGE_CHAR_WIDTH_RATIO; // fallback
    if (drawing && drawing.boundingBox) {
      charWidth = drawing.boundingBox.width;
    }
    
    // Translate the character to its position if needed
    let finalGeometry = charGeometry;
    if (currentX !== 0) {
      finalGeometry = await util.geometryProvider!.move(
        charGeometry,
        currentX,
        0,
        0,
        context
      );
    }
    
    // Create a leaf geometry for this character
    letterGeometries.push({
      geometry: finalGeometry,
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    });
    
    // Update position for next character
    currentX += charWidth;
  }
  
  // Return as an assembly (branch) with array of letter geometries
  return {
    geometry: letterGeometries,
    dimension: "2D",
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
  };
}

export { circle, rectangle, regularPolygon, textGeom as text };
