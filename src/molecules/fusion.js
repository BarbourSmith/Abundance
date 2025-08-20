import Atom from "../prototypes/atom.js";
import { addOrDeletePorts } from "../js/alwaysOneFreeInput.js";
import GlobalVariables from "../js/globalvariables.js";

/**
 * This class creates the Join atom instance.
 */
export default class Join extends Atom {
  /**
   * Creates a new join atom.
   * @param {object} values - An object of values. Each of these values will be applied to the resulting atom.
   */
  constructor(values) {
    super(values);

    this.addIO("output", "geometry", this, "geometry", "");

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Fusion";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Fusion";
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

    //This loads any inputs which this atom had when last saved.
    if (typeof this.ioValues !== "undefined") {
      this.ioValues.forEach((ioValue) => {
        //for each saved value
        this.addIO("input", ioValue.name, this, "geometry", "");
      });
    }

    this.unionType = "Fusion";

    this.unionIndex;

    this.setValues([]);
  }

  /**
   * Add or delete ports as needed in addition to the normal begin propogation stuff
   */
  beginPropagation() {
    //addOrDeletePorts(this); //Add or remove ports as needed

    super.beginPropagation();
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

  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputValues = [];
      this.inputs.forEach((io) => {
        if (io.connectors.length > 0 && io.type == "input") {
          inputValues.push(io.getValue());
        }
      });
      GlobalVariables.cad
        .fusion(this.uniqueID, inputValues)
        .then(() => {
          this.basicThreadValueProcessing();
        })
        .catch((err) => this.alertingErrorHandler(err));

      //Delete or add ports as needed
      addOrDeletePorts(this);
    }
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
