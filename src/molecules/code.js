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
      Inputs = [
       {inputName: "shape", type: "geometry", defaultValue: null},
      {inputName: "dist", type: "number", defaultValue: 5},
        {inputName: "height", type: "number", defaultValue: 10}
      ]
      //This defines the molecules inputs and creates variables with the same names which can be referenced in the code

      //Takes the address and gets the shape from the library
      let importedShape = library[shape]

      //This makes a new copy of the shape and moves it in the X direction
      let movedShape = importedShape.geometry[0].clone().translate([dist,0,0])

      //Console.log works for debugging to better see what is happening under the hood
      console.log("Shape:")
      console.log(importedShape);

      //Shapes stored in the library have tags, a color, a plane, and a bill of materials like this. We don't modify them here
      let shape1 = {
        geometry: [movedShape],
        tags: importedShape.tags,
        color: importedShape.color,
        plane: importedShape.plane,
        bom: importedShape.bom
      }

      //We could at this point return shape1 as a complete shape and it will be automatically written to the library for us
      //return shape1

      //We can also create a new shape from scratch
      let createdRectangle = replicad.drawRectangle(5,7)
      //This is the plane we are going to put our new shape on
      const newPlane = new replicad.Plane().pivot(0, 'Y');
      //And we extrude the shape to make it 3D
      let createdShape = createdRectangle.sketchOnPlane(newPlane).extrude(height)

      //For our new geometry we need to define the tags, color, plane, etc
      let shape2 = {
          geometry: [createdShape],
          tags: ["aTag"],
          color: '#A3CE5B',
          plane: newPlane,
          bom: []
      }

      //Then we can return our created shape in just the same way
      //return shape2

      //If we want to return both shapes at once, we can create an assembly with them
      let anAssembly = {
        geometry: [shape1, shape2],
        tags: ["aNewTag"],
        color: '#A3CF5B',
        plane: newPlane,
        bom: []
      }

      //And we can return that in the same way
      return anAssembly

      /**
      To Use the Code Atom, enter your inputs to the input list as an object array:
      Inputs = [
        {inputName: "shape", type: "geometry", defaultValue: null},
        {inputName: "dist", type: "number", defaultValue: 5},
        {inputName: "height", type: "number", defaultValue: 10}
      ]
      If your input is connected to another atom with a replicad geometry you can access its geometry by looking up its ID in your library. a.e library[Input1].geometry[0]
      Use any replicad available methods to modify your geometry. Learn more about all of the available methods at
      https://replicad.xyz/docs/introapp/UserGuide.html
      Return a replicad object that includes geometry, color, tags and plane.

      Example Code Atom:
        Inputs = [
          {inputName: "shape", type: "geometry", defaultValue: null},
          {inputName: "x", type: "number", defaultValue: 5}
        ]
        let finalShape = library[shape].geometry[0].clone().translate([x,0,0])
        return {geometry: finalShape, color: library[shape].color, plane: library[shape].plane, tags: library[shape].tags }
      */
      `;

    //This loads any inputs which this atom had when last saved.
    this.x = values.x || 0;
    this.y = values.y || 0;
    this.parent = values.parent || null;
    this.uniqueID = values.uniqueID || GlobalVariables.generateUniqueID();

    // Special behavior for code atoms requires that ap's are explicitly set to ready
    values.ioValues?.forEach((ioValue) => {
      const ap = this.addIO(ioValue.name, ioValue.valueType);
      ap.setReady(ioValue.ioValue);
    });
    this.addIO("output", "geometry", null, "output");

    this.setValues([]);
    this.code = values.code || this.code;

    this.parseInputs();
  }

  /**
   * Draw the code atom which has a code icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#949294";
    GlobalVariables.c.font = `${GlobalVariables.widthToPixels(
      this.radius
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "</>",
      GlobalVariables.widthToPixels(this.x - this.radius / 1.5),
      GlobalVariables.heightToPixels(this.y + this.radius * 1.5)
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
                `${input.name}:${input.defaultValue}:${input.valueType}`
            )
            .join("|")
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
          `User code error at line ${lineNumber}: ${err.name} - ${err.message}`
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
    return GlobalVariables.cad.code(this.code, argumentsArray);
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
    const allInputsMatches = [
      ...codeNoComments.matchAll(/(?:const\s+)?Inputs\s*=\s*\[(.*?)]\s*;?/gs),
    ];
    if (allInputsMatches.length > 0) {
      const firstMatch = allInputsMatches[0];
      // If it's a const declaration, use safe eval
      if (/const\s+Inputs\s*=/.test(firstMatch[0])) {
        try {
          const sandboxFn = new Function(firstMatch[0] + "; return Inputs;");
          const inputsArray = sandboxFn();
          const variableNames = [];
          inputsArray.forEach(({ inputName, type, defaultValue }) => {
            variableNames.push(inputName);
            const existingInput = this.inputs.find(
              (input) => input.name === inputName
            );

            if (!existingInput) {
              this._addIOWithoutSubscribing(
                inputName,
                type,
                defaultValue,
                "input"
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
          this._subscribeToInputs();
          return;
        } catch (e) {
          console.warn("Failed to eval const Inputs array from code:", e);
        }
      } else {
        // Otherwise, parse as JSON
        let arrStr = firstMatch[1];
        arrStr = arrStr.replace(/\n/g, ""); // Remove newlines
        arrStr = arrStr.replace(/\r/g, ""); // Remove carriage returns
        arrStr = arrStr.replace(/,\s*]/, "]"); // Remove trailing comma before closing bracket
        arrStr = arrStr.replace(/(\w+)\s*:/g, '"$1":');
        arrStr = arrStr.replace(/'/g, '"');
        try {
          const inputsArray = JSON.parse(`[${arrStr}]`);
          const variableNames = [];
          inputsArray.forEach(({ inputName, type, defaultValue }) => {
            variableNames.push(inputName);
            const existingInput = this.inputs.find(
              (input) => input.name === inputName
            );
            if (!existingInput) {
              this._addIOWithoutSubscribing(
                inputName,
                type,
                defaultValue,
                "input"
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
          this._subscribeToInputs();
          return;
        } catch (e) {
          console.warn("Failed to parse Inputs array from code:", e);
        }
      }
    }
    // Fallback: legacy string parsing
    const variables = /Inputs:\[\s*([^)]+?)\s*\]/.exec(this.code);
    if (variables) {
      const variableNames = [];
      const parsedVariables =
        variables[1]?.split(/\s*,\s*/).map((v) => v.split(/\s*=\s*/)) || [];
      parsedVariables.forEach(([name, defaultVal]) => {
        const value = defaultVal || 10;
        variableNames.push(name);
        const existingInput = this.inputs.find((input) => input.name === name);
        if (!existingInput) {
          this._addIOWithoutSubscribing(name, "geometry", value, "input");
        }
      });
      const inputList = [...this.inputs];
      inputList.forEach((input) => {
        if (!variableNames.includes(input.name)) {
          this.removeIO(input.type, input.name, this);
        }
      });
      this._subscribeToInputs();
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
      yInPixels
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
    valuesObj.code = this.code;

    return valuesObj;
  }
}
