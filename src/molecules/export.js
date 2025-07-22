import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { button, LevaInputs } from "leva";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import { saveAs } from "file-saver";

/**
 * This class creates an atom which supports uploading a .svg file
 */
export default class Export extends Atom {
  /**
   * The stnstructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Export";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Export";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Export Atom, let's you choose a type of file to Export.";
    /**
     * This atom's value. Contains the value of the input geometry, not the stl
     * @type {string}
     */
    this.value = null;
    /**
     * The type of file to export
     * @type {string}
     */
    this.type = null;

    this.resolution = 96;

    this.addIO("input", "geometry", this, "geometry", "");
    this.addIO("input", "Resolution (dpi)", this, "number", this.resolution);

    this.addIO("input", "Part Name", this, "string", this.parent.name);

    this.addIO("input", "File Type", this, "string", "SVG");

    this.setValues(values);

    this.importIndex = 0;

    this.partName = this.parent.name;
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
   * Update the displayed svg file
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      let inputID = this.findIOValue("geometry");
      let fileType = this.findIOValue("File Type");

      GlobalVariables.cad
        .visExport(this.uniqueID, inputID, fileType)
        .then((result) => {
          this.basicThreadValueProcessing();
        })
        .catch(this.alertingErrorHandler());
    }
  }

  createLevaInputs() {
    let inputParams = {};
    const exportOptions = ["STL", "SVG", "STEP"];

    /** Runs through active atom inputs and adds IO parameters to default param*/

    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };
        if (input.name == "File Type") {
          inputParams[this.uniqueID + "file_ops"] = {
            value: input.value,
            options: exportOptions,
            disabled: checkConnector(),
            label: "File Type",
            onChange: (value) => {
              if (input.value !== value) {
                this.type = value;
                input.setValue(value);
              }
            },
          };
        }
        /* Makes inputs for Io's other than geometry */
        if (input.name == "Resolution (dpi)") {
          inputParams[this.uniqueID + input.name] = {
            value: input.value,
            label: input.name,
            disabled: this.findIOValue("File Type") != "SVG" ? true : false,
            step: 0.01,
            onChange: (value) => {
              if (input.value !== value) {
                input.setValue(value);
              }
            },
          };
        }
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
        }
      });
    }

    inputParams["Download File"] = button(() =>
      //this.loadFile(importOptions[importIndex])
      this.exportFile()
    );

    return inputParams;
  }

  /**
   * The function which is called when you press the download button.
   */
  exportFile() {
    let fileType = this.findIOValue("File Type");
    let resolution = this.findIOValue("Resolution (dpi)");
    let partName = this.findIOValue("Part Name");

    console.log(this);
    GlobalVariables.cad
      .downExport(
        this.uniqueID,
        fileType,
        resolution,
        GlobalVariables.topLevelMolecule.unitsKey
      )
      .then((result) => {
        console.log("Export result");
        console.log(result);
        console.log("File type");
        saveAs(result, partName + "." + fileType.toLowerCase());
      })
      .catch(this.alertingErrorHandler());
  }
  /**
   * Add the file name to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.type = this.type;
    superSerialObject.resolution = this.resolution;
    superSerialObject.importIndex = this.importIndex;
    superSerialObject.partName = this.partName;

    return superSerialObject;
  }
}
