import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { Status } from "../prototypes/observableEntity.js";

/**
 * This class creates the output atom. The goal is that the output atom is fully transparent to the molecule which contains it
 */
export default class Output extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    //Add a new output to the current molecule
    if (typeof this.parent !== "undefined") {
      this.parent.addIO(
        "output",
        "Geometry",
        this.parent,
        "geometry",
        this.parent.path
      );
    }

    /**
     * This atom's type...not used?
     * @type {string}
     */
    this.type = "output";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Output";
    /**
     * This atom's value
     * @type {object}
     */
    this.value = null;
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Output";
    /**
     * This atom's height
     * @type {number}
     */
    this.height = 16;
    /**
     * This atom's radius
     * @type {number}
     */
    this.radius = 1 / 75;
    /**
     * This atom's path
     * @type {string}
     */
    this.path = ""; //Not sure why documentation made me put this hear instead of pulling it from atom
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Connect geometry here to make it available in the next level up. ";
    this.addAllIOs([{ name: "number or geometry", valueType: "geometry" }]);

    this.setValues(values);
  }

  compute(argsDict) {
    return Promise.resolve(argsDict["number or geometry"]);
  }

  /**
   * Sends output value to render instead of uniqueID
   */
  sendToRender() {
    //Send code to JSxCAD to render
    try {
      GlobalVariables.writeToDisplay(this.value);
    } catch (err) {
      this.setError(err);
    }
  }

  /**
   * Override super delete function to prevent output from being deleted
   */
  deleteNode() {}

  /**
   * A function to allow you to still call the delete function if needed.
   */
  deleteOutputAtom(deletePath = true) {
    // Clear all subscribers (typically just the parent molecule)
    this.unsubscribeAll();
    super.deleteNode(false, deletePath);
  }

  inputsAreReady() {
    return this.inputs.length > 0 && super.inputsAreReady();
  }

  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }

    if (this.uniqueID == "9f9d507e-3da6-4de1-885d-f2896e8c8ff2") {
      console.log(
        "update received. initial status: " +
          this.status +
          " input status: " +
          this.inputs[0].status
      );
      const result = super.onUpstreamChange();
      console.log("update received. final status: " + this.status);
      return result;
    } else {
      return super.onUpstreamChange();
    }
  }

  /**
   * Draw the output shape on the screen.
   */
  draw() {
    this.radius = GlobalVariables.atomSize / 1.25;
    const xInPixels = GlobalVariables.widthToPixels(this.x);
    const yInPixels = GlobalVariables.heightToPixels(this.y);
    const radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    this.height = radiusInPixels;

    //Set colors
    GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
    this.color = Atom.statusAsColor(this.status, this.selected);
    GlobalVariables.c.strokeStyle = this.selected
      ? Atom.DEFAULT_COLOR
      : Atom.SELECTED_COLOR;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.font = "10px Work Sans";
    GlobalVariables.c.textAlign = "start";
    GlobalVariables.c.fillText(
      this.name,
      xInPixels - radiusInPixels,
      yInPixels - radiusInPixels * 1.5
    );
    GlobalVariables.c.moveTo(
      xInPixels + radiusInPixels - radiusInPixels * 2,
      yInPixels - this.height
    );
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels - 5, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels - radiusInPixels * 2,
      yInPixels + this.height
    );
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels - radiusInPixels * 2,
      yInPixels - this.height
    );
    GlobalVariables.c.fillStyle = this.color;
    GlobalVariables.c.fill();
    GlobalVariables.c.lineWidth = 3;
    GlobalVariables.c.lineJoin = "round";
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();

    this.inputs.forEach((child) => {
      child.draw();
    });
  }
}
