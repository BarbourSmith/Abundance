import React from "react";
import { useEffect, useState, useMemo, useRef } from "react";

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
  // Console panel entries. Each entry: { id, timestamp (Date), level, message, stack? }.
  // `level === 'error'` is rendered in red and counts toward the unread badge.
  // `level === 'divider'` is rendered as a horizontal separator marking the
  // end of a run.
  const [consoleEntries, setConsoleEntries] = useState([]);
  const [interpreterVersion, setInterpreterVersion] = useState(0);

  // Ref to the scrollable console body so we can pin to the bottom on each
  // new entry. We keep a `pinnedToBottom` flag so manual scroll-up by the
  // user pauses auto-scroll until they return to the bottom.
  const consoleBodyRef = useRef(null);
  const pinnedToBottomRef = useRef(true);

  useEffect(() => {
    if (props.activeAtom != null) {
      setdocValue(props.activeAtom.code);
      setInterpreterVersion(props.activeAtom.interpreterVersion ?? 0);
    }
  }, [props.activeAtom]);

  // Subscribe to activeAtom changes to capture code execution errors and
  // console.* output forwarded from the worker (see molecules/code.js).
  // We use TWO separate channels:
  //   - subscribe()           → general atom state changes (for error alerts)
  //   - subscribeToLogs()     → log-only channel that does NOT trigger DAG
  //                              recomputation when entries are appended.
  useEffect(() => {
    if (props.activeAtom == null) return;

    // Track which worker-side log ids we've already pulled into local
    // state so re-runs don't double-add entries.
    const seenLogIds = new Set();

    const pullEntries = () => {
      // Errors: surfaced via atom.alert when status flips to 'error'.
      if (
        props.activeAtom.status === "error" &&
        props.activeAtom.alert &&
        props.activeAtom.alert.message
      ) {
        const errId = `err-${props.activeAtom.alert.message}`;
        if (!seenLogIds.has(errId)) {
          seenLogIds.add(errId);
          setConsoleEntries((prev) => [
            ...prev,
            {
              level: "error",
              message: props.activeAtom.alert.message,
              stack: null,
              timestamp: new Date(),
              id: `${Date.now()}-${Math.random()}`,
            },
          ]);
        }
      }
      // Logs: appended by molecules/code.js#appendConsoleEntries as the
      // worker forwards batches of console.* calls from user code.
      const entries = props.activeAtom.consoleEntries || [];
      // Detect a clear: previously seen ids that are no longer present
      // means the buffer was cleared. Reset local view + seen set.
      if (entries.length === 0 && seenLogIds.size > 0) {
        seenLogIds.clear();
        setConsoleEntries([]);
        return;
      }
      const fresh = entries.filter((e) => !seenLogIds.has(e.id));
      if (fresh.length) {
        for (const e of fresh) seenLogIds.add(e.id);
        setConsoleEntries((prev) => [
          ...prev,
          ...fresh.map((e) => ({
            level: e.level,
            message: e.message,
            stack: e.stack,
            timestamp: new Date(e.timestamp),
            id: e.id,
          })),
        ]);
      }
    };

    const subscriberId = "codeWindowConsole";
    props.activeAtom.subscribe(pullEntries, subscriberId, false);
    const unsubLogs = props.activeAtom.subscribeToLogs?.(pullEntries);
    // Pull whatever is already buffered from prior runs.
    pullEntries();

    return () => {
      props.activeAtom.unsubscribe(subscriberId);
      unsubLogs?.();
    };
  }, [props.activeAtom]);

  // Auto-scroll the console body to the bottom whenever new entries arrive,
  // but only if the user is already pinned to the bottom. This lets users
  // scroll up to inspect older output without being yanked back.
  useEffect(() => {
    const el = consoleBodyRef.current;
    if (!el) return;
    if (pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [consoleEntries, expandedPanel]);

  // Track whether the user has scrolled away from the bottom so we know
  // whether to keep auto-pinning. Tolerance of a few px to absorb rounding.
  const handleConsoleScroll = (e) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 4;
  };
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
              TypeScript - <b>BETA</b>
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
                      onClick={() => {
                        setConsoleEntries([]);
                        if (props.activeAtom?.clearConsoleEntries) {
                          props.activeAtom.clearConsoleEntries();
                        }
                      }}
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
                <div
                  className="info-panel-body console-body"
                  ref={consoleBodyRef}
                  onScroll={handleConsoleScroll}
                >
                  {consoleEntries.length === 0 ? (
                    <div className="no-methods">No console output</div>
                  ) : (
                    <div className="console-error-list">
                      {consoleEntries.map((entry) => {
                        // Run-end divider: distinct visual separator. No
                        // level glyph or timestamp clutter — just a thin
                        // labelled rule.
                        if (entry.level === "divider") {
                          const t = entry.timestamp;
                          const hh = String(t.getHours()).padStart(2, "0");
                          const mm = String(t.getMinutes()).padStart(2, "0");
                          const ss = String(t.getSeconds()).padStart(2, "0");
                          return (
                            <div
                              key={entry.id}
                              className="console-divider"
                              role="separator"
                            >
                              <span className="console-divider-label">
                                {entry.message} · {hh}:{mm}:{ss}
                              </span>
                            </div>
                          );
                        }
                        // Compact HH:MM:SS time format (drop the AM/PM and
                        // any locale fluff that toLocaleTimeString may add).
                        const t = entry.timestamp;
                        const hh = String(t.getHours()).padStart(2, "0");
                        const mm = String(t.getMinutes()).padStart(2, "0");
                        const ss = String(t.getSeconds()).padStart(2, "0");
                        const time = `${hh}:${mm}:${ss}`;
                        // Short single-character level glyph (L/I/W/E/D/T)
                        // keeps each row visually tight while still encoding
                        // severity. Full level is exposed via title for a11y.
                        const glyph =
                          {
                            log: "L",
                            info: "I",
                            warn: "W",
                            error: "E",
                            debug: "D",
                            trace: "T",
                          }[entry.level] || "?";
                        return (
                          <div
                            key={entry.id}
                            className={`console-error-item console-level-${entry.level}`}
                          >
                            <span className="console-error-meta">
                              <span className="console-error-time">{time}</span>
                              <span
                                className="console-error-level"
                                title={entry.level}
                              >
                                {glyph}
                              </span>
                            </span>
                            <span className="console-error-message">
                              {entry.message}
                              {entry.stack ? (
                                <pre className="console-error-stack">
                                  {entry.stack}
                                </pre>
                              ) : null}
                            </span>
                          </div>
                        );
                      })}
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
                  style={
                    consoleEntries.some((e) => e.level === "error")
                      ? { color: "#e05b5b" }
                      : {}
                  }
                >
                  Console
                  {consoleEntries.length > 0
                    ? ` (${consoleEntries.length})`
                    : ""}
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
