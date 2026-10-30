import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { Octokit } from "octokit";
import {
  DEFAULT_MODEL_UNITS,
  MODEL_UNITS,
  REFERENCE_TYPES,
  addAsset,
  describeReferenceFile,
  gltfExternalFiles,
  isReferenceType,
} from "../js/referenceFiles.js";
import { referencesOf, sideDataOf, withSideData } from "../js/sideData.js";
import { unitAbbreviation, unitsContextOf } from "../js/units.js";
import { EMPTY_ASSEMBLY } from "../worker/util";

/** The name of a file from its path in a repository. */
function baseName(path) {
  return String(path).split("/").pop();
}

/**
 * This class creates an atom which imports a file: SVG, STL, and STEP files
 * as geometry, and PNG, JPG, PDF, GLB, and glTF files as references to model
 * against (see src/js/referenceFiles.js).
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
      "Imports a file into your design: SVG, STL, and STEP files as geometry, and PNG, JPG, PDF, GLB, and glTF files as references (images, documents, and 3D scans) to model against. References are shown and moved like geometry, but never cut it or get cut.";

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

    /**
     * Width of an imported image or PDF page in project units, or null for
     * the default (about 100 mm for an image, the printed size for a PDF).
     * @type {number|null}
     */
    this.referenceWidth = null;

    /**
     * The PDF page to show, from 1.
     * @type {number}
     */
    this.page = 1;

    /**
     * The units an imported 3D model is in, a key of MODEL_UNITS.
     * @type {string}
     */
    this.modelUnits = DEFAULT_MODEL_UNITS;

    /**
     * How opaque an imported reference is, 0 to 1.
     * @type {number}
     */
    this.opacity = 1;

    this.addIO("output", "geometry", undefined, "output");

    this.importOptions = [
      "SVG",
      "STL",
      "STEP",
      ...Object.keys(REFERENCE_TYPES),
    ];

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
      this.radius,
    )}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "G",
      GlobalVariables.widthToPixels(this.x - this.radius / 3),
      GlobalVariables.heightToPixels(this.y) + this.height / 3,
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  compute(inputs) {
    return this.loadAndPropagate();
  }

  /** An imported reference is this atom's own side data. */
  outputSideData(inputs, value) {
    return sideDataOf(value);
  }

  /**
   * Get a file from github. Calback is called after the retrieved.
   */
  getAFile = async function () {
    const filePath = this.fileName;
    const repoOwner = this.repoOwner;
    const repoName = this.repoName;
    const ref = this.gitRef || undefined;

    // Use authenticated fetch if available (required for private repos)
    if (GlobalVariables.fetchFileContent) {
      return GlobalVariables.fetchFileContent(
        repoOwner,
        repoName,
        filePath,
        ref,
      );
    }

    const octokit = new Octokit({
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    return octokit.rest.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: filePath,
      ...(ref ? { ref } : {}),
    });
  };

  /**
   * Whether the file lives in another repository than the open project's,
   * as when the agent links an Import atom to a file on GitHub. Such a file
   * isn't this project's to delete.
   */
  isLinkedFile() {
    const node = GlobalVariables.currentAWSnode;
    return Boolean(
      this.repoOwner &&
        this.repoName &&
        node?.owner &&
        (this.repoOwner !== node.owner || this.repoName !== node.repoName),
    );
  }

  loadAndPropagate() {
    this.setProcessing();

    if (this.fileName != null) {
      return this.getAFile()
        .then(async (result) => {
          this.sha = result.data.sha;

          // GitHub's getContent API returns empty content for files >1MB.
          // In that case, fetch the raw file via the authenticated git blob API,
          // or from its public download URL on pages without a GitHub login
          // (run mode, signed-out viewers).
          let file;
          if (!result.data.content) {
            file = GlobalVariables.fetchRawFileContent
              ? await GlobalVariables.fetchRawFileContent(
                  this.repoOwner,
                  this.repoName,
                  result.data.sha,
                  this.type,
                )
              : await this.fetchFromDownloadUrl(result.data);
          } else {
            file = this.newBlobFromBase64(result);
          }

          this.file = file;
          if (isReferenceType(this.type)) {
            return this.loadReference(file);
          }
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
        .catch((err) => {
          // Only a missing file gets the "check that it exists" advice
          const reason =
            err?.status === 404
              ? "Please check that the file exists in the repository and try again."
              : err?.message || String(err);
          throw new Error(`Failed to load file "${this.fileName}". ${reason}`, {
            cause: err,
          });
        });
    }
  }

  /**
   * Fetch another file from the repository this atom's file is in, as a Blob,
   * the way loadAndPropagate fetches the file itself.
   * @param {string} path - Path in the repository
   */
  async fetchRepoFile(path) {
    const result = GlobalVariables.fetchFileContent
      ? await GlobalVariables.fetchFileContent(
          this.repoOwner,
          this.repoName,
          path,
          this.gitRef || undefined,
        )
      : await new Octokit({
          headers: { "X-GitHub-Api-Version": "2022-11-28" },
        }).rest.repos.getContent({
          owner: this.repoOwner,
          repo: this.repoName,
          path,
          ...(this.gitRef ? { ref: this.gitRef } : {}),
        });
    if (result.data.content) return this.newBlobFromBase64(result);
    return GlobalVariables.fetchRawFileContent
      ? GlobalVariables.fetchRawFileContent(
          this.repoOwner,
          this.repoName,
          result.data.sha,
          this.type,
        )
      : this.fetchFromDownloadUrl(result.data);
  }

  /**
   * Keep a reference file's bytes, with the other files a .gltf loads from
   * beside it in the repository, and describe it as this atom's output.
   * @param {Blob} file
   */
  async loadReference(file) {
    // Files fetched from GitHub come back untyped
    const blob = new Blob([file], {
      type: REFERENCE_TYPES[this.type].mimeType,
    });
    this.asset = await addAsset(blob, {
      name: baseName(this.fileName),
      mimeType: REFERENCE_TYPES[this.type].mimeType,
    });
    this.resources = {};
    if (this.type === "GLTF") {
      const folder = new URL(this.fileName, "https://repo/");
      for (const path of gltfExternalFiles(await blob.text())) {
        const repoPath = decodeURI(new URL(path, folder).pathname.slice(1));
        let resource;
        try {
          resource = await this.fetchRepoFile(repoPath);
        } catch (err) {
          throw new Error(
            `This .gltf file loads ${path}, which couldn't be loaded from the repository (${err?.message || err}). Import the .glb version of the model instead, which holds everything in one file.`,
          );
        }
        this.resources[path] = await addAsset(resource, {
          name: baseName(path),
        });
      }
    }
    return this.referenceValue();
  }

  /** This atom's output for its loaded reference file, with its settings. */
  async referenceValue() {
    const item = await describeReferenceFile(this.asset, {
      type: this.type,
      name: baseName(this.fileName),
      unitsKey: unitsContextOf(this),
      width: this.referenceWidth,
      page: this.page,
      modelUnits: this.modelUnits,
      opacity: this.opacity,
      resources: this.resources,
      ...(this.repoOwner && this.repoName
        ? {
            source: {
              owner: this.repoOwner,
              repo: this.repoName,
              path: this.fileName,
              ...(this.gitRef ? { ref: this.gitRef } : {}),
            },
          }
        : {}),
    });
    return withSideData(structuredClone(EMPTY_ASSEMBLY), [item]);
  }

  /**
   * Describe the loaded reference again after a setting changed, without
   * fetching the file again.
   */
  refreshReference() {
    if (!this.asset) {
      return this.loadAndPropagate();
    }
    this.setProcessing();
    return this.referenceValue()
      .then((value) => {
        this.setReady(value);
        if (this.selected) {
          this.sendToRender();
        }
        this.setInputChanged?.(Date.now());
      })
      .catch((err) => this.setError(err));
  }

  /**
   * Fetch a file too large for the contents API from its download URL. Only
   * public repositories serve files this way without a login.
   */
  async fetchFromDownloadUrl(data) {
    if (!data.download_url) {
      throw new Error("Authenticated file fetch is not available");
    }
    const response = await fetch(data.download_url);
    if (!response.ok) {
      throw new Error(`download_url returned ${response.status}`);
    }
    return this.type == "SVG" ? response.text() : response.blob();
  }

  /** Make new Blob from Github repo content results */

  newBlobFromBase64(result) {
    // Your base64 string
    let base64String = result.data.content;

    // GitHub API returns base64 with \n every 60 chars; atob() rejects whitespace
    let binary = atob(base64String.replace(/\s/g, ""));

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
    let inputParams = super.createInputParams(setInputChanged);
    if (this.fileName == null) {
      inputParams[this.uniqueID + "file_ops"] = {
        type: "select",
        options: this.importOptions,
        label: "File Type",
        onChange: (value) => {
          if (!value) {
            /*default to first option if no value is selected*/
            value = this.importOptions[0];
          }
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
      if (isReferenceType(this.type)) {
        Object.assign(inputParams, this.referenceParams());
      }
    }
    inputParams[this.uniqueID + "Loaded File"] = {
      type: "string",
      value: !this.fileName
        ? ""
        : this.isLinkedFile()
          ? `${this.repoOwner}/${this.repoName}/${this.fileName}`
          : this.fileName, //href to the file
      label: "Loaded File",
      disabled: true,
    };
    return inputParams;
  }

  /** Panel fields for a reference file's settings. */
  referenceParams() {
    const params = {};
    const id = this.uniqueID;
    const kind = REFERENCE_TYPES[this.type].kind;
    const [item] = referencesOf(this.value);
    if (kind === "image" || kind === "pdf") {
      const { min, max } = item?.contentBounds || { min: [0], max: [0] };
      params[id + "referenceWidth"] = {
        type: "number",
        value: this.referenceWidth ?? Math.round((max[0] - min[0]) * 100) / 100,
        label: `Width (${unitAbbreviation(unitsContextOf(this)) || "units"})`,
        step: 1,
        onChange: (value) => {
          const width = Number(value);
          this.referenceWidth = width > 0 ? width : null;
          this.refreshReference();
        },
      };
    }
    if (kind === "pdf") {
      params[id + "page"] = {
        type: "number",
        value: this.page,
        label: item?.pageCount ? `Page (of ${item.pageCount})` : "Page",
        min: 1,
        step: 1,
        onChange: (value) => {
          const page = Math.round(Number(value));
          if (page >= 1 && page !== this.page) {
            this.page = page;
            this.refreshReference();
          }
        },
      };
    }
    if (kind === "model") {
      params[id + "modelUnits"] = {
        type: "select",
        value: this.modelUnits,
        options: Object.keys(MODEL_UNITS),
        label: "File Units",
        onChange: (value) => {
          if (value && value !== this.modelUnits) {
            this.modelUnits = value;
            this.refreshReference();
          }
        },
      };
    }
    params[id + "opacity"] = {
      type: "range",
      value: this.opacity,
      label: "Opacity",
      min: 0.05,
      max: 1,
      step: 0.05,
      onChange: (value) => {
        this.opacity = Number(value);
        this.refreshReference();
      },
    };
    return params;
  }

  /**
   * Creates an input element to load a file and calls import function in CreateMode
   */
  loadFile(type, setInputChanged) {
    var f = document.getElementById("fileLoaderInput");
    f.accept = (REFERENCE_TYPES[type]?.extensions || [type.toLowerCase()])
      .map((extension) => "." + extension)
      .join(",");
    f.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        // If a previous file exists, delete it
        this.deleteUploadedFile();

        this.type = type;
        this.fileName = file.name; // Set the new filename

        if (setInputChanged) {
          setInputChanged(event.timeStamp); // Trigger the callback with the event timestamp
        }
      }
    };
    f.click();
  }

  /**
   * The user deleted this atom, so delete its file from the project's
   * repository too.
   */
  deleteByUser() {
    super.deleteByUser();
    this.deleteUploadedFile();
  }

  /**
   * Delete this atom's file from the project's repository, unless another atom
   * still loads it (copy and paste makes copies that share one file) or it
   * is linked from another repository.
   */
  deleteUploadedFile() {
    if (
      !this.fileName ||
      !this.sha ||
      this.isLinkedFile() ||
      this.fileIsShared()
    ) {
      return;
    }
    GlobalVariables.deleteFile?.(this.fileName, this.sha);
  }

  /**
   * Whether another atom in the open project loads the same file as this one.
   */
  fileIsShared() {
    const loadsSameFile = (atom) =>
      atom !== this &&
      atom.fileName === this.fileName &&
      atom.repoOwner === this.repoOwner &&
      atom.repoName === this.repoName;
    const search = (molecule) =>
      molecule.nodesOnTheScreen.some(
        (atom) =>
          loadsSameFile(atom) || (atom.nodesOnTheScreen && search(atom)),
      );
    return search(GlobalVariables.topLevelMolecule);
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

    if (file instanceof File && isReferenceType(this.type)) {
      this.setProcessing();
      this.loadReference(file)
        .then((result) => {
          this.setReady(result);
          if (this.selected) {
            this.sendToRender();
          }
        })
        .catch((err) => {
          this.setError(
            `Failed to load imported file "${this.fileName}". ${err?.message || err}`,
          );
        });
    } else if (file instanceof File) {
      // File object was passed directly from a fresh upload — process it immediately
      // without re-fetching from GitHub (avoids CDN propagation-delay 404s)
      this.setProcessing();
      const fileType = this.type;
      const funcToCall =
        fileType === "STL"
          ? GlobalVariables.cad.importingSTL
          : fileType === "SVG"
            ? GlobalVariables.cad.importingSVG
            : fileType === "STEP"
              ? GlobalVariables.cad.importingSTEP
              : null;

      if (funcToCall === null) {
        this.setError(`Unknown file type: ${fileType}`);
        return;
      }

      funcToCall(file, this.getContext(), this.SVGwidth)
        .then((result) => {
          this.setReady(result);
          if (this.selected) {
            this.sendToRender();
          }
        })
        .catch((err) => {
          this.setError(`Failed to process imported file "${this.fileName}".`);
          throw err;
        });
    } else {
      this.loadAndPropagate();
    }

    if (this.setInputChanged) {
      this.setInputChanged(Date.now());
    }
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
    if (this.gitRef) superSerialObject.gitRef = this.gitRef;
    superSerialObject.SVGwidth = this.SVGwidth;
    if (isReferenceType(this.type)) {
      if (this.referenceWidth) {
        superSerialObject.referenceWidth = this.referenceWidth;
      }
      if (this.page !== 1) superSerialObject.page = this.page;
      if (this.modelUnits !== DEFAULT_MODEL_UNITS) {
        superSerialObject.modelUnits = this.modelUnits;
      }
      if (this.opacity !== 1) superSerialObject.opacity = this.opacity;
    }

    return superSerialObject;
  }
}
