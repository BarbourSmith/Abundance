import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { ValueChangeCommand } from "../js/undoCommands.js";
import { parseCodeHeader } from "./utils/code-header-parser.js";
import { proxy } from "comlink";

/** Maximum number of console entries retained on a Code atom. Older
 *  entries are dropped from the head of the list when the cap is hit. */
const MAX_CONSOLE_ENTRIES = 500;

/**
 * Monaco instance captured by the code editor component once it mounts.
 * Used by `Code#updateCode()` to transpile TypeScript atom source to
 * JavaScript so the worker never has to deal with type annotations.
 */
let _monaco = null;

/**
 * Called by the code editor React component once Monaco has mounted so
 * that Code atoms can reach the TypeScript language worker.
 */
export function setMonacoInstance(monaco) {
  _monaco = monaco;
}

/**
 * Transpile a TypeScript source string to JavaScript using Monaco's
 * bundled TS language worker. Throws a descriptive Error on failure so the
 * caller can surface the problem to the user; callers should catch and
 * route to `setError()`.
 */
async function transpileTypeScript(tsSource) {
  if (!tsSource) return "";
  if (!_monaco) {
    throw new Error(
      "TypeScript transpiler not ready: open the code editor at least once before running.",
    );
  }
  const uri = _monaco.Uri.parse(`file:///abundance-code-${Date.now()}.ts`);
  const model = _monaco.editor.createModel(tsSource, "typescript", uri);
  try {
    const getWorker = await _monaco.languages.typescript.getTypeScriptWorker();
    const worker = await getWorker(uri);
    const output = await worker.getEmitOutput(uri.toString());
    const jsFile = output.outputFiles.find((f) => f.name.endsWith(".js"));
    if (jsFile && jsFile.text) return jsFile.text;

    // Emit was skipped or produced no .js — gather diagnostics to tell the user why.
    let details = "";
    if (output.emitSkipped) {
      details += " emitSkipped=true.";
      // noEmit is the usual culprit; include the current compiler options to
      // make misconfiguration obvious in the console.
      try {
        const opts =
          _monaco.languages.typescript.typescriptDefaults.getCompilerOptions();
        details += ` compilerOptions=${JSON.stringify(opts)}.`;
      } catch {}
    }
    try {
      const [syntactic, semantic] = await Promise.all([
        worker.getSyntacticDiagnostics(uri.toString()),
        worker.getSemanticDiagnostics(uri.toString()),
      ]);
      const msgs = [...syntactic, ...semantic]
        .map((d) => {
          const text =
            typeof d.messageText === "string"
              ? d.messageText
              : d.messageText?.messageText || "";
          return `TS${d.code}: ${text}`;
        })
        .filter(Boolean);
      if (msgs.length) details += ` diagnostics: ${msgs.join("; ")}`;
    } catch {}
    throw new Error(
      `TypeScript transpilation produced no JavaScript output.${details}`,
    );
  } finally {
    model.dispose();
  }
}

/**
 * The Code molecule type adds support for executing arbitrary jsxcad code.
 */
export default class Code extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Code";
    /**
     * This atom's name
     * @type {string}
     */
    this.atomType = "Code";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Defines a Replicad code block.";
    /**
     * Default code for new TypeScript atoms. Inputs are declared as `run()`
     * parameters; types map to `number`/`string`/`boolean`/`geometry`.
     * @type {string}
     */
    const TS_DEFAULT_CODE = `
/**
 * This code atom implements a simple linear layout funtion which repeats
 * shape count times in the positive X direction with offset space
 * between each. Works for either 2D or 3D shapes. Negative offset
 * and negative counts invert the direction.
 * 
 * Notice that defaults are set for both count and offset.
 */
function run(shape: Assembly, count: number = 1, offset: number = 5) {
  if (count == 0) {
    return []
  }
  const isReversed = count < 0;
  if (isReversed) {
    offset = -1 * offset
  }
  count = Math.abs(count)

  const result = [shape]
  for (let i = 1; i < count; i++) {
    const movedCopy = new Assembly(shape).onLeafs((leaf) => {
      if (leaf.is2D()) {
        leaf.geometry = leaf.geometry.translate(offset * i, 0)
      } else if (leaf.geometry instanceof replicad._3DShape) {
        leaf.geometry = leaf.geometry.translate(offset * i, 0, 0)
      }
      return leaf;
    })

    if (movedCopy) {
      result.push(movedCopy)
    }
  }

  return result;
}
`;
    /**
     * Legacy default code for JavaScript atoms, kept so that projects loaded
     * from before the interpreterVersion field existed continue to work.
     * @type {string}
     */
    const JS_DEFAULT_CODE = `
// Example Code
const Inputs = [
  { inputName: "shape", type: "geometry", defaultValue: null },
  { inputName: "radius", type: "number", defaultValue: 5 },
  { inputName: "height", type: "number", defaultValue: 10 }
];

let importedShape = library[shape];
let newPlane = replicad.makePlane()
let circDraw = replicad.drawCircle(radius)
let sketchCir = circDraw.sketchOnPlane(newPlane)
let cyl = sketchCir.extrude(height)
let cylObj = {
  geometry: [cyl],
  dimension: "3D",
  tags: ["createdCylinder"],
  color: "#A3CE5B",
  plane: null,
  bom: []
};

let assembly = await Assembly([importedShape, cylObj]);
return assembly;
`;

    //This loads any inputs which this atom had when last saved.
    this.x = values.x || 0;
    this.y = values.y || 0;
    this.parent = values.parent || null;
    this.uniqueID = values.uniqueID || GlobalVariables.generateUniqueID();

    /**
     * The interpreter version for this code atom.
     * 0 = JavaScript (legacy)
     * 1 = TypeScript (default for new atoms)
     * New atoms default to TypeScript. Atoms loaded from saves without this
     * field are treated as JavaScript to preserve backwards compatibility.
     * @type {number}
     */
    const isNewAtom =
      values.code === undefined && values.interpreterVersion === undefined;
    this.interpreterVersion = values.interpreterVersion ?? (isNewAtom ? 1 : 0);
    this.code =
      values.code ||
      (this.interpreterVersion >= 1 ? TS_DEFAULT_CODE : JS_DEFAULT_CODE);

    /**
     * For TypeScript atoms, the transpiled JavaScript output produced by the
     * Monaco TS worker at save time. Used by the worker to execute the code.
     * Not tracked in undo history — regenerated on every save.
     * @type {string}
     */
    this.compiledCode = values.compiledCode || "";

    // Manually construct the output AP with an "any" value type.
    this._addIOWithoutSubscribing("output", "any", null, "output");
    // Parse inputs from the saved code to get their structure.
    // Then set their .value based on the values.ioValues state (ie the deserialized AP state).
    try {
      this.parseInputs();
    } catch (err) {
      this.setError(err);
      console.error("Failed to parse code header for inputs:", err);
      return; // Don't subscribe since our input set is stale.
    }
    this.setValues(values);
    this.inputs.forEach((input) => {
      if (input.value) {
        input.setReady(input.value); // mark ready if applicable now that values are loaded from save.
      }
    });
    this._subscribeToInputs();
  }

  /**
   * Draw the code atom which has a code icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.font = `${GlobalVariables.widthToPixels(
      this.radius,
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "</>",
      GlobalVariables.widthToPixels(this.x - this.radius / 1.5),
      GlobalVariables.heightToPixels(this.y + this.radius * 1.5),
    );
  }

  createInputParams(setInputChanged) {
    let inputParams = super.createInputParams(setInputChanged);
    /** Runs through active atom inputs and adds IO parameters to default param*/

    inputParams["Edit Code"] = {
      type: "button",
      label: "Edit Code",
      order: 7,
      onClick: () => {
        this.editCode();
      },
    };
    inputParams["Save Code"] = {
      type: "button",
      label: "Save Code",
      order: 8,
      onClick: () => {
        // The InputPanel will be re-derived automatically once
        // `updateCode` finishes parsing the new `Inputs = [...]` block
        // and calls `this.setInputChanged(...)` (registered by
        // Atom#createInputParams). No need to fire a stale signature here.
        this.saveCode();
      },
    };
    inputParams["Close Editor"] = {
      type: "button",
      label: "Close Editor",
      order: 9,
      onClick: () => {
        this.closeCode();
      },
    };
    return inputParams;
  }

  /**
   * Called when code editor save button is clicked. Updates the code and value of the atom.
   * In TypeScript mode this also transpiles the source to JavaScript and
   * stores it on `this.compiledCode` so the worker never sees TS syntax.
   */
  async updateCode(code) {
    if (!GlobalVariables.isUndoing) {
      const oldCode = this.code;
      GlobalVariables.pushUndoCommand(
        new ValueChangeCommand(
          this.uniqueID,
          this.parent,
          "code",
          oldCode,
          (atom, val) => {
            atom.updateCode(val);
          },
          `Change code "${this.name}"`,
        ),
      );
    }
    this.code = code;

    if ((this.interpreterVersion ?? 0) >= 1) {
      try {
        this.compiledCode = await transpileTypeScript(code);
      } catch (err) {
        this.compiledCode = "";
        this.setError(err);
        console.error("TypeScript transpilation failed:", err);
      }
    } else {
      this.compiledCode = "";
    }

    try {
      this.parseInputs();
    } catch (err) {
      this.setError(err);
      console.error("Failed to parse code header for inputs:", err);
      return; // Don't subscribe since our input set is stale.
    }
    const alreadyCalledBack = this._subscribeToInputs();
    if (!alreadyCalledBack) {
      // Force a call back even if we don't have inputs. Some code atoms
      // Generate a useful output even with no inputs.
      this.onUpstreamChange();
    }
    // Notify the InputPanel that the input list may have changed (added,
    // removed, renamed, retyped). The base recompute path also calls this
    // on success, but parse-only changes (no upstream change, or zero
    // inputs) wouldn't otherwise trigger a re-derive of the controls.
    if (typeof this.setInputChanged === "function") {
      this.setInputChanged(
        this.inputs
          .map((i) => `${i.name}:${i.defaultValue}:${i.valueType}`)
          .join("|"),
      );
    }
    this.sendToRender();
  }

  /**
   * Generate custom error message if we can parse the the error stack for
   * line number in the users code.
   * @param {*} err
   */
  setError(err) {
    let logged = false;
    if (err.stack && err.stack.includes("eval")) {
      // If the error stack contains "eval", we can try to extract the line number
      const lineMatch = err.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (lineMatch) {
        const lineNumber = lineMatch[1];
        super.setError(
          `User code error at line ${lineNumber}: ${err.name} - ${err.message}`,
        );
        logged = true;
      }
    }
    if (!logged) {
      super.setError(err.name + ": " + err.message);
    }
  }

  /**
   * Grab the code as a text string and execute it. In TS mode we pass the
   * pre-transpiled JavaScript so the worker never has to handle type syntax.
   */
  compute(argsDict) {
    const isTs = (this.interpreterVersion ?? 0) >= 1;
    const codeToRun = isTs ? this.compiledCode || "" : this.code;
    // Comlink proxy the worker can use to send log messages from the user's
    // code.
    const onLog = isTs
      ? proxy((level, message, stack) => {
          this.appendConsoleEntry({ level, message, stack });
        })
      : undefined;
    const promise = GlobalVariables.cad.code(
      codeToRun,
      argsDict,
      this.getContext(),
      this.interpreterVersion ?? 0,
      this.uniqueID,
      onLog,
    );
    if (isTs) {
      // Mark end of an execution of this code atom in the console UI
      const finalize = (status) => {
        this.appendConsoleEntry({
          level: "divider",
          message: status === "ok" ? "run finished" : "run errored",
          stack: null,
        });
      };
      promise.then(
        () => finalize("ok"),
        () => finalize("error"),
      );
    }
    return promise;
  }

  /**
   * Append a console entry captured from this atom's worker-side execution.
   * Trims the buffer to `MAX_CONSOLE_ENTRIES` and notifies registered log
   * subscribers (NOT general atom subscribers — logs must not trigger
   * downstream recomputation).
   */
  appendConsoleEntry(entry) {
    if (!Array.isArray(this.consoleEntries)) this.consoleEntries = [];
    const nextId =
      this.consoleEntries.length > 0
        ? parseInt(this.consoleEntries[this.consoleEntries.length - 1].id) + 1
        : "0";
    this.consoleEntries.push({
      ...entry,
      timestamp: Date.now(),
      id: `${nextId}`,
    });
    if (this.consoleEntries.length > MAX_CONSOLE_ENTRIES) {
      this.consoleEntries.splice(
        0,
        this.consoleEntries.length - MAX_CONSOLE_ENTRIES,
      );
    }
    this._notifyLogSubscribers();
  }

  /** Clear all captured console entries on this atom. */
  clearConsoleEntries() {
    this.consoleEntries = [];
    this._notifyLogSubscribers();
  }

  /**
   * Subscribe to console-log changes on this atom. This is intentionally
   * separate from the regular atom subscription channel so that log
   * activity does NOT trigger DAG recomputation in downstream atoms.
   * @returns an unsubscribe function.
   */
  subscribeToLogs(callback) {
    if (!this._logSubscribers) this._logSubscribers = new Set();
    this._logSubscribers.add(callback);
    return () => {
      this._logSubscribers?.delete(callback);
    };
  }

  _notifyLogSubscribers() {
    if (!this._logSubscribers) return;
    for (const cb of this._logSubscribers) {
      try {
        cb();
      } catch (e) {
        console.error("Log subscriber threw:", e);
      }
    }
  }

  /**
   * This function reads the string of inputs the user specifies and adds them to the atom.
   */
  parseInputs() {
    if ((this.interpreterVersion ?? 0) >= 1) {
      this.parseTsRunSignature();
      return;
    }
    // Match Inputs = [{inputName: ..., type: ..., defaultValue: ...}, ...]
    // Try to extract a const Inputs = [...] block
    // Only parse the first Inputs declaration (const Inputs = [...] or Inputs = [...])
    // Remove all block comments and line comments before matching Inputs array
    let codeNoComments = this.code.replace(/\/\*[\s\S]*?\*\//g, ""); // Remove block comments
    codeNoComments = codeNoComments.replace(/\/\/.*$/gm, ""); // Remove line comments

    // Find Inputs = [ and extract the entire array by counting brackets
    // This handles nested arrays in defaultValue (e.g., defaultValue: [0,0])
    const inputsStart = codeNoComments.search(/(?:const\s+)?Inputs\s*=\s*\[/);
    if (inputsStart !== -1) {
      // Try to parse new format if found

      // Find the matching closing bracket by counting bracket depth
      let bracketCount = 0;
      let arrayEndIndex = -1;
      const startBracket = codeNoComments.indexOf("[", inputsStart);

      for (let i = startBracket; i < codeNoComments.length; i++) {
        if (codeNoComments[i] === "[") bracketCount++;
        if (codeNoComments[i] === "]") {
          bracketCount--;
          if (bracketCount === 0) {
            arrayEndIndex = i + 1;
            break;
          }
        }
      }

      if (arrayEndIndex !== -1) {
        const fullMatch = codeNoComments.substring(inputsStart, arrayEndIndex);
        const arrContent = fullMatch.match(/\[([\s\S]*)\]/)[1];
        const allInputsMatches = [{ 0: fullMatch, 1: arrContent }];

        if (allInputsMatches.length > 0) {
          const firstMatch = allInputsMatches[0];

          // If it's a const declaration, use safe eval
          if (/const\s+Inputs\s*=/.test(firstMatch[0])) {
            try {
              const sandboxFn = new Function(
                firstMatch[0] + "; return Inputs;",
              );
              const inputsArray = sandboxFn();

              const variableNames = [];
              inputsArray.forEach(({ inputName, type, defaultValue }) => {
                variableNames.push(inputName);
                const existingInput = this.inputs.find(
                  (input) => input.name === inputName,
                );

                if (!existingInput) {
                  this._addIOWithoutSubscribing(
                    inputName,
                    type,
                    defaultValue,
                    "input",
                  );
                } else {
                  existingInput.valueType = type;
                  existingInput.defaultValue = defaultValue;
                }
              });
              // Remove any inputs not in the new array
              const inputList = [...this.inputs];
              inputList.forEach((input) => {
                if (!variableNames.includes(input.name)) {
                  this.removeIO(input.type, input.name, this);
                }
              });
              return;
            } catch (e) {
              console.warn("Failed to eval const Inputs array from code:", e);
            }
          } else {
            // Otherwise, parse as JSON
            let arrStr = firstMatch[1];
            arrStr = arrStr.replace(/\n/g, ""); // Remove newlines
            arrStr = arrStr.replace(/\r/g, ""); // Remove carriage returns
            arrStr = arrStr.replace(/,\s*$/, ""); // Remove trailing comma at end
            arrStr = arrStr.replace(/(\w+)\s*:/g, '"$1":');
            arrStr = arrStr.replace(/'/g, '"');

            try {
              const inputsArray = JSON.parse(`[${arrStr}]`);

              const variableNames = [];
              inputsArray.forEach(({ inputName, type, defaultValue }) => {
                variableNames.push(inputName);
                const existingInput = this.inputs.find(
                  (input) => input.name === inputName,
                );
                if (!existingInput) {
                  this._addIOWithoutSubscribing(
                    inputName,
                    type,
                    defaultValue,
                    "input",
                  );
                } else {
                  existingInput.valueType = type;
                  existingInput.defaultValue = defaultValue;
                }
              });
              // Remove any inputs not in the new array
              const inputList = [...this.inputs];
              inputList.forEach((input) => {
                if (!variableNames.includes(input.name)) {
                  this.removeIO(input.type, input.name, this);
                }
              });
              return;
            } catch (e) {
              console.warn("Failed to parse Inputs array from code:", e);
            }
          }
        }
      }
    }

    // Fallback: legacy string parsing for old format like //Inputs:[input1,input2,input3]
    // This supports the old way of declaring inputs as simple comma-separated variable names
    const legacyPattern = /(?:\/\/\s*)?Inputs\s*:\s*\[\s*([^\]]+?)\s*\]/;
    const variables = legacyPattern.exec(this.code);
    if (variables) {
      const variableNames = [];
      const parsedVariables =
        variables[1]?.split(/\s*,\s*/).map((v) => v.split(/\s*=\s*/)) || [];
      parsedVariables.forEach(([name, defaultVal]) => {
        if (!name || name.trim() === "") return; // Skip empty entries
        const trimmedName = name.trim();
        // For legacy format, use null for geometry inputs (no default value specified)
        const value = defaultVal ? defaultVal.trim() : null;
        variableNames.push(trimmedName);
        const existingInput = this.inputs.find(
          (input) => input.name === trimmedName,
        );
        if (!existingInput) {
          this._addIOWithoutSubscribing(
            trimmedName,
            "geometry",
            value,
            "input",
          );
        }
      });
      const inputList = [...this.inputs];
      inputList.forEach((input) => {
        if (!variableNames.includes(input.name)) {
          this.removeIO(input.type, input.name, this);
        }
      });
    }
  }

  /**
   * Parse the parameters of the TypeScript `run(...)` function and register
   * them as atom inputs.
   *
   * String parsing is delegated to `parseCodeHeader`. Throws an error if
   * parsing fails.
   */
  parseTsRunSignature() {
    let parsedArgs;
    parsedArgs = parseCodeHeader(this.code);

    const declaredNames = [];
    for (const arg of parsedArgs) {
      declaredNames.push(arg.name);
      let existing = this.inputs.find((input) => input.name === arg.name);
      if (!existing) {
        existing = this._addIOWithoutSubscribing(
          arg.name,
          arg.type,
          arg.defaultValue,
          "input",
        );
      }
      // Overwrite existing inputs properties based on latest version of code.
      existing.valueType = arg.type;
      existing.defaultValue = arg.defaultValue;
      existing.isOptional = arg.isOptional;
    }

    // Remove inputs no longer declared in the run() signature.
    [...this.inputs].forEach((input) => {
      if (input.type === "input" && !declaredNames.includes(input.name)) {
        this.removeIO(input.type, input.name, this);
      }
    });
  }

  /**
   * Edit the atom's code when it is double clicked
   * @param {number} x - The X coordinate of the click
   * @param {number} y - The Y coordinate of the click
   */
  doubleClick(x, y) {
    //returns true if something was done with the click
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    var clickProcessed = false;

    var distFromClick = GlobalVariables.distBetweenPoints(
      x,
      xInPixels,
      y,
      yInPixels,
    );

    if (distFromClick < this.radius) {
      this.editCode();
      clickProcessed = true;
    }

    return clickProcessed;
  }

  /**
   * Updates the interpreter version for this code atom and re-serializes.
   * @param {number} version - 0 for JavaScript, 1 for TypeScript
   */
  updateInterpreterVersion(version) {
    this.interpreterVersion = version;
    // Persist immediately so the next save/serialize picks it up.
    // No recompute needed — only the editor mode changes.
    this.sendToRender();
  }

  /**
   * Called to trigger editing the code atom
   */
  editCode() {
    const codeWindow = document.getElementById("code-window");
    codeWindow.classList.remove("code-off");
  }

  /**
   * Called to trigger editing the code atom
   */
  saveCode() {
    const saveCodeButton = document.getElementById("save-code-button");
    saveCodeButton.click();
  }

  /**
   * Called to trigger editing the code atom
   */
  closeCode() {
    const closeCodeButton = document.getElementById("close-code-button");
    closeCodeButton.click();
  }

  /**
   * Save the input code to be loaded next time
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);

    valuesObj.interpreterVersion = this.interpreterVersion ?? 0;
    valuesObj.code = this.code;
    //    Atom.safeSerializeValue(valuesObj, "code", this.code, this.name || "Code");

    if (this.compiledCode) {
      valuesObj.compiledCode = this.compiledCode;
    }

    return valuesObj;
  }
}
