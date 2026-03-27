import Atom from "../prototypes/atom.js";

import GlobalVariables from "../js/globalvariables.js";

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

    // Special behavior for code atoms requires that ap's are explicitly set to ready
    values.ioValues?.forEach((ioValue) => {
      const ap = this._addIOWithoutSubscribing(ioValue.name, ioValue.valueType);
      ap.setReady(ioValue.ioValue);
    });
    this._addIOWithoutSubscribing("output", "geometry", null, "output");

    this.setValues([]);
    this.code = values.code || this.code;

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
    );
  }

  /**
   * This function reads the string of inputs the user specifies and adds them to the atom.
   */
  parseInputs() {
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

    valuesObj.codeVersion = 1;
    // Use safe serialization to prevent large code from bloating the save file
    Atom.safeSerializeValue(valuesObj, "code", this.code, this.name || "Code");

    return valuesObj;
  }
}
