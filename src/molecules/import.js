import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { button, LevaInputs } from "leva";
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

    this.addIO("output", "geometry", this, "geometry", "");

    this.importOptions = ["SVG", "STL", "STEP"];

    this.importIndex = 0;

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
  /**
   * Update the displayed svg file
   */
  updateValue() {
    super.updateValue();
    this.processing = true;

    if (this.fileName != null) {
      this.getAFile().then((result) => {
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

        funcToCall(this.uniqueID, file, this.SVGwidth)
          .then((result) => {
            this.basicThreadValueProcessing();
            this.sendToRender();
          })
          .catch((error) => {
            alert(`Error processing file: ${error.message || error}`);
            this.alertingErrorHandler();
          });
      });
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

  /**
   * Begin propagation from this atom if there is a file uploaded
   */
  beginPropagation() {
    if (this.fileName != null) {
      this.updateValue();
    }
  }

  createLevaInputs() {
    let inputParams = {};
    if (this.fileName == null) {
      inputParams[this.uniqueID + "file_ops"] = {
        options: this.importOptions,
        label: "File Type",
        onChange: (value) => {
          this.importIndex = this.importOptions.indexOf(value);
        },
      };
    } else {
      if (this.type == "SVG") {
        inputParams["Width"] = {
          value: this.SVGwidth, //href to the file
          label: "Width",
          step: 0.01,
          onChange: (value) => {
            this.SVGwidth = value;
            this.updateValue();
          },
        };
      }
    }
    return inputParams;
  }
  /**
   * Creates an input element to load a file and calls import function in CreateMode
   */
  loadFile(type, onLoadComplete) {
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
      !GlobalVariables.currentRepo?.owner ||
      !GlobalVariables.currentRepoName
    ) {
      console.warn("Repository information not available");
      return;
    }
    this.repoOwner = GlobalVariables.currentRepo.owner;
    this.repoName = GlobalVariables.currentRepoName;

    this.repoOwner = GlobalVariables.currentRepo.owner;
    this.repoName = GlobalVariables.currentRepoName;
    this.updateValue();
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
    superSerialObject.SVGwidth = this.SVGwidth;
    superSerialObject.repoOwner = this.repoOwner;
    superSerialObject.repoName = this.repoName;

    return superSerialObject;
  }
}
