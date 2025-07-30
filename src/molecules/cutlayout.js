import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
//import GlobalVariables from '../js/globalvariables.js'
import { proxy } from "comlink";
import { button, LevaInputs } from "leva";

/**
 * Rearrange all input geometries to fit on a sheet of material. Parts are packed
 * as densely as possible while still respecting part padding. In general, all parts
 * will be arranged to be as thin as possible, however there are some exceptions in
 * order to fit into a sheet of stock with some uniform thickness.
 *
 * Params:
 * - geometry: The geometry or assembly to be arranged
 * - width: The width of the sheet
 * - height: The height of the sheet
 * - partPadding: The padding between parts
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
    this.hasRerenderedInputs = false;

    this.progress = 0.0;
    this.counter = 0;

    this.cancelationHandle = undefined;

    this.addIO("input", "geometry", this, "geometry", null);

    this.addIO(
      "input",
      "Sheet Width",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 1219 : 48
    );
    this.addIO(
      "input",
      "Sheet Height",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 2438 : 96
    );
    this.addIO(
      "input",
      "Part Padding",
      this,
      "number",
      GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 6 : 0.25
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

  handleNewPlacements(placements, rerenderInputsCallback) {
    this.placements = placements;
    this.hasRerenderedInputs = false;
    this.basicThreadValueProcessing();
    this.updateValue();
    rerenderInputsCallback();
  }

  /**
   * We only want the layout to update when the button is pressed not when the inputs update so we block the regular update value behavior
   */
  updateValue() {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var sheetWidth = this.findIOValue("Sheet Width");
      var sheetHeight = this.findIOValue("Sheet Height");
      var partPadding = this.findIOValue("Part Padding");

      if (!inputID) {
        this.setError('"geometry" input is missing');
        return;
      }
      // if positions isn't a list of lists, nest it so that it is
      if (
        this.placements != undefined &&
        this.placements.length > 0 &&
        !Array.isArray(this.placements[0])
      ) {
        this.placements = [this.placements];
      }

      GlobalVariables.cad
        .displayLayout(
          this.uniqueID,
          inputID,
          this.placements,
          proxy((message) => {
            this.setWarning(message);
          }),
          {
            width: sheetWidth,
            height: sheetHeight,
            partPadding: partPadding,
            units:
              GlobalVariables.topLevelMolecule.units[
                GlobalVariables.topLevelMolecule.unitsKey
              ],
          }
        )
        .then(() => {
          this.basicThreadValueProcessing();
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
  updateValueButton(rerenderInputsCallback) {
    super.updateValue();

    if (this.inputs.every((x) => x.ready)) {
      if (this.cancelationHandle) {
        console.warn("unexpectedly called while already processing.");
        return;
      }
      this.processing = true;
      var inputID = this.findIOValue("geometry");
      var sheetWidth = this.findIOValue("Sheet Width");
      var sheetHeight = this.findIOValue("Sheet Height");
      var partPadding = this.findIOValue("Part Padding");

      if (!inputID) {
        this.setError('"geometry" input is missing');
        return;
      }

      const layoutProcessId = this.counter;
      this.counter++;

      GlobalVariables.cad
        .layout(
          this.uniqueID,
          inputID,
          proxy((progress, cancelationHandle) => {
            this.progress = progress;
            this.cancelationHandle = () => {
              console.log("cancelation called on process: " + layoutProcessId);
              cancelationHandle();
            };
          }),
          proxy((message) => {
            this.setWarning(message);
          }),
          proxy((placements) => {
            console.log("new placements for process: " + layoutProcessId);
            this.handleNewPlacements(placements, rerenderInputsCallback);
          }),
          {
            width: sheetWidth,
            height: sheetHeight,
            partPadding: partPadding,
            units:
              GlobalVariables.topLevelMolecule.units[
                GlobalVariables.topLevelMolecule.unitsKey
              ],
          },
          this.placements
        )
        .then((positions) => {
          console.log("layout completed for process: " + layoutProcessId);
          this.handleNewPlacements(positions, rerenderInputsCallback);
        })
        .catch(this.alertingErrorHandler())
        .finally(() => {
          this.finishProcessing();
        });
    }
  }

  finishProcessing() {
    if (this.cancelationHandle) {
      this.cancelationHandle();
      this.cancelationHandle = undefined;
      this.hasRerenderedInputs = false;
    }
    this.progress = 1.0;
    this.processing = false;
  }

  /**
   * Add the "Compute Layout" button to the leva inputs.
   */
  createLevaInputs(setInputChanged) {
    // if positions isn't a list of lists, nest it so that it is. Required for back-compatibility
    if (
      this.placements != undefined &&
      this.placements.length > 0 &&
      !Array.isArray(this.placements[0])
    ) {
      this.placements = [this.placements];
    }

    let inputParams = super.createLevaInputs();
    console.log("starting with inputParams:");
    console.log(inputParams);

    // If the atom is processing and cancelable, replace
    // the "Compute Layout" button with a "Halt Processing" button
    // and trigger a re-render.
    const isCancelable = this.cancelationHandle != undefined;
    if (isCancelable) {
      inputParams["Halt Processing"] = button(() => {
        this.finishProcessing();
        setInputChanged(isCancelable);
      });
    } else {
      inputParams["Compute Layout"] = button(() => {
        this.updateValueButton(() => {
          setInputChanged(isCancelable);
        });
      });
    }

    let prepareLabel = (sheet, index, totalsheets) => {
      if (totalsheets > 1) {
        return "sheet " + sheet + " p" + index;
      } else {
        return " " + index;
      }
    };

    //Expose the stored positions
    let part_counter = 0;
    const totalSheets = this.placements.length;
    this.placements.forEach((sheet, index) => {
      sheet.forEach((placement, part_num) => {
        inputParams[this.uniqueID + "position" + part_counter] = {
          value: {
            x: placement.translate.x,
            y: placement.translate.y,
            z: placement.rotate,
          },
          label: prepareLabel(index, part_num, totalSheets),
          step: 0.01,
          onChange: (value, index) => {
            const match = index.match(/position(\d+)/);
            const indexNumber = match ? parseInt(match[1], 10) : null;

            if (indexNumber != null) {
              const placement = this.placements.flat()[indexNumber];
              //Update the placement with the new value];
              //If anything has changed we need to update the value and recompute
              if (
                placement.translate.x !== value.x ||
                placement.translate.y !== value.y ||
                placement.rotate !== value.z
              ) {
                placement.translate.x = value.x;
                placement.translate.y = value.y;
                placement.rotate = value.z;

                this.updateValue();
              }
            }
          },
        };
        part_counter++;
      });
    });
    if (!this.hasRerenderedInputs) {
      // If we have already rerendered inputs, we don't need to do it again
      console.log("createLevaInputs - and rerendering inputs");
      console.log(this.placements);
      setInputChanged(this.placements);
      this.hasRerenderedInputs = true;
    } else {
      console.log("createLevaInputs - no rerender.");
      console.log(this.placements);
    }

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
