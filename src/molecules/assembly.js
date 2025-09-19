import Atom from "../prototypes/atom.js";
import {
  addOrDeletePorts,
  inputsReadyIgnoringFreeAP,
  initializeInputsFromSaved,
} from "../js/alwaysOneFreeInput.js";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the Assembly atom instance.
 */
export default class Assembly extends Atom {
  /**
   * Creates a new assembly atom.
   * @param {object} values - An object of values. Each of these values will be applied to the resulting atom.
   */
  constructor(values) {
    super(values);

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Assembly";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Assembly";
    /**
     * A list of all of the inputs to this molecule. May be loaded when the molecule is created.
     * @type {array}
     */
    this.ioValues = [];
    /**
     * A flag to determine if cutaway geometry is removed....not used anymore?
     * @type {boolean}
     */
    this.removeCutawayGeometry = true;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Pick between assembly and fusion to join input geometries. Assembly takes multiple shapes together into one, shapes higher in the inputs list will cut into shapes lower on the input list where they overlap. Fusion takes all shapes or sketches and fuses them permanently into a single shape";

    this.setValues(values);

    //Initialize an appropriate number of input APs based on saved ioValues
    initializeInputsFromSaved(this, this.ioValues);

    this.setValues([]);
  }

  /**
   * Draw the join icon
   */
  draw() {
    super.draw(); //Super call to draw the rest

    const xInPixels = GlobalVariables.widthToPixels(this.x);
    const yInPixels = GlobalVariables.heightToPixels(this.y);
    const radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.moveTo(
      xInPixels - radiusInPixels / 2,
      yInPixels + radiusInPixels / 2
    );
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 2,
      yInPixels + radiusInPixels / 2
    );
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(xInPixels - radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 2,
      yInPixels + radiusInPixels / 2
    );
    //GlobalVariables.c.fill()
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
    GlobalVariables.c.beginPath();
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 4,
      yInPixels - radiusInPixels / 2
    );
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 4,
      yInPixels - radiusInPixels / 2
    );
    GlobalVariables.c.lineTo(xInPixels - radiusInPixels / 4, yInPixels);
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 4,
      yInPixels - radiusInPixels / 2
    );

    //GlobalVariables.c.fill()
    GlobalVariables.c.lineWidth = 1;
    GlobalVariables.c.lineJoin = "round";
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
  }

  /**
   * Override the logic for determining if inputs are ready with the special case
   * logic for an alwaysOneFreeInput atom.
   */
  inputsAreReady() {
    return inputsReadyIgnoringFreeAP(this);
  }

  compute(inputs) {
    addOrDeletePorts(this); // clean up ports then check if we're in a ready state.
    // Preserve order from this.inputs since assembly behavior is highly order dependent and
    // the inputs dict may not traverse in the same order by default.
    const nonnullInputIds = this.inputs
      .filter((io) => io.connectors.length > 0)
      .map((io) => inputs[io.name])
      .filter(Boolean);
    return GlobalVariables.cad.assembly(nonnullInputIds, this.getContext());
  }

  /**
   * Super class the default serialize function to save the inputs since this atom has variable numbers of inputs.
   */
  serialize(savedObject) {
    var thisAsObject = super.serialize(savedObject);

    var ioValues = [];
    this.inputs.forEach((io) => {
      if (io.connectors.length > 0) {
        var saveIO = {
          name: io.name,
          ioValue: io.getValue(),
        };
        ioValues.push(saveIO);
      }
    });

    thisAsObject.ioValues = ioValues;
    thisAsObject.unionType = this.unionType;
    thisAsObject.unionIndex = this.unionIndex;

    return thisAsObject;
  }
}
