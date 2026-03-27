import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
//import GlobalVariables from '../js/globalvariables.js'
import { proxy } from "comlink";
import { Status } from "../prototypes/observableEntity.js";
import * as THREE from "three";

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
    this.placementsFor = "";

    this.progress = 0.0;

    this.computing = false;

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
      {
        name: "Orientations",
        valueType: "number",
        defaultValue: 12,
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
      yInPixels + radiusInPixels / 2,
    );
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 2,
      yInPixels + radiusInPixels / 2,
    );
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(xInPixels - radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 2,
      yInPixels + radiusInPixels / 2,
    );
    //GlobalVariables.c.fill()
    GlobalVariables.c.setLineDash([3, 3]);
    GlobalVariables.c.stroke();
    GlobalVariables.c.closePath();
    GlobalVariables.c.beginPath();
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 4,
      yInPixels - radiusInPixels / 1.7,
    );
    GlobalVariables.c.lineTo(
      xInPixels - radiusInPixels / 4,
      yInPixels - radiusInPixels / 2,
    );
    GlobalVariables.c.lineTo(xInPixels - radiusInPixels / 4, yInPixels);
    GlobalVariables.c.lineTo(xInPixels + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(
      xInPixels + radiusInPixels / 4,
      yInPixels - radiusInPixels / 1.7,
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
        GlobalVariables.heightToPixels(this.y),
      );
      GlobalVariables.c.arc(
        GlobalVariables.widthToPixels(this.x),
        GlobalVariables.heightToPixels(this.y),
        GlobalVariables.widthToPixels(this.radius) / 1.5,
        0,
        this.progress * Math.PI * 2,
        false,
      );
      GlobalVariables.c.closePath();
      GlobalVariables.c.fill();
    }
  }

  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    // Ensure any running layout computation is terminated to free up workers
    if (this.cancelationHandle) {
      this.cancelationHandle();
      this.cancelationHandle = undefined;
    }

    // Dispose of Three.js geometries and materials to free GPU memory
    if (this.nonReplicadGeom) {
      if (this.nonReplicadGeom["geometry"]) {
        this.nonReplicadGeom["geometry"].forEach((geom) => {
          if (geom && geom.dispose) {
            geom.dispose();
          }
        });
        this.nonReplicadGeom["geometry"] = null;
      }
      if (this.nonReplicadGeom["material"]) {
        if (this.nonReplicadGeom["material"].dispose) {
          this.nonReplicadGeom["material"].dispose();
        }
        this.nonReplicadGeom["material"] = null;
      }
    }

    // Clear large data structures
    this.placements = [];
    this.placementsFor = null;

    // Reset computing flag to free up UI resources
    this.computing = false;
    this.progress = 0;

    return super.deleteNode(backgroundClickAfter, deletePath, silent);
  }

  handleNewPlacements(placements, forGeom, isFinalPlacement = false) {
    this.placements = placements;
    this.placementsFor = forGeom;
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

  /**
   * Get the layout configuration from the current inputs
   * @returns {object} Layout configuration object
   */
  getLayoutConfig() {
    return {
      width: this.findIOValue("Sheet Width"),
      height: this.findIOValue("Sheet Height"),
      partPadding: this.findIOValue("Part Padding"),
      units:
        GlobalVariables.topLevelMolecule.units[
          GlobalVariables.topLevelMolecule.unitsKey
        ],
      rotations: this.findIOValue("Orientations"),
    };
  }
  /** Creates three.js shape to display the size of the cutlayout sheet and set it to nonReplicadGeom */
  displaySheet(sheetCount) {
    var sheetWidth = this.findIOValue("Sheet Width");
    var sheetHeight = this.findIOValue("Sheet Height");

    // Dispose of old geometries and materials before creating new ones
    if (this.nonReplicadGeom["geometry"]) {
      this.nonReplicadGeom["geometry"].forEach((geom) => {
        if (geom && geom.dispose) {
          geom.dispose();
        }
      });
    }
    if (this.nonReplicadGeom["material"]) {
      if (this.nonReplicadGeom["material"].dispose) {
        this.nonReplicadGeom["material"].dispose();
      }
    }

    const geometryArray = [];
    const spacing = 10; // Spacing between sheets, this is arbitrary and only for visual clarity in the UI but it is also declared inside the worker for the actual layout so it should be consistent with that spacing.
    for (let i = 0; i < sheetCount; i++) {
      // Center first sheet at (0,0), others spaced in +y direction
      const yOffset = i * (sheetHeight + spacing); // 10 units spacing, adjust as needed
      const sheetShape = new THREE.Shape()
        .moveTo(-sheetWidth / 2, -sheetHeight / 2 + yOffset)
        .lineTo(-sheetWidth / 2, sheetHeight / 2 + yOffset)
        .lineTo(sheetWidth / 2, sheetHeight / 2 + yOffset)
        .lineTo(sheetWidth / 2, -sheetHeight / 2 + yOffset)
        .lineTo(-sheetWidth / 2, -sheetHeight / 2 + yOffset)
        .closePath();
      const shapeGeometry = new THREE.ShapeGeometry(sheetShape);
      shapeGeometry.name = "sheet " + (i + 1);
      geometryArray.push(shapeGeometry);
    }
    this.nonReplicadGeom["geometry"] = geometryArray;
    this.nonReplicadGeom["material"] = new THREE.MeshBasicMaterial({
      color: "lightgray",
      side: THREE.DoubleSide,
    });
  }

  displayLayout(isFinalPlacement = false) {
    const placements = this.getPlacements();

    if (this.inputsAreReady()) {
      var inputGeom = this.findIOValue("geometry");
      this.displaySheet(placements.length);
      const priorStatus = this.status;
      this.setProcessing();
      console.log("Displaying layout with " + placements.length + " sheets."); // replaced the trace since it was too long
      return GlobalVariables.cad
        .displayLayout(
          inputGeom,
          placements,
          proxy((message) => {
            // TODO(tristan): warnings get cleared whenever we setReady.
            this.setWarning(message);
          }),
          this.getLayoutConfig(),
          this.getContext(),
        )
        .then((result) => {
          if (this.selected) {
            this.sendToRender();
          }
          // Only update our status if this is the final placement
          if (isFinalPlacement) {
            this.setReady(result);
            if (this.setInputChanged) {
              this.setInputChanged(this.status);
            }
          } else {
            this.setStatus(priorStatus);
            this.value = result;
          }
        });
    } else {
      return Promise.resolve();
    }
  }

  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }
    // No-op if we're currently processing a layout.
    if (this.status === Status.PROCESSING) {
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

    // If we have saved placements, try to display them with the current geometry.
    // If the geometry structure has changed, displayLayout will fail and we'll warn the user and reset placements.
    if (this.placements?.length > 0) {
      this.displayLayout(true).catch(() => {
        console.warn(
          "Failed to display saved placements with new geometry. Clearing placements.",
        );
        const event = new CustomEvent("user-notification", {
          detail: {
            message:
              "Your geometry has changed since you last computed cutLayout. CutLayout is resetting to default placements.",
            type: "warning",
          },
        });
        window.dispatchEvent(event);
        // If displayLayout fails we have an inconsistent state between the current geom and whatever
        // saved placements are here. Clear the placements and create default ones instead.
        this.placements = [];
        this.placementsFor = "";
        this.createDefaultPlacements();
      });
    } else {
      // No saved placements, set to waiting and wait for user to compute layout with the new geometry.
      this.setStatus(Status.WAITING);
      console.trace("No saved placements, waiting for user to compute layout.");
    }
  }

  /**
   * Create default placements for all parts at (0,0) with 0° rotation
   */
  createDefaultPlacements() {
    // Cancel any in-progress layout computation
    if (this.cancelationHandle) {
      this.cancelationHandle();
      this.cancelationHandle = undefined;
    }

    if (!this.inputsAreReady()) {
      this.setWaiting();
      return;
    }

    var inputGeom = this.findIOValue("geometry");

    if (!inputGeom) {
      this.setWaiting();
      return;
    }

    this.setProcessing();

    GlobalVariables.cad
      .createAndDisplayDefaultLayout(
        inputGeom,
        proxy((message) => {
          this.setWarning(message);
        }),
        this.getLayoutConfig(),
        this.getContext(),
      )
      .then(([result, placements]) => {
        this.handleNewPlacements(placements, inputGeom, true);
        this.setReady(result);
      })
      .catch((err) => {
        this.alertingErrorHandler()(err);
        this.selected = false; // Deselect self so that the atom renders in red with the warning attached.
      })
      .finally(() => {
        this.cancelationHandle = undefined;
        this.progress = 1.0;
        // Clear the worker cache to free up memory
        if (GlobalVariables.cad.clearRotateCache) {
          GlobalVariables.cad.clearRotateCache();
        }
      });
  }

  /**
   * Pass the input geometry to a worker function to compute the translation.
   */
  computeValueButton(setInputChanged) {
    //this.setInputsChanged = setInputsChanged;
    this.computing = true;
    setInputChanged(this.progress);
    if (this.inputsAreReady()) {
      // Only checks AP inputs, not the placement values themselves.
      if (this.cancelationHandle) {
        // There's an in-progress nesting worker. Cancel it and start another nesting
        // computation with the new inputs.
        this.cancelationHandle();
        this.cancelationHandle = undefined;
        // Give the worker a moment to terminate before starting a new one
        // This prevents accumulation of background workers
        setTimeout(() => this.startLayout(setInputChanged), 100);
        return;
      }
      this.startLayout(setInputChanged);
    }
  }

  /**
   * Helper method to start the layout computation
   */
  startLayout(setInputChanged) {
    this.setProcessing();
    var inputGeom = this.findIOValue("geometry");

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
          this.handleNewPlacements(placements, inputGeom);
        }),
        this.getLayoutConfig(),
        this.getContext(),
        this.placements,
      )
      .then((layoutAndPositions) => {
        const [layout, positions] = layoutAndPositions;
        this.handleNewPlacements(positions, inputGeom, true);
      })
      .catch((err) => {
        this.alertingErrorHandler()(err);
        this.selected = false; // Deselect self so that the atom renders in red with the warning attached.
      })
      .finally(() => {
        this.cancelationHandle = undefined;
        console.log(this.progress);
        this.computing = false;
        // Clear the worker cache to free up memory
        if (GlobalVariables.cad.clearRotateCache) {
          GlobalVariables.cad.clearRotateCache();
        }
        setInputChanged(this.progress);
        this.progress = 1.0;
      });
  }

  haltAndDisplay(setInputChanged) {
    if (this.cancelationHandle) {
      this.cancelationHandle();
      this.cancelationHandle = undefined;
    }
    this.progress = 1.0;
    this.computing = false;
    this.setWaiting();
    if (this.placements != undefined) {
      this.displayLayout(true);
    }
    setInputChanged(this.progress);
  }

  createInputParams(setInputChanged) {
    this.setInputChanged = setInputChanged;
    const placements = this.getPlacements();

    let inputParams = super.createInputParams();

    // If computing, disable all input params
    if (this.computing) {
      for (const key in inputParams) {
        if (Object.prototype.hasOwnProperty.call(inputParams, key)) {
          inputParams[key].disabled = true;
        }
      }
    }

    if (!this.computing) {
      inputParams["Compute Layout"] = {
        type: "button",
        label: "Compute Layout",
        title:
          "Compute the ideal layout based on the current geometry and layout configuration",
        onClick: () => {
          this.computeValueButton(setInputChanged);
        },
      };
    } else {
      inputParams["Halt Layout"] = {
        type: "button",
        label: "Halt Layout",
        title: "Halt the current layout computation",
        onClick: () => {
          this.haltAndDisplay(setInputChanged);
        },
      };
    }

    inputParams["Reset Layout"] = {
      type: "button",
      label: "Reset Layout",
      disabled: this.computing,
      title:
        "Reset all part placements to a default position to manually arrange them",
      onClick: () => {
        this.placements = [];
        this.placementsFor = "";
        this.createDefaultPlacements();
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
                this.handleNewPlacements(
                  this.getPlacements(),
                  this.placementsFor,
                  true,
                );
              }
            }
          },
          disabled: this.computing,
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
