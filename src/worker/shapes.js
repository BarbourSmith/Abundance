import * as util from "./util.ts";
import Fonts from "../js/fonts.js";
import { Plane } from "replicad";

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
function circle(diameter) {
  return {
    geometry: [util.geometryProvider.drawCircle(diameter / 2)],
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
function rectangle(x, y) {
  return {
    geometry: util.geometryProvider.drawRectangle(x, y)._value,
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
function regularPolygon(radius, numberOfSides) {
  if (numberOfSides < 3) {
    throw new Error("Number of sides must be at least 3 for a polygon.");
  }
  if (numberOfSides % 1.0 !== 0) {
    throw new Error("Number of sides must be an integer.");
  }
  return {
    geometry: [util.geometryProvider.drawPolysides(radius, numberOfSides)],
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
 * @returns {Promise<Object>} Promise of an Assembly containing text geometry on the XY plane
 * @throws {Error} Throws an error if the font fails to load
 */
async function text(text, fontSize, fontFamily) {
  return util.replicad
    .loadFont(Fonts[fontFamily])
    .then(() => {
      const textGeometry = util.geometryProvider.drawText(text, {
        startX: 0,
        startY: 0,
        fontSize: fontSize,
        font: fontFamily,
      });
      return {
        geometry: textGeometry,
        tags: [],
        plane: util.XYPlane,
        color: util.defaultColor,
        bom: [],
      };
    })
    .catch((err) => {
      throw new Error("Error loading font: ", err);
    });
}

/**
 * Copies a geometry from one library location to another, typically used for molecule connections.
 * @param {string} targetID - The unique identifier to store the molecule geometry in the library
 * @param {string} inputID - The library ID of the geometry to copy for the molecule
 * @returns {Promise<boolean>} A promise that resolves to true when the molecule operation is completed successfully
 * @throws {Error} Throws an error if the output ID is undefined
 */
function molecule(targetID, inputID) {
  return started.then(() => {
    if (library[inputID] != undefined) {
      library[targetID] = library[inputID];
    } else {
      throw new Error("output ID is undefined");
    }
    return true;
  });
}

export { circle, rectangle, regularPolygon, text, molecule };
