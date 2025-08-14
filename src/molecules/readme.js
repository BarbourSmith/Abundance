import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { e, re } from "mathjs";

/**
 * This class creates the readme atom.
 */
export default class Readme extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's name
     * @type {string}
     */
    this.atomType = "Readme";
    /**
     * The text to appear in the README file
     * @type {string}
     */
    this.readMeText = "Readme text here";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "readme";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "README";
    /**
     * This atom's radius...probably inherited and can be deleted
     * @type {number}
     */
    this.radius = 1 / 100;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "A place to put project notes. These will appear in the GitHub readme and in the description of molecules up the chain. Markdown is supported. ";

    /**
     * This atom's height as drawn on the screen
     */
    this.height = 10;

    /**
     * Should this atom contribute to the molecule level readme
     */
    this.global = true;

    this.addAllIOs([
      {
        name: "geometry",
        valueType: "geometry",
      },
    ]);
    this.setValues(values);
  }

  /**
   * Draw the readme atom with // icon.
   */
  draw() {
    super.draw("square");

    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius * 2.5}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "\u2263",
      GlobalVariables.widthToPixels(this.x - this.radius / 1.5),
      GlobalVariables.heightToPixels(this.y) + this.height / 1.5
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  setReady(newText) {
    this.readMeText = newText;
    super.setReady(newText);
  }

  /**
   * Creates the Leva input for this atom
   */
  createLevaInputs() {
    let inputParams = {};

    inputParams[this.name + this.uniqueID] = {
      value: this.readMeText,
      label: this.name,
      rows: 10,
      onChange: (value) => {
        if (this.readMeText !== value) {
          this.setReady(value);
        }
      },
    };
    return inputParams;
  }

  async generateProjectThumbnail() {
    let thumb = this.findIOValue("geometry");
    //Generate a thumbnail for the project
    if (thumb !== undefined) {
      return GlobalVariables.cad.generateThumbnail(thumb);
    } else {
      return null;
    }
  }

  /**
   * Provides this molecules contribution to the global Readme
   */
  async requestReadme() {
    if (this.global) {
      return this.generateProjectThumbnail()
        .then((res) => {
          if (res !== null) {
            return {
              readMeText: this.readMeText,
              svg: res,
              uniqueID: this.uniqueID,
            };
          } else {
            return {
              readMeText: this.readMeText,
              svg: null,
              uniqueID: this.uniqueID,
            };
          }
        })
        .catch((error) => {
          console.log(error);
        });
    } else {
      return [];
    }
  }

  /**
   * This atom has no output, but compute must still be defined.
   */
  compute(inputs) {
    return Promise.resolve(this.readMeText);
  }

  /**
   * Add the readme text to the information saved for this atom
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);

    valuesObj.readMeText = this.readMeText;
    valuesObj.global = this.global;

    return valuesObj;
  }
}
