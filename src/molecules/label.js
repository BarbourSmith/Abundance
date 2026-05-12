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
        defaultValue: "#3F3CDD",
        type: "input",
      },
      {
        name: "fontSize",
        valueType: "number",
        defaultValue: 40,
        type: "input",
      },
    ]);

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
   * @param {number} lineLength - Length of the label line to scale text proportionally
   * @param {number} fontSize - Font size multiplier (1 = default)
   * @returns {THREE.Sprite}
   */
  createTextSprite(text, color, lineLength = 10, fontSize = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = 2048; // Large width to accommodate longer text, will be scaled down by sprite scale
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const baseFontSize = 40;
    const scaledFontSize = Math.round(baseFontSize * fontSize);
    ctx.font = `Bold ${scaledFontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw stroke (text color)
    ctx.strokeStyle = color;
    ctx.lineWidth = fontSize * 0.4; // Line width for text stroke, scaled with font size
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

    // Draw fill (white)
    ctx.fillStyle = "white";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false, // Render label text on top so it remains visible regardless of depth
    });
    const sprite = new THREE.Sprite(material);
    // Scale based on line length and font size
    const scaleX = lineLength * 30 * fontSize;
    const scaleY = lineLength * 60 * fontSize;

    sprite.scale.set(scaleX, scaleY, 1);
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
    let fontSize = Number(this.findIOValue("fontSize") || 10);

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
    const color = String(this.findIOValue("color") || "#3F3CDD");

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

    // --- Calculate perpendicular direction for text offset and segments ---
    const lineDir = new THREE.Vector3().subVectors(end, start).normalize();

    // Find a perpendicular direction to the line that works for any orientation
    // If line is mostly horizontal, use vertical as reference; if mostly vertical, use horizontal
    let referenceVec;
    if (Math.abs(lineDir.z) < 0.9) {
      // Line is mostly horizontal, use vertical as reference to get perpendicular in XY plane
      referenceVec = new THREE.Vector3(0, 0, 1);
    } else {
      // Line is mostly vertical, use horizontal as reference
      referenceVec = new THREE.Vector3(1, 0, 0);
    }

    const segmentDir = new THREE.Vector3()
      .crossVectors(lineDir, referenceVec)
      .normalize();

    // For text, use perpendicular in XY plane
    const perpDir = new THREE.Vector3(-lineDir.y, lineDir.x, 0).normalize();

    // --- End segments perpendicular to the line ---
    // Length of the segments (proportional to line length)
    const lineLength = start.distanceTo(end);
    const endSegmentLength = Math.max(lineLength * 0.05, lineLength * 0.02); // 5% of line length, minimum 2%

    // Start perpendicular segment
    const startSegStart = new THREE.Vector3()
      .copy(start)
      .sub(segmentDir.clone().multiplyScalar(endSegmentLength / 2));
    const startSegEnd = new THREE.Vector3()
      .copy(start)
      .add(segmentDir.clone().multiplyScalar(endSegmentLength / 2));

    const startSegGeo = new LineGeometry();
    startSegGeo.setPositions(
      startSegStart.toArray().concat(startSegEnd.toArray()),
    );
    const startSegMat = new LineMaterial({
      color: color,
      linewidth: 5,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    const startSegLine = new Line2(startSegGeo, startSegMat);
    startSegLine.name = "label-end-segment-start";
    geometryArray.push(startSegLine);

    // End perpendicular segment
    const endSegStart = new THREE.Vector3()
      .copy(end)
      .sub(segmentDir.clone().multiplyScalar(endSegmentLength / 2));
    const endSegEnd = new THREE.Vector3()
      .copy(end)
      .add(segmentDir.clone().multiplyScalar(endSegmentLength / 2));

    const endSegGeo = new LineGeometry();
    endSegGeo.setPositions(endSegStart.toArray().concat(endSegEnd.toArray()));
    const endSegMat = new LineMaterial({
      color: color,
      linewidth: 5,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    const endSegLine = new Line2(endSegGeo, endSegMat);
    endSegLine.name = "label-end-segment-end";
    geometryArray.push(endSegLine);

    // --- Text sprite (positioned above the line like an underscore) ---
    const sprite = this.createTextSprite(
      String(labelText),
      color,
      lineLength,
      fontSize,
    );
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Use the perpendicular direction already calculated for end segments
    // Position text above the line at a fixed offset distance
    const OFFSET_DIST = 2.5; //* unitScale;
    const offsetVec = perpDir.clone().multiplyScalar(OFFSET_DIST);
    sprite.position.set(
      mid.x + offsetVec.x,
      mid.y + offsetVec.y,
      mid.z + offsetVec.z,
    );
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
      fontSize,
      mid,
      offsetVec,
    );
  }

  buildSerializableLabelGeometry(
    start,
    end,
    labelText,
    color,
    fontSize = 10,
    movement = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
  ) {
    const unitScale = this.getUnitScale();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // Calculate perpendicular direction to the line
    const lineDir = new THREE.Vector3().subVectors(end, start).normalize();

    // Find a perpendicular direction that works for any line orientation
    let referenceVec;
    if (Math.abs(lineDir.z) < 0.9) {
      // Line is mostly horizontal, use vertical as reference
      referenceVec = new THREE.Vector3(0, 0, 1);
    } else {
      // Line is mostly vertical, use horizontal as reference
      referenceVec = new THREE.Vector3(1, 0, 0);
    }

    const segmentDir = new THREE.Vector3()
      .crossVectors(lineDir, referenceVec)
      .normalize();

    // For text, use perpendicular in XY plane
    const perpDir = new THREE.Vector3(-lineDir.y, lineDir.x, 0).normalize();
    const OFFSET_DIST = 2.5; //* unitScale;
    const offset = perpDir.clone().multiplyScalar(OFFSET_DIST);

    // Calculate end segments
    const lineLength = start.distanceTo(end);
    const endSegmentLength = Math.max(lineLength * 0.05, lineLength * 0.02); // 5% of line length, minimum 2%

    const startSegStart = new THREE.Vector3()
      .copy(start)
      .sub(segmentDir.clone().multiplyScalar(endSegmentLength / 2));
    const startSegEnd = new THREE.Vector3()
      .copy(start)
      .add(segmentDir.clone().multiplyScalar(endSegmentLength / 2));

    const endSegStart = new THREE.Vector3()
      .copy(end)
      .sub(segmentDir.clone().multiplyScalar(endSegmentLength / 2));
    const endSegEnd = new THREE.Vector3()
      .copy(end)
      .add(segmentDir.clone().multiplyScalar(endSegmentLength / 2));

    return {
      type: "Label",
      fontSize: fontSize,
      line: {
        start: start.toArray(),
        end: end.toArray(),
        color: color,
        linewidth: 5,
      },
      endSegments: {
        start: {
          p1: startSegStart.toArray(),
          p2: startSegEnd.toArray(),
        },
        end: {
          p1: endSegStart.toArray(),
          p2: endSegEnd.toArray(),
        },
        color: color,
        linewidth: 5,
      },
      text: {
        value: labelText,
        color: color,
        position: [mid.x + offset.x, mid.y + offset.y, mid.z + offset.z],
        scale: [lineLength * 0.1 * fontSize, lineLength * 0.05 * fontSize, 1],
        font: `Bold ${fontSize}px Arial`,
        linewidth: fontSize * 0.4, // Line width for text stroke, scaled with font size
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

  createInputParams(setInputChanged) {
    let inputParams = super.createInputParams(setInputChanged);

    if (this.inputs) {
      this.inputs.forEach((input) => {
        if (input.name === "text") {
          const checkConnector = () => {
            return input.connectors.length > 0;
          };
          inputParams[this.uniqueID + "text"] = {
            type: "string",
            value: input.value,
            label: "Label text",
            disabled: checkConnector(),
            onChange: async (value) => {
              if (input.value !== value) {
                input.setValue(value);
              }
            },
          };
        } else if (input.name === "fontSize") {
          inputParams[this.uniqueID + "fontSize"] = {
            type: "range",
            value: input.value,
            label: "Font size",
            min: 0.5,
            max: 3,
            step: 0.1,
            onChange: (value) => {
              input.setValue(value);
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
