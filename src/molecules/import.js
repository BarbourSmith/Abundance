import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";

/**
 * This class creates an atom which supports uploading a .svg file
 */
export default class Import extends Atom {
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
    this.name = "Import";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Import";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Import Atom, let's you choose a type of file to import and use in your design.";

    /**
     * The uploaded file
     * @type {string}
     */
    this.file = null;
    /**
     * The filename
     * @type {string}
     */
    this.fileName = null;
    /**
     * The type of uploaded file
     * @type {string}
     */
    this.type = null;

    /**
     * The sha of the file. Need to keep track of it to be able to delete file from github
     * @type {string}
     */
    this.sha = null;

    this.SVGwidth = 10;

    this.addIO("output", "geometry", undefined, "output");

    this.importOptions = ["SVG", "STL", "STEP"];

    this.importIndex = 0;

    //This loads any inputs which this atom had when last saved.
    if (typeof this.ioValues !== "undefined") {
      this.ioValues.forEach((ioValue) => {
        //for each saved value
        this.addIO("input", ioValue.name, this, "number", 5);
      });
    }

    this.setValues(values);
  }

  /**
   * Draw the circle atom & icon.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${GlobalVariables.widthToPixels(
      this.radius
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "G",
      GlobalVariables.widthToPixels(this.x - this.radius / 3),
      GlobalVariables.heightToPixels(this.y) + this.height / 3
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  compute(inputs) {
    return this.loadAndPropagate();
  }

  /**
   * Get a file from github. Calback is called after the retrieved.
   */
  getAFile = async function () {
    const octokit = new Octokit();
    const filePath = this.fileName;

    const repoOwner = this.repoOwner;
    const repoName = this.repoName;
    const result = await octokit.rest.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: filePath,
    });
    return result;
  };

  loadAndPropagate() {
    this.setProcessing();

    if (this.fileName != null) {
      return this.getAFile()
        .then((result) => {
          this.sha = result.data.sha;
          this.file = this.newBlobFromBase64(result);
          let file = this.file;
          let fileType = this.type;

          let funcToCall =
            fileType == "STL"
              ? GlobalVariables.cad.importingSTL
              : fileType == "SVG"
              ? GlobalVariables.cad.importingSVG
              : fileType == "STEP"
              ? GlobalVariables.cad.importingSTEP
              : null;

          if (funcToCall == null) {
            throw new Error("Invalid file type");
          }

          return funcToCall(file, this.getContext(), this.SVGwidth);
        })
        .then((result) => {
          this.setReady(result);
          if (this.selected) {
            this.sendToRender();
          }
          return result;
        })
        .catch(this.alertingErrorHandler());
    }
  }

  /** Make new Blob from Github repo content results */

  newBlobFromBase64(result) {
    // Your base64 string
    let base64String = result.data.content;

    // Convert base64 string to binary
    let binary = atob(base64String);

    if (this.type == "SVG") {
      return binary;
    }

    // Create an array to store the binary data
    let array = [];
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }

    // Create a new Blob from the binary data
    return new Blob([new Uint8Array(array)], {
      type: "application/octet-stream",
    });
  }

  createInputParams(setInputChanged) {
    //REVISE FOR NEW MENU
    let inputParams = super.createInputParams();
    if (this.fileName == null) {
      inputParams[this.uniqueID + "file_ops"] = {
        type: "select",
        options: this.importOptions,
        label: "File Type",
        onChange: (value) => {
          this.importIndex = this.importOptions.indexOf(value);
        },
      };

      inputParams[this.uniqueID + "Load File"] = {
        type: "button",
        label: "Load File",
        onClick: () => {
          this.loadFile(this.importOptions[this.importIndex], setInputChanged);
        },
      };
    } else {
      if (this.type == "SVG") {
        inputParams["Width"] = {
          type: "number",
          value: this.SVGwidth, //href to the file
          label: "Width",
          step: 1,
          onChange: (value) => {
            this.SVGwidth = value;
            this.loadAndPropagate();
          },
        };
      }
    }
    inputParams[this.uniqueID + "Loaded File"] = {
      type: "string",
      value: this.fileName ? this.fileName : "", //href to the file
      label: "Loaded File",
      disabled: true,
    };
    return inputParams;
  }

  /**
   * Creates an input element to load a file and calls import function in CreateMode
   */
  loadFile(type, onLoadComplete, setInputChanged) {
    var f = document.getElementById("fileLoaderInput");
    f.accept = "." + type.toLowerCase();
    f.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        // If a previous file exists, delete it
        if (this.fileName && this.sha) {
          console.log(`Deleting previous file: ${this.fileName}`);
          const deleteInput = document.getElementById("fileDeleteInput");
          deleteInput.value = this.fileName;
          deleteInput.setAttribute("data-sha", this.sha);
          deleteInput.click();
        }

        this.type = type;
        this.fileName = file.name; // Set the new filename

        if (onLoadComplete) {
          onLoadComplete(file.name); // Trigger the callback with the new filename
        }
      }
    };
    f.click();
  }

  /**
   * Call super delete node and then grab input that calls function to delete the file from github
   */
  deleteNode() {
    super.deleteNode();
    var f = document.getElementById("fileDeleteInput");
    f.value = this.fileName;
    f.click();
  }

  /**
   * Update the file, filename and sha of the atom
   */
  updateFile(file, sha) {
    this.fileName = file.name;
    this.sha = sha;
    if (
      !GlobalVariables.currentAWSnode?.owner ||
      !GlobalVariables.currentAWSnode?.repoName
    ) {
      console.warn("Repository information not available");
      return;
    }
    this.repoOwner = GlobalVariables.currentAWSnode.owner;
    this.repoName = GlobalVariables.currentAWSnode.repoName;

    this.repoOwner = GlobalVariables.currentAWSnode.owner;
    this.repoName = GlobalVariables.currentAWSnode.repoName;
    this.loadAndPropagate();
  }

  /**
   * Add the file name to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);

    //Write the current equation to the serialized object
    superSerialObject.fileName = this.fileName; // might delete, maybe we just save as library object
    superSerialObject.name = this.name;
    superSerialObject.type = this.type;
    superSerialObject.repoOwner = this.repoOwner;
    superSerialObject.repoName = this.repoName;

    return superSerialObject;
  }
}
