import Atom from "../prototypes/atom.js";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

import GlobalVariables from "../js/globalvariables.js";
import { re } from "mathjs";

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
        name: "startX",
        valueType: "number",
        defaultValue: 0,
        type: "input",
      },
      {
        name: "startY",
        valueType: "number",
        defaultValue: 0,
        type: "input",
      },
      {
        name: "startZ",
        valueType: "number",
        defaultValue: 0,
        type: "input",
      },
      {
        name: "endX",
        valueType: "number",
        defaultValue: 10,
        type: "input",
      },
      {
        name: "endY",
        valueType: "number",
        defaultValue: 10,
        type: "input",
      },
      {
        name: "endZ",
        valueType: "number",
        defaultValue: 0,
        type: "input",
      },
      {
        name: "color",
        valueType: "string",
        defaultValue: "#dd863b",
        type: "input",
      },
    ]);

    this.color = "#dd863b";

    this.setValues(values);
  }

  /**
   * Build a ThreeJS texture/sprite from a text string and return a Sprite object.
   * @param {string} text - The text to render
   * @param {string} color - The hex color string for the text
   * @returns {THREE.Sprite}
   */
  createTextSprite(text, color) {
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
    // Scale so text appears at a reasonable size relative to the line
    sprite.scale.set(10, 5, 1);
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
    this.text = this.findIOValue("text");
    this.color = this.findIOValue("color");

    const startX = Number(this.findIOValue("startX")) || 0;
    const startY = Number(this.findIOValue("startY")) || 0;
    const startZ = Number(this.findIOValue("startZ")) || 0;
    const endX = Number(this.findIOValue("endX")) || 0;
    const endY = Number(this.findIOValue("endY")) || 0;
    const endZ = Number(this.findIOValue("endZ")) || 0;

    this.start = [startX, startY, startZ];
    this.end = [endX, endY, endZ];

    const start = new THREE.Vector3(startX, startY, startZ);
    const end = new THREE.Vector3(endX, endY, endZ);
    const labelText = String(this.text || "label");
    const color = String(this.color || "#d72020");

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

    // --- Text sprite (placed slightly offset from the midpoint of the line) ---
    const sprite = this.createTextSprite(String(labelText), color);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Determine if the line is more vertical or horizontal
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    // Offset direction: above for horizontal, right for vertical
    let offset = new THREE.Vector3(0, 0, 0);
    const OFFSET_DIST = 2.5;
    if (dy > dx) {
      // More vertical: offset to the right (positive x)
      offset.set(OFFSET_DIST, 0, 0);
    } else {
      // More horizontal: offset above (positive y)
      offset.set(0, OFFSET_DIST, 0);
    }
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
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Determine if the line is more vertical or horizontal
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    // Offset direction: above for horizontal, right for vertical
    let offset = new THREE.Vector3(0, 0, 0);
    const OFFSET_DIST = 2.5;
    if (dy > dx) {
      // More vertical: offset to the right (positive x)
      offset.set(OFFSET_DIST, 0, 0);
    } else {
      // More horizontal: offset above (positive y)
      offset.set(0, OFFSET_DIST, 0);
    }

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
        scale: [10, 5, 1],
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
                //this.onUpstreamChange();
              }
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

  /**
   * Serialize the atom's state. Uses the default implementation since all
   * label properties are stored as IO values.
   */
  serialize(offset = { x: 0, y: 0 }) {
    var thisAsObject = super.serialize(offset);
    thisAsObject.start = this.start;
    thisAsObject.end = this.end;
    thisAsObject.text = this.text;
    thisAsObject.color = this.color;
    return thisAsObject;
  }
}
