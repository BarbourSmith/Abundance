import React from "react";
import { useEffect, useState, useMemo, useRef } from "react";

import apiJson from "./methodsreplicad.json"; // static import of the JSON file
import abundanceJson from "./abundanceApiJson.json";
import ReactCodeEditorWithApiAutocomplete from "./ReactCodeEditorWithApiAutocomplete";
import InfoPanel from "./InfoPanel";
import { setMonacoInstance } from "../../molecules/code.js";

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

    // The atom's `consoleEntries` buffer is the source of truth for log
    // entries forwarded from the worker. We mirror it into local state on
    // every pull rather than maintaining a parallel "seen ids" set, because
    // (a) the effect re-runs whenever `props.activeAtom` changes — losing
    // such a set would re-append everything as "new", producing duplicate
    // React keys — and (b) the buffer is bounded (MAX_CONSOLE_ENTRIES) so
    // copying the array each time is cheap.
    //
    // Errors raised via `atom.alert` are NOT stored on `consoleEntries`, so
    // we synthesize a local entry for them. `seenAlertKey` prevents the
    // same alert from being inserted multiple times across pulls.
    let seenAlertKey = null;
    let alertEntry = null;

    const pullEntries = () => {
      // Errors: surfaced via atom.alert when status flips to 'error'.
      if (
        props.activeAtom.status === "error" &&
        props.activeAtom.alert &&
        props.activeAtom.alert.message
      ) {
        const key = `err-${props.activeAtom.alert.message}`;
        if (key !== seenAlertKey) {
          seenAlertKey = key;
          alertEntry = {
            level: "error",
            message: props.activeAtom.alert.message,
            stack: null,
            timestamp: new Date(),
            id: `alert-${Date.now()}-${Math.random()}`,
          };
        }
      } else {
        // Status is no longer error — drop any stale alert entry so the
        // next error produces a fresh one.
        seenAlertKey = null;
        alertEntry = null;
      }

      // Logs: appended by molecules/code.js#appendConsoleEntries as the
      // worker forwards batches of console.* calls from user code.
      const entries = props.activeAtom.consoleEntries || [];
      const next = entries.map((e) => ({
        level: e.level,
        message: e.message,
        stack: e.stack,
        timestamp: new Date(e.timestamp),
        // Namespace ids so worker-side ids can never collide with the
        // synthesized alert id above.
        id: `log-${e.id}`,
      }));
      if (alertEntry) next.push(alertEntry);
      setConsoleEntries(next);
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
   * Process Abundance API JSON to extract method information.
   * Entries describe the `Assembly` class surface — its constructor and
   * instance methods (`.isLeaf`, `.onLeafs`, `.is2D`, etc.). Example:
   * {
   *   type: "method",
   *   requiredParams: [],
   *   optionalParams: [],
   *   usage: "assembly.isLeaf()",
   *   returns: "boolean"
   * }
   */
  const abundanceMethods = useMemo(() => {
    if (!abundanceJson) return [];
    return Object.keys(abundanceJson)
      .map((key) => {
        const def = abundanceJson[key];
        const params = (def.requiredParams || []).concat(
          def.optionalParams || []
        );
        // Always prepend 'await' for abundance methods
        return {
          name: key,
          params,
          ...def,
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

Code atoms allow you to define atoms which perform custom actions using
Typescript, the Replicad API, and some Abundance utilities.

The "run" function is the entry point for the code atom. The arguments
to this function will determine what inputs this atom takes, and it's
returned value will be available to downstream atoms.

Allowed input types are:
• number
• string
• boolean
• Assembly - a structured Abundance assembly. Geometry may be one of:
    - 3D solid  (.is3D() → true)
    - 2D sketch (.is2D() → true)
    - Wire curve (.isWire() → true)
    - Point3D vertex (.isPoint3D() → true)
  See Abundance Methods panel for full API.

Allowed return types are same as input types.

console.log, console.warn, and console.error are available for debugging, and their output
will appear in the Console panel.
Errors thrown in this atom will be shown in the console and will also put the atom itself
into an error state displaying the error message.
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
