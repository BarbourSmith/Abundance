import Atom from "../prototypes/atom.js";
import { addOrDeletePorts } from "../js/alwaysOneFreeInput.js";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the shrinkwrap atom. This behavior can also be called 'hull'
 */
export default class shrinkWrap extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    this.addIO("output", "geometry", this, "geometry", "");

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Shrink Wrap";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Shrink Wrap";
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
      "Joins two or more drawings into a single sketch by filling in the space between them. Also called 'hull'";

    this.setValues(values);

    if (typeof this.ioValues !== "undefined") {
      this.ioValues.forEach((ioValue) => {
        //for each saved value
        this.addIO("input", ioValue.name, this, "geometry", "");
      });
    }

    this.setValues([]);
  }

  /**
   * Draw the translate icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x + this.radius / 4),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 2.5),
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x - this.radius / 4),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius / 2.5),
      0,
      Math.PI * 2,
      false
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.rect(
      GlobalVariables.widthToPixels(this.x - this.radius / 4),
      GlobalVariables.heightToPixels(this.y - this.radius),
      GlobalVariables.widthToPixels(this.radius / 2),
      GlobalVariables.widthToPixels(this.radius / 2)
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  /**
   * Generates a list of all of the input shapes, then passes them to a worker thread to compute the hull
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputsList = [];
      this.inputs.forEach((io) => {
        if (io.connectors.length > 0) {
          inputsList.push(io.getValue());
        }
      });
      GlobalVariables.cad
        .shrinkWrapSketches(this.uniqueID, inputsList)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());

      //Delete or add ports as needed
      addOrDeletePorts(this);
    }
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

    return thisAsObject;
  }
}
