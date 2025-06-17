import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { BOMEntry } from "../js/BOM.js";
import { re } from "mathjs";

/**
 * The addBOMTag molecule type adds a tag containing information about a bill of materials item to the input geometry. The input geometry is not modified in any other way
 */
export default class AddBOMTag extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Add BOM Tag";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "addBOMTag";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Add BOM Tag";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Adds a Bill Of Materials tag which appears in molecules containing this atom and in the GitHub project bill of materials.";

    /**
     * The BOM item object created by this atom
     * @type {string}
     */
    this.BOMitem = new BOMEntry();
    /**
     * This atom's radius as displayed on the screen is 1/65 width
     * @type {number}
     */
    this.radius = 1 / 65;
    /**
     * This atom's height as drawn on the screen
     */
    this.height;

    this.addIO("input", "geometry", this, "geometry", null, false, true);
    this.addIO("output", "geometry", this, "geometry", null);

    this.setValues(values);
  }

  /**
   * Set the value to be the BOMitem
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      var inputID = this.findIOValue("geometry");
      var bomItem = this.BOMitem;

      GlobalVariables.cad
        .bom(this.uniqueID, inputID, bomItem)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Draw the constant which is more rectangular than the regular shape.
   */
  draw() {
    super.draw("rect");

    let pixelsX = GlobalVariables.widthToPixels(this.x);
    let pixelsY = GlobalVariables.heightToPixels(this.y);
    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);

    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = pixelsRadius / 1.3;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius / 1.5}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      String.fromCharCode(0x0024, 0x0024, 0x0024),
      pixelsX - pixelsRadius / 2,
      pixelsY + this.height / 3
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  /** Leva inputs for bom  */
  createLevaInputs() {
    let bomParams = {};
    for (const key in this.BOMitem) {
      bomParams[key] = {
        value: this.BOMitem[key],
        label: key,
        disabled: false,
        onChange: (value) => {
          this.BOMitem[key] = value;
          this.updateValue();
        },
      };
    }
    return bomParams;
  }

  /**
   * Add the bom item to the saved object
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);

    valuesObj.BOMitem = Object.assign({}, this.BOMitem); //Makes a shallow copy to prevent issues when copy pasting

    return valuesObj;
  }
}
