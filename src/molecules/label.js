import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { sideDataOf, withSideData } from "../js/sideData.js";
import { unitAbbreviation, unitsContextOf } from "../js/units.js";

/** The text old projects saved by default; it now means "show the length". */
const LEGACY_DEFAULT_TEXT = "label";

/**
 * This class creates the label atom, which adds a dimension label (a line with
 * end marks and text) to the 3D view. The input geometry passes through
 * unchanged, carrying the label as side data (see src/js/sideData.js) that
 * Atom's reconstructLabelGeometry draws and Move/Rotate carry along.
 *
 * The label measures either:
 * - an edge picked on the input geometry (its two endpoints), or
 * - between two anchors, each typed coordinates, a wired point, or a face
 *   picked on the input geometry (its center).
 *
 * Its text is the measured length in project units unless text is typed.
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
      "Adds a dimension label with a line and text to the 3D view, measuring a picked edge or between two points or faces. The geometry is passed through unchanged.";

    /**
     * Picks made on the input geometry, as the 3D view's selection mode
     * reports them ({ kind, leaf, index }). `edge` measures that edge; `start`
     * and `end` are faces used as the ends when no edge is picked.
     * @type {{edge: object|null, start: object|null, end: object|null}}
     */
    this.anchors = { edge: null, start: null, end: null };

    /**
     * What each end of the label uses, as chosen in the panel: the start is
     * "edge" (measure an edge), "face" or "point"; the end is "face" or
     * "point". Unset until a choice is made, then saved.
     * @type {{start: string, end: string}|null}
     */
    this.anchorModes = null;

    /**
     * Whether the text shows the "measure"d length or "custom" text, as
     * chosen in the panel. Unset until a choice is made, then saved.
     * @type {"measure"|"custom"|null}
     */
    this.textMode = null;

    /**
     * The axis the line is offset along, "x" or "y", as chosen in the panel.
     * Unset means the one more across the line.
     * @type {"x"|"y"|null}
     */
    this.offsetAxisChoice = null;

    this.addAllIOs([
      { name: "geometry", valueType: "geometry", type: "input" },
      { name: "geometry", valueType: "geometry", type: "output" },
      {
        name: "text",
        valueType: "string",
        defaultValue: "",
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
        defaultValue: 1,
        type: "input",
      },
      {
        name: "offset",
        valueType: "number",
        defaultValue: 0,
        type: "input",
      },
    ]);

    this.setValues(values);
    this.anchors = { edge: null, start: null, end: null, ...this.anchors };
    // Labels saved before the choices existed: follow their picks
    this.anchorModes = {
      start: this.anchors.edge ? "edge" : this.anchors.start ? "face" : "point",
      end: this.anchors.end ? "face" : "point",
      ...this.anchorModes,
    };
  }

  /** The text size multiplier, 0.5 to 3. Old projects saved 40 by default. */
  textScale() {
    const value = Number(this.findIOValue("fontSize"));
    if (!Number.isFinite(value) || value <= 0 || value > 3) return 1;
    return Math.max(0.5, value);
  }

  /** The measured length formatted in the project's units. */
  formatLength(length) {
    const units = unitsContextOf(this);
    if (units === "Inches") return `${Number(length.toFixed(2))} in`;
    if (units === "MM") return `${Number(length.toFixed(1))} mm`;
    return String(Number(length.toFixed(2)));
  }

  /** The typed text, without old projects' default "label". */
  typedText() {
    const typed = String(this.findIOValue("text") ?? "").trim();
    return typed === LEGACY_DEFAULT_TEXT ? "" : typed;
  }

  /**
   * "measure" or "custom". Labels saved before the choice show custom text
   * when they have some typed or wired in.
   */
  currentTextMode() {
    if (this.textMode) return this.textMode;
    const wired = this.inputs?.find((i) => i.name === "text")?.connectors
      .length;
    return wired || this.typedText() ? "custom" : "measure";
  }

  /** The label text: the measured length, or the custom text if any. */
  labelText(length) {
    const typed = this.typedText();
    return this.currentTextMode() === "custom" && typed
      ? typed
      : this.formatLength(length);
  }

  /** Choose whether the text shows the length or custom text. */
  chooseTextMode(mode) {
    this.textMode = mode;
    this.refreshAnchors();
  }

  /**
   * Coordinates for the picked edge and faces, from the mesh workers.
   * @returns {Promise<object[]>} One result (or null) per ref
   */
  async resolvePicks(geometry, refs) {
    if (!refs.length || !GlobalVariables.pool) return refs.map(() => null);
    const worker = await GlobalVariables.pool.proxy();
    return worker.resolveSelectionPoints(geometry, refs, this.getContext());
  }

  /**
   * The label's two ends: a picked edge's endpoints, or each end's picked
   * face center, wired point or typed coordinates.
   * @returns {Promise<{start: number[], end: number[]}>}
   */
  async resolveEnds(geometry) {
    const { edge, start, end } = this.anchors;
    if (edge && this.anchorModes.start === "edge") {
      const [resolved] = await this.resolvePicks(geometry, [edge]);
      if (!resolved) {
        throw new Error(
          "The picked edge isn't on the model any more. Pick the edge again.",
        );
      }
      return { start: resolved.start, end: resolved.end };
    }

    const faces = [start, end].filter(Boolean);
    const centers = await this.resolvePicks(geometry, faces);
    const centerOf = (pick) => {
      const resolved = centers[faces.indexOf(pick)];
      if (!resolved) {
        throw new Error(
          "A picked face isn't on the model any more. Pick the face again.",
        );
      }
      return resolved.center;
    };
    return {
      start: start
        ? centerOf(start)
        : await this.extractCoordinates(this.findIOValue("startPosition")),
      end: end
        ? centerOf(end)
        : await this.extractCoordinates(this.findIOValue("endPosition")),
    };
  }

  /**
   * The serializable label that Atom.reconstructLabelGeometry draws and
   * Move/Rotate atoms transform (src/js/sideData.js).
   */
  serializeLabel(start, end) {
    const color = String(this.findIOValue("color") || "#3F3CDD");
    const length = Math.hypot(...start.map((v, i) => end[i] - v));
    const dir = start.map((v, i) => (end[i] - v) / (length || 1));
    this.lineDirection = dir;

    // The offset moves the line along X or Y, + or -
    const axis = this.offsetAxis(dir);
    const away = axis === "x" ? [1, 0, 0] : [0, 1, 0];
    const shift = (p, distance) => p.map((v, i) => v + away[i] * distance);

    const offset = this.offsetDistance();
    const lineStart = shift(start, offset);
    const lineEnd = shift(end, offset);
    // Extension lines: from just off the part to just past the line
    const gap = offset * 0.1;
    const past = offset + Math.sign(offset) * length * 0.025;

    return {
      type: "Label",
      line: { start: lineStart, end: lineEnd, color, linewidth: 1.5 },
      arrows: true,
      ...(offset
        ? {
            endSegments: {
              start: { p1: shift(start, gap), p2: shift(start, past) },
              end: { p1: shift(end, gap), p2: shift(end, past) },
              color,
              linewidth: 1,
              opacity: 0.45,
            },
          }
        : {}),
      text: {
        value: this.labelText(length),
        color,
        position: lineStart.map((v, i) => (v + lineEnd[i]) / 2),
        // Text size in screen pixels: it shrinks with the line on screen,
        // between these
        size: 16 * this.textScale(),
        minSize: 10 * this.textScale(),
      },
      movement: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * How far the line sits from what it measures along the offset axis, in
   * project units. Negative is the - side.
   */
  offsetDistance() {
    const value = Number(this.findIOValue("offset"));
    return Number.isFinite(value) ? value : 0;
  }

  /** Whether the line runs along an axis, so offsetting along it would only slide it. */
  runsAlong(axis, dir = this.lineDirection) {
    return Boolean(dir) && Math.abs(dir[axis === "x" ? 0 : 1]) > 0.99;
  }

  /**
   * The axis the line is offset along: the chosen one, unless the line runs
   * along it, else the one more across the line.
   */
  offsetAxis(dir = this.lineDirection) {
    const choice = this.offsetAxisChoice;
    if (choice && !this.runsAlong(choice, dir)) return choice;
    if (!dir) return "x";
    return Math.abs(dir[0]) <= Math.abs(dir[1]) ? "x" : "y";
  }

  /** Choose the axis the line is offset along. */
  chooseOffsetAxis(axis) {
    this.offsetAxisChoice = axis;
    this.refreshAnchors();
  }

  /** The offset slider's top: about half the model's size, rounded up. */
  offsetSliderMax() {
    const bounds = this.modelBounds;
    const size = bounds
      ? Math.max(...bounds.max.map((v, i) => v - bounds.min[i]))
      : 0;
    const wanted = Math.max(size / 2, Math.abs(this.offsetDistance()), 1);
    const power = 10 ** Math.floor(Math.log10(wanted));
    const nice = [1, 2, 5, 10].find((m) => m * power >= wanted);
    return nice * power;
  }

  /**
   * Compute the label atom: work out its ends and pass the input geometry
   * through with the label attached.
   * @returns {Promise} The input geometry, carrying only the label;
   *   outputSideData adds back what the input carried
   */
  async compute() {
    const assembly = this.findIOValue("geometry");
    const { start, end } = await this.resolveEnds(assembly);
    const [bounds] = await this.resolvePicks(assembly, [{ kind: "bounds" }]);
    this.modelBounds = bounds;
    this.serializedLabel = this.serializeLabel(start, end);
    return withSideData(assembly, [this.serializedLabel]);
  }

  /** The input's labels and references, and this label. */
  outputSideData(inputs, value) {
    return [...sideDataOf(inputs.geometry), ...sideDataOf(value)];
  }

  /** Recompute and refresh the panel after the picks or choices change. */
  refreshAnchors() {
    this.onUpstreamChange();
    this.setInputChanged?.(String(Date.now()));
  }

  /** Stop waiting for a click on the model, so another choice can be made. */
  cancelPicking() {
    if (GlobalVariables.selectionModeAtom) GlobalVariables.exitSelectionMode();
  }

  /**
   * Choose what one end uses. Edge and face start picking on the model;
   * point uses the typed or wired coordinates.
   * @param {"start"|"end"} slot - Which end
   * @param {"edge"|"face"|"point"} mode - What it uses
   */
  chooseAnchor(slot, mode) {
    this.cancelPicking();
    const wasMode = this.anchorModes[slot];
    this.anchorModes = { ...this.anchorModes, [slot]: mode };
    const anchors = { ...this.anchors };
    if (slot === "start" && mode !== "edge") anchors.edge = null;
    if (mode !== "face") anchors[slot] = null;
    this.anchors = anchors;

    if (mode === "point") {
      this.refreshAnchors();
    } else {
      if (wasMode !== mode) this.refreshAnchors();
      this.startPicking(mode, mode === "edge" ? "edge" : slot);
    }
  }

  /**
   * Pick an edge or face on the input geometry in the 3D view, using the
   * selection mode Input atoms use. The first click sets the pick and exits.
   * @param {"edge"|"face"} kind - What to pick
   * @param {"edge"|"start"|"end"} slot - Which pick to set
   */
  startPicking(kind, slot) {
    this.cancelPicking();
    const label = this;
    const current = this.anchors[slot];
    const highlight = current ? { [current.leaf]: [current.index] } : {};
    const choose = (leaf, index) => {
      label.anchors = { ...label.anchors, [slot]: { kind, leaf, index } };
      if (slot === "edge") {
        label.anchors.start = null;
        label.anchors.end = null;
      }
      // Exiting recomputes the label and refreshes the panel
      GlobalVariables.exitSelectionMode();
    };
    this.pickingSlot = slot;
    GlobalVariables.enterSelectionMode({
      type: kind === "edge" ? "edgeselect" : "faceselect",
      selectedEdgeData: kind === "edge" ? highlight : {},
      selectedFaceData: kind === "face" ? highlight : {},
      parentAP: { getState: () => ({ value: label.findIOValue("geometry") }) },
      parent: label.parent,
      getContext: () => label.getContext(),
      toggleEdgeForLeaf: choose,
      toggleFaceForLeaf: choose,
      onUpstreamChange: () => label.onUpstreamChange(),
      setInputChanged: (value) => label.setInputChanged?.(value),
    });
  }

  /** "Edge 3 of part 1", for showing a pick in the panel. */
  describePick(pick) {
    const what = pick.kind === "edge" ? "Edge" : "Face";
    return `${what} ${pick.index + 1} of part ${pick.leaf + 1}`;
  }

  /**
   * The panel: a row of choices (Edge, Face, Point) for each end, then what
   * the choice needs: the pick, or a point input. Choosing Edge for the start
   * measures that edge, so the end's choices are grayed out.
   */
  createInputParams(setInputChanged) {
    const inputParams = super.createInputParams(setInputChanged);
    const id = this.uniqueID;
    const modes = this.anchorModes;
    const measuringEdge = modes.start === "edge";
    const picking = GlobalVariables.selectionModeAtom != null;
    const input = (name) => this.inputs.find((i) => i.name === name);

    const choices = (slot) => ({
      type: "buttongroup",
      label: slot === "start" ? "Start" : "End",
      buttons: [
        {
          key: "edge",
          label: "Edge",
          title:
            slot === "start"
              ? "Measure an edge of the input geometry"
              : "Choose Edge for the start to measure an edge",
          selected: slot === "start" && measuringEdge,
          disabled: slot === "end",
        },
        {
          key: "face",
          label: "Face",
          title: `The ${slot} is the center of a face of the input geometry`,
          selected:
            !(slot === "end" && measuringEdge) && modes[slot] === "face",
          disabled: slot === "end" && measuringEdge,
        },
        {
          key: "point",
          label: "Point",
          title: `The ${slot} is a point: typed coordinates or a wired point`,
          selected:
            !(slot === "end" && measuringEdge) && modes[slot] === "point",
          disabled: slot === "end" && measuringEdge,
        },
      ].map((button) => ({
        ...button,
        onClick: () => this.chooseAnchor(slot, button.key),
      })),
    });

    // What a choice needs: the pick (click to change it), or a point input
    const details = (slot) => {
      const mode = modes[slot];
      if (mode === "point") {
        const position = input(slot + "Position");
        const value = position?.value;
        return {
          type: "point",
          value: Array.isArray(value)
            ? [value[0], value[1], value[2]]
            : [0, 0, 0],
          label: slot === "start" ? "Start point" : "End point",
          step: 0.1,
          disabled: position?.connectors.length > 0,
          onChange: (v) => position.setValue([v[0], v[1], v[2]]),
        };
      }
      const pickSlot = mode === "edge" ? "edge" : slot;
      const pick = this.anchors[pickSlot];
      const what = mode === "edge" ? "an edge" : "a face";
      return {
        type: "button",
        label:
          picking && this.pickingSlot === pickSlot
            ? `Click ${what} on the model…`
            : pick
              ? `${this.describePick(pick)} · change`
              : `Pick ${what} on the model`,
        title: `Click ${what} of the input geometry in the 3D view`,
        onClick: () => this.startPicking(mode, pickSlot),
      };
    };

    const text = input("text");
    const fontSize = input("fontSize");
    const color = input("color");
    const textMode = this.currentTextMode();
    const panel = {
      [id + "textChoice"]: {
        type: "buttongroup",
        label: "Text",
        buttons: [
          {
            key: "measure",
            label: "Length",
            title: "Show the measured length",
          },
          {
            key: "custom",
            label: "Custom text",
            title: "Show text you type",
          },
        ].map((button) => ({
          ...button,
          selected: textMode === button.key,
          onClick: () => this.chooseTextMode(button.key),
        })),
      },
    };
    if (textMode === "custom") {
      panel[id + "text"] = {
        type: "string",
        value: text.value === LEGACY_DEFAULT_TEXT ? "" : text.value,
        // No side label, so the input spans the panel
        placeholder: "Type the label text",
        disabled: text.connectors.length > 0,
        onChange: (value) => text.value !== value && text.setValue(value),
      };
    }
    Object.assign(panel, {
      [id + "startChoice"]: choices("start"),
      [id + "startDetails"]: details("start"),
      [id + "endChoice"]: choices("end"),
    });
    if (!measuringEdge) panel[id + "endDetails"] = details("end");
    const offset = input("offset");
    const offsetMax = this.offsetSliderMax();
    const axis = this.offsetAxis();
    panel[id + "offsetAxis"] = {
      type: "buttongroup",
      label: "Offset",
      buttons: ["x", "y"].map((key) => ({
        key,
        label: key.toUpperCase(),
        title: this.runsAlong(key)
          ? `The line runs along ${key.toUpperCase()}`
          : `Move the line along ${key.toUpperCase()}`,
        selected: axis === key,
        disabled: this.runsAlong(key),
        onClick: () => this.chooseOffsetAxis(key),
      })),
    };
    panel[id + "offset"] = {
      type: "rangeSlider",
      value: this.offsetDistance(),
      label: "Distance",
      title: `Move the line along ${axis.toUpperCase()}, + or -`,
      min: -offsetMax,
      max: offsetMax,
      step: offsetMax / 100,
      disabled: offset.connectors.length > 0,
      onChange: (value) => offset.setValue(value),
    };
    panel[id + "color"] = {
      type: "color",
      value: color.value,
      label: "Label color",
      onChange: (value) => color.setValue(value),
    };
    panel[id + "fontSize"] = {
      type: "range",
      value: this.textScale(),
      label: "Text size",
      min: 0.5,
      max: 3,
      step: 0.1,
      onChange: (value) => fontSize.setValue(value),
    };

    // Then this atom's own buttons (Delete Selected), leaving out the generic
    // controls for the inputs shown above
    const shown = [
      "geometry",
      "text",
      "startPosition",
      "endPosition",
      "color",
      "fontSize",
      "offset",
    ];
    Object.keys(inputParams).forEach((key) => {
      if (!shown.some((name) => key === id + name))
        panel[key] = inputParams[key];
    });
    return panel;
  }

  serialize(offset) {
    const serialized = super.serialize(offset);
    const { edge, start, end } = this.anchors;
    if (edge || start || end) {
      serialized.anchors = { edge, start, end };
    }
    serialized.anchorModes = this.anchorModes;
    serialized.textMode = this.currentTextMode();
    if (this.offsetAxisChoice) {
      serialized.offsetAxisChoice = this.offsetAxisChoice;
    }
    return serialized;
  }
}
