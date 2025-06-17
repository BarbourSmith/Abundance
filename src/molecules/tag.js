import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { button, LevaInputs } from "leva";

/**
 * This class creates the tag atom.
 */
export default class Tag extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    this.addIO("input", "geometry", this, "geometry", "", false, true);
    //this.addIO("input", "tag", this, "string", "Tag String");
    this.addIO("output", "geometry", this, "geometry", "");

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Tag";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Tag";
    /**
     * This atom's height as drawn on the screen
     */
    this.height;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Tags geometry so that it can be extracted later.";

    /** Array of tags for this atom */
    this.tags = [""];

    this.setValues(values);
  }

  /**
   * Draw the constant which is more rectangular than the regular shape.
   */
  draw() {
    super.draw("rect");

    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius * 1.3}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "@",
      GlobalVariables.widthToPixels(this.x - this.radius / 1.5),
      GlobalVariables.heightToPixels(this.y) + this.height / 1.5
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  checkHasTag() {
    return this.cutTag;
  }

  addTagsToAvailableTags() {
    let newProjectTags = Array.from(
      new Set(
        GlobalVariables.topLevelMolecule.projectAvailableTags.concat(this.tags)
      )
    );
    GlobalVariables.topLevelMolecule.projectAvailableTags = newProjectTags;
  }

  createLevaInputs() {
    let inputParams = {};

    inputParams[this.uniqueID + "custom_string"] = {
      value: this.tags[0],
      label: "Add Tag",
      disabled: false,
      onChange: (value) => {
        this.tags = [];
        this.tags.push(value); // Add the new tag to the array
        this.name = this.tags.toString();
        this.updateValue();
      },
    };

    return inputParams;
  }
  /**
   * Add a tag to the input geometry. The substance is not changed.
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var tags = this.tags;
      GlobalVariables.cad
        .tag(this.uniqueID, inputID, tags)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());
    }
  }
  /**
   * Send the value of this atom to the 3D display. Used to display the number
   */
  sendToRender() {
    // do nothing
    console.log("tag has nothing to render");
  }

  /**
   * Add the file name to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.tags = this.tags;

    return superSerialObject;
  }
}
