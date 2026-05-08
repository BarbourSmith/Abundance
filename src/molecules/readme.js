import Atom from "../prototypes/atom";
import GlobalVariables from "../js/globalvariables.js";
import { e, re } from "mathjs";
import { Status } from "../prototypes/observableEntity.js";

/**
 * This class creates the readme atom.
 */
export default class Readme extends Atom {
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
    this.atomType = "Readme";
    /**
     * The text to appear in the README file
     * @type {string}
     */
    this.readMeText = "Readme text here";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "readme";
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "README";
    /**
     * This atom's radius...probably inherited and can be deleted
     * @type {number}
     */
    this.radius = 1 / 100;
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "A place to put project notes. These will appear in the GitHub readme and in the description of molecules up the chain. Markdown is supported. ";

    /**
     * This atom's height as drawn on the screen
     */
    this.height = 10;

    /**
     * Should this atom contribute to the molecule level readme
     */
    this.global = true;

    this.addAllIOs([
      {
        name: "value",
        valueType: "geometry",
      },
    ]);
    this.setValues(values);
  }

  /**
   * Draw the readme atom with // icon.
   */
  draw() {
    super.draw("square");

    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius * 2.5}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      "\u2263",
      GlobalVariables.widthToPixels(this.x - this.radius / 1.5),
      GlobalVariables.heightToPixels(this.y) + this.height / 1.5,
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  setReady(newText) {
    this.readMeText = newText;
    super.setReady(newText);
  }

  createInputParams(setInputChanged) {
    let inputParams = super.createInputParams(setInputChanged);

    inputParams[this.name + this.uniqueID] = {
      type: "string",
      value: this.readMeText,
      label: this.name,
      multiline: true,
      rows: 10,
      onChange: (value) => {
        if (this.readMeText !== value) {
          this.setReady(value);
        }
      },
    };

    return inputParams;
  }

  async generateProjectThumbnail() {
    try {
      const value = this.findIOValue("value");

      // Generate a thumbnail only if value is geometry (object but not null or array)
      if (value != null && typeof value === "object" && !Array.isArray(value)) {
        // Check if pool is available (same as global thumbnail generation)
        if (!GlobalVariables.pool) {
          console.error(
            "[README THUMBNAIL] GlobalVariables.pool is not available",
          );
          return null;
        }

        // Check if meshRef is available
        if (!GlobalVariables.meshRef || !GlobalVariables.meshRef.current) {
          console.warn(
            "[README THUMBNAIL] meshRef is not available for thumbnail generation",
          );
          return null;
        }

        // Use the same approach as global thumbnail generation in ProjectContext.jsx
        return GlobalVariables.pool
          .proxy()
          .then((worker) => {
            return worker.generateDisplayMesh(value, this.getContext());
          })
          .then(async (m) => {
            const svg = await GlobalVariables.meshRef.current.buildThumbnail(
              m.mesh,
            );
            return svg;
          })
          .catch((error) => {
            console.error(
              "[README THUMBNAIL] Error in worker/mesh generation:",
              error,
            );
            return null;
          });
      }

      return null;
    } catch (error) {
      console.error(
        "[README THUMBNAIL] Error generating readme thumbnail:",
        error,
      );
      return null;
    }
  }

  /**
   * Provides this molecules contribution to the global Readme
   */
  async requestReadme() {
    if (this.global) {
      // Get the input value (could be geometry, number, or string)
      const inputValue = this.findIOValue("value");
      let readMeTextWithValue = this.readMeText;

      // If there's a non-geometry input value, append it to the readme text
      // Geometry is an object but not an array; primitives (numbers, strings, booleans) should be displayed as text
      if (
        inputValue != null &&
        (typeof inputValue !== "object" || Array.isArray(inputValue))
      ) {
        const valueStr = String(inputValue);
        readMeTextWithValue = this.readMeText + "\n\n**Value:** " + valueStr;
      }

      return this.generateProjectThumbnail()
        .then((res) => {
          if (res !== null) {
            return {
              readMeText: readMeTextWithValue,
              svg: res,
              uniqueID: this.uniqueID,
            };
          } else {
            return {
              readMeText: readMeTextWithValue,
              svg: null,
              uniqueID: this.uniqueID,
            };
          }
        })
        .catch((error) => {
          console.error(error);
          return {
            readMeText: readMeTextWithValue,
            svg: null,
            uniqueID: this.uniqueID,
          };
        });
    } else {
      return [];
    }
  }

  /**
   * Override onUpstreamChange to handle optional inputs.
   * The Readme atom's "value" input is optional - it should compute
   * even when the input is not connected (WAITING state).
   */
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

    // For Readme atom, compute as soon as inputs are either READY or WAITING
    // The "value" input is optional, so WAITING state is acceptable
    const inputsReadyOrWaiting = this.inputs.every((input) => {
      const status = input.getState().status;
      return status === Status.READY || status === Status.WAITING;
    });

    if (inputsReadyOrWaiting) {
      const argsDict = Object.fromEntries(
        this.inputs.map((input) => [input.name, input.getState().value]),
      );

      this.setProcessing();
      this.compute(argsDict)
        .then((value) => {
          this.setReady(value);
        })
        .catch(this.alertingErrorHandler());
    } else {
      this.setWaiting();
    }
  }

  /**
   * This atom has no output, but compute must still be defined.
   */
  compute(inputs) {
    return Promise.resolve(this.readMeText);
  }

  /**
   * Add the readme text to the information saved for this atom
   */
  serialize(values) {
    //Save the readme text to the serial stream
    var valuesObj = super.serialize(values);

    valuesObj.readMeText = this.readMeText;
    valuesObj.global = this.global;

    return valuesObj;
  }
}
