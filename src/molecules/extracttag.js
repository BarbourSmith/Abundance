import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";

/**
 * The cut away tag adds a tag to a part indicating that it should be cut away from the rest of the model in the next assembly. Essentially it creates a negitive version of itself.
 */
export default class ExtractTag extends Atom {
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
    this.atomType = "Extract Tag";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "extractTag";
    /**
     * This atom's height as drawn on the screen
     */
    this.height;
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Extract Tag";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Extracts geometry containing the specified tag.";

    this.addIO("input", "geometry", this, "geometry", null, false, true);
    this.addIO("output", "geometry", this, "geometry", null);

    /** Index for initial tag dropdown
     * @type {number}
     */
    this.tagIndex = 0;

    /** Selected Tag
     * @type {string}
     */
    this.tag;

    this.setValues(values);
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
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      String.fromCharCode(0x2191, 0x0040, 0x2191),
      pixelsX - pixelsRadius / 1,
      pixelsY + this.height / 2
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  createLevaInputs() {
    let inputParams = {};
    const tagOptions = GlobalVariables.topLevelMolecule.tagDictionary;

    // Create an array from the values in tagDictionary while keeping track of the key
    const tagArray = Object.values(tagOptions).map((value) => {
      return value;
    });
    inputParams[this.uniqueID + "tag_ops"] = {
      value: tagArray[this.tagIndex],
      options: tagArray,
      label: "Extract Tag",
      onChange: (value) => {
        this.tagIndex = tagArray.indexOf(value);
        if (this.tag != tagArray[this.tagIndex]) {
          this.tag = tagArray[this.tagIndex];
          this.updateValue();
          //this.sendToRender();
        }
      },
    };
    return inputParams;
  }

  /**
   * Adds the cutAway tag to the part
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var tag = this.tag;
      GlobalVariables.cad
        .extractTag(this.uniqueID, inputID, tag)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Keeps track of tag to be extracted
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.tag = this.tag;
    superSerialObject.tagIndex = this.tagIndex;

    return superSerialObject;
  }
}
