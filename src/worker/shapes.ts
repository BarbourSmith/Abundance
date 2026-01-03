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
 * Each character is treated as a separate element in an assembly to avoid issues with overlapping letters in cursive fonts.
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
  
  // Check if font exists and load it
  const fontData = Fonts[fontFamily as keyof typeof Fonts];
  if (!fontData) {
    const availableFonts = Object.keys(Fonts).join(", ");
    throw new Error(`Font "${fontFamily}" is not available. Available fonts: ${availableFonts}`);
  }
  
  await util.replicad.loadFont(fontData, fontFamily);
  
  // Handle empty string case
  if (!text || text.length === 0) {
    return {
      geometry: [],
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
  }
  
  // For single character, return as a leaf (no assembly needed)
  if (text.length === 1) {
    const singleCharGeometry = await util.geometryProvider!.drawText(
      text,
      {
        startX: 0,
        startY: 0,
        fontSize: fontSize,
        fontFamily: fontFamily,
      },
      context
    );
    return {
      geometry: singleCharGeometry,
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
  }
  
  console.log(`[textGeom] Creating text assembly: "${text}" (${text.length} chars)`);
  
  // To preserve exact font spacing, we need to determine where each letter
  // would naturally be positioned in the full text string.
  // We do this by generating progressive substrings and measuring their widths.
  
  const letterPositions: number[] = [];
  
  // For each letter, generate the text up to that point and measure its xMax
  // The position of letter i is where substring[0..i] ends
  for (let i = 0; i <= text.length; i++) {
    const substring = text.substring(0, i);
    if (i === 0) {
      letterPositions.push(0);
      continue;
    }
    
    const substringGeometry = await util.geometryProvider!.drawText(
      substring,
      {
        startX: 0,
        startY: 0,
        fontSize: fontSize,
        fontFamily: fontFamily,
      },
      context
    );
    const substringDrawing = await util.geometryProvider!.get(substringGeometry, context);
    
    // Calculate the rightmost extent (xMax) which tells us where the text ends
    // This accounts for all font rendering including kerning and letter spacing
    let substringEndX: number;
    if (substringDrawing.boundingBox) {
      const xMin = substringDrawing.boundingBox.center[0] - substringDrawing.boundingBox.width / 2;
      const xMax = substringDrawing.boundingBox.center[0] + substringDrawing.boundingBox.width / 2;
      // Use xMax as the end position - this is where the next letter would start
      substringEndX = xMax;
      console.log(`[textGeom] Position[${i}] '${substring}': xMin=${xMin.toFixed(2)}, xMax=${xMax.toFixed(2)}, center=${substringDrawing.boundingBox.center[0].toFixed(2)}, width=${substringDrawing.boundingBox.width.toFixed(2)}`);
    } else {
      substringEndX = i * fontSize * 0.6;
      console.log(`[textGeom] Position[${i}] '${substring}': NO BBOX, using estimate=${substringEndX.toFixed(2)}`);
    }
    letterPositions.push(substringEndX);
  }
  
  const totalWidth = letterPositions[text.length];
  console.log(`[textGeom] Positions:`, letterPositions.map((p, i) => `[${i}]=${p.toFixed(2)}`).join(' '));
  
  // Create individual letter geometries at their natural positions
  const letterGeometries: AbundanceLeaf[] = [];
  
  // Position letters from right to left to compensate for rendering order
  // Use the natural letter positions from progressive substring measurement
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const naturalEndX = letterPositions[i + 1];
    
    // Transform to right-to-left: total width - ending position of this letter
    const charX = totalWidth - naturalEndX;
    
    console.log(`[textGeom] Letter[${i}] '${char}': X=${charX.toFixed(2)}`);
    
    // Draw each character at its transformed position
    const charGeometry = await util.geometryProvider!.drawText(
      char,
      {
        startX: charX,
        startY: 0,
        fontSize: fontSize,
        fontFamily: fontFamily,
      },
      context
    );
    
    const letterLeaf = {
      geometry: charGeometry,
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
    letterGeometries.push(letterLeaf);
  }
  
  console.log("[textGeom] Created assembly with", letterGeometries.length, "letters");
  console.log("[textGeom] END - Success");
  
  // Return as a simple assembly without cutting behavior
  // We don't want letters to cut into each other - they should overlap naturally
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
