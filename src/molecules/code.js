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
 * =========================================================================
 *  ABUNDANCE CODE ATOM — Quick Reference
 * =========================================================================
 *
 *  HOW INPUTS WORK
 *  ---------------
 *  Every parameter of run() becomes an input port on this atom.
 *  Four types are supported:
 *
 *    number   -> numeric input / slider
 *    string   -> text input  (great for hex color codes, labels, etc.)
 *    boolean  -> true/false toggle
 *    Assembly -> geometry -- wire this to the output of another atom
 *
 *  Give a parameter a default value ( = x ) to make it optional.
 *  Mark it with ? (name?: Assembly) to make it optional with no default.
 *  Parameters without a default must be connected before the atom runs.
 *
 *  RETURN VALUE
 *  ------------
 *  Return an Assembly, an Assembly[], or a primitive (number/string/boolean).
 *  Returning an Assembly[] lets downstream atoms (BOM, cut layout...)
 *  see each piece independently.
 *
 *  GEOMETRY API  (replicad is available as a global)
 *  -------------------------------------------------
 *  Create 2-D sketches
 *    replicad.drawCircle(radius)
 *    replicad.drawRectangle(width, height)
 *    replicad.drawRoundedRectangle(width, height, cornerRadius)
 *
 *  Turn a 2-D sketch into a 3-D solid
 *    sketch.sketchOnPlane().extrude(distance)
 *    sketch.sketchOnPlane().revolve()          // rotate 360 deg around Z
 *
 *  Create 3-D primitives directly
 *    replicad.makeBaseBox(width, depth, height)
 *    replicad.makeSphere(radius)
 *    replicad.makeCylinder(radius, height)
 *
 *  Boolean operations
 *    solidA.fuse(solidB)                       // union
 *    solidA.cut(solidB)                        // difference (cut a hole)
 *    solidA.intersect(solidB)                  // intersection
 *
 *  Post-processing
 *    solid.fillet(radius)                      // round ALL edges
 *    solid.fillet(r, e => e.inPlane("XY", z))  // round only top-face edges
 *    solid.chamfer(distance)                   // bevel ALL edges
 *    solid.translate(x, y, z)                  // move the solid
 *    solid.rotate(angle, [0, 0, 1])            // rotate around Z axis
 *
 *  ASSEMBLY CLASS
 *  --------------
 *  Wrap any replicad solid in an Assembly to attach display metadata:
 *    new Assembly({ geometry, color, tags, bom })
 *      geometry -> replicad solid / drawing returned by the API above
 *      color    -> hex string shown in the 3-D viewport  ("#A3CE5B")
 *      tags     -> string[] used for filtering in cut layout / BOM
 *      bom      -> string[] lines added to the Bill of Materials panel
 *
 *  AI PROMPT TIP
 *  -------------
 *  Copy the code in this editor into ChatGPT / Claude and say something like:
 *    "Modify this Abundance Code Atom to create a gear with 12 teeth"
 *    "Change this to make a hexagonal nut instead of a round plate"
 *  The comments above give the AI all the context it needs to produce
 *  valid, working Abundance TypeScript code.
 * =========================================================================
 */

/**
 * A rectangular mounting plate with a circular hole in the centre.
 * All parameters have defaults so the atom produces geometry immediately
 * after creation — no connections required to get started.
 */
function run(
  width: number = 40,        
  depth: number = 30,       
  thickness: number = 5,    
  holeRadius: number = 6,   
  color: string = "#5B9BD5", 
  addFillet: boolean = true, 
  extra?: Assembly           
) {
  // ── Step 1: Create the base solid ────────────────────────────────────────
  // makeBaseBox(width, depth, height) places a box with one corner at the
  // origin.  Translate it so the hole will be centred at (0, 0).
  let plate = replicad
    .makeBaseBox(width, depth, thickness)
    .translate(-width / 2, -depth / 2, 0);

  // ── Step 2: Cut a through-hole in the centre ──────────────────────────────
  // Extrude a circle slightly taller than the plate so the cut goes all the
  // way through.  Start 1 mm below the bottom face to avoid coplanar issues.
  const holeCutter = replicad
    .drawCircle(holeRadius)
    .sketchOnPlane()
    .extrude(thickness + 2)
    .translate(0, 0, -1);

  plate = plate.cut(holeCutter);

  // ── Step 3: Optional fillet on the top-face edges ────────────────────────
  // inPlane("XY", thickness) selects only the edges that lie in the
  // horizontal plane at z = thickness (i.e. the top face of the plate).
  if (addFillet) {
    plate = plate.fillet(1.5, (e) => e.inPlane("XY", thickness));
  }

  // ── Step 4: Wrap in an Assembly to set display properties ─────────────────
  const plateAssembly = new Assembly({
    geometry: plate,
    color: color,
    tags: ["plate", "mounting-plate"],
    bom: [\`Mounting plate \${width}×\${depth}×\${thickness} mm\`],
  });

  // ── Step 5: Combine with any upstream geometry ────────────────────────────
  // Returning an array lets each piece stay independent for the BOM and
  // cut-layout atoms.  If nothing is connected, \`extra\` is undefined.
  const results: Assembly[] = [plateAssembly];
  if (extra) results.push(extra);
  return results;
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
      // For array inputs, remember the element type so the control panel
      // can coerce edits and so we know it's not Assembly[] (rejected by
      // the parser). Cleared for non-array inputs.
      if (arg.type === "array") {
        existing.elementType = arg.elementType;
      } else if ("elementType" in existing) {
        delete existing.elementType;
      }
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
