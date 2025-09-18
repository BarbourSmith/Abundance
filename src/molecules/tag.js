import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";

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

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

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

  createInputParams() {
    let inputParams = {};

    inputParams[this.uniqueID + "custom_string"] = {
      type: "string",
      value: this.tags[0],
      label: "Add Tag",
      disabled: false,
      onChange: (value) => {
        const newVal = [value];
        if (this.name !== newVal.toString()) {
          this.tags = newVal;
          this.name = newVal.toString();
          this.onUpstreamChange();
        }
      },
    };

    return inputParams;
  }
  /**
   * Add a tag to the input geometry. The substance is not changed.
   */
  /**
   * Compute the tagged geometry.
   */
  compute(inputs) {
    const inputID = inputs.geometry;
    const tags = this.tags;
    return GlobalVariables.cad.tag(inputID, tags);
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
