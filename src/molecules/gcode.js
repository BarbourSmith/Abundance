import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";

import { saveAs } from "file-saver";

/**
 * This class creates the circle atom.
 */
export default class Gcode extends Atom {
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
    this.name = "Gcode";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Gcode";
    /**
     * This atom's height as drawn on the screen
     */

    this.height = 16;
    /**
     * The center color for progress indicator
     * @type {string}
     */
    this.centerColor = "#949294";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Generates Maslow gcode from the input geometry. For single parts, generates one gcode file. For assemblies, extracts individual parts, sorts them based on the selected direction (Left, Right, Top, or Bottom) using bounding boxes, generates gcode for each part sequentially, and concatenates the results into one file.";

    this.blob = null;
    /**
     * The generated gcode string
     * @type {string}
     */
    this.gcodeString = "";

    /**
     * Whether gcode has been generated
     * @type {boolean}
     */
    this.gcodeGenerated = false;

    /**
     * Progress indicator for gcode generation (0.0 to 1.0)
     * @type {number}
     */
    this.progress = 1.0;
    this.parent = values?.parent;
    this.partName = this.parent?.name ?? "output";
    this.tools = [
      {
        id: 1000,
        number: 1,
        type: "endmill",
        name: "end 1/4",
        metric: false,
        shaft_diam: 0.25,
        shaft_len: 1,
        flute_diam: 0.25,
        flute_len: 2,
        taper_tip: 0,
        order: 5,
      },
    ];

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      {
        name: "Tool Size",
        valueType: "number",
        defaultValue:
          GlobalVariables.topLevelMolecule?.unitsKey === "MM" ? 6.35 : 0.25,
      },
      { name: "Passes", valueType: "number", defaultValue: 1 },
      { name: "Speed", valueType: "number", defaultValue: 1500 },
      {
        name: "Cut Through",
        valueType: "number",
        defaultValue: 0,
      },
      {
        name: "Part Name",
        valueType: "string",
        defaultValue: this.partName,
      },
      {
        name: "output",
        valueType: "geometry",
        defaultValue: null,
        type: "output",
      },
    ]);

    this.stlURL = null; // Store the STL URL

    this.center = [0, 0, 0]; //Used to correctly position the gcode

    /**
     * Flag to track if we're processing an assembly
     * @type {boolean}
     */
    this._isProcessingAssembly = false;

    /**
     * Direction to sort parts in assemblies
     * @type {string}
     */
    this.sortDirection = "Left";

    this.setValues(values);
  }

  /**
   * Draw the gcode atom & icon with progress indicator.
   */
  draw() {
    super.draw(); //Super call to draw the rest

    const centerX = GlobalVariables.widthToPixels(this.x);
    const centerY = GlobalVariables.heightToPixels(this.y);
    const radiusInPixels = GlobalVariables.widthToPixels(this.radius);

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${radiusInPixels}px Work Sans Bold`;
    const text = "G";
    const textWidth = GlobalVariables.c.measureText(text).width;
    const textX = centerX - textWidth / 2;
    const textY = centerY + radiusInPixels / 2.8; // visually center the G
    GlobalVariables.c.fillText(text, textX, textY);
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();

    // Draw progress circle in the middle when generating gcode
    if (this.progress < 1.0) {
      GlobalVariables.c.beginPath();
      GlobalVariables.c.fillStyle = this.centerColor;
      GlobalVariables.c.moveTo(centerX, centerY);
      GlobalVariables.c.arc(
        centerX,
        centerY,
        radiusInPixels / 1.5,
        0,
        this.progress * Math.PI * 2,
        false
      );
      GlobalVariables.c.closePath();
      GlobalVariables.c.fill();
    }
  }

  /**
   * Creates a callback function for when gcode is generated
   * @returns {Function} The gcode callback function
   */
  _createGcodeCallback() {
    return (gcode) => {
      this.gcodeString = gcode;
      this.gcodeGenerated = true;
      this.progress = 1.0; // Complete progress
      this.setReady(GlobalVariables.cad.visualizeGcode(gcode));
    };
  }

  /**
   * Generates gcode using Kirimoto with the current parameters
   * Handles both single parts and assemblies
   */
  async _generateGcode() {
    // Initialize progress tracking
    this.progress = 0.0;
    this.processing = true;

    try {
      // Get the current input ID
      let inputGeometry = this.findIOValue("geometry");

      // Check if the input is an assembly
      const isAssembly = await this._checkIfAssembly(inputGeometry);

      if (isAssembly) {
        // For assemblies, extract parts and generate G-code sequentially
        const parts = await this._extractPartsFromAssembly(inputGeometry);
        const sortedParts = await this._sortParts(parts);
        const resultWire = await this._generateSequentialGcode(sortedParts);
      } else {
        const resultWire = await this._generateSequentialGcode([inputGeometry]);
      }
    } catch (err) {
      console.error("Error generating G-code:", err);
      this.setError(err);
      this.progress = 1.0;
      this.processing = false;
      //this.sendToRender();
    }
  }

  /**
   * Handle geometry input - either single part or assembly
   * @param {string} inputID - The input geometry ID
   */
  async _handleGeometryInput(inputID) {
    try {
      // Check if the input is an assembly
      const isAssembly = await this._checkIfAssembly(inputID);
      if (isAssembly) {
        // Process as assembly - extract parts and generate G-code sequentially
        await this._processAssembly(inputID);
      } else {
        // Process as single part (original behavior)
        await this._processSinglePart(inputID);
      }
    } catch (err) {
      console.error("Error handling geometry input:", err);
      this.setError(err);
    }
  }

  /**
   * Check if the input geometry is an assembly
   * @param {string} inputID - The input geometry ID
   * @returns {Promise<boolean>} True if it's an assembly
   * @throws {Error} If the input ID is not found
   */
  async _checkIfAssembly(inputID) {
    return GlobalVariables.cad.isAssembly(inputID);
  }

  /**
   * Process a single part (original behavior)
   * @param {string} inputID - The input geometry ID
   */
  async _processSinglePart(inputID) {
    this._isProcessingAssembly = false;
    GlobalVariables.cad
      .visExport(inputID, "STL")
      .then((visExported) => {
        const units = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
        GlobalVariables.cad
          .downExport(visExported, "STL", null, units)
          .then((result) => {
            //Delete anything previously stored
            if (this.stlURL) {
              URL.revokeObjectURL(this.stlURL); // Clean up the previous URL
            }
            this.stlURL = URL.createObjectURL(result); // Store the STL URL
            GlobalVariables.cad.getBoundingBox(visExported).then((bounds) => {
              this.center = [
                (bounds.max[0] + bounds.min[0]) / 2,
                (bounds.max[1] + bounds.min[1]) / 2,
                (bounds.max[2] + bounds.min[2]) / 2,
              ];
              // Always generate gcode when geometry input is processed
              this._generateGcode();
            });
          });
      })
      .catch((err) => {
        console.error("Error creating STL for gcode:", err);
      });
  }

  /**
   * Process an assembly by extracting parts and generating G-code sequentially
   * @param {string} inputID - The input assembly ID
   */
  async _processAssembly(inputID) {
    try {
      this._isProcessingAssembly = true;

      // Extract individual parts from assembly
      const parts = await this._extractPartsFromAssembly(inputID);

      // Sort parts based on selected direction
      const sortedParts = await this._sortParts(parts);

      // Always generate G-code when assembly is processed
      // Generate G-code for each part sequentially
      await this._generateSequentialGcode(sortedParts);
    } catch (err) {
      console.error("Error processing assembly:", err);
      this.setError(err);
    }
  }

  /**
   * Extract individual parts from an assembly
   * @param {string} assemblyID - The assembly ID
   * @returns {Promise<Array>} Array of part IDs
   */
  async _extractPartsFromAssembly(assemblyID) {
    return GlobalVariables.cad.extractParts(assemblyID);
  }

  /**
   * Sort parts based on the selected direction using their bounding boxes
   * @param {Array} parts - Array of part IDs
   * @returns {Promise<Array>} Sorted array of part IDs
   */
  async _sortParts(parts) {
    const partsWithBounds = [];

    for (const part of parts) {
      try {
        const bounds = await GlobalVariables.cad.getBoundingBox(part);
        const centerX = (bounds.max[0] + bounds.min[0]) / 2;
        const centerY = (bounds.max[1] + bounds.min[1]) / 2;
        partsWithBounds.push({
          partGeom: part,
          centerX: centerX,
          centerY: centerY,
          bounds: bounds,
        });
      } catch (err) {
        console.warn(`Could not get bounds for part ${part}:`, err);
      }
    }

    // Sort based on the selected direction
    switch (this.sortDirection) {
      case "Left":
        // Sort by X coordinate ascending (left to right)
        partsWithBounds.sort((a, b) => a.centerX - b.centerX);
        break;
      case "Right":
        // Sort by X coordinate descending (right to left)
        partsWithBounds.sort((a, b) => b.centerX - a.centerX);
        break;
      case "Top":
        // Sort by Y coordinate descending (top to bottom, assuming Y+ is up)
        partsWithBounds.sort((a, b) => b.centerY - a.centerY);
        break;
      case "Bottom":
        // Sort by Y coordinate ascending (bottom to top)
        partsWithBounds.sort((a, b) => a.centerY - b.centerY);
        break;
      default:
        // Default to left to right
        partsWithBounds.sort((a, b) => a.centerX - b.centerX);
        break;
    }

    return partsWithBounds.map((part) => part.partGeom);
  }

  /**
   * Generate G-code for multiple parts sequentially and concatenate
   * @param {Array} sortedPartIDs - Array of part IDs sorted left to right
   */
  async _generateSequentialGcode(sortedPartIDs) {
    this.setProcessing();
    const allGcode = [];
    this.progress = 0.0;

    for (let i = 0; i < sortedPartIDs.length; i++) {
      const partID = sortedPartIDs[i];
      const partProgress = i / sortedPartIDs.length;

      try {
        // Update progress
        this.progress = partProgress;
        //this.sendToRender();

        // Generate STL for this part
        const visExported = await GlobalVariables.cad.visExport(partID, "STL");
        const units = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
        const stlBlob = await GlobalVariables.cad.downExport(
          visExported,
          "STL",
          null,
          units
        );

        const stlURL = URL.createObjectURL(stlBlob);

        // Get part bounds for centering
        const bounds = await GlobalVariables.cad.getBoundingBox(visExported);
        const center = [
          (bounds.max[0] + bounds.min[0]) / 2,
          (bounds.max[1] + bounds.min[1]) / 2,
          (bounds.max[2] + bounds.min[2]) / 2,
        ];

        // Generate G-code for this part
        const partGcode = await this._generateGcodeForPart(
          stlURL,
          center,
          i + 1
        );
        allGcode.push(partGcode);

        // Clean up STL URL
        URL.revokeObjectURL(stlURL);
      } catch (err) {
        console.error(`Error generating G-code for part ${i + 1}:`, err);
        // Continue with next part
      }
    }

    // Concatenate all G-code
    this.gcodeString = this._concatenateGcode(allGcode);
    this.gcodeGenerated = true;

    // Generate visualization for the final G-code and returns as
    // an AbundanceObject.
    const gcodeWire = await GlobalVariables.cad.visualizeGcode(
      this.gcodeString
    );
    this.setReady(gcodeWire);
    this.progress = 1.0;
    return gcodeWire;
  }

  /**
   * Generate G-code for a single part
   * @param {string} stlURL - URL to the STL blob
   * @param {Array} center - Center coordinates [x, y, z]
   * @param {number} partNumber - Part number for naming
   * @returns {Promise<string>} Generated G-code
   */
  _generateGcodeForPart(stlURL, center, partNumber) {
    return new Promise((resolve, reject) => {
      const partGcodeCallback = (gcode) => {
        resolve(gcode);
      };

      const partProgressCallback = (progress) => {
        // Update overall progress within this part's range
        // Each part gets equal weight in the overall progress
      };

      // Use the same tool selection logic as single-part
      const selectedToolName = this.findIOValue("Tool");
      const selectedToolObj =
        this.tools.find((tool) => tool.name === selectedToolName) ||
        this.tools[0];

      // Set a timeout in case generation fails
      const timeout = setTimeout(() => {
        reject(new Error(`G-code generation timeout for part ${partNumber}`));
      }, 60000); // 60 second timeout

      try {
        window.generateGcode(
          stlURL,
          center,
          this.findIOValue("Tool Size"),
          this.findIOValue("Passes"),
          this.findIOValue("Speed"),
          this.findIOValue("Cut Through"),
          (gcode) => {
            clearTimeout(timeout);
            partGcodeCallback(gcode);
          },
          partProgressCallback,
          selectedToolObj // Pass the selected tool object/ disabled currently
        );
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Concatenate multiple G-code strings
   * @param {Array<string>} gcodeArray - Array of G-code strings
   * @returns {string} Concatenated G-code
   */
  _concatenateGcode(gcodeArray) {
    if (gcodeArray.length === 0) return "";
    if (gcodeArray.length === 1) return gcodeArray[0];

    const partName =
      this.findIOValue("Part Name") || this.partName || "assembly";

    // Create header comment
    let result = `; Generated by Abundance CAD - Assembly G-code\n`;
    result += `; Project: ${partName}\n`;
    result += `; Total parts: ${gcodeArray.length}\n`;
    result += `; Generated: ${new Date().toISOString()}\n\n`;

    // Process each G-code
    const processedGcode = gcodeArray.map((gcode, index) => {
      if (index === gcodeArray.length - 1) {
        // Keep the last G-code as-is
        return gcode;
      } else {
        // Remove common end commands (M30, M2, etc.) but preserve other content
        return gcode
          .replace(/M30.*$/gm, "")
          .replace(/M2.*$/gm, "")
          .replace(/^\s*$/gm, "") // Remove empty lines
          .trim();
      }
    });

    // Join all G-code with part separators
    result += processedGcode
      .map((gcode, index) => {
        if (index === 0) {
          return `; === Part 1 (leftmost) ===\n${gcode}`;
        } else {
          return `\n; === Part ${index + 1} ===\n${gcode}`;
        }
      })
      .join("\n");

    return result;
  }

  onUpstreamChange() {
    this.setWaiting();

    if (this.findIOValue("geometry") !== null) {
      this._handleGeometryInput(this.findIOValue("geometry"));
    }
  }

  createInputParams() {
    let inputParams = super.createInputParams();

    //Temporarily disable the "Cut Through" input parameter
    inputParams[this.uniqueID + "Cut Through"].disabled = true;

    /*inputParams[this.uniqueID + "Tool"] = {
      type: "select",
      value: this.findIOValue("Tool") || "end 1/4",
      options: this.tools.map((tool) => tool.name),
      label: "Tool",
      onChange: (value) => {
        this.setIOValue("Tool", value);
      },
    };*/

    // Add sort direction dropdown for assembly processing
    inputParams["Assembly Sort Direction"] = {
      type: "select",
      value: this.sortDirection,
      options: ["Left", "Right", "Top", "Bottom"],
      label: "Sort Direction",
      onChange: (value) => {
        this.sortDirection = value;
      },
    };

    inputParams["Generate Gcode"] = {
      type: "button",
      label: "Generate Gcode",
      onClick: () => {
        this._generateGcode();
      },
    };

    const partName = this.findIOValue("Part Name") || this.partName || "output";
    // For assemblies, show "Assembly" in the button name, otherwise use the part name
    const displayName = this._isProcessingAssembly
      ? `${partName}_assembly`
      : partName;
    inputParams[`Download Gcode - ${displayName}`] = {
      type: "button",
      label: `Download Gcode - ${displayName}`,
      onClick: () => {
        if (this.gcodeGenerated && this.gcodeString) {
          // Get the current part name dynamically when button is clicked
          const currentPartName =
            this.findIOValue("Part Name") || this.partName || "output";
          const fileName = this._isProcessingAssembly
            ? `${currentPartName}_assembly.gcode`
            : `${currentPartName}.gcode`;
          this.downloadGcode(this.gcodeString, fileName);
        } else {
          console.warn("No G-code available. Please generate G-code first.");
          // You could also show an alert or notification to the user here
          alert("No G-code available. Please generate G-code first.");
        }
      },
    };

    return inputParams;
  }

  //Function to download G-code from a G-code string
  downloadGcode(gcode, filename = "output.gcode") {
    if (this.gcodeGenerated && !gcode) {
      gcode = this.gcodeString; // Use the stored G-code string if not provided
    }
    if (!gcode) {
      console.error("No G-code available to download.");
      return;
    }

    const blob = new Blob([gcode], { type: "text/plain" });
    saveAs(blob, filename);
  }

  /**
   * Add the part name and sort direction to the object which is saved for this molecule
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.partName = this.partName;
    superSerialObject.sortDirection = this.sortDirection;

    return superSerialObject;
  }
}
