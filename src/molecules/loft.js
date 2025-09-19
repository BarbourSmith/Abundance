import Atom from "../prototypes/atom.js";
import {
  addOrDeletePorts,
  inputsReadyIgnoringFreeAP,
  initializeInputsFromSaved,
} from "../js/alwaysOneFreeInput.js";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the loft atom.
 */
export default class Loft extends Atom {
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
    this.name = "Loft";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Loft";
    /**
     * A list of all of the inputs to this molecule. May be passed to the constructor and loaded.
     * @type {array}
     */
    this.ioValues = [];
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Joins two or more shapes into a single solid by filling in the space between them.";

    /**
     * This was used when there was a drop down to select closed...may be deleted
     * @type {number}
     */
    this.closedSelection = 0;
    /**
     * I believe this is no longer used alzatin - is that right?
     * @type {boolean}
     */
    this.addedIO = false;

    this.setValues(values);
    //Initialize an appropriate number of input APs based on saved ioValues
    initializeInputsFromSaved(this, this.ioValues);

    this.setValues([]);
  }

  /**
   * Draw the translate icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    // Center in pixel space
    const centerX = GlobalVariables.widthToPixels(this.x);
    const centerY = GlobalVariables.heightToPixels(this.y);
    const circleOffset = GlobalVariables.widthToPixels(this.radius / 4);
    const circleRadius = GlobalVariables.widthToPixels(this.radius / 2.5);

    // Right circle
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      centerX + circleOffset,
      centerY,
      circleRadius,
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();

    // Left circle
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      centerX - circleOffset,
      centerY,
      circleRadius,
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();

    // Rectangle centered between the two circles
    const rectSize = GlobalVariables.widthToPixels(this.radius / 2);
    const rectX = centerX - rectSize / 2;
    const rectY = centerY - rectSize / 2;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.rect(rectX, rectY, rectSize, rectSize);
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  inputsAreReady() {
    return inputsReadyIgnoringFreeAP(this);
  }

  compute(inputs) {
    addOrDeletePorts(this); // clean up ports then check if we're in a ready state.
    // Preserve input order.
    const nonnullInputIds = this.inputs
      .filter((io) => io.connectors.length > 0)
      .map((io) => inputs[io.name])
      .filter(Boolean);

    return GlobalVariables.cad.loftShapes(nonnullInputIds, this.getContext());
  }

  /**
   * Add the names of the inputs to the saved object so that they can be loaded later
   */
  serialize(savedObject) {
    var thisAsObject = super.serialize(savedObject);

    var ioValues = [];
    this.inputs.forEach((io) => {
      if (io.type == "input") {
        var saveIO = {
          name: io.name,
          ioValue: io.getValue(),
        };
        ioValues.push(saveIO);
      }
    });

    ioValues.forEach((ioValue) => {
      thisAsObject.ioValues.push(ioValue);
    });

    //Write the selection for if the chain is closed
    thisAsObject.closedSelection = this.closedSelection;

    return thisAsObject;
  }
}
