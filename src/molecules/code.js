import Atom from "../prototypes/atom.js";

import GlobalVariables from "../js/globalvariables.js";
import { button } from "leva";

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
    this.code = " \n\
// Define inputs: [width, height, thickness]\n\
// This creates input parameters that can be connected to other atoms or set manually\n\
Inputs:[width=20, height=10, thickness=5]\n\
\n\
/**\n\
 * BASIC EXAMPLE: Create a simple rectangular box\n\
 * This demonstrates the fundamental structure of a Code atom:\n\
 * 1. Use input parameters\n\
 * 2. Create geometry with replicad\n\
 * 3. Return a properly formatted shape object\n\
 */\n\
\n\
// Step 1: Create a 2D rectangle using the width and height inputs\n\
let rectangle = replicad.drawRectangle(width, height)\n\
\n\
// Step 2: Define the plane where our shape will be created\n\
// The XY plane is the default, positioned at Z=0\n\
let plane = new replicad.Plane()\n\
\n\
// Step 3: Extrude the rectangle to make it 3D using the thickness input\n\
let box = rectangle.sketchOnPlane(plane).extrude(thickness)\n\
\n\
// Step 4: Create the shape object with all required properties\n\
let finalShape = {\n\
  geometry: [box],              // Array of 3D geometries\n\
  tags: [\"custom-box\"],         // Tags for identification and export\n\
  color: '#4A90E2',            // Hex color code\n\
  plane: plane,                // Reference plane\n\
  bom: []                      // Bill of materials (empty for basic shapes)\n\
}\n\
\n\
// Step 5: Return the shape (this makes it available to other atoms)\n\
return finalShape\n\
\n\
/**\n\
 * WORKING WITH INPUT SHAPES:\n\
 * If you connect another atom to this code atom, you can access its geometry:\n\
 * \n\
 * Inputs:[inputShape, offsetX=5]\n\
 * \n\
 * // Get the connected shape from the library\n\
 * let connectedShape = library[inputShape]\n\
 * \n\
 * // Clone and modify the geometry (always clone to avoid issues)\n\
 * let modifiedGeometry = connectedShape.geometry[0].clone().translate([offsetX, 0, 0])\n\
 * \n\
 * // Return the modified shape, preserving original properties\n\
 * return {\n\
 *   geometry: [modifiedGeometry],\n\
 *   tags: connectedShape.tags,\n\
 *   color: connectedShape.color,\n\
 *   plane: connectedShape.plane,\n\
 *   bom: connectedShape.bom\n\
 * }\n\
 */\n\
\n\
/**\n\
 * TIPS:\n\
 * - Use console.log() for debugging: console.log('Debug info:', variable)\n\
 * - Input names become variables you can use in your code\n\
 * - Default values: Inputs:[width=10, height=5] sets defaults\n\
 * - Learn more at: https://replicad.xyz/docs/api\n\
 * - Always return an object with geometry, tags, color, plane, and bom\n\
 */\n\
";

    this.addIO("output", "geometry", this, "geometry", "");

    this.setValues(values);

    this.parseInputs(false);
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

  /**
   * Begin propagation from this code atom if it has no inputs or if none of the inputs are connected.
   */
  beginPropagation() {
    //If there are no inputs
    if (this.inputs.length == 0) {
      this.updateValue();
    }

    //If none of the inputs are connected
    var connectedInput = false;
    this.inputs.forEach((input) => {
      if (input.connectors.length > 0) {
        connectedInput = true;
      }
    });
    if (!connectedInput) {
      this.updateValue();
    }
  }

  createLevaInputs() {
    let inputParams = {};
    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        inputParams[this.uniqueID + input.name] = {
          value: input.value,
          label: input.name,
          disabled: checkConnector(),
          step: 0.01,
          onChange: (value) => {
            if (input.value !== value) {
              input.setValue(value);
              //this.sendToRender();
            }
          },
        };
      });
      inputParams["Edit Code"] = button(() => this.editCode());
      inputParams["Save Code"] = button(() => this.saveCode());
      inputParams["Close Editor"] = button(() => this.closeCode());
      return inputParams;
    }
  }

  /**
   * Called when code editor save button is clicked. Updates the code and value of the atom.
   */
  updateCode(code) {
    this.code = code;
    this.updateValue();
    this.sendToRender();
  }

  /**
   * Grab the code as a text string and execute it.
   */
  updateValue(value) {
    super.updateValue();
    //Parse the inputs
    this.parseInputs();

    if (this.inputs.every((x) => x.ready)) {
      var inputValues = [];
      this.inputs.forEach((io) => {
        if (io.connectors.length > 0 && io.type == "input") {
          inputValues.push(io.getValue());
        }
      });
      var argumentsArray = {};
      this.inputs.forEach((input) => {
        argumentsArray[input.name] = input.value;
      });

      console.log("reevaluating code atom with inputs: ", argumentsArray);
      GlobalVariables.cad
        .code(this.uniqueID, this.code, argumentsArray)
        .then((result) => {
          if (result === true) {
            //Code atom returned geometry
            this.basicThreadValueProcessing();
          } else {
            //Code atom returned a number
            this.customThreadValueProcessing(result);
          }
        })
        .catch((err) => {
          this.processing = false;
          console.log(err);
          // try to extract line number trace from the evaluated code
          let logged = false;
          if (err.stack && err.stack.includes("eval")) {
            // If the error stack contains "eval", we can try to extract the line number
            const lineMatch = err.stack.match(/<anonymous>:(\d+):(\d+)/);
            if (lineMatch) {
              const lineNumber = lineMatch[1];
              this.setAlert(
                `User code error at line ${lineNumber}: ${err.name} - ${err.message}`
              );
              logged = true;
            }
          }
          if (!logged) {
            this.setAlert(err.name + ": " + err.message);
          }
        });
    }
  }


  /**
   * Override the standard basic thread processing function to allow passing of numbers or geometry depending on what we have
   */
  customThreadValueProcessing(returnedNumber) {
    this.decreaseToProcessCountByOne();
    this.clearAlert();
    if (this.output) {
      this.value = returnedNumber;
      this.output.setValue(returnedNumber);
      this.output.ready = true;
    }
    this.processing = false;
  }

  /**
   * This function reads the string of inputs the user specifies and adds them to the atom.
   */
  parseInputs(ready = true) {
    //Parse this.code for the line "\nmain(input1, input2....) and add those as inputs if needed
    var variables = /Inputs:\[\s*([^)]+?)\s*\]/.exec(this.code);

    if (variables) {
      if (variables[1]) {
        variables = variables[1].split(/\s*,\s*/);
      }
      let variableNames = [];
      //Add any inputs which are needed
      for (var variable in variables) {
        variables[variable] = variables[variable].split(/\s*=\s*/);
        let variableName = variables[variable][0];
        variableNames.push(variableName);
        let defaultVal = variables[variable][1] ? variables[variable][1] : 10;

        if (!this.inputs.some((input) => input.Name === variableName)) {
          this.addIO(
            "input",
            variableName,
            this,
            "geometry",
            defaultVal,
            ready
          );
        }
      }

      //Remove any inputs which are not needed
      for (var input in this.inputs) {
        if (!variableNames.includes(this.inputs[input].name)) {
          this.removeIO("input", this.inputs[input].name, this);
        }
      }
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
