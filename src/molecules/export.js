import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { saveAs } from "file-saver";
import { Status } from "../prototypes/observableEntity.js";

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
     * This atom's value. A struct of the input geometry and the produced
     */
    this.value = null;
    /**
     * The type of file to export
     * @type {string}
     */
    this.type = null;

    this.resolution = 96;

    this.parent = values?.parent;
    this.partName = this.parent?.name ?? "output";

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "File Type", valueType: "string", defaultValue: "STL" },
      {
        name: "Resolution (dpi)",
        valueType: "number",
        defaultValue: this.resolution,
      },
      {
        name: "Part Name",
        valueType: "string",
        defaultValue: this.partName,
      },
    ]);

    this.setValues(values);

    this.importIndex = 0;
  }

  /**
   * Draw the circle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${GlobalVariables.widthToPixels(
      this.radius,
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "G",
      GlobalVariables.widthToPixels(this.x - this.radius / 3),
      GlobalVariables.heightToPixels(this.y) + this.height / 3,
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  /**
   * Override the logic for determining if inputs are ready.
   * Only check the essential inputs needed for compute() - "geometry" and "File Type".
   * "Part Name" and "Resolution (dpi)" are only used during download and can be set
   * via the parameter menu without connections.
   */
  inputsAreReady() {
    const essentialInputs = this.inputs.filter(
      (input) => input.name === "geometry" || input.name === "File Type",
    );
    return essentialInputs.every((input) => {
      return input.getState().status === Status.READY;
    });
  }

  /**
   * Update the displayed svg file
   */
  compute(inputs) {
    return GlobalVariables.cad.visExport(
      inputs.geometry,
      inputs["File Type"],
      this.getContext(),
    );
  }

  createInputParams(setInputChanged) {
    // Forward to super so it can register `setInputChanged` on this atom.
    // We discard its returned controls because Export builds a fully
    // custom param panel below.
    super.createInputParams(setInputChanged);
    let inputParams = {};
    const exportOptions = ["STL", "SVG", "STEP", "TXT"];

    /** Runs through active atom inputs and adds IO parameters to default param*/

    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };
        if (input.name == "File Type") {
          inputParams[this.uniqueID + "file_ops"] = {
            type: "select",
            value: input.value,
            options: exportOptions,
            disabled: checkConnector(),
            label: "File Type",
            onChange: (value) => {
              if (input.value !== value) {
                this.type = value;
                input.setValue(value);
                setInputChanged(value);
              }
            },
          };
        }
        /* Makes inputs for Io's other than geometry */

        if (
          input.name == "Resolution (dpi)" &&
          this.findIOValue("File Type") === "SVG"
        ) {
          inputParams[this.uniqueID + input.name] = {
            type: "number",
            value: input.value,
            label: input.name,
            disabled: false,
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
            type: "string",
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
    inputParams["Download File"] = {
      type: "button",
      label: "Download File",
      disabled: this.status !== Status.READY,
      onClick: () => {
        this.exportFile();
        // Dispatch a custom event for error notification
        const event = new CustomEvent("user-notification", {
          detail: {
            message: "Preparing your export." || String(err),
            type: "notice",
          },
        });
        window.dispatchEvent(event);
      },
    };

    return inputParams;
  }

  /**
   * The function which is called when you press the download button.
   */
  async exportFile() {
    let fileType = this.findIOValue("File Type");
    let resolution = this.findIOValue("Resolution (dpi)");
    let partName = this.findIOValue("Part Name");
    let geometry = this.findIOValue("geometry");
    try {
      if (geometry == null) {
        throw new Error(
          "No geometry to export. Please make sure the geometry is ready.",
        );
      }
      const result = await GlobalVariables.cad.downExport(
        geometry,
        fileType,
        resolution,
        GlobalVariables.topLevelMolecule.unitsKey,
        this.getContext(),
      );

      saveAs(result, partName + "." + fileType.toLowerCase());
    } catch (err) {
      console.error("Export error:", err);
      if (typeof this.alertingErrorHandler === "function") {
        this.alertingErrorHandler(err);
      }
      // Dispatch a custom event for error notification
      const event = new CustomEvent("user-notification", {
        detail: { message: err.message || String(err) },
      });
      window.dispatchEvent(event);
    }
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
