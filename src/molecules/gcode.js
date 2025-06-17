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
    //this.addIO("input", "tabs", this, "string", "true");
    //this.addIO("input", "safe height", this, "number", 6);

    this.addIO("output", "Gcode", this, "geometry", "");

    this.setValues(values);

    // Initialize Kiri:Moto if not already initialized
    if (!GlobalVariables.kirimotoInitialized) {
      initKiriMoto();
      GlobalVariables.kirimotoInitialized = true;
    }

    this.stlURL = null; // Store the STL URL
 
    this.center = [0, 0, 0]; //Used to correctly position the gcode

      //A callback function for once the gcode is generated
    this.gcodeCallback = (gcode) => {
      this.gcodeString = gcode;
      this.gcodeGenerated = true;
      GlobalVariables.cad.visualizeGcode(this.uniqueID, gcode);
      this.sendToRender();
    };
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
   * Generate the gcode for the part
   */
  generateGcode() {
    generateKirimoto(this.stlURL, this.center, this.findIOValue("Tool Size"), this.findIOValue("Passes"), this.findIOValue("Speed"), this.findIOValue("Cut Through"), this.gcodeCallback);
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
              this.stlURL = URL.createObjectURL(result); // Store the STL URL
              GlobalVariables.cad.getBoundingBox(this.uniqueID+1).then((bounds) => {
                this.center = [
                  (bounds.max[0] + bounds.min[0]) / 2,
                  (bounds.max[1] + bounds.min[1]) / 2,
                  (bounds.max[2] + bounds.min[2]) / 2,
                ];
              });
            })
            .then(() => {
              if(GlobalVariables.runMode) {
                this.generateGcode();
              }
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
          inputParams[input.name] = {
            value: input.value,
            disabled: checkConnector(),
            onChange: (value) => {
              input.setValue(value);
            },
            order: -2,
          };
        }
      });
    }

    inputParams["Generate Gcode"] = button(() => this.generateGcode(), {});

    inputParams["Download Gcode"] = button(() => {
      if (this.gcodeGenerated && this.gcodeString) {
        downloadGcode(this.gcodeString);
      } else {
        console.warn("No G-code available. Please generate G-code first.");
        // You could also show an alert or notification to the user here
        alert("No G-code available. Please generate G-code first.");
      }
    }, {});

    return inputParams;
  }

}
