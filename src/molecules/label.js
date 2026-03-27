import Atom from "../prototypes/atom.js";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

import GlobalVariables from "../js/globalvariables.js";
import { re } from "mathjs";

/** Number of millimeters per inch, used to scale label geometry for MM projects. */
const MM_PER_INCH = 25.4;

/**
 * This class creates the label atom which adds a dimension label (a line with
 * accompanying text) to the 3D view. The label is rendered as non-replicad
 * ThreeJS geometry and the input geometry is passed through unchanged.
 */
export default class Label extends Atom {
  /**
   * The constructor function.
   * @param {object} values An object of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Label";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Label";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Adds a dimension label with a line and text to the 3D view. The geometry is passed through unchanged.";

    this.addAllIOs([
      { name: "geometry", valueType: "geometry", type: "input" },
      { name: "geometry", valueType: "geometry", type: "output" },
      {
        name: "text",
        valueType: "string",
        defaultValue: "label",
        type: "input",
      },
      {
        name: "startPosition",
        valueType: "array",
        defaultValue: [0, 0, 0],
        type: "input",
      },
      {
        name: "endPosition",
        valueType: "array",
        defaultValue: [10, 10, 0],
        type: "input",
      },
      {
        name: "color",
        valueType: "string",
        defaultValue: "#dd863b",
        type: "input",
      },
    ]);

    console.log("Label constructor values:", values);
    this.setValues(values);
  }

  /**
   * Returns the scale factor for label geometry based on project units.
   * MM projects use coordinates ~25.4x larger than Inch projects, so the
   * sprite size and offsets must be scaled accordingly.
   * @returns {number} 25.4 for MM projects, 1 otherwise
   */
  getUnitScale() {
    return GlobalVariables.topLevelMolecule?.unitsKey === "MM"
      ? MM_PER_INCH
      : 1;
  }

  /**
   * Build a ThreeJS texture/sprite from a text string and return a Sprite object.
   * @param {string} text - The text to render
   * @param {string} color - The hex color string for the text
   * @param {number} unitScale - Scale factor based on project units (25.4 for MM, 1 for Inches)
   * @returns {THREE.Sprite}
   */
  createTextSprite(text, color, unitScale = 1) {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "Bold 40px Arial";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false, // Render label text on top so it remains visible regardless of depth
    });
    const sprite = new THREE.Sprite(material);
    // Scale so text appears at a reasonable size relative to the line, adjusted for project units
    sprite.scale.set(10 * unitScale, 5 * unitScale, 1);
    return sprite;
  }

  /**
   * Build the ThreeJS geometries (line + text sprite) and store them in
   * this.nonReplicadGeom so they get sent to the renderer.
   * @param {THREE.Vector3} start - Start point of the line
   * @param {THREE.Vector3} end - End point of the line
   * @param {string} labelText - The text to display
   * @param {string} color - The hex color string for the line and text
   */
  buildLabelGeometry() {
    // Dispose of old geometry before creating new one
    this.disposeLabelGeometry();

    let startPoint = this.findIOValue("startPosition");
    let endPoint = this.findIOValue("endPosition");
    let text = this.findIOValue("text");

    const start = new THREE.Vector3(
      Number(startPoint[0]) || 0,
      Number(startPoint[1]) || 0,
      Number(startPoint[2]) || 0,
    );
    const end = new THREE.Vector3(
      Number(endPoint[0]) || 0,
      Number(endPoint[1]) || 0,
      Number(endPoint[2]) || 0,
    );
    const labelText = String(text || "label");
    const color = String(this.findIOValue("color") || "#d72020");

    // Scale sprite size and offset based on project units (MM coords are ~25.4x larger than Inches)
    const unitScale = this.getUnitScale();

    const geometryArray = [];

    // --- Line (complete Three.js object with geometry + material) ---
    const lineGeo = new LineGeometry();
    const lineMat = new LineMaterial({
      color: color,
      linewidth: 5, // Desired width in pixels
      // You must set these uniforms in your render loop or whenever the window is resized
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    // Define points as a flat array of x, y, z coordinates
    lineGeo.setPositions(start.toArray().concat(end.toArray()));
    const line = new Line2(lineGeo, lineMat);

    line.name = "label-line";
    geometryArray.push(line);

    // --- Text sprite (positioned above the line like an underscore) ---
    const sprite = this.createTextSprite(String(labelText), color, unitScale);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Calculate perpendicular direction to the line (rotated 90 degrees in XY plane)
    const lineDir = new THREE.Vector3().subVectors(end, start);
    const perpDir = new THREE.Vector3(-lineDir.y, lineDir.x, 0).normalize();
    // Position text above the line at a fixed offset distance
    const OFFSET_DIST = 2.5 * unitScale;
    const offset = perpDir.multiplyScalar(OFFSET_DIST);
    sprite.position.set(mid.x + offset.x, mid.y + offset.y, mid.z + offset.z);
    sprite.name = "label-text";
    geometryArray.push(sprite);

    this.nonReplicadGeom = {
      geometry: geometryArray,
      material: null,
      hideMainMesh: false,
    };

    return this.buildSerializableLabelGeometry(
      start,
      end,
      labelText,
      color,
      mid,
      offset,
    );
  }

  buildSerializableLabelGeometry(
    start,
    end,
    labelText,
    color,
    movement = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
  ) {
    const unitScale = this.getUnitScale();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Calculate perpendicular direction to the line (rotated 90 degrees in XY plane)
    const lineDir = new THREE.Vector3().subVectors(end, start);
    const perpDir = new THREE.Vector3(-lineDir.y, lineDir.x, 0).normalize();
    // Position text above the line at a fixed offset distance
    const OFFSET_DIST = 2.5 * unitScale;
    const offset = perpDir.multiplyScalar(OFFSET_DIST);

    return {
      type: "Label",
      line: {
        start: start.toArray(),
        end: end.toArray(),
        color: color,
        linewidth: 5,
      },
      text: {
        value: labelText,
        color: color,
        position: [mid.x + offset.x, mid.y + offset.y, mid.z + offset.z],
        scale: [10 * unitScale, 5 * unitScale, 1],
        font: "Bold 40px Arial",
      },
      movement: { ...movement }, // e.g. {x: 10, y: 0, z: 0}
      rotation: { ...rotation }, // e.g. {x: 0, y: 0, z: Math.PI/2}
    };
  }

  /**
   * Compute the label atom: build label geometry and pass through the input geometry.
   * @param {object} inputs - The resolved input values
   * @returns {Promise} The input geometry unchanged
   */
  compute() {
    this.serializedLabel = this.buildLabelGeometry();
    let geom = this.findIOValue("geometry");
    return GlobalVariables.cad.addNonReplicadGeom(geom, this.serializedLabel);
  }

  createInputParams() {
    let inputParams = super.createInputParams();

    if (this.inputs) {
      this.inputs.forEach((input) => {
        if (input.name === "text") {
          inputParams[this.uniqueID + "text"] = {
            type: "string",
            value: input.value,
            label: "Label text",
            onChange: async (value) => {
              if (input.value !== value) {
                input.setValue(value);
              }
            },
          };
        } else if (input.name === "startPosition") {
          inputParams[this.uniqueID + "startPosition"] = {
            type: "point",
            value: [input.value[0], input.value[1], input.value[2]],
            label: "Start position",
            step: 0.1,
            onChange: (value) => {
              input.setValue([value[0], value[1], value[2]]);
            },
          };
        } else if (input.name === "endPosition") {
          inputParams[this.uniqueID + "endPosition"] = {
            type: "point",
            value: [input.value[0], input.value[1], input.value[2]],
            label: "End position",
            step: 0.1,
            onChange: (value) => {
              input.setValue([value[0], value[1], value[2]]);
            },
          };
        } else if (input.name === "color") {
          inputParams[this.uniqueID + "color"] = {
            type: "color",
            value: input.value,
            label: "Label color",
            onChange: (value) => {
              input.setValue(value);
            },
          };
        }
      });
    }

    return inputParams;
  }
}
