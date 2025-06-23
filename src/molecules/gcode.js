import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { button } from "leva";
import { initKiriMoto, generateKirimoto, downloadGcode } from '../components/secondary/Kirimoto.js'; // Adjust the path
//import saveAs from '../lib/FileSaver.js'

/**
 * This class creates the circle atom.
 */
export default class Gcode extends Atom {
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
    this.name = "Gcode";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Gcode";
    /**
     * This atom's height as drawn on the screen
     */

    this.height = 16;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Generates Maslow gcode from the input geometry.";

    this.blob = null;
    /**
     * The generated gcode string
     * @type {string}
     */
    this.gcodeString = "";

    /**
     * Whether gcode has been generated
     * @type {boolean}
     */
    this.gcodeGenerated = false;

    this.addIO("input", "Geometry", this, "geometry", null);
    this.addIO("input", "Tool Size", this, "number", 6.35);
    this.addIO("input", "Passes", this, "number", 6);
    this.addIO("input", "Speed", this, "number", 500);
    this.addIO("input", "Cut Through", this, "number", 1);
    this.addIO("input", "Part Name", this, "string", this.parent.name);
    //this.addIO("input", "tabs", this, "string", "true");
    //this.addIO("input", "safe height", this, "number", 6);

    this.addIO("output", "Gcode", this, "geometry", "");

    this.setValues(values);

    this.partName = this.parent.name;

    // Initialize Kiri:Moto if not already initialized
    if (!GlobalVariables.kirimotoInitialized) {
      initKiriMoto();
    }

    this.stlURL = null; // Store the STL URL
 
    this.center = [0, 0, 0]; //Used to correctly position the gcode
  }

  /**
   * Draw the circle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${GlobalVariables.widthToPixels(
      this.radius
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "G",
      GlobalVariables.widthToPixels(this.x - this.radius / 3),
      GlobalVariables.heightToPixels(this.y) + this.height / 3
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  /**
   * Creates a callback function for when gcode is generated
   * @returns {Function} The gcode callback function
   */
  _createGcodeCallback() {
    return (gcode) => {
      this.gcodeString = gcode;
      this.gcodeGenerated = true;
      GlobalVariables.cad.visualizeGcode(this.uniqueID, gcode);
      this.basicThreadValueProcessing();
      this.sendToRender();
    };
  }

  /**
   * Generates gcode using Kirimoto with the current parameters
   */
  _generateGcode() {
    if (!GlobalVariables.kirimotoInitialized) {
      // If Kirimoto is not initialized, wait 500ms and try again
      setTimeout(() => this._generateGcode(), 500);
      console.log("Waiting for Kirimoto to initialize...");
      return;
    }
    
    const gcodeCallback = this._createGcodeCallback();
    generateKirimoto(
      this.stlURL, 
      this.center, 
      this.findIOValue("Tool Size"), 
      this.findIOValue("Passes"), 
      this.findIOValue("Speed"), 
      this.findIOValue("Cut Through"), 
      gcodeCallback
    );
  }

  /**
   * Generate a layered outline of the part where the tool will cut
   */
  updateValue() {
    super.updateValue();
    try {

      let inputID = this.findIOValue("Geometry");

      GlobalVariables.cad
        .visExport(this.uniqueID+1, inputID, "STL") //What a hack, we shouldn't be using uniqueID+1 here
        .then((result) => {
          GlobalVariables.cad
            .downExport(this.uniqueID+1, "STL")
            .then((result) => {
              //Delete anything previously stored
              if (this.stlURL) {
                URL.revokeObjectURL(this.stlURL); // Clean up the previous URL
              }
              this.stlURL = URL.createObjectURL(result); // Store the STL URL
              GlobalVariables.cad.getBoundingBox(this.uniqueID+1).then((bounds) => {
                this.center = [
                  (bounds.max[0] + bounds.min[0]) / 2,
                  (bounds.max[1] + bounds.min[1]) / 2,
                  (bounds.max[2] + bounds.min[2]) / 2,
                ];
                if(window.location.pathname.includes('/run/')) {
                  this._generateGcode();
                }
              });
            });
        })
        .catch((err) => {
          console.error("Error creating STL for gcode:", err);
        });
    } catch (err) {
      this.setAlert(err);
    }

  }

  createLevaInputs() {
    let inputParams = {};

    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        /* Some input parameters (inlcuding equation and result) live in the parameter editor file so they can use the set, get functions */

        /* Makes inputs for Io's other than geometry */
        if (input.valueType !== "geometry") {
          if (input.name == "Part Name") {
            inputParams[this.uniqueID + input.name] = {
              value: this.partName,
              label: input.name,
              disabled: checkConnector(),
              onChange: (value) => {
                if (input.value !== value) {
                  input.setValue(value);
                  this.partName = value;
                }
              },
            };
          } else {
            inputParams[input.name] = {
              value: input.value,
              disabled: checkConnector(),
              onChange: (value) => {
                input.setValue(value);
              },
              order: -2,
            };
          }
        }
      });
    }

    inputParams["Generate Gcode"] = button(() => this._generateGcode(), {});

    const partName = this.findIOValue("Part Name") || this.partName || "output";
    inputParams[`Download Gcode - ${partName}`] = button(() => {
      if (this.gcodeGenerated && this.gcodeString) {
        // Get the current part name dynamically when button is clicked
        const currentPartName = this.findIOValue("Part Name") || this.partName || "output";
        downloadGcode(this.gcodeString, `${currentPartName}.gcode`);
      } else {
        console.warn("No G-code available. Please generate G-code first.");
        // You could also show an alert or notification to the user here
        alert("No G-code available. Please generate G-code first.");
      }
    }, {});

    return inputParams;
  }

  /**
   * Add the part name to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.partName = this.partName;

    return superSerialObject;
  }

}
