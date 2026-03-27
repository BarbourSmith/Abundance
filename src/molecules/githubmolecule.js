import Molecule from "../molecules/molecule";
import GlobalVariables from "../js/globalvariables.js";
import { Octokit } from "octokit";

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
     * Handle double clicks on GitHub molecules
     * If the user owns the molecule (based on parentRepo.owner), allow navigation with confirmation
     * @param {number} x - The x coordinate of the click
     * @param {number} y - The y coordinate of the click
     // */
  doubleClick(x, y) {
    //returns true if something was done with the click
    x = GlobalVariables.pixelsToWidth(x);
    y = GlobalVariables.pixelsToHeight(y);

    var clickProcessed = false;

    var distFromClick = GlobalVariables.distBetweenPoints(x, this.x, y, this.y);

    if (distFromClick < this.radius * 2) {
      // Check if the user owns this GitHub molecule
      if (
        this.parentRepo &&
        this.parentRepo.owner === GlobalVariables.currentUser
      ) {
        // User owns this GitHub molecule - allow navigation with confirmation
        const moleculeName = this.name || this.parentRepo.repoName;
        const confirmMessage = `Navigate to ${moleculeName}?\n\nThis will take you to the project "${this.parentRepo.owner}/${this.parentRepo.repoName}" and leave your current project.\n\nDo you want to continue?`;

        if (window.confirm(confirmMessage)) {
          // User confirmed - navigate to the owned molecule's project
          window.location.href = `/${this.parentRepo.owner}/${this.parentRepo.repoName}`;
        }
      }
      // else: User doesn't own this molecule - do nothing (can't navigate into it)

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

  createInputParams(setInputChanged, authorizedUserOcto, userScopes) {
    let inputParams = {};
    inputParams = super.createInputParams();
    inputParams["Reload From Github"] = {
      type: "button",
      label: "Reload From Github",
      title:
        "Reload this molecule from GitHub, which will update its contents to match the current state of the linked GitHub repository.",
      onClick: () =>
        this.reloadMoleculeFromGithub(authorizedUserOcto, userScopes),
    };
    return inputParams;
  }

  /**
   * Reload this github molecule from github
   */
  async reloadMoleculeFromGithub(authorizedUserOcto, userScopes) {
    var githubMoleculeObjectPreReload = this.serialize();
    var githubMoleculeParentObjectConnectorsPreReload =
      this.parent.serialize().allConnectors;

    let gitObj = this.parentRepo;
    let parentMolecule = this.parent;

    //Only delete and continue if you have permission to load
    if (
      gitObj.privateRepo &&
      (!authorizedUserOcto || !userScopes.includes("repo"))
    ) {
      this.setError(
        "Authentication with 'repo' scope is required to access private repositories.",
      );
      return;
    }

    // Verify the repository is accessible before deleting the existing node.
    // If the repository has been deleted or is unreachable, keep the existing
    // molecule and show an error rather than silently removing it.
    const octokit = authorizedUserOcto || new Octokit();
    try {
      await octokit.request(
        "GET /repos/{owner}/{repo}/contents/project.abundance",
        {
          owner: gitObj.owner,
          repo: gitObj.repoName,
        },
      );
    } catch (error) {
      window.dispatchEvent(new CustomEvent('user-notification', { detail: { message: `Cannot reload: the repository "${gitObj.owner}/${gitObj.repoName}" could not be found or accessed.`, type: 'error' } }));
      return;
    }

    const copyOfNodeToBeDeleted = this;
    copyOfNodeToBeDeleted.deleteNode(false, false, true);

    this.loadGithubMoleculeByName(
      gitObj,
      githubMoleculeObjectPreReload,
      githubMoleculeParentObjectConnectorsPreReload,
      null,
      authorizedUserOcto,
      userScopes,
    );
  }
}
