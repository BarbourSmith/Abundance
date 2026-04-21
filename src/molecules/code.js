import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { ValueChangeCommand } from "../js/undoCommands.js";

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
     * The code contained within the atom stored as a string.
     * @type {string}
     */
    this.code = `
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

    // Only mark inputs as ready if they have defined values and are not sentinel objects
    values.ioValues?.forEach((ioValue) => {
      const ap = this._addIOWithoutSubscribing(ioValue.name, ioValue.valueType);
      // Check if value is defined and not the NO_GEOMETRY sentinel
      const isNoGeometry =
        ioValue.ioValue && ioValue.ioValue == "__GEOMETRY_INPUT__";
      if (
        ioValue.ioValue !== undefined &&
        ioValue.ioValue !== null &&
        !isNoGeometry
      ) {
        ap.setReady(ioValue.ioValue);
      }
    });
    this._addIOWithoutSubscribing("output", "geometry", null, "output");

    this.setValues([]);
    this.code = values.code || this.code;

    /**
     * The interpreter version for this code atom.
     * 0 = JavaScript (default, backwards-compatible)
     * 1 = TypeScript (strict type checking)
     * Atoms saved before this field existed will have no value, which defaults to 0.
     * @type {number}
     */
    this.interpreterVersion = values.interpreterVersion ?? 0;

    /**
     * For TypeScript atoms, the transpiled JavaScript output produced by the
     * Monaco TS worker at save time. Used by the worker to execute the code.
     * Not tracked in undo history — regenerated on every save.
     * @type {string}
     */
    this.compiledCode = values.compiledCode || "";

    this.parseInputs();
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
        this.saveCode();
        setInputChanged(
          this.inputs
            .map(
              (input) =>
                `${input.name}:${input.defaultValue}:${input.valueType}`,
            )
            .join("|"),
        );
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
   */
  updateCode(code) {
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

    this.parseInputs();
    this._subscribeToInputs();
    this.onUpstreamChange();
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
   * Grab the code as a text string and execute it.
   */
  compute(argumentsArray) {
    return GlobalVariables.cad.code(
      this.code,
      argumentsArray,
      this.getContext(),
      this.interpreterVersion ?? 0,
      this.compiledCode || "",
    );
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
   * them as atom inputs. Walks the signature with a bracket-depth counter so
   * that generics, union types, array types, and nested object/default values
   * are handled correctly.
   *
   * Type mapping: `number` -> number, `string` -> string, `boolean` -> boolean,
   * anything else -> "geometry" (includes RealizedAssembly, any, etc.).
   */
  parseTsRunSignature() {
    const src = this.code;
    const startIdx = src.search(/\bfunction\s+run\s*\(/);
    if (startIdx === -1) {
      // No run() found — remove all existing inputs and bail
      [...this.inputs].forEach((input) => {
        if (input.type === "input") this.removeIO(input.type, input.name, this);
      });
      return;
    }
    const openParen = src.indexOf("(", startIdx);
    // Walk forward tracking bracket depth to find the matching ")"
    let depth = 0;
    let closeParen = -1;
    for (let i = openParen; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "[" || c === "{" || c === "<") depth++;
      else if (c === ")" || c === "]" || c === "}" || c === ">") {
        depth--;
        if (depth === 0 && c === ")") {
          closeParen = i;
          break;
        }
      }
    }
    if (closeParen === -1) return;

    const sig = src.substring(openParen + 1, closeParen);

    // Split on top-level commas (respecting bracket depth)
    const params = [];
    {
      let d = 0;
      let start = 0;
      for (let i = 0; i < sig.length; i++) {
        const c = sig[i];
        if (c === "(" || c === "[" || c === "{" || c === "<") d++;
        else if (c === ")" || c === "]" || c === "}" || c === ">") d--;
        else if (c === "," && d === 0) {
          const piece = sig.substring(start, i).trim();
          if (piece) params.push(piece);
          start = i + 1;
        }
      }
      const last = sig.substring(start).trim();
      if (last) params.push(last);
    }

    const typeMap = (tsType) => {
      const first = (tsType || "").trim().split(/[\s|&]/)[0];
      if (first === "number") return "number";
      if (first === "string") return "string";
      if (first === "boolean") return "boolean";
      return "geometry";
    };

    const parseDefault = (raw, valueType) => {
      if (raw === undefined) return valueType === "geometry" ? null : undefined;
      const trimmed = raw.trim();
      if (valueType === "number") {
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : 0;
      }
      if (valueType === "boolean") return trimmed === "true";
      if (valueType === "string") {
        // Strip surrounding quotes if present
        if (
          (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ) {
          return trimmed.slice(1, -1);
        }
        return trimmed;
      }
      return null;
    };

    const variableNames = [];
    for (const p of params) {
      // Separate default: split on first top-level '='
      let eqIdx = -1;
      {
        let d = 0;
        for (let i = 0; i < p.length; i++) {
          const c = p[i];
          if (c === "(" || c === "[" || c === "{" || c === "<") d++;
          else if (c === ")" || c === "]" || c === "}" || c === ">") d--;
          else if (
            c === "=" &&
            d === 0 &&
            p[i + 1] !== "=" &&
            p[i - 1] !== "="
          ) {
            eqIdx = i;
            break;
          }
        }
      }
      const beforeEq = eqIdx === -1 ? p : p.substring(0, eqIdx);
      const defaultRaw = eqIdx === -1 ? undefined : p.substring(eqIdx + 1);

      // Separate name : type on the FIRST top-level ':'
      let colonIdx = -1;
      {
        let d = 0;
        for (let i = 0; i < beforeEq.length; i++) {
          const c = beforeEq[i];
          if (c === "(" || c === "[" || c === "{" || c === "<") d++;
          else if (c === ")" || c === "]" || c === "}" || c === ">") d--;
          else if (c === ":" && d === 0) {
            colonIdx = i;
            break;
          }
        }
      }
      const nameRaw =
        colonIdx === -1 ? beforeEq : beforeEq.substring(0, colonIdx);
      const typeRaw = colonIdx === -1 ? "" : beforeEq.substring(colonIdx + 1);

      // Strip `?` (optional marker) and whitespace from name
      const name = nameRaw.trim().replace(/\?$/, "");
      if (!name || !/^[a-zA-Z_$][\w$]*$/.test(name)) continue;

      const valueType = typeMap(typeRaw);
      const defaultValue = parseDefault(defaultRaw, valueType);

      variableNames.push(name);
      const existingInput = this.inputs.find((input) => input.name === name);
      if (!existingInput) {
        this._addIOWithoutSubscribing(name, valueType, defaultValue, "input");
      } else {
        existingInput.valueType = valueType;
        existingInput.defaultValue = defaultValue;
      }
    }

    // Remove inputs no longer declared in the run() signature
    [...this.inputs].forEach((input) => {
      if (input.type === "input" && !variableNames.includes(input.name)) {
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
    // Use safe serialization to prevent large code from bloating the save file
    Atom.safeSerializeValue(valuesObj, "code", this.code, this.name || "Code");
    if (this.compiledCode) {
      Atom.safeSerializeValue(
        valuesObj,
        "compiledCode",
        this.compiledCode,
        this.name || "Code",
      );
    }

    return valuesObj;
  }
}
