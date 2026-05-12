import Molecule from "../molecules/molecule";
import GlobalVariables from "../js/globalvariables.js";
import { Octokit } from "octokit";

import { Status } from "../prototypes/observableEntity.js";
import { formatOrdinalDate } from "../js/projectNameUtils.js";

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

    /**
     * Timestamp (milliseconds since epoch) of when this molecule was last reloaded from GitHub
     * @type {number}
     */
    this.lastReloadedFromGithubAt = null;

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

    // Check if GitHub molecule navigation is enabled in dev settings
    const devSettings = JSON.parse(
      localStorage.getItem("dev-settings") || "{}",
    );
    if (!devSettings.allowGitHubMoleculeNavigation) {
      return clickProcessed; // Do nothing if navigation is disabled
    }

    var distFromClick = GlobalVariables.distBetweenPoints(x, this.x, y, this.y);

    if (distFromClick < this.radius * 2) {
      // Check if the user owns this GitHub molecule
      if (
        this.parentRepo &&
        this.parentRepo.owner === GlobalVariables.currentUser
      ) {
        // User owns this GitHub molecule - dispatch navigate request event
        const moleculeName = this.name || this.parentRepo.repoName;
        window.dispatchEvent(
          new CustomEvent("github-molecule-navigate-request", {
            detail: {
              owner: this.parentRepo.owner,
              repoName: this.parentRepo.repoName,
              moleculeName: moleculeName,
            },
          }),
        );
      } else if (this.parentRepo) {
        // User doesn't own this molecule - dispatch preview request event
        const moleculeName = this.name || this.parentRepo.repoName;
        window.dispatchEvent(
          new CustomEvent("github-molecule-preview-request", {
            detail: {
              owner: this.parentRepo.owner,
              repoName: this.parentRepo.repoName,
              moleculeName: moleculeName,
            },
          }),
        );
      }

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
    this.setInputMoleculeChanged = setInputChanged; // Store for later use in reload button

    inputParams = super.createInputParams(setInputChanged);
    inputParams["ParentInfo"] = {
      type: "string",
      label: "Parent Repository",
      value: this.parentRepo
        ? `${this.parentRepo.owner}/${this.parentRepo.repoName}`
        : "",
      disabled: true,
    };
    inputParams["Parent Last Modified"] = {
      type: "string",
      label: "Last Modified",
      value: this.parentRepo
        ? formatOrdinalDate(this.parentRepo.dateModified)
        : "",
      disabled: true,
    };
    inputParams["Last Reloaded"] = {
      type: "string",
      label: "Last Reloaded From GitHub",
      value: this.lastReloadedFromGithubAt
        ? new Date(this.lastReloadedFromGithubAt).toLocaleString()
        : "Unknown",
      disabled: true,
    };
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
   * Override serialize to include lastReloadedFromGithubAt timestamp
   */
  serialize(offset = { x: 0, y: 0 }) {
    const serialized = super.serialize(offset);

    // Include last reload timestamp if it exists
    if (this.lastReloadedFromGithubAt !== null) {
      serialized.lastReloadedFromGithubAt = this.lastReloadedFromGithubAt;
    }

    return serialized;
  }

  /**
   * Reload this github molecule from github
   */
  async reloadMoleculeFromGithub(authorizedUserOcto, userScopes) {
    var githubMoleculeObjectPreReload = this.serialize();

    var githubMoleculeParentObjectConnectorsPreReload =
      this.parent.serialize().allConnectors;

    let gitObj = this.parentRepo;

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
    const octokit =
      authorizedUserOcto ||
      new Octokit({ headers: { "X-GitHub-Api-Version": "2022-11-28" } });
    try {
      await octokit.request(
        "GET /repos/{owner}/{repo}/contents/project.abundance",
        {
          owner: gitObj.owner,
          repo: gitObj.repoName,
        },
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("user-notification", {
          detail: {
            message: `Cannot reload: the repository "${gitObj.owner}/${gitObj.repoName}" could not be found or accessed.`,
            type: "error",
          },
        }),
      );
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
