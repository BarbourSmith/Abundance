import Atom from "../prototypes/atom.js";
import Connector from "../prototypes/connector.js";
import AttachmentPoint from "../prototypes/attachmentpoint.js";
import GlobalVariables from "../js/globalvariables.js";

import { Octokit } from "octokit";
import { BOMEntry } from "../js/BOM";

import { Status } from "../prototypes/observableEntity.js";
import { saveAs } from "file-saver";

/**
 * This class creates the Molecule atom.
 */
export default class Molecule extends Atom {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    super(values);

    /**
     * A list of all of the atoms within this Molecule which should be drawn on the screen as objects.
     * @type {array}
     */
    this.nodesOnTheScreen = [];

    /**
     * This atom's type
     * @type {string}
     */
    this.name = "Molecule";
    /**
     * A description of this atom
     * @type {string}
     */
    this.description =
      "Molecules provide an organizational structure to contain atoms. Double click on a molecule to enter it. Use the up arrow in the upper right hand corner of the screen to go up one level.";
    /**
     * This atom's type
     * @type {string}
     */
    this.atomType = "Molecule";
    /**
     * The color for the middle dot in the molecule
     * @type {string}
     */
    this.centerColor = "#949294";
    /**
     * A flag to indicate if this molecule is the top level molecule.
     * @type {boolean}
     */
    this.topLevel = false;
    /**
     * A flag to indicate if this molecule is currently processing.
     * @type {boolean}
     */
    this.processing = false; //Should be pulled from atom. Docs made me put this here

    /**
     * The total number of atoms contained in this molecule
     * @type {integer}
     */
    this.totalAtomCount = 1;
    /**
     * The total number of atoms contained in this molecule which are waiting to process
     * @type {integer}
     */
    this.toProcess = 0;
    /**
     * A flag to indicate if this molecule was waiting propagation. If it is it will take place
     *the next time we go up one level.
     * @type {number}
     */
    this.awaitingPropagationFlag = false;
    /**
     * A list of available units with corresponding scaling numbers.
     * @type {object}
     */
    this.units = { MM: "MM", Inches: "Inches", Unitless: "Unitless" };
    /**
     * The key of the currently selected unit.
     * @type {string}
     */
    this.unitsKey;
    /**
     * List of BOM items.
     * @type {array}
     */
    this.BOMlist;

    this.compiledBom = {};

    this.partToExport = null;

    /**
     * List of all available tags in project.
     * @type {array}
     */
    this.projectAvailableTags = [];

    this.addAllIOs([
      { name: "geometry or number", valueType: "geometry", type: "output" },
    ]);

    this.setValues(values);

    this.color;
  }

  // Returns a tuple of [READY_child_count, total_child_count]
  // Always computes total recursively to ensure progress bar never goes backwards
  getCompletionTuple() {
    let totalCount = 0;
    let readyCount = 0;

    this.nodesOnTheScreen.forEach((atom) => {
      const status = atom.getState().status;
      if (status === Status.DISABLED) {
        // Skip disabled children entirely (and their subtrees)
        return;
      }

      if (atom.atomType === "Molecule" || atom.atomType === "GitHubMolecule") {
        // Recurse into nested molecules to get consistent totals
        const [ready, total] = atom.getCompletionTuple();
        totalCount += total;
        readyCount += ready;
      } else {
        // Non-molecule atom counts as 1
        totalCount += 1;
        if (status === Status.READY) {
          readyCount += 1;
        }
      }
    });

    if (totalCount === 0) {
      return [1, 1]; // be nice about division by 0
    }

    return [readyCount, totalCount];
  }

  /**
   * Add the center dot to the molecule
   */
  draw() {
    super.draw(); //Super call to draw the rest

    //draw the circle in the middle
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = this.centerColor;
    GlobalVariables.c.moveTo(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y)
    );

    const [ready, total] = this.getCompletionTuple();

    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius) / 2,
      0,
      (ready / total) * Math.PI * 2,
      false
    );
    GlobalVariables.c.closePath();
    GlobalVariables.c.fill();
  }

  createInputParams() {
    let inputParams = { ...super.createInputParams() };

    inputParams["molecule name" + this.uniqueID] = {
      type: "string",
      value: this.topLevel
        ? GlobalVariables.currentAWSnode.repoName
        : this.name,
      label: "Molecule Name",
      disabled: this.topLevel || this.atomType === "GitHubMolecule",
      onChange: (value) => {
        this.name = value;
      },
    };
    if (this.topLevel == true) {
      inputParams["molecule name" + this.uniqueID + "units"] = {
        type: "select",
        value: this.unitsKey,
        label: "Project Units",
        options: Object.keys(this.units),
        disabled: false,
        onChange: (value) => {
          this.unitsKey = this.units[value];
        },
      };
    }
    if (GlobalVariables.currentAWSnode.parentRepo != null && this.topLevel) {
      inputParams["Reload from Github"] = {
        type: "button",
        label: "Reload from Github",
        onClick: () => {
          this.reloadFork();
        },
      };
    }

    return inputParams;
  }

  createExportMenuInputs() {
    let exportParams = {};
    const exportAtoms = this.nodesOnTheScreen.filter(
      (node) => node.atomType === "Export"
    );

    exportAtoms.forEach((atom) => {
      const partName =
        atom.inputs.filter((input) => input.name === "Part Name")[0]?.value ||
        "Unnamed Part";
      exportParams[`Export ${partName}`] = {
        type: "button",
        label: `Export ${partName}`,
        onClick: () => {
          atom.exportFile();
          console.log(`Exporting: ${partName}`);
        },
      };
    });

    const gcodeAtoms = this.nodesOnTheScreen.filter(
      (node) => node.atomType === "Gcode"
    );
    // this is wrong and only a placeholder for kiri forum questions
    gcodeAtoms.forEach((atom) => {
      exportParams[`Download Gcode – ${atom.partName}`] = {
        type: "button",
        label: `Download Gcode – ${atom.partName}`,
        onClick: () => {
          atom.downloadGcode();
          console.log(`Downloading Gcode: ${atom.partName}`);
        },
      };
    });

    return exportParams;
  }

  async reloadFork() {
    const octokit = new Octokit();
    let parent = GlobalVariables.currentAWSnode.parentRepo.split("/");
    let parentOwner = parent[0];
    let parentRepo = parent[1];
    octokit
      .request("GET /repos/{owner}/{repo}", {
        owner: parentOwner,
        repo: parentRepo,
      })
      .then((response) => {
        console.log("Fetched repository data:", response.data);
        octokit.rest.repos
          .getContent({
            owner: response.data.owner.login,
            repo: response.data.name,
            path: "project.abundance",
          })
          .then(async (response) => {
            // Clear the nodesOnTheScreen array before deserialization to avoid doubling
            GlobalVariables.topLevelMolecule.nodesOnTheScreen.forEach(
              (atom) => {
                atom.deleteNode();
              }
            );
            GlobalVariables.topLevelMolecule.nodesOnTheScreen = []; // <-- clear the array
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
              rawFile = await this.asyncJsonParse(rawFileContent); // Use the async parser from previous answer
            } catch (err) {
              console.error("Failed to parse project.abundance:", err);
              return;
            }
            // Reset ID counter to avoid collisions with existing IDs
            GlobalVariables.resetIdCounter(rawFile);
            // Only call deserialize after rawFile is ready
            if (rawFile.filetypeVersion == 1) {
              await GlobalVariables.topLevelMolecule.deserialize(rawFile);
            }
            GlobalVariables.currentMolecule.selected = true;
          });
      });
  }

  asyncJsonParse(str) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(JSON.parse(str));
        } catch (e) {
          reject(e);
        }
      }, 0); // Defer to next tick
    });
  }

  /**
   * Computes and returns an array of BOMEntry objects after looking at the tags of a geometry.*/
  async extractBomTags() {
    var tag = "BOMitem";
    let bomlist = await GlobalVariables.cad.extractBomList(this.value);
    return bomlist;
  }

  /**
   * Set the atom's response to a mouse click up. If the atom is moving this makes it stop moving.
   * @param {number} x - The X coordinate of the click
   * @param {number} y - The Y coordinate of the click
   */
  clickUp(x, y) {
    super.clickUp(x, y);
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
      atom.isMoving = false;
    });
  }

  /**
   * Delineates bounds for selection box.
   */
  selectBox(x, y, xEnd, yEnd) {
    let xIn = Math.min(x, xEnd);
    let xOut = Math.max(x, xEnd);
    let yIn = Math.min(y, yEnd);
    let yOut = Math.max(y, yEnd);
    let xInPixels = GlobalVariables.widthToPixels(this.x);
    let yInPixels = GlobalVariables.heightToPixels(this.y);
    if (xInPixels >= xIn && xInPixels <= xOut) {
      if (yInPixels >= yIn && yInPixels <= yOut) {
        //this.isMoving = true
        this.selected = true;
      }
    }
  }

  /**
   * Handle double clicks by replacing the molecule currently on the screen with this one, esentially diving into it.
   * @param {number} x - The x coordinate of the click
   * @param {number} y - The y coordinate of the click
   *
   */
  doubleClick(x, y) {
    //returns true if something was done with the click
    x = GlobalVariables.pixelsToWidth(x);
    y = GlobalVariables.pixelsToHeight(y);

    var clickProcessed = false;

    var distFromClick = GlobalVariables.distBetweenPoints(x, this.x, y, this.y);

    if (distFromClick < this.radius * 2) {
      GlobalVariables.resetView();
      GlobalVariables.currentMolecule = this; //set this to be the currently displayed molecule
      this.enableAllChildren();

      /**
       * Deselects Atom
       * @type {boolean}
       */
      this.selected = false;
      clickProcessed = true;

      // update to the new current molecule's background mesh
      this.getOutputAtom()?.sendToRender();
    }

    return clickProcessed;
  }

  /**
   * Enables all child nodes in this molecule. Should be called for the currentMolecule
   * so onscreen nodes are always computed
   */
  enableAllChildren() {
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.status === Status.DISABLED) {
        atom.enable();
      }
    });
  }

  /**
   * Pushes serialized atoms into array if selected
   */
  copy() {
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.selected) {
        GlobalVariables.atomsSelected.push(
          atom.serialize({ x: 0.05, y: 0.05 })
        );
      }
    });
  }

  /**
   * Enhanced copy that includes internal connectors between selected atoms
   */
  copyWithConnectors() {
    const selectedAtoms = [];
    const selectedAtomIDs = new Set();
    const internalConnectors = [];

    // First pass: collect selected atoms and their IDs
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.selected) {
        selectedAtoms.push(atom.serialize({ x: 0.05, y: 0.05 }));
        selectedAtomIDs.add(atom.uniqueID);
      }
    });

    // Early return if no atoms selected
    if (selectedAtoms.length === 0) {
      console.log("No atoms selected for copy with connectors");
      return;
    }

    // Second pass: collect connectors that connect only selected atoms
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.selected && atom.output) {
        atom.output.connectors.forEach((connector) => {
          // Only include connectors where both ends are in selected atoms
          if (
            connector.attachmentPoint2 &&
            selectedAtomIDs.has(
              connector.attachmentPoint1.parentMolecule.uniqueID
            ) &&
            selectedAtomIDs.has(
              connector.attachmentPoint2.parentMolecule.uniqueID
            )
          ) {
            internalConnectors.push(connector.serialize());
          }
        });
      }
    });

    // Store in a structured format that includes both atoms and connectors
    GlobalVariables.atomsSelected = selectedAtoms;
    GlobalVariables.connectorsSelected = internalConnectors;

    console.log(
      `Copied ${selectedAtoms.length} atoms with ${internalConnectors.length} internal connectors`
    );
  }

  /**
   * Move selected atoms with their internal connectors into a new or existing molecule
   * @param {object} targetMolecule - The molecule to move atoms into (optional, creates new if not provided)
   */
  moveSelectedAtomsToMolecule(targetMolecule = null) {
    // Check if any atoms are selected
    const selectedCount = this.nodesOnTheScreen.filter(
      (atom) => atom.selected
    ).length;
    if (selectedCount === 0) {
      console.log("No atoms selected to move. Please select atoms first.");
      return null;
    }

    // Copy atoms and connectors
    this.copyWithConnectors();

    if (GlobalVariables.atomsSelected.length === 0) {
      console.warn("No atoms could be copied for moving");
      return null;
    }

    console.log(
      `Moving ${selectedCount} selected atoms to ${
        targetMolecule ? "existing" : "new"
      } molecule`
    );

    // Create new molecule if not provided
    if (!targetMolecule) {
      // Calculate center position of selected atoms
      let avgX = 0,
        avgY = 0;
      GlobalVariables.atomsSelected.forEach((atom) => {
        avgX += atom.x;
        avgY += atom.y;
      });
      avgX /= GlobalVariables.atomsSelected.length;
      avgY /= GlobalVariables.atomsSelected.length;

      // Create new molecule
      const newMoleculeObj = {
        parentMolecule: this,
        x: avgX,
        y: avgY,
        parent: this,
        atomType: "Molecule",
        uniqueID: GlobalVariables.generateUniqueID(),
        name: "New Molecule",
      };

      // Place the new molecule
      this.placeAtom(newMoleculeObj, true)
        .then(() => {
          // Find the newly created molecule
          targetMolecule = this.nodesOnTheScreen.find(
            (atom) => atom.uniqueID === newMoleculeObj.uniqueID
          );

          if (targetMolecule) {
            this.completeAtomMove(targetMolecule);
          } else {
            console.error("Failed to create target molecule");
          }
        })
        .catch((error) => {
          console.error("Error creating target molecule:", error);
        });
    } else {
      this.completeAtomMove(targetMolecule);
    }

    return targetMolecule;
  }

  /**
   * Complete the atom move operation by placing atoms and connectors in target molecule
   * @param {object} targetMolecule - The target molecule to place atoms into
   */
  completeAtomMove(targetMolecule) {
    // Remove selected atoms from current molecule, excluding the target molecule
    const atomsToRemove = [];
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.selected && atom !== targetMolecule) {
        atomsToRemove.push(atom);
      }
    });

    // Delete atoms from current molecule (this also removes their connectors)
    atomsToRemove.forEach((atom) => {
      atom.deleteNode();
    });

    // Create structured data for the target molecule
    const moleculeData = {
      allAtoms: GlobalVariables.atomsSelected,
      allConnectors: GlobalVariables.connectorsSelected || [],
      fileTypeVersion: 1,
    };

    // Remap IDs to avoid conflicts
    const remappedData = targetMolecule.remapIDs(moleculeData);

    // Place atoms in target molecule
    if (remappedData?.allAtoms) {
      const atomPromises = [];
      remappedData.allAtoms.forEach((atomData) => {
        const promise = targetMolecule.placeAtom(atomData, true);
        atomPromises.push(promise);
      });

      // Place connectors after atoms are placed
      Promise.all(atomPromises)
        .then(() => {
          if (remappedData.allConnectors) {
            remappedData.allConnectors.forEach((connectorData) => {
              targetMolecule.placeConnector(connectorData);
            });
          }
        })
        .catch((error) => {
          console.warn("Error placing atoms or connectors:", error);
        });
    }

    // Clear selection
    GlobalVariables.atomsSelected = [];
    GlobalVariables.connectorsSelected = [];
  }

  deleteAllAtoms() {
    // Remove all atoms from the molecule
    if (Array.isArray(this.nodesOnTheScreen)) {
      this.nodesOnTheScreen.length = 0;
    }
    // Optionally, clear any other related state or references here
  }

  /**
   * Performs undo operation with improved reliability and operation type awareness
   */
  async undo() {
    // Check if there are any undo states available
    if (GlobalVariables.recentMoleculeRepresentation.length === 0) {
      console.log("No undo history available");
      return; // Exit gracefully when no undo history exists
    }

    try {
      // Save the current molecule path so we can navigate back to it after undo
      const currentMoleculePath = this.getMoleculePath();

      // Get the last saved state and operation info
      let rawFile = JSON.parse(
        GlobalVariables.recentMoleculeRepresentation.pop()
      );

      // Get operation info if available
      let operationInfo = null;
      if (GlobalVariables.undoOperationHistory.length > 0) {
        operationInfo = GlobalVariables.undoOperationHistory.pop();
        console.log(
          `Undoing ${operationInfo.type} operation: ${operationInfo.context}`
        );
      }

      // Make a copy of current nodes to safely delete them
      const nodesCopy = [...GlobalVariables.topLevelMolecule.nodesOnTheScreen];

      // Delete all current nodes to prepare for state restoration
      nodesCopy.forEach((atom) => {
        try {
          atom.deleteNode();
        } catch (error) {
          console.warn("Error deleting atom during undo:", error);
        }
      });

      // Restore the previous state if it's a valid format
      if (rawFile && rawFile.fileTypeVersion == 1) {
        // Reset ID counter to avoid collisions with existing IDs
        GlobalVariables.resetIdCounter(rawFile);
        await GlobalVariables.topLevelMolecule.deserialize(rawFile);
        // Navigate back to the molecule where the user was working before undo
        this.navigateToMoleculePath(currentMoleculePath);
      } else {
        console.warn("Invalid file format for undo operation");
      }

      // Ensure current molecule is selected
      if (GlobalVariables.currentMolecule) {
        GlobalVariables.currentMolecule.selected = true;
      }
    } catch (error) {
      console.error("Error during undo operation:", error);
      // If undo fails, we should try to maintain a consistent state
      // The nodes have already been deleted, so we need to handle this gracefully
    }
  }

  /**
   * Unselect this molecule
   */
  deselect() {
    this.selected = false;
  }

  compileBom() {
    let compiled = this.extractBomTags().then((result) => {
      let bomList = [];
      let compileBomItems = [];
      if (result) {
        result.forEach(function (bomElement) {
          if (bomElement?.BOMitemName) {
            if (!bomList[bomElement.BOMitemName]) {
              //If the list of items doesn't already have one of these
              bomList[bomElement.BOMitemName] = new BOMEntry(); //Create one
              bomList[bomElement.BOMitemName].numberNeeded = 0; //Set the number needed to zerio initially
              bomList[bomElement.BOMitemName].BOMitemName =
                bomElement.BOMitemName; //With the information from the item
              bomList[bomElement.BOMitemName].source = bomElement.source;
              compileBomItems.push(bomList[bomElement.BOMitemName]);
            }
            bomList[bomElement.BOMitemName].numberNeeded +=
              bomElement.numberNeeded;
            // Round to nearest penny to avoid floating-point precision errors
            bomList[bomElement.BOMitemName].costUSD =
              Math.round(
                (bomList[bomElement.BOMitemName].costUSD + bomElement.costUSD) *
                  100
              ) / 100;
          }
        });

        // Alphabetize by source
        compileBomItems = compileBomItems.sort((a, b) =>
          a.source > b.source ? 1 : b.source > a.source ? -1 : 0
        );
        return compileBomItems;
      }
    });
    return compiled;
  }

  formatBom() {
    /**
     * Takes a link and converts it to be an affiliate link if it should be.
     * @param {string} link - The link to check.
     */
    const convertLinks = function (link) {
      if (link.toLowerCase().includes("amazon")) {
        return "[Amazon](" + link + "?tag=maslowcnc01-20)";
      }
      return link;
    };

    // format and compile the BOM
    var bomHeader =
      "###### Note: Do not edit this file directly, it is automatically generated from the CAD model \n# Bill Of Materials \n |Part|Number Needed|Price|Source| \n |----|----------|-----|-----|";

    var bomItems = GlobalVariables.topLevelMolecule.compiledBom;
    var bomContent = bomHeader;
    var totalParts = 0;
    var totalCost = 0;
    if (bomItems.length > 0) {
      bomItems.forEach((item) => {
        totalParts += item.numberNeeded;
        totalCost += item.costUSD;
        bomContent =
          bomContent +
          "\n|" +
          item.BOMitemName +
          "|" +
          item.numberNeeded +
          "|$" +
          item.costUSD.toFixed(2) +
          "|" +
          convertLinks(item.source) +
          "|";
      });
    }
    // Round total cost to nearest penny
    totalCost = Math.round(totalCost * 100) / 100;
    bomContent =
      bomContent +
      "\n|" +
      "Total: " +
      "|" +
      totalParts +
      "|$" +
      totalCost.toFixed(2) +
      "|" +
      " " +
      "|";
    return bomContent;
  }

  createBom(setInputChanged) {
    this.setInputChanged = setInputChanged;
    let bomParams = {};
    // Show this molecule’s compiled BOM (top-level = full project; nested = local)
    const bomToShow = this.compiledBom;
    if (bomToShow) {
      if (bomToShow.length > 0) {
        bomToShow.map((item) => {
          bomParams[item.BOMitemName] = {
            type: "number",
            value: item.numberNeeded,
            label: item.BOMitemName + " x",
            disabled: true,
          };
        });

        bomParams["Download List of Materials"] = {
          type: "button",
          label: "Download List of Materials",
          onClick: () => {
            var fileName =
              GlobalVariables.currentAWSnode.repoName +
              "- Bill-of-Materials.txt";
            var fileContent = this.formatBom();
            var myFile = new Blob([fileContent], { type: "text/plain" });

            saveAs(myFile, fileName + "." + "txt");
          },
        };
      }
    }
    return bomParams;
  }

  getOutputAtom() {
    return this.nodesOnTheScreen.find(
      (atom) => atom.atomType === "Output" && atom.parent === this
    );
  }

  onChildError() {
    this.setError("An error occurred in a child atom.");
  }

  onUpstreamChange() {
    // No-op if this atom is disabled
    if (this.status === Status.DISABLED) {
      return;
    }

    // If there's an upstream error in this context (ie the inputs to this molecule have an error),
    // Set upstream error status to indicate that the issue is not within this molecule.
    const hasErrorInputs = this.inputs.some((input) => {
      return (
        input.status === Status.ERROR || input.status === Status.UPSTREAM_ERROR
      );
    });

    if (hasErrorInputs) {
      this.setUpstreamError();
      return;
    }

    const outputAtom = this.getOutputAtom();
    if (outputAtom) {
      const outputState = outputAtom.getState();
      if (outputState.status == Status.READY) {
        this.setReady(outputState.value);
        this.compileBom()
          .then((bom) => {
            this.compiledBom = bom;
            if (this.setInputChanged) {
              this.setInputChanged(bom);
            }
          })
          .catch(this.alertingErrorHandler);
      } else {
        if (this.inputs.every((input) => input.status == Status.READY)) {
          // All inputs are ready but our output isn't yet. check for an internal error
          // else we're in progress.
          if (
            outputAtom.status == Status.UPSTREAM_ERROR ||
            outputAtom.status == Status.ERROR
          ) {
            this.onChildError();
          } else if (outputAtom.inputs[0]?.connectors.length == 0) {
            this.setWaiting(); // No connectors to our internal output means we're in a freshly initialized state.;
          } else {
            this.setProcessing();
          }
        } else {
          // Else set status to waiting since some of our inputs are not ready.
          this.setWaiting();
        }
      }
    } else {
      console.trace("Undefined output atom in onUpstreamChange");
      this.setError("got callback with undefined output atom");
    }
  }

  propagateChange() {
    if (this == GlobalVariables.currentMolecule) {
      // This is the output of the currently focused molecule
      // don't dispatch changes upstream because those entities aren't
      // shown.
      this.selfSubscriber();
      return;
    }
    super.propagateChange();
  }

  changeUnits(newUnitsIndex) {
    this.unitsIndex = newUnitsIndex;
  }

  /**
   * Replace the currently displayed molecule with the parent of this molecule...moves the user up one level.
   */
  goToParentMolecule() {
    //Go to the parent molecule if there is one
    if (!GlobalVariables.currentMolecule.topLevel) {
      GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
        atom.selected = false;
      });
      GlobalVariables.resetView();
      GlobalVariables.currentMolecule = GlobalVariables.currentMolecule.parent; //set parent this to be the currently displayed molecule
      GlobalVariables.currentMolecule.enableAllChildren();

      // Force propagation upstream since intermediate changes have been
      // withheld. Only call setReady if we have a valid value.
      const value = this.value;
      this.setWaiting();
      if (value !== null && value !== undefined) {
        this.setReady(value);
      }
      this.selected = true;
      this.sendToRender();
      GlobalVariables.currentMolecule.getOutputAtom()?.sendToRender();
    }
  }

  async generateProjectThumbnail() {
    //Generate a thumbnail for the project
    return GlobalVariables.cad
      .generateDisplayMesh(
        GlobalVariables.topLevelMolecule.value,
        GlobalVariables.topLevelMolecule.getContext()
      )
      .then((m) => {
        console.log("Generated project thumbnail");
        console.log(m);
        return m;
      });
  }

  /**
   * Check to see if any of this molecules children have contributions to make to the README file. Children closer to the top left will be applied first. TODO: No contribution should be made if it's just a title.
   */
  async requestReadme() {
    var sortableAtomsList = this.nodesOnTheScreen;
    sortableAtomsList = sortableAtomsList
      .filter(
        (atom) => atom.atomType == "Molecule" || atom.atomType == "Readme"
      )
      .sort(function (a, b) {
        return (
          GlobalVariables.distBetweenPoints(a.x, 0, a.y, 0) -
          GlobalVariables.distBetweenPoints(b.x, 0, b.y, 0)
        );
      });
    const promiseArray = sortableAtomsList.map((atom) => {
      return atom.requestReadme();
    });
    let finalReadMe = [];

    await Promise.all(promiseArray).then((values) => {
      values.forEach((value) => {
        // Skip undefined or null values
        if (!value) {
          return;
        }
        let text;
        if (value instanceof Array) {
          value.forEach((arrayItem) => {
            text = arrayItem.readMeText;
            finalReadMe.push({
              uniqueID: arrayItem.uniqueID,
              readMeText: text,
              svg: arrayItem.svg,
            });
          });
        } else {
          text = value.readMeText;
          if (value.svg) {
            text = text.concat(
              " \n\n![readme](/readme" + value.uniqueID + ".svg)\n\n"
            );
          }
          finalReadMe.push({
            uniqueID: value.uniqueID,
            readMeText: text,
            svg: value.svg,
          });
        }
      });
    });
    return finalReadMe;
  }

  /**
   * Generates and returns a object representation of this molecule and all of its children.
   */
  serialize(offset = { x: 0, y: 0 }) {
    var allAtoms = []; //An array of all the atoms contained in this molecule
    var allConnectors = []; //An array of all the connectors contained in this molecule

    this.nodesOnTheScreen.forEach((atom) => {
      //Store a representation of the atom
      allAtoms.push(atom.serialize());
      //Store a representation of the atom's connectors
      if (atom.output) {
        atom.output.connectors.forEach((connector) => {
          allConnectors.push(connector.serialize());
        });
      }
    });

    var thisAsObject = super.serialize(offset); //Do the atom serialization to create an object, then add all the bits of this one to it
    thisAsObject.topLevel = this.topLevel;
    thisAsObject.allAtoms = allAtoms;
    thisAsObject.allConnectors = allConnectors;

    // Check if there are Input atoms whose values aren't in ioValues
    // This handles cases where Input atoms exist but their attachment points weren't added to this.inputs
    const inputAtoms = this.nodesOnTheScreen.filter(
      (atom) => atom.atomType === "Input"
    );
    if (inputAtoms.length > 0) {
      // Get existing ioValues or create empty array
      const existingIoValues = thisAsObject.ioValues || [];
      const existingNames = new Set(existingIoValues.map((io) => io.name));

      const MAX_VALUE_SIZE = 10000;
      const additionalIoValues = [];

      inputAtoms.forEach((inputAtom) => {
        // Skip if this input is already in ioValues
        if (existingNames.has(inputAtom.name)) {
          return;
        }

        // Get the value from the Input atom's parentAP if it exists
        const value = inputAtom.parentAP
          ? inputAtom.parentAP.getValue()
          : inputAtom.value;

        // Only save if value is a number or string
        // Don't check valueType - just check the actual value type
        // This allows Input atoms with type="geometry" to save number/string values
        if (typeof value !== "number" && typeof value !== "string") {
          return;
        }

        // Skip large strings
        if (typeof value === "string" && value.length > MAX_VALUE_SIZE) {
          console.warn(
            `Skipping serialization of large string value (${value.length} chars) for Input atom: ${inputAtom.name}`
          );
          return;
        }

        // Skip undefined and null values
        if (value !== undefined && value !== null) {
          additionalIoValues.push({
            name: inputAtom.name,
            ioValue: value,
          });
        }
      });

      // Merge additional ioValues with existing ones
      if (additionalIoValues.length > 0) {
        thisAsObject.ioValues = [...existingIoValues, ...additionalIoValues];
      }
    }

    // Only include parentRepo if it exists
    if (this.parentRepo) {
      thisAsObject.parentRepo = this.parentRepo;
    }
    // Only include unitsKey if it exists
    if (this.unitsKey) {
      thisAsObject.unitsKey = this.unitsKey;
    }
    thisAsObject.fileTypeVersion = 1;
    // Note: compiledBom is not saved - it can be regenerated from geometry tags on load

    return thisAsObject;
  }

  /**
   * Load the children of this from a JSON representation
   * @param {object} json - A json representation of the molecule
   * @param {object} values - An array of values to apply to this molecule before de-serializing it's contents. Used by githubmolecules to set top level correctly
   */
  deserialize(json, values = {}, forceEnable = false) {
    //Find the target molecule in the list
    let promiseArray = [];

    //Try to place molecule's output
    this.placeAtom(
      {
        parentMolecule: this,
        x: 0.98,
        y: 0.5,
        parent: this,
        name: "Output",
        atomType: "Output",
        uniqueID: GlobalVariables.generateUniqueID(),
      },
      false
    );
    this.setValues(json); //Grab the values of everything from the passed object
    this.setValues(values); //Over write those values with the passed ones where needed

    if (json.allAtoms) {
      json.allAtoms.forEach((atom) => {
        //Place the atoms
        const promise = this.placeAtom(atom, false);
        promiseArray.push(promise);
      });
    }
    return Promise.all(promiseArray).then(() => {
      //Once all the atoms are placed we can finish
      this.setValues([]); //Call set values again with an empty list to trigger loading of IO values from memory

      if (this.topLevel) {
        GlobalVariables.totalAtomCount = GlobalVariables.numberOfAtomsToLoad;
      }

      //Place the connectors, skipping null/undefined
      if (json.allConnectors) {
        json.allConnectors.forEach((connector) => {
          if (connector) {
            this.placeConnector(connector);
          }
        });
      }

      // Reset variable name subscriptions now that all atoms are placed.
      this.nodesOnTheScreen.forEach((atom) => {
        atom.inputs.forEach((ap) => {
          ap.subscribeToVariablesInEquation(ap.currentEquation);
        });
      });

      const outputAtom = this.getOutputAtom();
      outputAtom.subscribe(
        () => {
          this.onUpstreamChange();
        },
        this.uniqueID,
        false
      );
      if (GlobalVariables.currentMolecule === this || forceEnable) {
        this.enable(); // Enable self and all child nodes upstream of output.
      }
      if (GlobalVariables.currentMolecule === this) {
        this.enableAllChildren(); // For the currently rendered molecule, also
        // enable all children visible on the screen
      }

      return this;
    });
  }

  enable() {
    // Override default enable behavior. Instead of propagating to our inputs, the molecule
    // diverts enable calls into it's child tree of atoms.
    // The input atoms within our tree will push the enable call back up to the input
    // atoms at this level (ie to this.inputs).
    if (this.status !== Status.DISABLED) {
      return false;
    }
    this.setWaiting();
    const outputAtom = this.getOutputAtom();
    if (outputAtom) {
      outputAtom.enable();
    }
    return true;
  }

  disable() {
    this.setDisabled(false);
    this.nodesOnTheScreen.forEach((atom) => {
      atom.disable();
    });
  }

  /**
   * Get the list of all geometries used in this molecule and all sub-molecules in their current state.
   * Note that only values of "READY" status atoms are included.
   */
  deepGeomList() {
    let geomList = [];
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.status === Status.READY) {
        if (
          atom.atomType === "Molecule" ||
          atom.atomType === "GitHubMolecule"
        ) {
          // Recursively get geometries from sub-molecules
          const subGeomList = atom.deepGeomList();
          geomList = geomList.concat(subGeomList);
        } else {
          // exclude null values and string or numeric values (eg: from input or equation atoms)
          if (atom.value && atom.value instanceof Object) {
            geomList.push(atom.value);
          }
        }
      }
    });
    if (this.status === Status.READY && this.value) {
      geomList.push(this.value);
    }
    return geomList;
  }

  async recomputeAll() {
    this.disable();
    await GlobalVariables.cad.clearCache(this.getContext());
    this.enable();
    for (const atom of this.nodesOnTheScreen) {
      atom.enable();
    }
  }

  /**
   * Loads a project into this GitHub molecule from GitHub based on the passed GitHub object.
   * This function is async and execution time depends on project complexity and network speed.
   * @param {object} gitObj - An object containing the GitHub repository information (owner, repoName, etc).
   * @param {object} oldObject - (Optional) The previous atom object to recover IO values from.
   * @param {object} oldParentObjectConnectors - (Optional) Connectors from the parent object to remap.
   */
  async loadGithubMoleculeByName(
    gitObj,
    oldObject = {},
    oldParentObjectConnectors = [],
    position
  ) {
    let octokit = new Octokit();
    try {
      await octokit
        .request("GET /repos/{owner}/{repo}/contents/project.abundance", {
          owner: gitObj.owner,
          repo: gitObj.repoName,
        })
        .then(async (response) => {
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
            return;
          }
          let rawFileWithNewIds = this.remapIDs(rawFile);
          rawFileWithNewIds.atomType = "GitHubMolecule";

          //content will be base64 encoded
          let valuesToOverwriteInLoadedVersion = {};
          let newMoleculeUniqueID = GlobalVariables.generateUniqueID();

          //If there are stored io values to recover
          if (oldObject.ioValues != undefined) {
            valuesToOverwriteInLoadedVersion = {
              uniqueID: newMoleculeUniqueID,
              x: this.x,
              y: this.y,
              parentRepo: gitObj,
              topLevel: false,
              ioValues: oldObject.ioValues,
            };
          } else {
            let xPos = position ? position.x : 0.5;
            let yPos = position ? position.y : 0.6;

            valuesToOverwriteInLoadedVersion = {
              uniqueID: newMoleculeUniqueID,
              parentRepo: gitObj,
              x: xPos,
              y: yPos,
              topLevel: false,
            };
          }

          GlobalVariables.currentMolecule
            .placeAtom(
              rawFileWithNewIds,
              false,
              valuesToOverwriteInLoadedVersion
            )
            .then((placedAtom) => {
              oldParentObjectConnectors.forEach((connector) => {
                if (connector.ap1ID == oldObject.uniqueID) {
                  connector.ap1ID = newMoleculeUniqueID;
                  this.parent.placeConnector(connector);
                }
                if (connector.ap2ID == oldObject.uniqueID) {
                  connector.ap2ID = newMoleculeUniqueID;
                  this.parent.placeConnector(connector);
                }
              });
              // Once placed and connected, enable
              placedAtom.enable();
            });
        });
    } catch (error) {
      console.error("Error during API call:", error);
      throw new Error("Failed to load GitHub molecule: " + error.message);
    }
  }

  /** Gives new unique IDs to all atoms in a json object and remaps the connections with the attachment points */
  remapIDs(json) {
    let idPairs = {};

    // Helper function to recursively process nested atoms
    const processNestedAtoms = (obj) => {
      if (obj.allAtoms) {
        obj.allAtoms.forEach((atom) => {
          let oldID = atom.uniqueID;
          let newID = GlobalVariables.generateUniqueID();
          idPairs[oldID] = newID;
          atom.uniqueID = newID;

          // Recursively process any nested atoms (e.g., within GitHubMolecules)
          processNestedAtoms(atom);
        });
      }
    };

    // Always ensure the main atom/molecule gets a new ID if it doesn't already have one assigned
    if (json.uniqueID && !json.uniqueID.toString().startsWith("temp-new-")) {
      let oldMainID = json.uniqueID;
      let newMainID = GlobalVariables.generateUniqueID();
      idPairs[oldMainID] = newMainID;
      json.uniqueID = newMainID;
    }

    // Process all nested atoms recursively
    processNestedAtoms(json);

    // Helper function to recursively process connectors
    const processConnectors = (obj) => {
      if (obj.allConnectors) {
        obj.allConnectors.forEach((connector) => {
          if (connector.ap1ID && idPairs[connector.ap1ID]) {
            connector.ap1ID = idPairs[connector.ap1ID];
          }
          if (connector.ap2ID && idPairs[connector.ap2ID]) {
            connector.ap2ID = idPairs[connector.ap2ID];
          }
          // Also remap connector's own uniqueID if it exists
          if (connector.uniqueID) {
            connector.uniqueID = GlobalVariables.generateUniqueID();
          }
        });
      }

      // Process connectors in nested atoms recursively
      if (obj.allAtoms) {
        obj.allAtoms.forEach((atom) => processConnectors(atom));
      }
    };

    // Handle all connectors recursively
    processConnectors(json);

    return json;
  }

  /**
   * Override the addIO function from atom.js.
   *
   * molecule.js holds a list of inputs but we don't want to subscribe to them here.
   * Instead we just keep the list and Input type atom within this molecule
   * subscribes to the relevant APs (which provide either user entered values or
   * values from a higher-order molecule).
   *
   * Constructs a new AP and returns it, does not subscribe to changes.
   * The caller is responsible for calling updateIO and removeIO on `this` as needed.
   */
  addIO(name, valueType, defaultValue = undefined, type = "input") {
    return this._addIOWithoutSubscribing(name, valueType, defaultValue, type);
  }

  /**
   * Delete this molecule and everything in it.
   */
  deleteNode(backgroundClickAfter = true, deletePath = true, silent = false) {
    //make a copy of the nodes on the screen array since we will be modifying it
    const copyOfNodesOnTheScreen = [...this.nodesOnTheScreen];

    copyOfNodesOnTheScreen.forEach((atom) => {
      atom.deleteNode(backgroundClickAfter, deletePath, silent);
    });
    super.deleteNode(backgroundClickAfter, deletePath, silent);
  }

  /**
   * Finds selected atoms with geometry outputs
   * @returns {Array} Array of atoms that are selected and have geometry outputs
   */
  findSelectedAtomsWithGeometryOutput() {
    return this.nodesOnTheScreen.filter((atom) => {
      return (
        atom.selected && atom.output && atom.output.valueType === "geometry"
      );
    });
  }

  /**
   * Finds the first available geometry input on an atom
   * @param {object} atom - The atom to search for geometry inputs
   * @returns {object|null} The first available geometry input or null if none found
   */
  findFirstAvailableGeometryInput(atom) {
    if (!atom.inputs) return null;

    return (
      atom.inputs.find((input) => {
        return input.valueType === "geometry" && input.connectors.length === 0;
      }) || null
    );
  }

  /**
   * Auto-creates connector from selected atom with geometry output to new atom with geometry input
   * @param {object} newAtom - The newly placed atom
   */
  async autoCreateConnector(newAtom) {
    // Find selected atoms with geometry outputs
    const selectedGeometryAtoms = this.findSelectedAtomsWithGeometryOutput();

    if (selectedGeometryAtoms.length === 0) {
      return; // No selected atoms with geometry outputs
    }

    // Find first available geometry input on the new atom
    const geometryInput = this.findFirstAvailableGeometryInput(newAtom);

    if (!geometryInput) {
      return; // New atom doesn't have an available geometry input
    }

    // Use the first selected atom with geometry output (could be enhanced to be smarter)
    const sourceAtom = selectedGeometryAtoms[0];

    // Create connector using the existing placeConnector logic
    this.placeConnector({
      ap1ID: sourceAtom.uniqueID,
      ap2ID: newAtom.uniqueID,
      ap2Name: geometryInput.name,
    });
  }

  /**
   * Places a new atom inside the molecule
   * @param {object} newAtomObj - An object defining the new atom to be placed
   * @param {array} moleculeList - Only passed if we are placing an instance of Molecule.
   * @param {object} typesList - A dictionary of all of the available types with references to their constructors
   * @param {boolean} unlock - A flag to indicate if this atom should spawn in the unlocked state.
   */
  async placeAtom(newAtomObj, unlock, values) {
    try {
      //If the input has a name and is a copy, we need to make sure it is unique so that the constructors adds IO
      if (
        GlobalVariables.isReferencableByName(newAtomObj) &&
        newAtomObj.name !== undefined &&
        unlock
      ) {
        newAtomObj.name = GlobalVariables.incrementVariableName(
          newAtomObj.atomType,
          this
        );
      }
      // Save undo state for user-initiated atom additions (unlock=true means user action)
      if (unlock && this === GlobalVariables.currentMolecule) {
        GlobalVariables.saveUndoState("ADD", `Added ${newAtomObj.atomType}`);
      }

      GlobalVariables.numberOfAtomsToLoad =
        GlobalVariables.numberOfAtomsToLoad + 1; //Indicate that one more atom needs to be loaded

      let promise = null;

      /* Fallback for deprecated join atom */
      if (newAtomObj.atomType == "Join") {
        newAtomObj.atomType = newAtomObj.unionType;
      }

      for (var key in GlobalVariables.availableTypes) {
        if (
          GlobalVariables.availableTypes[key].atomType == newAtomObj.atomType
        ) {
          newAtomObj.parent = this;
          var atom = new GlobalVariables.availableTypes[key].creator(
            newAtomObj
          );
          //If this is a molecule, de-serialize it
          if (
            atom.atomType == "Molecule" ||
            atom.atomType == "GitHubMolecule"
          ) {
            atom = await atom.deserialize(newAtomObj, values, unlock);
          }

          //reassign the name of the Inputs to preserve linking
          if (
            GlobalVariables.isReferencableByName(atom) &&
            typeof newAtomObj.name !== "undefined"
          ) {
            // For copied inputs (when unlock=true), apply name deduplication
            if (unlock) {
              atom.name = GlobalVariables.incrementVariableName(
                newAtomObj.name,
                this
              );
            } else {
              atom.name = newAtomObj.name; // Preserve exact name for normal loading
            }
            atom.type = newAtomObj.type;

            atom.draw(); //The poling happens in draw :roll_eyes:
          } else if (GlobalVariables.isReferencableByName(atom)) {
            atom.name = GlobalVariables.incrementVariableName(atom.name, this);
          }
          //If this is an output, check to make sure there are no existing outputs, and if there are delete the existing one because there can only be one
          if (atom.atomType == "Output") {
            //Check for existing outputs
            this.nodesOnTheScreen.forEach((atom) => {
              if (atom.atomType == "Output") {
                atom.deleteOutputAtom(false); //Remove them
              }
            });
          }

          // Add the atom to the list to display
          this.nodesOnTheScreen.push(atom);

          if (unlock) {
            const flowCanvas = document.querySelector("#flow-canvas");
            if (!flowCanvas) {
              console.warn("Flow canvas element not found");
              return;
            }
            this.autoCreateConnector(atom);
            atom.selected = true; // TODO: this feels hacky. probably should forward to it's children?
            atom.enable(); // Enable the atom after placing it
            this.makeActiveAtom(flowCanvas, atom);
          }
        }
      }
      return promise ? promise : Promise.resolve(atom);
    } catch (err) {
      console.error("Unable to place entity...");
      console.warn(newAtomObj);
      console.warn(err);
      return Promise.resolve();
    }
  }
  /** Force mouse events for activeAtom selection that triggers menu */
  makeActiveAtom(flowCanvas, atom) {
    const rect = flowCanvas.getBoundingClientRect();
    const clientX = rect.left + GlobalVariables.widthToPixels(atom.x);
    const clientY = rect.top + GlobalVariables.heightToPixels(atom.y);

    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    });
    flowCanvas.dispatchEvent(down);

    const up = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 0,
    });
    flowCanvas.dispatchEvent(up);

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      button: 0,
    });
    flowCanvas.dispatchEvent(click);
  }
  /**
   * Places a new connector within the molecule
   * @param {object} connectorObj - An object representation of the connector specifying its inputs and outputs.
   */
  placeConnector(connectorObj) {
    if (!connectorObj) {
      console.warn("placeConnector called with null or undefined connectorObj");
      return;
    }
    var outputAttachmentPoint = false;
    var inputAttachmentPoint = false;

    this.nodesOnTheScreen.forEach((atom) => {
      //Check each atom on the screen
      if (atom.uniqueID == connectorObj.ap1ID) {
        //When we have found the output atom
        outputAttachmentPoint = atom.output;
      }
      if (atom.uniqueID == connectorObj.ap2ID) {
        //When we have found the input atom
        atom.inputs.forEach((input) => {
          //Check each of its inputs
          if (input.name == connectorObj.ap2Name) {
            inputAttachmentPoint = input; //Until we find the one with the right name
          }
        });
      }
    });

    if (outputAttachmentPoint && inputAttachmentPoint) {
      //If we have found the output and input

      // Check if there are existing connections to the input and if they should be replaced
      if (inputAttachmentPoint.connectors.length > 0) {
        // Check type compatibility before replacement
        if (
          AttachmentPoint.areTypesCompatible(
            outputAttachmentPoint,
            inputAttachmentPoint
          )
        ) {
          // Save undo state before replacing connection during project loading
          GlobalVariables.saveUndoState(
            "MODIFY",
            `Connection replacement during load: ${outputAttachmentPoint.parentMolecule.name} → ${inputAttachmentPoint.parentMolecule.name}.${inputAttachmentPoint.name}`
          );

          // Remove existing connections
          const connectorsToRemove = [...inputAttachmentPoint.connectors];
          connectorsToRemove.forEach((existingConnector) => {
            existingConnector.deleteSelf(true); // silent deletion
          });
        } else {
          console.warn("Cannot place connector: incompatible types");
          return;
        }
      }

      // Ensure attachment points have correct positions during project loading
      // Update output attachment point position
      outputAttachmentPoint.y = outputAttachmentPoint.parentMolecule.y;
      if (outputAttachmentPoint.parentMolecule.atomType == "Input") {
        outputAttachmentPoint.x = GlobalVariables.atomSize * 3.5;
      } else {
        outputAttachmentPoint.x =
          outputAttachmentPoint.parentMolecule.x +
          outputAttachmentPoint.parentMolecule.radius;
      }
      [outputAttachmentPoint.x, outputAttachmentPoint.y] =
        GlobalVariables.constrainToCanvasBorders(
          outputAttachmentPoint.x,
          outputAttachmentPoint.y
        );

      // Update input attachment point position
      inputAttachmentPoint.y = inputAttachmentPoint.parentMolecule.y;
      inputAttachmentPoint.x =
        inputAttachmentPoint.parentMolecule.x -
        inputAttachmentPoint.parentMolecule.radius;
      [inputAttachmentPoint.x, inputAttachmentPoint.y] =
        GlobalVariables.constrainToCanvasBorders(
          inputAttachmentPoint.x,
          inputAttachmentPoint.y
        );

      new Connector({
        atomType: "Connector",
        attachmentPoint1: outputAttachmentPoint,
        attachmentPoint2: inputAttachmentPoint,
      });
    } else {
      console.warn("Unable to place connector");
    }
  }

  logState() {
    const state = {};
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.atomType == "Molecule" || atom.atomType == "GitHubMolecule") {
        state[atom.uniqueID] = atom.logState();
      } else {
        state[atom.uniqueID] = {
          type: atom.atomType,
          status: atom.status,
          value: atom.value,
          subs: Object.keys(atom.subscribers),
        };
      }
    });
    return state;
  }

  /**
   * Get the path from the top-level molecule to the current molecule
   * @returns {string[]} Array of molecule names representing the path
   */
  getMoleculePath() {
    const path = [];
    let currentMolecule = GlobalVariables.currentMolecule;

    // Build path from current molecule back to top level
    while (currentMolecule && !currentMolecule.topLevel) {
      path.unshift(currentMolecule.name);
      currentMolecule = currentMolecule.parent;
    }

    // Add the top level molecule name if it exists
    if (currentMolecule && currentMolecule.topLevel) {
      path.unshift(currentMolecule.name);
    }

    return path;
  }

  /**
   * Navigate to a specific molecule path
   * @param {string[]} moleculePath - Array of molecule names representing the path
   */
  navigateToMoleculePath(moleculePath) {
    // Start from the top level molecule
    GlobalVariables.currentMolecule = GlobalVariables.topLevelMolecule;

    // If the path is empty or only contains the top level, we're done
    if (moleculePath.length <= 1) {
      GlobalVariables.currentMolecule.enableAllChildren();
      return;
    }

    // Navigate through the path (skip the first element which is the top level)
    for (let i = 1; i < moleculePath.length; i++) {
      const targetMoleculeName = moleculePath[i];
      let foundMolecule = null;

      // Look for a molecule with the target name in the current molecule's nodes
      if (GlobalVariables.currentMolecule.nodesOnTheScreen) {
        foundMolecule = GlobalVariables.currentMolecule.nodesOnTheScreen.find(
          (atom) =>
            (atom.atomType === "Molecule" ||
              atom.atomType === "GitHubMolecule") &&
            atom.name === targetMoleculeName
        );
      }

      if (foundMolecule) {
        // Navigate into this molecule
        GlobalVariables.currentMolecule = foundMolecule;
        GlobalVariables.currentMolecule.enableAllChildren();
      } else {
        // If we can't find a molecule in the path, stop at the current level
        console.warn(
          `Cannot find molecule "${targetMoleculeName}" in path, stopping navigation at current level`
        );
        break;
      }
    }
  }
}
