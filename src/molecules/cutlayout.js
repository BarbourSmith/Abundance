import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
//import GlobalVariables from '../js/globalvariables.js'
import { proxy } from "comlink";
import { Status } from "../prototypes/observableEntity.js";

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

    this.progress = 0.0;

    this.cancelationHandle = undefined;

    this.addAllIOs([
      { name: "geometry", valueType: "geometry", type: "input" },
      {
        name: "Sheet Width",
        valueType: "number",
        defaultValue:
          GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 2438 : 96,
      },
      {
        name: "Sheet Height",
        valueType: "number",
        defaultValue:
          GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 1219 : 48,
      },
      {
        name: "Part Padding",
        valueType: "number",
        defaultValue:
          GlobalVariables.topLevelMolecule.unitsKey == "MM" ? 10 : 0.4,
      },
      { name: "geometry", valueType: "geometry", type: "output" },
    ]);

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

  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    if (this.cancelationHandle) {
      this.cancelationHandle();
      this.cancelationHandle = undefined;
    }
    return super.deleteNode(backgroundClickAfter, deletePath, silent);
  }

  handleNewPlacements(placements, isFinalPlacement = false) {
    this.placements = placements;
    this.displayLayout(isFinalPlacement);
    if (this.setInputChanged) {
      this.setInputChanged(this.placements);
    }
  }

  /**
   * Read placements in backward compatible way. Updates this.placements to the
   * current format if necessary. Returns well-formatted placements.
   */
  getPlacements() {
    if (
      this.placements != undefined &&
      this.placements.length > 0 &&
      !Array.isArray(this.placements[0])
    ) {
      this.placements = [this.placements];
    }
    return this.placements;
  }

  displayLayout(isFinalPlacement = false) {
    const placements = this.getPlacements();

    if (this.inputsAreReady()) {
      var inputGeom = this.findIOValue("geometry");
      var sheetWidth = this.findIOValue("Sheet Width");
      var sheetHeight = this.findIOValue("Sheet Height");
      var partPadding = this.findIOValue("Part Padding");
      const priorStatus = this.status;
      this.setProcessing();
      return GlobalVariables.cad
        .displayLayout(
          inputGeom,
          placements,
          proxy((message) => {
            // TODO(tristan): warnings get cleared whenever we setReady.
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
          },
          this.getContext()
        )
        .then((result) => {
          if (this.selected) {
            this.sendToRender();
          }
          // Only update our status if this is the final placement
          if (isFinalPlacement) {
            this.setReady(result);
          } else {
            this.setStatus(priorStatus);
            this.value = result;
          }
        });
    }
  }

  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }

    // Check for errors in inputs first
    if (this.inputsHaveErrors()) {
      this.setUpstreamError();
      return;
    }

    // If the upstream geometry has changed, we need to reset our status as stale
    // However, computation must be manually triggered via the "compute layout" button
    // so there's not much else to do here.

    // TODO: add logic for whether upstream changes have made the current
    // placements stale.
    if (this.placements?.length > 0) {
      this.displayLayout(true);
    } else {
      this.setWaiting();
    }
  }

  /**
   * Pass the input geometry to a worker function to compute the translation.
   */
  updateValueButton(setInputsChanged) {
    //this.setInputsChanged = setInputsChanged;
    if (this.inputsAreReady()) {
      // Only checks AP inputs, not the placement values themselves.
      if (this.cancelationHandle) {
        // There's an in-progress nesting worker. Cancel it and start another nesting
        // computation with the new inputs.
        this.cancelationHandle();
      }
      this.setProcessing();
      var inputGeom = this.findIOValue("geometry");
      var sheetWidth = this.findIOValue("Sheet Width");
      var sheetHeight = this.findIOValue("Sheet Height");
      var partPadding = this.findIOValue("Part Padding");

      if (!inputGeom) {
        this.setError('"geometry" input is missing');
        return;
      }

      GlobalVariables.cad
        .layout(
          inputGeom,
          proxy((progress, cancelationHandle) => {
            if (this.getState().status == Status.PROCESSING) {
              this.progress = progress;
              this.cancelationHandle = cancelationHandle;
            }
          }),
          proxy((message) => {
            this.setWarning(message);
          }),
          proxy((placements) => {
            this.handleNewPlacements(placements);
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
          this.getContext(),
          this.placements
        )
        .then((layoutAndPositions) => {
          const [layout, positions] = layoutAndPositions;
          this.handleNewPlacements(positions, true);
        })
        .catch(this.alertingErrorHandler())
        .finally(() => {
          this.cancelationHandle = undefined;
          this.progress = 1.0;
        });
    }
  }

  haltAndDisplay() {
    if (this.cancelationHandle) {
      this.cancelationHandle();
      this.cancelationHandle = undefined;
    }
    this.progress = 1.0;
    if (this.placements != undefined) {
      this.displayLayout(true);
    } else {
      this.setWaiting();
    }
  }

  createInputParams(setInputChanged) {
    this.setInputChanged = setInputChanged;
    const placements = this.getPlacements();

    let inputParams = super.createInputParams();

    inputParams["Compute Layout"] = {
      type: "button",
      label:
        this.getState().status == Status.PROCESSING
          ? "Halt Layout"
          : "Compute Layout",
      onClick: () => {
        if (this.getState().status == Status.PROCESSING) {
          this.haltAndDisplay();
        } else {
          this.updateValueButton();
        }
        setInputChanged();
      },
    };

    let prepareLabel = (sheet, index, totalsheets) => {
      if (totalsheets > 1) {
        return "sheet " + sheet + " p" + index;
      } else {
        return " " + index;
      }
    };

    //Expose the stored positions
    let part_counter = 0;
    const totalSheets = placements.length;
    placements.forEach((sheet, index) => {
      sheet.forEach((placement, part_num) => {
        inputParams[this.uniqueID + "position" + part_counter] = {
          type: "point",
          value: [
            placement.translate.x,
            placement.translate.y,
            placement.rotate,
          ],
          label: prepareLabel(index, part_num, totalSheets),
          step: 0.01,
          onChange: (value, index) => {
            const match = index.match(/position(\d+)/);
            const indexNumber = match ? parseInt(match[1], 10) : null;

            if (indexNumber != null) {
              const placement = placements.flat()[indexNumber];
              //Update the placement with the new value];
              //If anything has changed we need to update the value and recompute
              const [x, y, z] = Array.isArray(value)
                ? value
                : [value?.x, value?.y, value?.z];
              if (
                placement.translate.x !== x ||
                placement.translate.y !== y ||
                placement.rotate !== z
              ) {
                placement.translate.x = x;
                placement.translate.y = y;
                placement.rotate = z;
                this.handleNewPlacements(this.getPlacements(), true);
              }
            }
          },
        };
        part_counter++;
      });
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
