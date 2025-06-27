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
      //Inputs:[inputShape, dist, height]\n\
      //This defines the molecules inputs and creates variables with the same names which can be referenced in the code\n\
      \n\
      //Takes the address and gets the shape from the library\n\
      let importedShape = library[inputShape]\n\
      \n\
      //This makes a new copy of of the shape (to prevent garbage collection issues),\n\
      //and moves it in the X direction. Note that this will not work if the input is an assembly\n\
      let movedShape = importedShape.geometry[0].clone().translate([dist,0,0])\n\
      \n\
      //Console.log works for debugging to better see what is happening under the hood\n\
      console.log(\"Shape:\")\n\
      console.log(importedShape);\n\
      \n\
      //Shapes stored in the library have tags, a color, a plane, and a bill of materials like this. We don't modify them here\n\
      let shape1 = {\n\
        geometry: [movedShape],\n\
        tags: importedShape.tags,\n\
        color: importedShape.color,\n\
        plane: importedShape.plane,\n\
        bom: importedShape.bom\n\
      }\n\
      \n\
      //We could at this point return shape1 as a complete shape and it will be automatically written to the library for us\n\
      //return shape1\n\
      \n\
      //We can also create a new shape from scratch\n\
      let createdRectangle = replicad.drawRectangle(5,7)\n\
      //This is the plane we are going to put our new shape on\n\
      const newPlane = new replicad.Plane().pivot(0, 'Y');\n\
      //And we extrude the shape to make it 3D\n\
      let createdShape = createdRectangle.sketchOnPlane(newPlane).extrude(height)\n\
      \n\
      //For our new geometry we need to define the tags, color, plane, etc\n\
      let shape2 = {\n\
          geometry: [createdShape], \n\
          tags: [\"aTag\"],\n\
          color: '#A3CE5B',\n\
          plane: newPlane,\n\
          bom: []\n\
      }\n\
      \n\
      //Then we can return our created shape in just the same way\n\
      //return shape2\n\
      \n\
      //If we want to return both shapes at once, we can create an assembly with them\n\
      let anAssembly = {\n\
        geometry: [shape1, shape2], \n\
        tags: [\"aNewTag\"],\n\
        color: '#A3CF5B',\n\
        plane: newPlane,\n\
        bom: []\n\
      }\n\
      \n\
      //And we can return that in the same way\n\
      return anAssembly\n\
      \n\
      \n\
          /**\n\
          To Use the Code Atom, enter your inputs to the input list a.e Inputs:[shape, height]\n\
          If your input is connected to another atom with a replicad geometry you can access its geometry by looking up its ID in your library. a.e library[Input1].geometry[0] \n\
          Use any replicad available methods to modify your geometry. Learn more about all of the available methods at \n\
          https://replicad.xyz/docs/introapp/UserGuide.html \n\
          Return a replicad object that includes geometry, color, tags and plane. \n\
      \n\
      \n\
          Example Code Atom:\n\
      \n\
            Inputs:[shape, x];\n\
      \n\
            let finalShape = library[shape].geometry[0].clone.translate[x,0,0]\n\
      \n\
            return {geometry: finalShape, color: library[shape].color, plane: library[shape].plane, tags: library[shape].tags }\n\
      \n\
            - See more examples at _______ \n\
      \n\
      \n\
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
