import React from "react";
import { useEffect, useState, useMemo } from "react";

import apiJson from "./methodsreplicad.json"; // static import of the JSON file
import abundanceJson from "./abundanceApiJson.json";
import ReactCodeEditorWithApiAutocomplete from "./ReactCodeEditorWithApiAutocomplete";
import InfoPanel from "./InfoPanel";
import { setMonacoInstance } from "../../molecules/code.js";

/**
 * Common JavaScript methods for reference panel
 */
// User Quick Guide for the Code Window
const CODE_WINDOW_GUIDE = [
  {
    name: "Code Window Quick Guide",
    usage: null,
    params: [],
    returns: null,
    detail:
      `• Define your inputs at the top using the Inputs array.\n\n` +
      `  Example:\n  const Inputs = [\n    { inputName: "shape", type: "geometry", defaultValue: null },\n    { inputName: "dist", type: "number", defaultValue: 5 },\n    { inputName: "height", type: "number", defaultValue: 10 }\n  ];\n\n` +
      `• Access imported geometry using: library[shape]\n` +
      `• Use built-in async functions (always with await):\n` +
      `  let moved = await Move(importedShape, dist, 0, 0);\n  let rotated = await Rotate(importedShape, 0, 45, 0);\n  let scaled = await Scale(importedShape, 0.8);\n  let filleted = await Fillet(moved, 0.5);\n  let chamfered = await Chamfer(moved, 0.3);\n  let assembly = await Assembly([rotated, scaled, filleted, chamfered]);\n\n` +
      `• Create new geometry with Replicad:\n` +
      `  let rect = replicad.drawRectangle(5, 7);\n  let plane = new replicad.Plane().pivot(0, 'Y');\n  let shape = rect.sketchOnPlane(plane).extrude(height);\n\n` +
      `• Wrap raw geometry as an Abundance Object:\n` +
      `  let shapeObj = {\n    geometry: [shape],\n    dimension: "3D",\n    tags: ["createdShape"],\n    color: "#A3CE5B",\n    plane: plane,\n    bom: []\n  };\n\n` +
      `• Use console.log for debugging:\n` +
      `  console.log("Bounds:", GetBounds(moved));\n\n` +
      `• Return your result at the end:\n` +
      `  return assembly;\n\n` +
      `• Built-in Functions:\n` +
      `  Move, Rotate, Scale, Assembly, Intersect, GetBounds, Fillet, Chamfer\n\n` +
      `• Tips:\n` +
      `  - Use the Replicad and Abundance panels to browse all available methods.\n` +
      `  - Hover over suggestions for parameter and return type info.\n` +
      `  - Save and close your code using the buttons below the editor.\n`,
  },
];

/*
 * CodeWindow component is a code editor window that allows the user to edit the code of the active code atom.
 */
export default function CodeWindow(props) {
  const [docvalue, setdocValue] = useState("");
  const [expandedPanel, setExpandedPanel] = useState(null); // null, 'replicad', 'abundance', 'common', or 'console'
  const [consoleErrors, setConsoleErrors] = useState([]);
  const [interpreterVersion, setInterpreterVersion] = useState(0);

  useEffect(() => {
    if (props.activeAtom != null) {
      setdocValue(props.activeAtom.code);
      setInterpreterVersion(props.activeAtom.interpreterVersion ?? 0);
    }
  }, [props.activeAtom]);

  // Subscribe to activeAtom changes to capture code execution errors
  useEffect(() => {
    if (props.activeAtom == null) return;

    const subscriberId = "codeWindowConsole";
    const handleAtomChange = () => {
      if (
        props.activeAtom.status === "error" &&
        props.activeAtom.alert &&
        props.activeAtom.alert.message
      ) {
        setConsoleErrors((prev) => [
          { message: props.activeAtom.alert.message, timestamp: new Date(), id: Date.now() + Math.random() },
          ...prev,
        ]);
      }
    };

    props.activeAtom.subscribe(handleAtomChange, subscriberId, false);

    return () => {
      props.activeAtom.unsubscribe(subscriberId);
    };
  }, [props.activeAtom]);

  /**
   * Closes the code editor window.
   */
  function closeEditor() {
    const codeWindow = document.getElementById("code-window");
    codeWindow.classList.add("code-off");
  }

  /**
   * Switches the interpreter version and persists it on the atom immediately.
   * @param {number} version - 0 = JavaScript, 1 = TypeScript
   */
  function handleVersionChange(version) {
    setInterpreterVersion(version);
    if (props.activeAtom) {
      props.activeAtom.updateInterpreterVersion(version);
    }
  }

  /**
   * Save handler invoked by the hidden save button (which in turn is clicked
   * via atom.saveCode() or Ctrl/Cmd+S). Transpilation (TS -> JS) lives on
   * the atom itself now — see Code#updateCode in molecules/code.js.
   */
  async function handleSave() {
    if (!props.activeAtom) return;
    await props.activeAtom.updateCode(docvalue);
  }

  /**
   * Process API JSON to extract method information
   */
  /**
   * Process API JSON to extract method information (Replicad style)
   * Each entry: {
   *   type: "method",
   *   requiredParams: [],
   *   optionalParams: ["position"],
   *   returns: "Vector"
   * }
   */
  const replicadMethods = useMemo(() => {
    if (!apiJson) return [];
    return Object.keys(apiJson)
      .sort()
      .map((key) => {
        const def = apiJson[key];
        const params = (def.requiredParams || []).concat(
          def.optionalParams || []
        );
        let usage;
        if (key.includes(".")) {
          // Instance method: e.g. Shape.move(x, y)
          const [typeName, methodName] = key.split(".");
          usage = `${typeName}.${methodName}(${params.join(", ")})`;
        } else {
          // Top-level: e.g. replicad.Box(x, y, z)
          usage = `replicad.${key}(${params.join(", ")})`;
        }
        return {
          name: key,
          usage,
          params,
          returns: def.returns,
          detail: def.type || "method",
        };
      });
  }, []);

  /**
   * Process Abundance API JSON to extract method information (Abundance style)
   * Each entry: {
   *   type: "function",
   *   requiredParams: ["AbundanceObject", "x", "y", "z"],
   *   optionalParams: [],
   *   usage: "await Move(AbundanceObject, x, y, z)",
   *   returns: "AbundanceObject"
   * }
   */
  const abundanceMethods = useMemo(() => {
    if (!abundanceJson) return [];
    return Object.keys(abundanceJson)
      .sort()
      .map((key) => {
        const def = abundanceJson[key];
        const params = (def.requiredParams || []).concat(
          def.optionalParams || []
        );
        // Always prepend 'await' for abundance methods
        const usage = `await ${key}(${params.join(", ")})`;
        return {
          name: key,
          usage: def.usage || usage,
          params,
          returns: def.returns,
          detail: def.type || "function",
        };
      });
  }, []);

  const togglePanel = (panel) => {
    setExpandedPanel(expandedPanel === panel ? null : panel);
  };

  return (
    <div id="code-window" className="code-off login-page code-window-div">
      <div className="code-window-container">
        <div className="code-editor-section">
          <div className="code-editor-toolbar">
            <span className="code-editor-toolbar-label">Interpreter:</span>
            <button
              className={`code-version-btn${interpreterVersion === 0 ? " active" : ""}`}
              onClick={() => handleVersionChange(0)}
              title="JavaScript mode – relaxed, no type errors"
            >
              JavaScript
            </button>
            <button
              className={`code-version-btn${interpreterVersion === 1 ? " active" : ""}`}
              onClick={() => handleVersionChange(1)}
              title="TypeScript mode – strict type checking with error highlighting"
            >
              TypeScript
            </button>
          </div>
          <ReactCodeEditorWithApiAutocomplete
            value={docvalue}
            onChange={setdocValue}
            apiJson={apiJson}
            abundanceJson={abundanceJson}
            activeAtom={props.activeAtom}
            interpreterVersion={interpreterVersion}
            onEditorReady={(editor, monaco) => {
              setMonacoInstance(monaco);
            }}
          />
        </div>
        <div className="info-panels-section">
          <InfoPanel
            title="Replicad API"
            isExpanded={expandedPanel === "replicad"}
            onToggle={() => togglePanel("replicad")}
            methods={replicadMethods}
          />
          <InfoPanel
            title="Abundance Methods"
            isExpanded={expandedPanel === "abundance"}
            onToggle={() => togglePanel("abundance")}
            methods={abundanceMethods}
          />
          <div
            className={`info-panel ${
              expandedPanel === "common" ? "expanded" : "collapsed"
            }`}
          >
            {expandedPanel === "common" ? (
              <div className="info-panel-content">
                <div className="info-panel-header">
                  <h3>Code Window Quick Guide</h3>
                  <button
                    className="collapse-btn"
                    onClick={() => togglePanel("common")}
                  >
                    ▶
                  </button>
                </div>
                <div
                  className="info-panel-body"
                  style={{
                    fontSize: ".8em",
                    lineHeight: 1.3,
                    whiteSpace: "pre-line",
                    padding: "10px 18px",
                    color: "#a8a5a5ff",
                    fontFamily: "Courier New, monospace",
                    fontWeight: 700,
                  }}
                >
                  {`
Welcome to the Code Window!

How to Use:

• Define your inputs at the top using the Inputs array:`}
                  <div className="method-item">
                    {`
  const Inputs = [
    { inputName: "shape", type: "geometry", defaultValue: null },
    { inputName: "dist", type: "number", defaultValue: 5 },
    { inputName: "height", type: "number", defaultValue: 10 }
  ]; `}{" "}
                  </div>{" "}
                  {`

• Access imported geometry using: library[shape] `}
                  <div className="method-item">
                    {`
 let importedShape = library[shape]; `}{" "}
                  </div>
                  {`

• Use built-in async functions (always with await): `}
                  <div className="method-item">
                    {`
  let moved = await Move(importedShape, dist, 0, 0);
  let rotated = await Rotate(importedShape, 0, 45, 0);
  let scaled = await Scale(importedShape, 0.8);
  let filleted = await Fillet(moved, 0.5);
  let chamfered = await Chamfer(moved, 0.3);
  let assembly = await Assembly([rotated, scaled, filleted, chamfered]);
`}{" "}
                  </div>
                  {`
• Create new geometry with Replicad:  `}
                  <div className="method-item">
                    {`
  let rect = replicad.drawRectangle(5, 7);
  let plane = new replicad.Plane().pivot(0, 'Y');
  let shape = rect.sketchOnPlane(plane).extrude(height);

`}
                  </div>
                  {`
• Wrap raw geometry as an Abundance Object: `}
                  <div className="method-item">
                    {`
  let shapeObj = {
    geometry: [shape],
    dimension: "3D",
    tags: ["createdShape"],
    color: "#A3CE5B",
    plane: plane,
    bom: []
  };  `}{" "}
                  </div>
                  {`
• Use console.log for debugging: `}
                  <div className="method-item">
                    {`
  console.log("Bounds:", GetBounds(moved)); `}{" "}
                  </div>
                  {`
• Return your result at the end. If you intent to continue using the result in further steps as a geometry, make sure to return an Abundance Object.
  `}{" "}
                  <div className="method-item">
                    {`
  return assembly;
`}{" "}
                  </div>{" "}
                  {`
Tips:
- Use the Replicad and Abundance panels to browse all available methods.
- Hover over autocomplete suggestions for parameter and return type info.
- Save and close your code using the buttons below the editor.
`}
                </div>
              </div>
            ) : (
              <div
                className="info-panel-tab"
                onClick={() => togglePanel("common")}
              >
                <span className="tab-arrow">◀</span>
                <span className="tab-label">Code Window Guide</span>
              </div>
            )}
          </div>
          <div
            className={`info-panel ${
              expandedPanel === "console" ? "expanded" : "collapsed"
            }`}
          >
            {expandedPanel === "console" ? (
              <div className="info-panel-content">
                <div className="info-panel-header">
                  <h3>Console</h3>
                  <div className="console-header-actions">
                    <button
                      className="console-clear-btn"
                      onClick={() => setConsoleErrors([])}
                      title="Clear console"
                    >
                      Clear
                    </button>
                    <button
                      className="collapse-btn"
                      onClick={() => togglePanel("console")}
                    >
                      ▶
                    </button>
                  </div>
                </div>
                <div className="info-panel-body console-body">
                  {consoleErrors.length === 0 ? (
                    <div className="no-methods">No errors</div>
                  ) : (
                    <div className="console-error-list">
                      {consoleErrors.map((entry) => (
                        <div key={entry.id} className="console-error-item">
                          <span className="console-error-time">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                          <span className="console-error-message">
                            {entry.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="info-panel-tab"
                onClick={() => togglePanel("console")}
              >
                <span className="tab-arrow">◀</span>
                <span
                  className="tab-label"
                  style={consoleErrors.length > 0 ? { color: "#e05b5b" } : {}}
                >
                  Console{consoleErrors.length > 0 ? ` (${consoleErrors.length})` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSave}
        style={{ display: "none" }}
        id="save-code-button"
      >
        Save Code
      </button>
      <button
        type="button"
        style={{ display: "none" }}
        id="close-code-button"
        onClick={() => closeEditor()}
      >
        Close Editor
      </button>
    </div>
  );
}
