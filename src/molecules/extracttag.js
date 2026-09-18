import Atom from "../prototypes/atom.js";
import GlobalVariables from "../js/globalvariables.js";
import { Status } from "../prototypes/observableEntity.js";
import {
  filterAssembly,
  walkAssembly,
  extractKeepOut,
  isLeaf,
} from "../worker/util";

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
     * @deprecated Superseded by `selectedTags`/`includeUntagged`/`notKeepOut`. Kept for backwards-compat serialization only.
     */
    this.tagIndex = 0;

    /** Selected Tag
     * @type {string}
     * @deprecated Superseded by `selectedTags`/`includeUntagged`/`notKeepOut`. Kept for backwards-compat serialization only.
     */
    this.tag = undefined;

    /** Tags currently checked for extraction
     * @type {string[]}
     */
    this.selectedTags = [];

    /** Whether untagged (leaf) geometry should be included
     * @type {boolean}
     */
    this.includeUntagged = false;

    /** Whether to remove "keepout"-tagged geometry from the result
     * @type {boolean}
     */
    this.notKeepOut = false;

    /** Value stored in tagList Observable is a struct of {source: "geomID", tags: ["tag1", "tag2"...]} */
    this.tagList = { source: undefined, tags: [] };

    this.addAllIOs([
      { name: "geometry", valueType: "geometry" },
      { name: "output", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);

    // Backwards compatibility: migrate old single-tag/dropdown state
    // (`this.tag`) into the new checkbox-based fields if this atom was
    // loaded from a project saved before checkboxes were introduced.
    const hasNewFields =
      values &&
      (values.selectedTags !== undefined ||
        values.includeUntagged !== undefined ||
        values.notKeepOut !== undefined);

    if (!hasNewFields && this.tag) {
      if (this.tag === "Not Keep Out") {
        this.notKeepOut = true;
      } else if (this.tag !== "Select Tag") {
        this.selectedTags = [this.tag];
      }
    }
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
      pixelsY + this.height / 2,
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

  createInputParams(setInputChanged) {
    // Forward to super so it can register `setInputChanged`. We discard
    // its returned controls because ExtractTag builds a fully custom panel.
    super.createInputParams(setInputChanged);
    // "Select Tag" is a placeholder value added by extractAllTags, not a real tag.
    let tagList = (this.tagList.tags || []).filter(
      (tag) => tag !== "Select Tag",
    );
    let inputParams = {};

    tagList.forEach((tag) => {
      inputParams[this.uniqueID + "tag_" + tag] = {
        type: "boolean",
        value: this.selectedTags.includes(tag),
        label: tag,
        onChange: (checked) => {
          if (checked) {
            if (!this.selectedTags.includes(tag)) {
              this.selectedTags = [...this.selectedTags, tag];
            }
          } else {
            this.selectedTags = this.selectedTags.filter((t) => t !== tag);
          }
          this.updateName();
          this.onUpstreamChange();
        },
      };
    });

    inputParams[this.uniqueID + "untagged"] = {
      type: "boolean",
      value: this.includeUntagged,
      label: "Untagged",
      onChange: (checked) => {
        this.includeUntagged = checked;
        this.updateName();
        this.onUpstreamChange();
      },
    };

    inputParams[this.uniqueID + "not_keep_out"] = {
      type: "boolean",
      value: this.notKeepOut,
      label: "Not Keep Out",
      onChange: (checked) => {
        this.notKeepOut = checked;
        this.updateName();
        this.onUpstreamChange();
      },
    };

    return inputParams;
  }

  /**
   * Updates this atom's displayed name to reflect the current selection.
   */
  updateName() {
    const parts = [...this.selectedTags];
    if (this.includeUntagged) {
      parts.push("Untagged");
    }
    if (this.notKeepOut) {
      parts.push("Not Keep Out");
    }
    this.name =
      parts.length > 0 ? `Extract ${parts.join(", ")}` : "Extract Tag";
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
      const geomId = this.findIOValue("geometry");

      if (!geomId) {
        throw new Error("inputs ready but couldn't find geometry id");
      }

      // TODO(tristan): this geomId comparison is outdated I think? shouldn't we
      // use deep equality on the abundance object?
      if (!this.tagList.source || this.tagList.source != geomId) {
        this.setProcessing();

        this.tagList = { source: geomId, tags: this.getTagList(geomId) };
        if (typeof this.setInputChanged === "function") {
          this.setInputChanged(this.tagList.tags); // Mark input as changed to trigger re-render of tag checkboxes
        }
        // TODO: this is oversensitive. There are scenarios where the
        // extracted items haven't changed here.
        this.onUpstreamChange();

        return;
      }

      const hasCriteria =
        this.selectedTags.length > 0 || this.includeUntagged || this.notKeepOut;

      if (hasCriteria) {
        // At least one criterion has been selected and we're ready to go!
        this.setReady(
          this.extractTags(
            geomId,
            this.selectedTags,
            this.includeUntagged,
            this.notKeepOut,
          ),
        );
      } else {
        this.setWaiting();
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
   * Keeps track of tags to be extracted
   */
  serialize(offset = { x: 0, y: 0 }) {
    var superSerialObject = super.serialize(offset);
    // Kept for backwards compatibility with older projects/tooling.
    superSerialObject.tag = this.tag;
    superSerialObject.tagIndex = this.tagIndex;
    superSerialObject.selectedTags = this.selectedTags;
    superSerialObject.includeUntagged = this.includeUntagged;
    superSerialObject.notKeepOut = this.notKeepOut;

    return superSerialObject;
  }

  getTagList(abundanceObject) {
    const tags = [];
    walkAssembly(abundanceObject, (leaf) => {
      tags.push(...(leaf.tags || []));
    });

    return ["Select Tag", ...new Set(tags)];
  }

  extractTags(geometry, selectedTags, includeUntagged, notKeepOut) {
    const hasSelection = selectedTags.length > 0 || includeUntagged;

    let result;
    if (hasSelection) {
      result = filterAssembly(geometry, (node) => {
        const tags = node.tags || [];
        if (selectedTags.some((tag) => tags.includes(tag))) {
          return true;
        }
        if (includeUntagged && isLeaf(node) && tags.length === 0) {
          return true;
        }
        return false;
      });
    } else {
      result = geometry;
    }

    if (result !== undefined && notKeepOut) {
      const filtered = extractKeepOut(result);
      result = filtered === false ? undefined : filtered;
    }

    if (result === undefined) {
      // Nothing matched the selected criteria. This is a valid result, so return
      // an empty assembly (preserving the top-level metadata) rather than throwing.
      return { ...geometry, geometry: [] };
    }

    return result;
  }
}
