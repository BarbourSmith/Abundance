import Molecule from "../molecules/molecule";
import GlobalVariables from "../js/globalvariables.js";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import { button } from "leva";
import { re } from "mathjs";
import { LevaInputs } from "leva";

/**
 * This class creates the GitHubMolecule atom.
 */
export default class GitHubMolecule extends Molecule {
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
    this.name = "Github Molecule";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "GitHubMolecule";
    /**
     * A flag to signal if this node is the top level node
     * @type {boolean}
     */
    this.topLevel = false;
    /**
     * The color for the whole in the center of the drawing...probably doesn't need to be in this scope
     * @type {string}
     */
    this.centerColor = "black";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description = "Project imported from GitHub";

    this.gitHubUniqueID;

    this.setValues(values);
  }

  /**
     * This replaces the default Molecule double click behavior to prevent you from being able to double click into a github molecule
     * @param {number} x - The x coordinate of the click
     * @param {number} y - The y coordinate of the click
     // */
  doubleClick(x, y) {
    var clickProcessed = false;
    var distFromClick = GlobalVariables.distBetweenPoints(x, this.x, y, this.y);
    if (distFromClick < this.radius) {
      clickProcessed = true;
    }
    return clickProcessed;
  }

  /**
   * Create Leva Menu Input - returns to ParameterEditor
   */
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
          onChange: (value) => {
            if (input.value !== value) {
              input.setValue(value);
              //this.sendToRender();
            }
          },
        };
        if (input.type && input.valueType) {
          inputParams[this.uniqueID + input.name].type =
            LevaInputs[input.valueType.toUpperCase()];
        }
      });
      inputParams["Reload From Github"] = button(() =>
        this.reloadMoleculeFromGithub()
      );
      return inputParams;
    }
  }

  /**
   * Reload this github molecule from github
   */
  reloadMoleculeFromGithub() {
    var githubMoleculeObjectPreReload = this.serialize();
    var githubMoleculeParentObjectConnectorsPreReload =
      this.parent.serialize().allConnectors;

    const copyOfNodeToBeDeleted = this;
    copyOfNodeToBeDeleted.deleteNode(false, false, true);

    let item = this.parentRepo;

    this.loadGithubMoleculeByName(
      /*old way > keeping until i fix reload -- this.gitHubUniqueID*/
      item,
      githubMoleculeObjectPreReload,
      githubMoleculeParentObjectConnectorsPreReload
    );
  }
}
