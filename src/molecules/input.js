import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { Status } from "../prototypes/observableEntity.js";
import { Octokit } from "octokit";

// Default values for range type inputs
const DEFAULT_RANGE_MIN = 0;
const DEFAULT_RANGE_MAX = 100;

/**
 * This class creates the input atom.
 */
export default class Input extends Atom {
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
    this.name = "Input";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Adds an input to the parent molecule. If the parent molecule is the top level of the project then the input will be available when the project is shared or imported into another project. Name is editable";
    /**
     * The value the input is set to, defaults to 10. Is this still used or are we using the value of the attachmentPoint now?
     * @type {number}
     */
    this.value = 10;
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Input";
    /**
     * This atom's height for drawing
     * @type {number}
     */
    this.height;

    this.width;

    this.type = "number";

    this.radius = 1 / 75;

    /**
     * Properties for import type inputs
     */
    this.fileName = null;
    this.fileType = null;
    this.fileSha = null;
    this.repoOwner = null;
    this.repoName = null;
    this.SVGwidth = 10;
    this.importOptions = ["SVG", "STL", "STEP"];
    this.importIndex = 0;

    /**
     * Properties for local file processing (not saved to GitHub)
     * Used for unauthenticated users or temporary imports
     */
    this.isLocalFile = false;
    this.localFileContent = null;

    /**
     * Flag indicating if the name text is currently truncated
     * @type {boolean}
     */
    this.isTextTruncated = false;

    /**
     * Timer for tooltip delay
     * @type {number}
     */
    this.tooltipTimer = null;

    /**
     * Reference to the tooltip DOM element
     * @type {HTMLElement}
     */
    this.tooltipElement = null;

    // Set values first to ensure type is set correctly
    this.setValues(values);

    // Determine the output valueType (import type outputs geometry)
    const outputValueType = this.type === "import" ? "geometry" : this.type;
    this.addIO("number or geometry", outputValueType, this.value, "output");

    /**
     * This atom's old name, used during name changes. Set after values are applied.
     * @type {string}
     */
    this.oldName = this.name;

    // Apply Y-offset to prevent overlapping with existing Input atoms
    this.adjustYForCollision();

    //Add a new input to the current molecule
    if (typeof this.parent !== "undefined") {
      // For import type, pass additional metadata through options
      const inputOptions =
        this.type === "import"
          ? {
              ...this.options,
              importType: true,
              importOptions: this.importOptions,
              fileName: this.fileName,
              fileType: this.fileType,
              SVGwidth: this.SVGwidth,
              inputAtom: this, // Reference to the Input atom for file operations
            }
          : this.options;

      // parent should subscribe so it can manage it's ready/processing/etc state
      this.parentAP = this.parent.addIO(
        this.name,
        this.type === "import" ? "geometry" : this.type,
        this.value,
        "input",
        inputOptions
      );
      // We also subscribe directly to the parent ap.
      this.parentAP.subscribe(() => {
        this.onUpstreamChange(); // Subscribe with our callback instead of our parent's which is default.
      }, this.uniqueID);
    } else {
      throw new Error(
        "constructed an input with undefined parent. IDK what to do here"
      );
    }

    // Load import file if this is an import type with file data
    if (this.type === "import" && this.fileName) {
      this.loadAndPropagate();
    }
  }

  /**
   * Positions Input atoms in a vertical stack on the left side of the canvas.
   * First input spawns at top left, subsequent inputs spawn below existing ones.
   * Dynamically adjusts spacing to ensure all inputs fit within the canvas height.
   *
   * Note: The x position is also set in draw() to ensure Inputs remain locked
   * to the left side even if a user attempts to move them. Setting it here
   * ensures correct initial positioning during construction.
   */
  adjustYForCollision() {
    if (!this.parent || !this.parent.nodesOnTheScreen) return;

    // Always position Input atoms on the left side of the canvas
    // This is also enforced in draw() to prevent horizontal movement
    this.x = GlobalVariables.atomSize * 1.65;

    // Find all existing Input atoms in the parent molecule (excluding this one)
    const existingInputs = this.parent.nodesOnTheScreen.filter(
      (atom) => atom.atomType === "Input" && atom !== this
    );

    // Calculate total number of inputs including this one
    const totalInputs = existingInputs.length + 1;

    // Default spacing and starting position
    const defaultSpacing = GlobalVariables.atomSize * 6;
    const defaultStartY = GlobalVariables.atomSize * 10;

    // Calculate available canvas height (in fractional units, where 1.0 = full height)
    // Reserve some space at the bottom for safety
    const maxY = 0.95;

    // Calculate the height required with default spacing
    const requiredHeight = defaultStartY + (totalInputs - 1) * defaultSpacing;

    // Adjust spacing if inputs would exceed canvas height
    let atomSpacing = defaultSpacing;
    let startY = defaultStartY;

    if (requiredHeight > maxY) {
      // Calculate the maximum spacing that will fit all inputs
      const availableHeight = maxY - defaultStartY;
      atomSpacing =
        totalInputs > 1 ? availableHeight / (totalInputs - 1) : defaultSpacing;

      // Ensure minimum spacing for usability (at least 1.5x atomSize)
      const minSpacing = GlobalVariables.atomSize * 1.5;
      if (atomSpacing < minSpacing) {
        atomSpacing = minSpacing;
        // Adjust start position to fit more inputs by starting higher
        const adjustedRequiredHeight = (totalInputs - 1) * atomSpacing;
        startY = Math.max(
          GlobalVariables.atomSize * 2,
          maxY - adjustedRequiredHeight
        );
      }
    }

    if (existingInputs.length === 0) {
      // This is the first Input atom - position it at the top left
      this.y = startY;
    } else {
      // Find the Input with the lowest (highest y value) position
      const lowestInput = existingInputs.reduce((lowest, current) => {
        return current.y > lowest.y ? current : lowest;
      });

      // Position this Input below the lowest existing Input
      this.y = lowestInput.y + atomSpacing;

      // Ensure we don't exceed the canvas height
      if (this.y > maxY) {
        this.y = maxY;
      }
    }
  }

  enable() {
    // Instead of the usual enable behavior, we want to push the propagation of
    // enable-ment up to our parent's attachment points if any.
    if (this.status !== Status.DISABLED) {
      return false;
    }
    let didPropagateUpstream = false;
    if (this.parentAP) {
      if (this.parentAP.connectors && this.parentAP.connectors.length > 0) {
        this.parentAP.connectors.forEach((connector) => {
          const upstreamAtom = connector.attachmentPoint1?.parentMolecule;
          if (upstreamAtom && upstreamAtom !== this) {
            // Recursively enable the upstream atom
            this.setWaiting();
            didPropagateUpstream = upstreamAtom.enable();
          }
        });
      }
    }
    if (!didPropagateUpstream) {
      // For import type inputs with file data
      if (this.type === "import" && this.fileName) {
        // If we already have the geometry value, just set to ready
        // No need to reload from GitHub/memory every time
        if (this.value && typeof this.value === "object") {
          this.setReady(this.value);
          if (this.parentAP) {
            this.parentAP.setValue(this.value);
          }
          return true;
        }
        // Otherwise, load and propagate the geometry
        this.loadAndPropagate();
        return true;
      }

      if (this.parentAP) {
        const apState = this.parentAP.getState();
        if (apState.value !== null && apState.value !== undefined) {
          this.setStatus(Status.READY, apState.value);
          return true;
        }
      } else {
        this.setWaiting();
      }
    }
    return true;
  }

  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }

    // Store the previous value to detect changes
    const previousValue = this.value;

    // This is called when the parent attachment point changes
    // We need to update the value of this input atom
    if (this.parentAP) {
      const parentState = this.parentAP.getState();

      // For import type inputs with cached geometry, maintain READY state
      // Don't sync with parent AP status changes that might temporarily set to WAITING
      if (
        this.type === "import" &&
        this.value &&
        typeof this.value === "object"
      ) {
        // Keep the cached geometry and stay READY
        // Parent AP status changes shouldn't affect import inputs with loaded files
        if (this.status !== Status.READY) {
          this.setReady(this.value);
        }
        return;
      }

      this.setStatus(parentState.status, parentState.value);

      // Update our internal value if status is READY
      if (parentState.status === Status.READY) {
        this.value = parentState.value;
      }
    } else {
      // This is a top-level input atom. Set to our value and mark as ready
      if (this.value) {
        this.setReady(this.value);
      } else {
        this.setWaiting();
      }
    }

    // Notify parent molecule of input value change if value actually changed
    // and the status is READY (successful state change)
    if (
      this.status === Status.READY &&
      this.value !== previousValue &&
      this.parent &&
      typeof this.parent.propagateInputChange === "function"
    ) {
      this.parent.propagateInputChange(this.name);
    }
  }

  /**
   * Override setReady to trigger propagation when input value changes
   */
  setReady(value) {
    const previousValue = this.value;
    super.setReady(value);

    // Update internal value and trigger propagation if changed
    this.value = value;
    if (
      this.value !== previousValue &&
      this.parent &&
      typeof this.parent.propagateInputChange === "function"
    ) {
      this.parent.propagateInputChange(this.name);
    }
  }

  /** Solution to canvas overflow https://stackoverflow.com/questions/10508988/html-canvas-text-overflow-ellipsis*/
  fittingString(c, str, maxWidth) {
    if (!str) {
      this.isTextTruncated = false;
      return str || "";
    }

    var width = c.measureText(str).width;
    var ellipsis = "…";
    var ellipsisWidth = c.measureText(ellipsis).width;
    if (width <= maxWidth || width <= ellipsisWidth) {
      this.isTextTruncated = false;
      return str;
    } else {
      this.isTextTruncated = true;
      var len = str.length;
      while (width >= maxWidth - ellipsisWidth && len-- > 0) {
        str = str.substring(0, len);
        width = c.measureText(str).width;
      }
      return str + ellipsis;
    }
  }

  /**
   * Draws the atom on the screen.
   */
  draw() {
    // Always lock the inputs to the left side
    /**
     * The x position of the atom
     * @type {number}
     */
    this.x = GlobalVariables.atomSize * 1.65;
    this.radius = GlobalVariables.atomSize * 1.3;

    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    let radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    /**
     * Relates height to radius
     * @type {number}
     */
    // Reduce height to be just enough for text with padding
    // Extract font size from canvasFont (e.g., "12px Work Sans Bold" -> 12)
    const fontSize = parseInt(GlobalVariables.canvasFont) || 12;
    this.height = fontSize + 14; // Font size + padding (7px top + 7px bottom)

    // Calculate width based on text length with min and max constraints
    // Set font first to measure text accurately
    GlobalVariables.c.font = GlobalVariables.canvasFont;
    const textWidth = GlobalVariables.c.measureText(this.name).width;
    const padding = 15; // Left padding (5) + right padding (10) to give some breathing room
    const minWidth = radiusInPixels * 2.5; // Minimum width based on original design
    const maxWidth = radiusInPixels * 3; // Maximum width to prevent overly wide atoms
    this.width = Math.max(minWidth, Math.min(maxWidth, textWidth + padding));

    //Check if the name has been updated
    if (this.name != this.oldName) {
      this.updateParentName();
    }

    //Set colors based on status
    GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
    this.color = Atom.statusAsColor(this.status, this.selected);

    GlobalVariables.c.strokeStyle = this.selected
      ? Atom.DEFAULT_COLOR
      : Atom.SELECTED_COLOR;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.moveTo(0, yInPixels + this.height / 2);
    GlobalVariables.c.lineTo(this.width, yInPixels + this.height / 2);
    GlobalVariables.c.lineTo(this.width + radiusInPixels / 2, yInPixels);
    GlobalVariables.c.lineTo(this.width, yInPixels - this.height / 2);
    GlobalVariables.c.lineTo(0, yInPixels - this.height / 2);
    GlobalVariables.c.lineWidth = 1;
    GlobalVariables.c.fillStyle = this.color;
    GlobalVariables.c.fill();
    GlobalVariables.c.fillStyle = Atom.DEFAULT_COLOR;
    GlobalVariables.c.closePath();
    GlobalVariables.c.stroke();
    GlobalVariables.c.font = GlobalVariables.canvasFont;
    GlobalVariables.c.textAlign = "start";
    GlobalVariables.c.fillStyle = "black";
    GlobalVariables.c.width = 20;
    GlobalVariables.c.textOverflow = "ellipsis";

    // Use the actual width minus padding for text overflow calculation
    const maxTextWidth = this.width - 10; // Leave 5px on each side
    GlobalVariables.c.fillText(
      this.fittingString(GlobalVariables.c, this.name, maxTextWidth),
      5,
      yInPixels + 3
    );

    // Draw the inputs
    this.inputs.forEach((input) => {
      input.draw();
    });

    // Draw the output
    if (this.output) {
      this.output.draw();
    }
  }

  /**
   * Remove the input from the parent molecule, then delete the atom normally.
   */
  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    // Clean up tooltip
    this.clearTooltipTimer();
    this.hideTooltip();

    this.deleteFile();

    //Remove this input from the parent molecule
    if (typeof this.parent !== "undefined") {
      this.parent.removeIO("input", this.name, this.parent, silent);
    }

    super.deleteNode(backgroundClickAfter, deletePath, silent);
  }

  deleteFile() {
    console.log("delete file called from input atom");
    // Delete uploaded file if this is an import type
    console.log(this.type, this.fileName);
    if (this.type === "import" && this.fileName) {
      if (GlobalVariables.deleteFile) {
        GlobalVariables.deleteFile(this.fileName, this.fileSha);
        this.fileName = null;
        this.fileSha = null;
        this.repoOwner = null;
        this.repoName = null;
        this.fileType = null;
        this.value = null;
        this.updateParentAPOptions();
        this.setWaiting();
      } else {
        console.warn("deleteFile not available in GlobalVariables");
      }
      this.setInputChanged(this.name);
    }
  }

  /**
   * Called when the name has changed to updated the name of the parent molecule IO
   */
  updateParentName() {
    //Run through the parent molecule and find the input with the same name
    this.parent.inputs.forEach((child) => {
      if (child.name == this.oldName) {
        child.name = this.name;
      }
    });
    this.oldName = this.name;

    // Clear tooltip if name is no longer truncated
    // Note: isTextTruncated will be updated in the next draw() call
    // But we can hide tooltip immediately to avoid showing outdated info
    if (this.tooltipElement) {
      this.hideTooltip();
    }
  }

  /**
   * Creates and shows the tooltip element
   */
  showTooltip(x, y) {
    if (!this.isTextTruncated || !this.name || this.tooltipElement) {
      return;
    }

    // Get canvas position to properly position tooltip
    const canvas = GlobalVariables.canvas.current;
    // Trigger layout reflow to ensure getBoundingClientRect returns current values
    void canvas.offsetHeight;
    
    const canvasRect = canvas.getBoundingClientRect();

    this.tooltipElement = document.createElement("div");
    this.tooltipElement.className = "tooltip";
    this.tooltipElement.textContent = this.name;

    // Position tooltip relative to the page, not just the canvas
    this.tooltipElement.style.left = x + canvasRect.left + "px";
    this.tooltipElement.style.top = y + canvasRect.top - 35 + "px";
    this.tooltipElement.style.display = "block";
    this.tooltipElement.style.padding = "4px 8px";
    this.tooltipElement.style.borderRadius = "4px";
    this.tooltipElement.style.whiteSpace = "nowrap";

    document.body.appendChild(this.tooltipElement);
  }

  /**
   * Hides and removes the tooltip element
   */
  hideTooltip() {
    if (this.tooltipElement) {
      document.body.removeChild(this.tooltipElement);
      this.tooltipElement = null;
    }
  }

  /**
   * Override mouseMove to handle tooltip functionality
   */
  mouseMove(x, y) {
    super.mouseMove(x, y);

    // Only show tooltip if text is truncated
    if (!this.isTextTruncated) {
      this.clearTooltipTimer();
      this.hideTooltip();
      return;
    }

    // Check if mouse is over this input atom using the input's actual dimensions
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);

    // Use the input's width and height instead of just radius
    const isOverAtom =
      x >= xInPixels - (this.width || 100) / 2 &&
      x <= xInPixels + (this.width || 100) / 2 &&
      y >= yInPixels - (this.height || 30) / 2 &&
      y <= yInPixels + (this.height || 30) / 2;

    if (isOverAtom) {
      // Mouse is over the atom
      if (!this.tooltipTimer) {
        // Start timer for delayed tooltip
        this.tooltipTimer = setTimeout(() => {
          this.showTooltip(x, y);
          this.tooltipTimer = null;
        }, 1000); // 1 second delay
      }
    } else {
      // Mouse is not over the atom
      this.clearTooltipTimer();
      this.hideTooltip();
    }
  }

  /**
   * Clears the tooltip timer
   */
  clearTooltipTimer() {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
  }

  /**
   * Get a file from github. Called when loading a saved project with import input.
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
   * Load the imported file and propagate the geometry value
   */
  loadAndPropagate() {
    if (this.type !== "import" || this.fileName === null) {
      return Promise.resolve(this.value);
    }

    // If this is a local file (not stored in GitHub), process from memory
    if (this.isLocalFile && this.localFileContent) {
      return this.processLocalFileContent();
    }

    // Otherwise, load from GitHub
    this.setProcessing();

    return this.getAFile()
      .then((result) => {
        this.fileSha = result.data.sha;
        const file = this.newBlobFromBase64(result);
        const fileType = this.fileType;

        let funcToCall =
          fileType === "STL"
            ? GlobalVariables.cad.importingSTL
            : fileType === "SVG"
            ? GlobalVariables.cad.importingSVG
            : fileType === "STEP"
            ? GlobalVariables.cad.importingSTEP
            : null;

        if (funcToCall === null) {
          throw new Error("Invalid file type");
        }

        return funcToCall(file, this.getContext(), this.SVGwidth);
      })
      .then((result) => {
        this.value = result;
        this.setReady(result);
        //this.setInputChanged(result);
        if (this.parentAP) {
          this.parentAP.setValue(result);
        }
        return result;
      })
      .catch(this.alertingErrorHandler());
  }

  /**
   * Make new Blob from Github repo content results
   */
  newBlobFromBase64(result) {
    let base64String = result.data.content;
    let binary = atob(base64String);

    if (this.fileType === "SVG") {
      return binary;
    }

    let array = [];
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }

    return new Blob([new Uint8Array(array)], {
      type: "application/octet-stream",
    });
  }

  /**
   * Process a file locally without uploading to GitHub
   * Used for unauthenticated users or temporary imports
   */
  async processFileLocally(file, type) {
    this.fileName = file.name;
    this.fileType = type;
    this.fileSha = null; // No SHA for local files
    this.isLocalFile = true; // Flag to indicate this is a local file

    // Store the file data as a data URL for later processing
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          // Store the data URL or raw content
          if (type === "SVG") {
            // For SVG, store as text
            const text = e.target.result;
            this.localFileContent = text;
          } else {
            // For binary files (STL, STEP), store as data URL
            this.localFileContent = e.target.result;
          }

          // Process the file immediately
          await this.processLocalFileContent();
          resolve();
        } catch (error) {
          console.error("Error processing local file:", error);
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      // Read as text for SVG, as data URL for binary formats
      if (type === "SVG") {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  /**
   * Process the locally stored file content into geometry
   */
  async processLocalFileContent() {
    if (!this.localFileContent || !this.fileType) {
      return Promise.resolve(this.value);
    }

    this.setProcessing();

    try {
      let fileData;

      if (this.fileType === "SVG") {
        // SVG is already text
        fileData = this.localFileContent;
      } else {
        // Convert data URL to Blob for STL/STEP
        const base64String = this.localFileContent.split(",")[1];
        const binary = atob(base64String);
        const array = [];
        for (let i = 0; i < binary.length; i++) {
          array.push(binary.charCodeAt(i));
        }
        fileData = new Blob([new Uint8Array(array)], {
          type: "application/octet-stream",
        });
      }

      let funcToCall =
        this.fileType === "STL"
          ? GlobalVariables.cad.importingSTL
          : this.fileType === "SVG"
          ? GlobalVariables.cad.importingSVG
          : this.fileType === "STEP"
          ? GlobalVariables.cad.importingSTEP
          : null;

      if (funcToCall === null) {
        throw new Error("Invalid file type");
      }

      const result = await funcToCall(
        fileData,
        this.getContext(),
        this.SVGwidth
      );

      this.value = result;
      this.setReady(result);
      if (this.parentAP) {
        this.parentAP.setValue(result);
      }

      // Update parent AP options with file metadata
      this.updateParentAPOptions();

      return result;
    } catch (error) {
      console.error("Error processing local file content:", error);
      this.alertingErrorHandler()(error);
      throw error;
    }
  }

  /**
   * Trigger file upload using FileImportContext
   */
  loadFile(type, setInputChanged, onSave) {
    // Use the new FileImportContext approach
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "." + type.toLowerCase();
    input.style.display = "none";

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (file) {
        // Delete previous file if exists (only if it was uploaded to GitHub)
        if (
          this.fileName &&
          this.fileSha &&
          GlobalVariables.deleteFile &&
          !this.isLocalFile
        ) {
          await GlobalVariables.deleteFile(this.fileName, this.fileSha);
        }

        this.fileType = type;

        // Check if we should process locally (unauthenticated or no upload function)
        // Use GlobalVariables.saveProject if onSave is not provided
        const saveCallback = onSave || GlobalVariables.saveProject;
        const shouldProcessLocally =
          !GlobalVariables.uploadFile || !saveCallback;

        if (shouldProcessLocally) {
          // Process file locally without GitHub upload
          try {
            await this.processFileLocally(file, type);

            // Call input changed callback
            if (setInputChanged && typeof setInputChanged === "function") {
              setInputChanged(file.name);
            }
          } catch (error) {
            console.error("Failed to process file locally:", error);
          }
        } else {
          // Upload the file to GitHub using GlobalVariables.uploadFile
          const inputChangedCallback =
            typeof setInputChanged === "function" ? setInputChanged : null;

          this.isLocalFile = false; // Mark as GitHub file
          GlobalVariables.uploadFile(file, this, saveCallback);

          // Call input changed callback after file name is set
          if (inputChangedCallback) {
            setTimeout(() => inputChangedCallback(this.fileName), 100);
          }
        }
      }
      // Clean up
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  }

  /**
   * Update the file, filename and sha of the input
   */
  updateFile(file, sha) {
    this.fileName = file.name;
    this.fileSha = sha;
    // This is a GitHub file, not a local file
    this.isLocalFile = false;
    this.localFileContent = null;

    if (
      !GlobalVariables.currentAWSnode?.owner ||
      !GlobalVariables.currentAWSnode?.repoName
    ) {
      console.warn("Repository information not available");
      return;
    }
    this.repoOwner = GlobalVariables.currentAWSnode.owner;
    this.repoName = GlobalVariables.currentAWSnode.repoName;

    // Update parent AP options with file metadata
    this.updateParentAPOptions();

    this.loadAndPropagate();
  }

  /**
   * Update the parent attachment point's options with current import metadata
   */
  updateParentAPOptions() {
    if (this.parentAP && this.type === "import") {
      this.parentAP.options = {
        ...this.parentAP.options,
        importType: true,
        importOptions: this.importOptions,
        fileName: this.fileName,
        fileType: this.fileType,
        SVGwidth: this.SVGwidth,
        inputAtom: this,
      };
    }
  }

  /**
   * Helper method to update parent attachment point options with current min/max values
   */
  updateParentAPRangeOptions() {
    if (this.parentAP) {
      this.parentAP.options = {
        min: this.min,
        max: this.max,
      };
    }
  }

  createInputParams(setInputChanged) {
    this.setInputChanged = setInputChanged;
    let inputParams = {};
    inputParams[this.uniqueID] = {
      type: "string",
      value: this.name,
      label: "Input Name",
      disabled: false,
      onChange: (newName) => {
        // Replace spaces and equation operator characters (-, +, *, /, %) with underscores
        // to prevent them from being mistaken as operators in equations
        let sanitizedName = newName.replace(/[\s\-+*/%]+/g, "_");
        sanitizedName = GlobalVariables.incrementVariableName(
          sanitizedName,
          this.parent,
          [this]
        );
        if (this.name !== sanitizedName) {
          this.name = sanitizedName;
          this.parentAP.name = sanitizedName; // Update the attachment point name
          setInputChanged(sanitizedName);
        } else if (newName !== sanitizedName) {
          setInputChanged(sanitizedName);
        }
      },
    };
    inputParams[this.uniqueID + "type"] = {
      type: "select",
      value: this.type,
      label: "Input Type",
      disabled: false,
      options: ["number", "string", "geometry", "array", "boolean", "range", "import"],
      onChange: (newType) => {
        if (this.type !== newType) {
          this.type = newType;
          // Import type should output geometry
          const outputType = newType === "import" ? "geometry" : newType;
          this.output.valueType = outputType;

          //Add a new input to the current molecule
          if (this.parentAP) {
            this.parentAP.valueType = outputType;
            // Update parent AP options if switching to/from import type
            if (newType === "import") {
              this.updateParentAPOptions();
            } else if (this.parentAP.options?.importType) {
              // Clear import metadata if switching away from import type
              this.parentAP.options = {};
            }
          }
        }
      },
    };

    // If type is array, add a control to input options
    if (this.type === "array") {
      inputParams[this.uniqueID + "arrayOptions"] = {
        type: "string",
        value: Array.isArray(this.options) ? this.options.join(", ") : "",
        label: "Array Options (comma separated)",
        disabled: false,
        onChange: (val) => {
          // Split by comma and trim whitespace
          this.options = val
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
          //Add a new input to the current molecule
          if (this.parentAP) {
            this.parentAP.options = this.options;
          }
          this.setInputChanged(val);
        },
      };
    }

    // If type is range, add controls for min and max values
    if (this.type === "range") {
      // Initialize min/max if not set
      if (this.min === undefined) {
        this.min = DEFAULT_RANGE_MIN;
      }
      if (this.max === undefined) {
        this.max = DEFAULT_RANGE_MAX;
      }

      inputParams[this.uniqueID + "rangeMin"] = {
        type: "number",
        value: this.min,
        label: "Min Value",
        disabled: false,
        onChange: (val) => {
          this.min = val;
          this.updateParentAPRangeOptions();
          this.setInputChanged(val);
        },
      };

      inputParams[this.uniqueID + "rangeMax"] = {
        type: "number",
        value: this.max,
        label: "Max Value",
        disabled: false,
        onChange: (val) => {
          this.max = val;
          this.updateParentAPRangeOptions();
          this.setInputChanged(val);
        },
      };
    }

    // If type is import, add controls for file upload
    if (this.type === "import") {
      if (this.fileName === null) {
        inputParams[this.uniqueID + "file_ops"] = {
          type: "select",
          options: this.importOptions,
          label: "File Type",
          onChange: (value) => {
            if (!value) {
              value = this.importOptions[0];
            }
            this.importIndex = this.importOptions.indexOf(value);
          },
        };
        inputParams[this.uniqueID + "Load File"] = {
          type: "button",
          label: "Load File",
          onClick: () => {
            this.loadFile(
              this.importOptions[this.importIndex],
              this.setInputChanged
            );
          },
        };
      } else {
        // File is loaded, show SVG width control if applicable
        if (this.fileType === "SVG") {
          inputParams[this.uniqueID + "Width"] = {
            type: "number",
            value: this.SVGwidth,
            label: "Width",
            step: 1,
            onChange: (value) => {
              this.SVGwidth = value;
              this.loadAndPropagate();
            },
          };
        }
      }
      inputParams[this.uniqueID + "file_info"] = {
        type: "string",
        label: `Loaded File`,
        value: `${this.fileName}`,
        onRemove: () => {
          this.deleteFile();
        },
      };
    }
    return inputParams;
  }

  /**
   * Returns the current value being output
   */
  getOutput() {
    return this.output.getValue();
  }

  /**
   * Add the input Type choice to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);

    //Write the current color selection to the serialized object
    superSerialObject.type = this.type;
    superSerialObject.options = this.options;

    // Save range min/max if type is range
    if (this.type === "range") {
      superSerialObject.min = this.min;
      superSerialObject.max = this.max;
    }

    // Save import-related properties if type is import
    if (this.type === "import") {
      superSerialObject.fileName = this.fileName;
      superSerialObject.fileType = this.fileType;
      superSerialObject.repoOwner = this.repoOwner;
      superSerialObject.repoName = this.repoName;
      superSerialObject.SVGwidth = this.SVGwidth;
    }

    return superSerialObject;
  }
}
