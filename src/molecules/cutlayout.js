import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
//import GlobalVariables from '../js/globalvariables.js'
import { proxy } from "comlink";
import { button, LevaInputs } from "leva";


/**
 * The Cut Layout atom extracts a copy of each shape on the cutlist and places them optimally on a cut sheet.
 */
export default class CutLayout extends Atom {
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
    this.atomType = "Cut Layout";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "cutLayout";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Cut Layout";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Extracts all parts tagged for cutting and lays them out on a sheet to cut.";
    /**
     * The array of placements returned by the layout function
     * @type {array}
     */
    this.placements = [];

    this.progress = 0.0;

    this.cancelationHandle = undefined;

    this.addIO("input", "geometry", this, "geometry", null);

    this.addIO(
      "input",
      "Material Thickness",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 19 : 0.75
    );
    this.addIO(
      "input",
      "Sheet Width",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 2438 : 96
    );
    this.addIO(
      "input",
      "Sheet Height",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 1219 : 48
    );
    this.addIO(
      "input",
      "Part Padding",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 6 : .25
    );

    this.addIO("output", "geometry", this, "geometry", "");

    this.setValues(values);
  }

  /**
   * Draw the cutlayout icon
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
    GlobalVariables.c.setLineDash([3, 3]);
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
    GlobalVariables.c.beginPath();
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 4,
      yInPixels - radiusInPixels / 1.7
    );
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 4,
      yInPixels - radiusInPixels / 2
    );
    GlobalVariables.c.lineTo(xInPixels - radiusInPixels / 4, yInPixels);
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 4,
      yInPixels - radiusInPixels / 1.7
    );

    //GlobalVariables.c.fill()
    GlobalVariables.c.lineWidth = 1;
    GlobalVariables.c.lineJoin = "round";
    GlobalVariables.c.stroke();
    GlobalVariables.c.setLineDash([]);
    GlobalVariables.c.closePath();


    //draw progress circle in the middle
    if (this.progress < 1.0) {
      GlobalVariables.c.beginPath();
      GlobalVariables.c.fillStyle = this.centerColor;
      GlobalVariables.c.moveTo(
        GlobalVariables.widthToPixels(this.x),
        GlobalVariables.heightToPixels(this.y)
      );
      GlobalVariables.c.arc(
        GlobalVariables.widthToPixels(this.x),
        GlobalVariables.heightToPixels(this.y),
        GlobalVariables.widthToPixels(this.radius) / 1.5,
        0,
        this.progress * Math.PI * 2,
        false
      );
      GlobalVariables.c.closePath();
      GlobalVariables.c.fill();
    }
  }
  /**
   * We only want the layout to update when the button is pressed not when the inputs update so we block the regular update value behavior
   */
  updateValue() {

    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var materialThickness = this.findIOValue("Material Thickness");
      var sheetWidth = this.findIOValue("Sheet Width");
      var sheetHeight = this.findIOValue("Sheet Height");
      var sheetPadding = 0;//this.findIOValue("Sheet Padding"); //It's easier to just adjust the sheet size than to add padding
      var partPadding = this.findIOValue("Part Padding");

      if (!inputID) {
        this.setAlert('"geometry" input is missing');
        return;
      }
      
      GlobalVariables.cad
        .displayLayout(
          this.uniqueID,
          inputID,
          [this.placements],
          {
            thickness: materialThickness,
            width: sheetWidth,
            height: sheetHeight,
            sheetPadding: sheetPadding,
            partPadding: partPadding
          })
        .then((warning) => {
          this.basicThreadValueProcessing();
          if (warning != undefined) {
            this.setAlert(warning);
          }
          this.progress = 1.0;
          this.cancelationHandle = undefined;
          this.processing = false;
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Pass the input geometry to a worker function to compute the translation.
   */
  updateValueButton() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      if (this.cancelationHandle) {
        // There's an in-progress nesting worker. Cancel it and start another nesting
        // computation with the new inputs.
        this.cancelationHandle();
      }
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var materialThickness = this.findIOValue("Material Thickness");
      var sheetWidth = this.findIOValue("Sheet Width");
      var sheetHeight = this.findIOValue("Sheet Height");
      var sheetPadding = 0;//this.findIOValue("Sheet Padding"); //It's easier to just adjust the sheet size than to add padding
      var partPadding = this.findIOValue("Part Padding");

      if (!inputID) {
        this.setAlert('"geometry" input is missing');
        return;
      }

      GlobalVariables.cad
        .layout(
          this.uniqueID,
          inputID,
          proxy((progress, cancelationHandle) => {
            this.progress = progress;
            this.cancelationHandle = cancelationHandle;
          }),
          proxy((placements) => {
            this.placements = placements[0];
          }),
          {
            thickness: materialThickness,
            width: sheetWidth,
            height: sheetHeight,
            sheetPadding: sheetPadding,
            partPadding: partPadding
          })
        .then((warning) => {
          this.basicThreadValueProcessing();
          if (warning != undefined) {
            this.setAlert(warning);
          }
          this.progress = 1.0;
          this.cancelationHandle = undefined;
          this.processing = false;
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /**
   * Add the "Compute Layout" button to the leva inputs.
   */
  createLevaInputs() {
      let inputParams = super.createLevaInputs();
  
      inputParams["Compute Layout"] = button(() => {
          this.updateValueButton();
      });

      //Expose the stored positions
      this.placements.forEach((placement, index) => {
        inputParams[this.uniqueID + "position" + index] = {
          value: { x: placement.translate.x, y: placement.translate.y, z: placement.rotate },
          label: " " + index,
          onChange: (value, index) => {
              const match = index.match(/position(\d+)/);
              const indexNumber = match ? parseInt(match[1], 10) : null;
          
              if (indexNumber !== null) {
                  const placement = this.placements[indexNumber];
                  //If anything has changed we need to update the value and recompute
                  if (placement.translate.x !== value.x || placement.translate.y !== value.y || placement.rotate !== value.z) {
                      placement.translate.x = value.x;
                      placement.translate.y = value.y;
                      placement.rotate = value.z;
          
                      this.updateValue();
                  }
              }
          },
        };
      });


      return inputParams;
  }

  /**
   * Save the placements to be loaded next time
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);
    valuesObj.placements = this.placements;

    return valuesObj;
  }

}
