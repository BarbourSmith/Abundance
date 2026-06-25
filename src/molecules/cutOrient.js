import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
//import GlobalVariables from '../js/globalvariables.js'
import { proxy } from "comlink";
import { Status } from "../prototypes/observableEntity.js";
import * as THREE from "three";
import * as util from "../worker/util.ts";

/**
 * Orient all given parts to the best orientation for cutting. Returns a new assembly of the oriented parts.
 * Selection is done by selecting the face which should be "down" on the bed of the cutting machine. The returned
 * assembly is best-effort, and we loosely pack parts in to avoid overlap.
 *
 * Recommended to pair this atom with cutlayout which takes the pre-oriented parts and does a tighter packing of
 * them, as well as grouping into sheets.
 */
export default class CutOrient extends Atom {
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
    this.atomType = "Cut Orient";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "cutOrient";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Cut Orient";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Orient parts to be as suitable as possible for cutting.";
    /**
     * The array of placements returned by the layout function
     * @type {array}
     */
    this.orientations = [];
    this.orientationsFor = null;
    this.orientationsForHashed = null;

    this.computing = false;

    this.addAllIOs([
      { name: "geometry", valueType: "geometry", type: "input" },
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

  /**
   * Get the orientation configuration from the current inputs
   * @returns {object} Orientation configuration object
   */
  getOrientationConfig() {
    return {
      units:
        GlobalVariables.topLevelMolecule.units[
          GlobalVariables.topLevelMolecule.unitsKey
        ],
    };
  }

  saveAndDisplayOrientations(orientations, inputGeom) {
    this.orientations = orientations;
    this.orientationsFor = inputGeom;
    this.orientationsForHashed = util.hashAssembly(inputGeom);
    return GlobalVariables.cad.displayOrientation(
      inputGeom,
      this.orientations,
      this.getOrientationConfig(),
      this.getContext(),
    );
  }

  compute(inputs) {
    const inputGeom = inputs.geometry;
    if (
      util.hashAssembly(inputGeom) != this.orientationsForHashed ||
      this.orientations.length == 0
    ) {
      // No valid cached orientations, so we need to recompute them
      return GlobalVariables.cad
        .orient(inputGeom, this.getOrientationConfig(), this.getContext())
        .then(([result, orientations]) => {
          return this.saveAndDisplayOrientations(orientations, inputGeom);
        });
    } else {
      // We have valid cached orientations, so we can just display them
      return this.saveAndDisplayOrientations(this.orientations, inputGeom);
    }
  }

  createInputParams(setInputChanged) {
    let inputParams = super.createInputParams(setInputChanged);

    this.orientations.forEach((orientation, index) => {
      inputParams[this.uniqueID + "orientation" + index] = {
        type: "number",
        value: orientation.downwardFaceIndex,
        label: "Underside Face pt" + index,
        step: 1,
        onChange: (value, index) => {
          const match = index.match(/orientation(\d+)/);
          const indexNumber = match ? parseInt(match[1], 10) : null;

          if (indexNumber != null) {
            const orientation = this.orientations[indexNumber];
            orientation.downwardFaceIndex = value;
            this.setProcessing();
            this.saveAndDisplayOrientations(
              this.orientations,
              this.orientationsFor,
            ).then((result) => {
              console.log("result from manual orientation change: ", result);
              if (this.selected) {
                this.sendToRender();
              }
              this.setReady(result);
            });
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
    valuesObj.orientations = this.orientations;
    valuesObj.orientationsForHashed = util.hashAssembly(this.orientationsFor);

    return valuesObj;
  }
}
