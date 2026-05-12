import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { BOMEntry } from "../js/BOM.js";

/**
 * The addBOMTag molecule type adds a tag containing information about a bill of materials item to the input geometry. The input geometry is not modified in any other way
 */
export default class AddBOMTag extends Atom {
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
    this.atomType = "Add BOM Tag";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "addBOMTag";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Add BOM Tag";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Adds a Bill Of Materials tag which appears in molecules containing this atom and in the GitHub project bill of materials.";

    /**
     * The BOM item object created by this atom
     * @type {string}
     */
    this.BOMitem = new BOMEntry();
    /**
     * This atom's radius as displayed on the screen is 1/65 width
     * @type {number}
     */
    this.radius = 1 / 65;
    /**
     * This atom's height as drawn on the screen
     */
    this.height;

    this.uniqueID = values?.uniqueID || GlobalVariables.generateUniqueID();

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "geometry", valueType: "geometry", type: "output" },
      { name: "Item Name", valueType: "string", defaultValue: "New Item" },
      { name: "Number Needed", valueType: "number", defaultValue: 1 },
      { name: "Cost (USD)", valueType: "number", defaultValue: 0 },
      { name: "Source Link", valueType: "string", defaultValue: "" },
    ]);

    this.setValues(values);
  }

  compute(inputs) {
    const input = inputs.geometry;

    // Sync BOMitem with current input values before computing
    // This ensures values from upstream connections are properly used
    if (inputs["Item Name"] !== null && inputs["Item Name"] !== undefined) {
      this.BOMitem.BOMitemName = inputs["Item Name"];
    }
    if (
      inputs["Number Needed"] !== null &&
      inputs["Number Needed"] !== undefined
    ) {
      this.BOMitem.numberNeeded = inputs["Number Needed"];
    }
    if (inputs["Cost (USD)"] !== null && inputs["Cost (USD)"] !== undefined) {
      this.BOMitem.costUSD = inputs["Cost (USD)"];
    }
    if (inputs["Source Link"] !== null && inputs["Source Link"] !== undefined) {
      this.BOMitem.source = inputs["Source Link"];
    }

    const bomItem = this.BOMitem;
    return GlobalVariables.cad.bom(input, bomItem);
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
    this.height = pixelsRadius / 1.3;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius / 1.5}px Work Sans Bold`;
    const text = String.fromCharCode(0x0024, 0x0024, 0x0024);
    const textWidth = GlobalVariables.c.measureText(text).width;
    const textX = pixelsX - textWidth / 2;
    const textY = pixelsY + this.height / 3;
    GlobalVariables.c.fillText(text, textX, textY);
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  createInputParams(setInputChanged) {
    // Forward to super so it can register `setInputChanged`. We discard
    // its returned controls because BOM builds a fully custom panel.
    super.createInputParams(setInputChanged);
    let inputParams = {};

    if (this.inputs) {
      this.inputs.forEach((input) => {
        if (input.name === "Item Name") {
          inputParams[this.uniqueID + "BOMitemName"] = {
            type: "string",
            value: this.findIOValue("Item Name") || this.BOMitem.BOMitemName,
            label: "Item Name",
            order: 1,
            onChange: (value) => {
              this.BOMitem.BOMitemName = value;
              // Also update the attachment point value so findIOValue returns the correct value
              const itemNameInput = this.inputs.find(
                (input) => input.name === "Item Name",
              );
              if (itemNameInput) {
                itemNameInput.setValue(value);
              }
              this.onUpstreamChange();
            },
          };
        } else if (input.name === "Number Needed") {
          inputParams[this.uniqueID + "numberNeeded"] = {
            type: "number",
            value:
              this.findIOValue("Number Needed") || this.BOMitem.numberNeeded,
            label: "Number Needed",
            step: 1,
            min: 1,
            order: 2,
            onChange: (value) => {
              this.BOMitem.numberNeeded = value;
              // Also update the attachment point value so findIOValue returns the correct value
              const numberNeededInput = this.inputs.find(
                (input) => input.name === "Number Needed",
              );
              if (numberNeededInput) {
                numberNeededInput.setValue(value);
              }
              this.onUpstreamChange(); //Recompute to update the tag in the 3D view
            },
          };
        } else if (input.name === "Cost (USD)") {
          inputParams[this.uniqueID + "costUSD"] = {
            type: "number",
            value: this.findIOValue("Cost (USD)") || this.BOMitem.costUSD,
            label: "Cost (USD)",
            step: 0.01,
            min: 0,
            order: 3,
            onChange: (value) => {
              this.BOMitem.costUSD = value;
              // Also update the attachment point value so findIOValue returns the correct value
              const costInput = this.inputs.find(
                (input) => input.name === "Cost (USD)",
              );
              if (costInput) {
                costInput.setValue(value);
              }
              this.onUpstreamChange(); //Recompute to update the tag in the 3D view
            },
          };
        } else if (input.name === "Source Link") {
          inputParams[this.uniqueID + "source"] = {
            type: "string",
            value: this.findIOValue("Source Link") || this.BOMitem.source,
            label: "Source Link",
            order: 4,
            onChange: (value) => {
              this.BOMitem.source = value;
              // Also update the attachment point value so findIOValue returns the correct value
              const sourceInput = this.inputs.find(
                (input) => input.name === "Source Link",
              );
              if (sourceInput) {
                sourceInput.setValue(value);
              }
              this.onUpstreamChange(); //Recompute to update the tag in the 3D view
            },
          };
        }
      });
    }

    // Add mobile delete button for touchscreen devices
    const flowCanvas = document.getElementById("flow-canvas");
    if (
      GlobalVariables.isMobile() &&
      flowCanvas &&
      flowCanvas.style.display !== "none" //in runMode don't show delete button
    ) {
      inputParams[this.uniqueID + "delete"] = {
        type: "button",
        label: "Delete Selected",
        onClick: () => {
          flowCanvas.focus();
          const event = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Delete",
            code: "Delete",
            keyCode: 46,
          });
          flowCanvas.dispatchEvent(event);
        },
      };
    }

    return inputParams;
  }

  /**
   * Add the bom item to the saved object
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);

    // Use safe serialization to prevent large BOM items from bloating the save file
    const bomCopy = Object.assign({}, this.BOMitem); //Makes a shallow copy to prevent issues when copy pasting
    Atom.safeSerializeValue(valuesObj, "BOMitem", bomCopy, this.name || "BOM");

    return valuesObj;
  }
}
