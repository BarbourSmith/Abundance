import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { unitAbbreviation, unitsContextOf } from "../js/units.js";

/** The text old projects saved by default; it now means "show the length". */
const LEGACY_DEFAULT_TEXT = "label";

/**
 * This class creates the label atom, which adds a dimension label (a line with
 * end marks and text) to the 3D view. The input geometry passes through
 * unchanged, carrying the label as nonReplicadSerialized data that Atom's
 * reconstructLabelGeometry draws and Move/Rotate carry along.
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
    ]);

    this.setValues(values);
    this.anchors = { edge: null, start: null, end: null, ...this.anchors };
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

  /** The label text: what's typed, or the measured length. */
  labelText(length) {
    const typed = String(this.findIOValue("text") ?? "").trim();
    return typed && typed !== LEGACY_DEFAULT_TEXT
      ? typed
      : this.formatLength(length);
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
    if (edge) {
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
   * The serializable label that Atom.reconstructLabelGeometry draws and the
   * worker's Move/Rotate actions transform.
   */
  serializeLabel(start, end) {
    const color = String(this.findIOValue("color") || "#3F3CDD");
    const length = Math.hypot(...start.map((v, i) => end[i] - v));
    const mid = start.map((v, i) => (v + end[i]) / 2);

    // End marks: perpendicular to the line, 5% of its length
    const dir = start.map((v, i) => (end[i] - v) / (length || 1));
    const ref = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const cross = [
      dir[1] * ref[2] - dir[2] * ref[1],
      dir[2] * ref[0] - dir[0] * ref[2],
      dir[0] * ref[1] - dir[1] * ref[0],
    ];
    const crossLength = Math.hypot(...cross) || 1;
    const half = (length * 0.05) / 2;
    const mark = (p, sign) =>
      p.map((v, i) => v + sign * (cross[i] / crossLength) * half);

    return {
      type: "Label",
      line: { start, end, color, linewidth: 5 },
      endSegments: {
        start: { p1: mark(start, -1), p2: mark(start, 1) },
        end: { p1: mark(end, -1), p2: mark(end, 1) },
        color,
        linewidth: 5,
      },
      text: {
        value: this.labelText(length),
        color,
        position: mid,
        // Text height in screen pixels, the same at any zoom
        screenHeight: 28 * this.textScale(),
      },
      movement: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Compute the label atom: work out its ends and pass the input geometry
   * through with the label attached.
   * @returns {Promise} The input geometry, carrying the label
   */
  async compute() {
    const assembly = this.findIOValue("geometry");
    const { start, end } = await this.resolveEnds(assembly);
    this.serializedLabel = this.serializeLabel(start, end);

    const prev = Array.isArray(assembly.nonReplicadSerialized)
      ? assembly.nonReplicadSerialized
      : assembly.nonReplicadSerialized
        ? [assembly.nonReplicadSerialized]
        : [];
    return {
      ...assembly,
      nonReplicadSerialized: [...prev, this.serializedLabel],
    };
  }

  /** Set or clear one of the picks ("edge", "start" or "end") and recompute. */
  setAnchor(slot, pick) {
    this.anchors = { ...this.anchors, [slot]: pick };
    if (slot === "edge" && pick) {
      this.anchors.start = null;
      this.anchors.end = null;
    }
    this.onUpstreamChange();
    this.setInputChanged?.(String(Date.now()));
  }

  /**
   * Pick an edge or face on the input geometry in the 3D view, using the
   * selection mode Input atoms use. The first click sets the pick and exits.
   * @param {"edge"|"face"} kind - What to pick
   * @param {"edge"|"start"|"end"} slot - Which pick to set
   */
  startPicking(kind, slot) {
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

  createInputParams(setInputChanged) {
    let inputParams = super.createInputParams(setInputChanged);
    const picking = GlobalVariables.selectionModeAtom != null;

    const pickControls = (slot, kind, pickLabel) => {
      const pick = this.anchors[slot];
      if (pick) {
        inputParams[this.uniqueID + slot + "Pick"] = {
          type: "string",
          label: pickLabel,
          value: this.describePick(pick),
          disabled: true,
        };
        inputParams[this.uniqueID + slot + "Clear"] = {
          type: "button",
          label: `Clear ${pickLabel.toLowerCase()}`,
          title: `Stop using the picked ${kind}`,
          onClick: () => this.setAnchor(slot, null),
        };
      }
      const what =
        slot === "edge"
          ? "edge to measure"
          : `${slot === "start" ? "start" : "end"} face`;
      inputParams[this.uniqueID + slot + "PickButton"] = {
        type: "button",
        label: picking
          ? "Click the model…"
          : `${pick ? "Change" : "Pick"} ${what}`,
        title: `Click ${kind === "edge" ? "an edge" : "a face"} of the input geometry in the 3D view`,
        onClick: () => (picking ? null : this.startPicking(kind, slot)),
      };
    };

    if (this.inputs) {
      this.inputs.forEach((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };
        if (input.name === "text") {
          inputParams[this.uniqueID + "text"] = {
            type: "string",
            value: input.value === LEGACY_DEFAULT_TEXT ? "" : input.value,
            label: "Label text (empty shows the length)",
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
            value: this.textScale(),
            label: "Text size",
            min: 0.5,
            max: 3,
            step: 0.1,
            onChange: (value) => {
              input.setValue(value);
            },
          };
        } else if (input.name === "startPosition" && !this.anchors.edge) {
          if (!this.anchors.start) {
            inputParams[this.uniqueID + "startPosition"] = {
              type: "point",
              value: Array.isArray(input.value)
                ? [input.value[0], input.value[1], input.value[2]]
                : [0, 0, 0],
              label: "Start position",
              step: 0.1,
              disabled: checkConnector(),
              onChange: (value) => {
                input.setValue([value[0], value[1], value[2]]);
              },
            };
          }
          pickControls("start", "face", "Start face");
        } else if (input.name === "endPosition" && !this.anchors.edge) {
          if (!this.anchors.end) {
            inputParams[this.uniqueID + "endPosition"] = {
              type: "point",
              value: Array.isArray(input.value)
                ? [input.value[0], input.value[1], input.value[2]]
                : [0, 0, 0],
              label: "End position",
              step: 0.1,
              disabled: checkConnector(),
              onChange: (value) => {
                input.setValue([value[0], value[1], value[2]]);
              },
            };
          }
          pickControls("end", "face", "End face");
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

    // Measuring an edge replaces the start and end
    pickControls("edge", "edge", "Measured edge");

    // Positions that a pick replaces aren't editable
    if (this.anchors.edge || this.anchors.start) {
      delete inputParams[this.uniqueID + "startPosition"];
    }
    if (this.anchors.edge || this.anchors.end) {
      delete inputParams[this.uniqueID + "endPosition"];
    }

    // Show the controls in reading order, with this atom's own buttons
    // (Delete Selected) last
    const order = [
      "text",
      "edgePick",
      "edgeClear",
      "edgePickButton",
      "startPosition",
      "startPick",
      "startClear",
      "startPickButton",
      "endPosition",
      "endPick",
      "endClear",
      "endPickButton",
      "color",
      "fontSize",
    ].map((name) => this.uniqueID + name);
    const ordered = {};
    order.forEach((key) => {
      if (key in inputParams) ordered[key] = inputParams[key];
    });
    Object.keys(inputParams).forEach((key) => {
      if (!(key in ordered)) ordered[key] = inputParams[key];
    });
    return ordered;
  }

  serialize(offset) {
    const serialized = super.serialize(offset);
    const { edge, start, end } = this.anchors;
    if (edge || start || end) {
      serialized.anchors = { edge, start, end };
    }
    return serialized;
  }
}
