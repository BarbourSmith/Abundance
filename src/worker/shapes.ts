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
  console.log("[textGeom] START - text:", text, "fontSize:", fontSize, "fontFamily:", fontFamily);
  console.log("[textGeom] context:", JSON.stringify(context));
  
  await util.init();
  
  // Check if font exists and load it
  const fontData = Fonts[fontFamily as keyof typeof Fonts];
  if (!fontData) {
    const availableFonts = Object.keys(Fonts).join(", ");
    const errorMsg = `Font "${fontFamily}" is not available. Available fonts: ${availableFonts}`;
    console.error("[textGeom] ERROR:", errorMsg);
    throw new Error(errorMsg);
  }
  
  // Try to load font, but catch errors to provide better diagnostics
  try {
    console.log("[textGeom] Font data type:", typeof fontData, "length:", fontData?.length || "N/A");
    await util.replicad.loadFont(fontData, fontFamily);
    console.log("[textGeom] Font loaded successfully");
  } catch (error) {
    console.error("[textGeom] ERROR loading font:", error);
    console.error("[textGeom] Font family:", fontFamily);
    console.error("[textGeom] Fonts object keys:", Object.keys(Fonts));
    throw new Error(`Failed to load font ${fontFamily}: ${error.message}`);
  }
  
  // Handle empty string case
  if (!text || text.length === 0) {
    console.log("[textGeom] Empty string - returning empty geometry array");
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
    console.log("[textGeom] Single character - returning as leaf");
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
    console.log("[textGeom] Single char geometry:", singleCharGeometry);
    const result = {
      geometry: singleCharGeometry,
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
    console.log("[textGeom] Single char result:", JSON.stringify(result));
    return result;
  }
  
  console.log("[textGeom] Multiple characters - generating assembly");
  
  // To preserve exact font spacing, we need to determine where each letter
  // would naturally be positioned in the full text string.
  // We do this by generating progressive substrings and measuring their widths.
  console.log("[textGeom] Step 1: Calculating natural letter positions");
  
  const letterPositions: number[] = [];
  
  // For each letter, generate the text up to that point and measure its width
  // The position of letter i is the width of all previous letters
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
    const substringWidth = substringDrawing.boundingBox ? substringDrawing.boundingBox.width : i * fontSize * 0.6;
    letterPositions.push(substringWidth);
    console.log(`[textGeom] Position after '${substring}': ${substringWidth}`);
  }
  
  const totalWidth = letterPositions[text.length];
  console.log("[textGeom] Total text width:", totalWidth);
  
  // Create individual letter geometries at their natural positions
  const letterGeometries: AbundanceLeaf[] = [];
  console.log("[textGeom] Step 2: Creating individual letter geometries");
  
  // Position letters from right to left to compensate for rendering order reversal
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // The natural position of this letter (from left)
    const naturalX = letterPositions[i];
    // Convert to right-to-left positioning for rendering
    const charX = totalWidth - naturalX - (letterPositions[i + 1] - letterPositions[i]);
    
    console.log(`[textGeom] Letter ${i}: '${char}' at natural X=${naturalX}, render X=${charX}`);
    
    // Draw each character at its calculated position
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
    console.log(`[textGeom] Letter ${i} geometry ID:`, charGeometry);
    
    const letterLeaf = {
      geometry: charGeometry,
      dimension: "2D",
      tags: [],
      plane: util.XYPlane,
      color: util.defaultColor,
      bom: [],
    };
    console.log(`[textGeom] Letter ${i} leaf:`, JSON.stringify(letterLeaf));
    letterGeometries.push(letterLeaf);
  }
  
  console.log("[textGeom] Step 4: Creating assembly with", letterGeometries.length, "letters");
  console.log("[textGeom] Letter geometries array:", JSON.stringify(letterGeometries));
  
  // Return as a simple assembly without cutting behavior
  // We don't want letters to cut into each other - they should overlap naturally
  const result = {
    geometry: letterGeometries,
    dimension: "2D",
    tags: [],
    plane: util.XYPlane,
    color: util.defaultColor,
    bom: [],
  };
  
  console.log("[textGeom] Assembly result:", JSON.stringify(result));
  console.log("[textGeom] END - Success");
  return result;
}

export { circle, rectangle, regularPolygon, textGeom as text };
