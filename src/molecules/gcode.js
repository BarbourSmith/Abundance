import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";

import { saveAs } from "file-saver";
import { Status } from "../prototypes/observableEntity.js";

import { GCodeLoader } from "../js/GCodeAbundanceLoader.js";
import { Group } from "three";

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
    /**
     * Flag to track if gcode generation is in progress
     * @type {boolean}
     */
    this.isGenerating = false;
    /**
     * Flag to track if a new generation is requested while one is running
     * @type {boolean}
     */
    this.pendingGeneration = false;
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
      /*{
        name: "output",
        valueType: "geometry",
        defaultValue: null,
        type: "output",
      },*/
    ]);

    this.stlURL = null; // Store the STL URL

    this.center = [0, 0, 0]; //Used to correctly position the gcode

    this.setValues(values);

    /**
     * Direction to sort parts in assemblies
     * @type {string}
     */
    if (!this.sortDirection) {
      this.sortDirection = "Left";
    }
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
        false,
      );
      GlobalVariables.c.closePath();
      GlobalVariables.c.fill();
    }
  }

  /**
   * Generates gcode using Kirimoto with the current parameters
   * Handles both single parts and assemblies
   */
  async _generateGcode() {
    // Prevent multiple concurrent gcode generation processes
    if (this.isGenerating) {
      // If a run is in progress, queue a pending run
      this.pendingGeneration = true;
      console.warn(
        "G-code generation already in progress, queuing pending run",
      );
      return;
    }

    // Initialize progress tracking
    this.progress = 0.0;
    this.processing = true;
    this.isGenerating = true;
    this.pendingGeneration = false;

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
    } finally {
      // Always reset the flag when generation completes
      this.isGenerating = false;
      // If a pending run was queued, run again
      if (this.pendingGeneration) {
        this.pendingGeneration = false;
        setTimeout(() => {
          this._generateGcode();
        }, 0);
      }
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
    /*Because kirimoto defaults to MM units and we want to support both MM and IN, we will scale the geometry before exporting to STL for kirimoto. This is a temporary solution until we can pass units directly to kirimoto.*/
    const scaledMesh = await GlobalVariables.cad.scale(
      inputID,
      GlobalVariables.topLevelMolecule?.unitsKey === "MM" ? 1 : 25.4, // Scale to MM if in IN, otherwise keep the same
      this.getContext(),
    );
    /* Find flat faces for area operation */
    GlobalVariables.cad
      .findFlatFaces(scaledMesh, this.getContext())
      .then((flatFaces) => {
        console.log("Flat faces found:", flatFaces);
      });
    // Export the geometry to STL and generate G-code
    GlobalVariables.cad
      .visExport(scaledMesh, "STL", this.getContext())
      .then((visExported) => {
        const units = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
        GlobalVariables.cad
          .downExport(visExported, "STL", null, units, this.getContext())
          .then((result) => {
            //Delete anything previously stored
            if (this.stlURL) {
              URL.revokeObjectURL(this.stlURL); // Clean up the previous URL
            }

            this.stlURL = URL.createObjectURL(result); // Store the STL URL

            GlobalVariables.cad
              .getBoundingBox(visExported, this.getContext())
              .then((bounds) => {
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
    return GlobalVariables.cad.extractParts(assemblyID, this.getContext());
  }

  /**
   * Check if bounding box A is entirely inside bounding box B (in XY plane)
   * @param {Object} boundsA - Bounding box with min/max arrays [x, y, z]
   * @param {Object} boundsB - Bounding box with min/max arrays [x, y, z]
   * @returns {boolean} True if A is entirely inside B
   */
  _isBoundsInsideBounds(boundsA, boundsB) {
    // Check if A's min is greater than B's min AND A's max is less than B's max
    // in both X and Y dimensions (ignoring Z for 2D cutting)
    return (
      boundsA.min[0] > boundsB.min[0] &&
      boundsA.max[0] < boundsB.max[0] &&
      boundsA.min[1] > boundsB.min[1] &&
      boundsA.max[1] < boundsB.max[1]
    );
  }

  /**
   * Reorder parts so that interior parts come before their containing exterior parts
   * Uses topological sort to handle nested containment
   * @param {Array} partsWithBounds - Array of parts with bounds info
   * @returns {Array} Reordered array with interior parts before exterior parts
   */
  _reorderForNestedParts(partsWithBounds) {
    const n = partsWithBounds.length;
    if (n <= 1) return partsWithBounds;

    // Build containment relationships: contains[i] = indices of parts that are inside part i
    const contains = partsWithBounds.map(() => []);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          // Check if part j is inside part i
          if (
            this._isBoundsInsideBounds(
              partsWithBounds[j].bounds,
              partsWithBounds[i].bounds,
            )
          ) {
            contains[i].push(j);
          }
        }
      }
    }

    // Topological sort: when we visit a part, first add all parts it contains
    const visited = new Set();
    const result = [];

    const visit = (index) => {
      if (visited.has(index)) return;
      visited.add(index);

      // First recursively add all parts contained within this part
      for (const containedIndex of contains[index]) {
        visit(containedIndex);
      }

      // Then add this part
      result.push(partsWithBounds[index]);
    };

    // Visit in original order to maintain directional sort as tiebreaker
    for (let i = 0; i < n; i++) {
      visit(i);
    }

    return result;
  }

  /**
   * Sort parts based on the selected direction using their bounding boxes
   * Also ensures interior parts are cut before their containing exterior parts
   * @param {Array} parts - Array of part IDs
   * @returns {Promise<Array>} Sorted array of part IDs
   */
  async _sortParts(parts) {
    const partsWithBounds = [];

    for (const part of parts) {
      try {
        const bounds = await GlobalVariables.cad.getBoundingBox(
          part,
          this.getContext(),
        );
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

    // Reorder to ensure interior parts are cut before their containing exterior parts
    const reorderedParts = this._reorderForNestedParts(partsWithBounds);

    return reorderedParts.map((part) => part.partGeom);
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

        /*Because kirimoto defaults to MM units and we want to support both MM and IN, we will scale the geometry before exporting to STL for kirimoto. This is a temporary solution until we can pass units directly to kirimoto.*/
        const scaledMesh = await GlobalVariables.cad.scale(
          partID,
          GlobalVariables.topLevelMolecule?.unitsKey === "MM" ? 1 : 25.4, // Scale to MM if in IN, otherwise keep the same
          this.getContext(),
        );

        /* Find flat faces for area operation */
        const flatFaces = await GlobalVariables.cad.findFlatFaces(
          scaledMesh,
          this.getContext(),
        );
        // Generate STL for this part
        const visExported = await GlobalVariables.cad.visExport(
          scaledMesh,
          "STL",
          this.getContext(),
        );
        const units = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
        const stlBlob = await GlobalVariables.cad.downExport(
          visExported,
          "STL",
          null,
          units,
          this.getContext(),
        );

        const stlURL = URL.createObjectURL(stlBlob);

        // Get part bounds for centering
        const bounds = await GlobalVariables.cad.getBoundingBox(
          visExported,
          this.getContext(),
        );
        const center = [
          (bounds.max[0] + bounds.min[0]) / 2,
          (bounds.max[1] + bounds.min[1]) / 2,
          (bounds.max[2] + bounds.min[2]) / 2,
        ];

        // Generate G-code for this part
        const partGcode = await this._generateGcodeForPart(
          stlURL,
          center,
          i + 1,
          flatFaces,
        );
        allGcode.push(partGcode);

        // Clean up STL URL
        URL.revokeObjectURL(stlURL);
      } catch (err) {
        console.error(`Error generating G-code for part ${i + 1}:`, err);
        // Continue with next part
      }
    }

    if (allGcode.length === 0) {
      throw new Error("G-code generation failed for all parts.");
    }
    this.gcodeGenerated = true;
    this.parseGcodeString(allGcode).then(() => {
      const geometryValue = this.findIOValue("geometry");
      this.setReady(geometryValue);
    });
    // Set the final result as ready for visualization to pass to loader - this is an array of G-code strings, one per part, which the loader can handle
    // Concatenate all G-code for download
    this.gcodeString = this._concatenateGcode(allGcode);
    this.progress = 1.0;
    this.setInputChanged?.();

    console.log("G-code generation complete.");
    return this.gcodeString ?? null;
  }

  /**
   * Dispose of G-code geometries and materials to prevent GPU memory leaks
   */
  disposeGcodeGeometry() {
    if (
      this.nonReplicadGeom?.geometry &&
      Array.isArray(this.nonReplicadGeom.geometry)
    ) {
      this.nonReplicadGeom.geometry.forEach((group) => {
        if (group && typeof group === "object" && group.children) {
          // Recursively dispose all children (LineSegments with geometries/materials)
          group.traverse((child) => {
            if (child.geometry) {
              child.geometry.dispose();
            }
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  if (mat && typeof mat.dispose === "function") {
                    mat.dispose();
                  }
                });
              } else if (typeof child.material.dispose === "function") {
                child.material.dispose();
              }
            }
          });
        }
      });
      this.nonReplicadGeom.geometry = null;
    }
  }

  parseGcodeString = async (allGcode) => {
    if (!allGcode) {
      console.warn("No G-code string available for parsing.");
      setObject(null);
      return;
    }

    try {
      // Dispose old geometries before creating new ones
      this.disposeGcodeGeometry();

      const loader = new GCodeLoader();
      const parsedObjects = [];
      let lastPosition = { x: 0, y: 0, z: 0 };
      for (const part of allGcode) {
        const { object: parsedObject, lastPosition: partLastPosition } =
          loader.parse(part, lastPosition.x, lastPosition.y);
        lastPosition = partLastPosition;
        parsedObjects.push(parsedObject);
      }

      const allGcodeObjects = new Group();
      parsedObjects.forEach((obj) => {
        //obj.children[1].material.color.set(0x0000ff); // blue
        allGcodeObjects.add(obj);
      });
      allGcodeObjects.rotation.x = Math.PI / 2;
      this.nonReplicadGeom = {
        geometry: [allGcodeObjects],
        material: null,
        hideMainMesh: true, // Hide the main mesh when rendering G-code visualization
      };
      //setObject(allGcodeObjects);
    } catch (err) {
      console.error("Error parsing G-code:", err);
    }
  };

  /**
   * Generate G-code for a single part
   * @param {string} stlURL - URL to the STL blob
   * @param {Array} center - Center coordinates [x, y, z]
   * @param {number} partNumber - Part number for naming
   * @returns {Promise<string>} Generated G-code
   */
  _generateGcodeForPart(stlURL, center, partNumber, flats = []) {
    return new Promise((resolve, reject) => {
      const partGcodeCallback = (gcode) => {
        resolve(gcode);
        //this.setReady(gcode);
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

      window
        .generateGcode(
          stlURL,
          center,
          this.findIOValue("Tool Size"),
          this.findIOValue("Passes"),
          this.findIOValue("Speed"),
          this.findIOValue("Cut Through"),
          partProgressCallback,
          selectedToolObj, // Pass the selected tool object/ disabled currently
          flats, // Pass the flat faces for area operation
        )
        .then((gcode) => {
          clearTimeout(timeout);
          partGcodeCallback(gcode);
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error(`Error generating G-code for part ${partNumber}:`, err);
          reject(err);
        });
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
    // No-op if this atom isn't enabled
    if (!this.isEnabled()) {
      return;
    }

    // Check for errors in inputs first
    if (this.inputsHaveErrors()) {
      this.setUpstreamError();
      return;
    }

    // Check if geometry input is ready
    const geometryValue = this.findIOValue("geometry");
    if (geometryValue !== null) {
      this.setWaiting();
      // Always call _generateGcode so concurrency guard and pending logic are respected
      this._generateGcode();
    } else {
      // If geometry is not available yet, set to waiting
      this.setWaiting();
    }
  }

  createInputParams(setInputChanged) {
    this.setInputChanged = setInputChanged;
    let inputParams = super.createInputParams();

    //Temporarily disable the "Cut Through" input parameter
    //inputParams[this.uniqueID + "Cut Through"].disabled = true;

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

    const partName = this.findIOValue("Part Name") || this.partName || "output";
    inputParams[`Download Gcode - ${partName}`] = {
      type: "button",
      label: `Download Gcode - ${partName}`,
      disabled: this.status !== Status.READY,
      onClick: () => {
        if (this.gcodeGenerated && this.gcodeString) {
          // Get the current part name dynamically when button is clicked
          const currentPartName =
            this.findIOValue("Part Name") || this.partName || "output";
          const fileName = `${currentPartName}.gcode`;
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
      gcode = this.gcodeString;
    }
    if (!gcode) {
      console.error("No G-code available to download.");
      // Dispatch a custom event
      const event = new CustomEvent("user-notification", {
        detail: { message: "No G-code available to download." },
      });
      window.dispatchEvent(event);
      return;
    }

    const blob = new Blob([gcode], { type: "text/plain" });
    saveAs(blob, filename);
  }

  /**
   * Add the part name and sort direction to the object which is saved for this molecule
   */
  /**
   * Override deleteNode to dispose of gcode geometries
   */
  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    this.disposeGcodeGeometry();
    return super.deleteNode(backgroundClickAfter, deletePath, silent);
  }

  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.partName = this.partName;
    superSerialObject.sortDirection = this.sortDirection;

    return superSerialObject;
  }
}
