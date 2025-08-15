import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { ObservableEntity, Status } from "../prototypes/observableEntity.js";

/**
 * The cut away tag adds a tag to a part indicating that it should be cut away from the rest of the model in the next assembly. Essentially it creates a negitive version of itself.
 */
export default class ExtractTag extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Extract Tag";
    /**
     * This atom's type
     * @type {string}
     */
    this.type = "extractTag";
    /**
     * This atom's height as drawn on the screen
     */
    this.height;
    /**
     * This atom's name
     * @type {string}
     */
    this.name = "Extract Tag";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Extracts geometry containing the specified tag.";

    /** Index for initial tag dropdown
     * @type {number}
     */
    this.tagIndex = 0;

    /** Selected Tag
     * @type {string}
     */
    this.tag = undefined;

    /** Value stored in tagList Observable is a struct of {source: "geomID", tags: ["tag1", "tag2"...]} */
    this.tagList = { source: undefined, tags: [] };

    this.addAllIOs([
      { name: "input", valueType: "geometry" },
      { name: "output", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);
  }

  /**
   * Draw the constant which is more rectangular than the regular shape.
   */
  draw() {
    super.draw("rect");
    let pixelsX = GlobalVariables.widthToPixels(this.x);
    let pixelsY = GlobalVariables.heightToPixels(this.y);
    let pixelsRadius = GlobalVariables.widthToPixels(this.radius);
    /**
     * Relates height to radius
     * @type {number}
     */
    this.height = pixelsRadius;

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = "#484848";
    GlobalVariables.c.font = `${pixelsRadius}px Work Sans Bold`;
    GlobalVariables.c.fillText(
      String.fromCharCode(0x2191, 0x0040, 0x2191),
      pixelsX - pixelsRadius / 1,
      pixelsY + this.height / 2
    );
    GlobalVariables.c.fill();
    GlobalVariables.c.closePath();
  }

  arraysEqual(arr1, arr2) {
    if (!arr1 || !arr2) return false;
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

  createLevaInputs(setInputChanged, inputState) {
    let tagList = this.tagList.tags || [];
    let inputParams = {};

    inputParams[this.uniqueID + "extracting"] = {
      value: this.tag,
      label: "Tag",
      disabled: true,
    };

    inputParams[this.uniqueID + "tag_ops"] = {
      value: "Select Tag",
      options: tagList,
      label: "Extract Tag",
      onChange: (value) => {
        setInputChanged(value);
        if (this.tag != value && value != "Select Tag") {
          this.tag = value;
          this.onUpstreamChange();
        }
      },
    };
    return inputParams;
  }

  compute(inputs) {
    const inputID = inputs.input;
    console.log("extracting tag", this.tag, "from input geom: ", inputID);
    return GlobalVariables.cad.extractTag(this.uniqueID, inputID, this.tag);
  }

  /**
   * Override default behavior since extractTag is a two-step process
   * We first need to extract the list of candidate tags from the input geometry
   * then wait on the user to select one before we can proceed with extraction.
   */
  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }

    // Check for errors in inputs first
    if (this.inputsHaveErrors()) {
      this.setUpstreamError();
      return;
    }

    if (this.inputsAreReady()) {
      // Geometry input exists and is ready.
      const geomId = this.findIOValue("input");

      if (!geomId) {
        throw new Error("inputs ready but couldn't find geometry id");
      }

      if (!this.tagList.source || this.tagList.source != geomId) {
        this.setProcessing();
        GlobalVariables.cad
          .extractAllTags(geomId)
          .then((result) => {
            // Implicit recursion since we're observing tagList with onUpstreamChange
            this.setWaiting();
            this.tagList = { source: geomId, tags: result };
          })
          .catch(this.alertingErrorHandler());
      }

      if (this.tag) {
        if (this.tag != "Select Tag") {
          // A legit tag has been selected and we're ready to go!
          this.setProcessing();
          this.compute({ input: geomId })
            .then((value) => {
              console.log(
                `Extracted tag ${this.tag} from geometry ${geomId}, result:`,
                value
              );
              this.setReady(value);
            })
            .catch(this.alertingErrorHandler());
        }
      }
    } else {
      // Input's aren't ready. Clear our current list
      if (this.tagList.source) {
        // there was a valid input geometry but it's been removed.
        this.tagList = { source: undefined, tags: [] };
      }
      this.setWaiting();
    }
  }

  /**
   * Keeps track of tag to be extracted
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    superSerialObject.tag = this.tag;
    superSerialObject.tagIndex = this.tagIndex;

    return superSerialObject;
  }
}
