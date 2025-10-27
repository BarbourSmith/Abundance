import Molecule from "../molecules/molecule";
import GlobalVariables from "../js/globalvariables.js";

import { Status } from "../prototypes/observableEntity.js";

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

  onChildError() {
    // find the causal error.
    let buffer = [this.getOutputAtom()];
    while (buffer.length > 0) {
      let atom = buffer.shift();
      if (atom.getState().status === Status.ERROR) {
        this.setError(atom.alert?.message);
        return;
      }
      if (atom.getState().status === Status.UPSTREAM_ERROR) {
        atom.inputs.forEach((input) => {
          if (input.connectors.length > 0) {
            let toAdd = input.connectors[0].attachmentPoint1.parentMolecule;
            if (
              toAdd.atomType == "Molecule" ||
              toAdd.atomType == "GitHubMolecule"
            ) {
              toAdd = toAdd.getOutputAtom();
            }

            if (buffer.includes(toAdd) === false) {
              buffer.push(toAdd);
            }
          }
        });
      }
    }
    // Failed to find cause. set something generic.
    this.setError("An unknown error occurred in a child atom.");
  }

  createInputParams() {
    let inputParams = {};

    inputParams = super.createInputParams();
    
    // Only show reload button if a project has been loaded
    if (this.parentRepo) {
      inputParams["Reload From Github"] = {
        type: "button",
        label: "Reload From Github",
        onClick: () => this.reloadMoleculeFromGithub(),
      };
    } else {
      // Show a "Load Project" button if no project has been loaded yet
      inputParams["Load Project"] = {
        type: "button",
        label: "Load Project",
        onClick: () => {
          // Trigger the git search menu to open
          const gitSearchEvent = new CustomEvent('openGitSearch', { 
            detail: { targetMolecule: this }
          });
          window.dispatchEvent(gitSearchEvent);
        },
      };
    }
    
    return inputParams;
  }

  /**
   * Reload this github molecule from github
   */
  reloadMoleculeFromGithub() {
    var githubMoleculeObjectPreReload = this.serialize();
    var githubMoleculeParentObjectConnectorsPreReload =
      this.parent.serialize().allConnectors;

    let gitObj = this.parentRepo;
    let parentMolecule = this.parent;

    const copyOfNodeToBeDeleted = this;
    copyOfNodeToBeDeleted.deleteNode(false, false, true);

    this.loadGithubMoleculeByName(
      /*old way > keeping until i fix reload -- this.gitHubUniqueID*/
      gitObj,
      githubMoleculeObjectPreReload,
      githubMoleculeParentObjectConnectorsPreReload
    );
  }

  /**
   * Load content from GitHub into this existing GitHubMolecule
   * @param {object} gitObj - An object containing the GitHub repository information (owner, repoName, etc).
   */
  async loadContentFromGithub(gitObj) {
    const { Octokit } = await import("https://esm.sh/octokit@2.0.19");
    let octokit = new Octokit();
    
    try {
      const response = await octokit.request("GET /repos/{owner}/{repo}/contents/project.abundance", {
        owner: gitObj.owner,
        repo: gitObj.repoName,
      });

      let rawFileContent;
      // Handle large files (>1MB) using download_url
      if (!response.data.content || response.data.content.length === 0) {
        const fileResponse = await fetch(response.data.download_url);
        rawFileContent = await fileResponse.text();
      } else {
        // Handle small files using base64 content with UTF-8 encoding
        rawFileContent = GlobalVariables.fromBinaryStr(
          atob(response.data.content)
        );
      }

      let rawFile;
      try {
        rawFile = await this.asyncJsonParse(rawFileContent);
      } catch (err) {
        console.error("Failed to parse project.abundance:", err);
        throw err;
      }

      // Store the parent repo information
      this.parentRepo = gitObj;
      
      // Update the name to match the loaded project
      if (rawFile.name) {
        this.name = rawFile.name;
      }

      // Clear existing children before loading new content
      const nodesCopy = [...this.nodesOnTheScreen];
      nodesCopy.forEach((atom) => {
        try {
          atom.deleteNode(false, false, true);
        } catch (error) {
          console.warn("Error deleting atom during GitHub load:", error);
        }
      });
      this.nodesOnTheScreen = [];

      // Deserialize the loaded content into this molecule
      await this.deserialize(rawFile, { parentRepo: gitObj, topLevel: false }, true);
      
      // Enable the molecule after loading
      this.enable();
      
    } catch (error) {
      console.error("Error loading GitHub molecule content:", error);
      throw new Error("Failed to load GitHub molecule: " + error.message);
    }
  }
}
