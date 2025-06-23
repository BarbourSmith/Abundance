import Atom from "../prototypes/atom.js";
import Connector from "../prototypes/connector.js";
import GlobalVariables from "../js/globalvariables.js";
import { button } from "leva";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import { BOMEntry } from "../js/BOM";
import globalvariables from "../js/globalvariables.js";
import { LevaInputs } from "leva";

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
     * An array of the molecules inputs. Is this not inherited from atom?
     * @type {array}
     */
    this.inputs = [];
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

    this.setValues(values);

    this.color;
  }

  /**
   * Gives this molecule inputs with the same names as all of it's parent's inputs
   */
  copyInputsFromParent() {
    if (this.parent) {
      this.parent.nodesOnTheScreen.forEach((node) => {
        if (node.atomType == "Input") {
          this.placeAtom(
            {
              parentMolecule: this,
              y: node.y,
              parent: this,
              name: node.name,
              atomType: "Input",
              uniqueID: GlobalVariables.generateUniqueID(),
            },
            true
          );
        }
      });
    }
  }

  /**
   * Add the center dot to the molecule
   */
  draw() {
    const percentLoaded = 1 - this.toProcess / this.totalAtomCount;
    if (this.toProcess > 1) {
      this.processing = true;
    } else {
      this.processing = false;
    }

    super.draw(); //Super call to draw the rest

    //draw the circle in the middle
    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = this.centerColor;
    GlobalVariables.c.moveTo(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y)
    );
    GlobalVariables.c.arc(
      GlobalVariables.widthToPixels(this.x),
      GlobalVariables.heightToPixels(this.y),
      GlobalVariables.widthToPixels(this.radius) / 2,
      0,
      percentLoaded * Math.PI * 2,
      false
    );
    GlobalVariables.c.closePath();
    GlobalVariables.c.fill();
  }

  /**
   * Create Leva Menu Input - returns to ParameterEditor
   */
  createLevaInputs() {
    let inputParams = {};
    inputParams["molecule name" + this.uniqueID] = {
      value: this.topLevel ? GlobalVariables.currentRepoName : this.name,
      label: "Molecule Name",
      disabled: this.topLevel ? true : false,
      onChange: (value) => {
        this.name = value;
      },
    };
    if (this.topLevel == true) {
      inputParams["molecule name" + this.uniqueID + "units"] = {
        value: this.unitsKey,
        label: "Project Units",
        options: Object.keys(this.units),
        disabled: false,
        onChange: (value) => {
          this.unitsKey = this.units[value];
        },
      };
    }
    /** Runs through active atom inputs and adds IO parameters to default param*/
    if (this.inputs) {
      this.inputs.map((input) => {
        const checkConnector = () => {
          return input.connectors.length > 0;
        };

        /* Makes inputs for Io's other than geometry */

        inputParams[this.uniqueID + input.name] = {
          value: input.value,
          label: input.name,
          disabled: checkConnector(),
          onChange: (value) => {
            if (input.value !== value) {
              input.setValue(value);
            }
          },
        };
        if (input.type && input.valueType) {
          inputParams[this.uniqueID + input.name].type =
            LevaInputs[input.valueType.toUpperCase()];
        }
        if (input.valueType == "geometry") {
          inputParams[this.uniqueID + input.name].disabled = true;
        }
      });
    }

    if (GlobalVariables.currentRepo.parentRepo != null && this.topLevel) {
      inputParams["Reload from Github"] = button(() => {
        //Future compare to main branch
        this.reloadFork();
      });
    }

    return inputParams;
  }

  createLevaExport() {
    let exportParams = {};
    const exportOptions = ["STL", "SVG", "STEP"];
    const exportAtoms = this.nodesOnTheScreen.filter(
      (node) => node.atomType === "Export"
    );

    exportAtoms.forEach((atom) => {
      const partName =
        atom.inputs.filter((input) => input.name === "Part Name")[0]?.value ||
        "Unnamed Part";
      exportParams[`Export ${partName}`] = button(() => {
        atom.exportFile();
        console.log(`Exporting: ${partName}`);
      });
    });

    const gcodeAtoms = this.nodesOnTheScreen.filter(
      (node) => node.atomType === "Gcode"
    );
    // this is wrong and only a placeholder for kiri forum questions
    gcodeAtoms.forEach((atom) => {
      exportParams[`Download Gcode – ${this.uniqueID}`] = button(() =>
        atom.clickKiriButton()
      );
    });

    return exportParams;
  }

  async reloadFork() {
    const octokit = new Octokit();
    let parent = GlobalVariables.currentRepo.parentRepo.split("/");
    let parentOwner = parent[0];
    let parentRepo = parent[1];
    octokit
      .request("GET /repos/{owner}/{repo}", {
        owner: parentOwner,
        repo: parentRepo,
      })
      .then((response) => {
        octokit.rest.repos
          .getContent({
            owner: response.data.owner.login,
            repo: response.data.name,
            path: "project.abundance",
          })
          .then((response) => {
            // Delete nodes so deserialize doesn't repeat, could be useful to not delete for a diff in the future

            GlobalVariables.topLevelMolecule.nodesOnTheScreen.forEach(
              (atom) => {
                atom.deleteNode();
              }
            );
            let rawFile = JSON.parse(atob(response.data.content));

            if (rawFile.filetypeVersion == 1) {
              GlobalVariables.topLevelMolecule.deserialize(rawFile);
            }
            GlobalVariables.currentMolecule.selected = true;
          });
      });
  }

  /**
   * Computes and returns an array of BOMEntry objects after looking at the tags of a geometry.*/
  async extractBomTags() {
    var tag = "BOMitem";
    let bomlist = await GlobalVariables.cad.extractBomList(this.output.value);
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
      GlobalVariables.currentMolecule = this; //set this to be the currently displayed molecule

      /**
       * Deselects Atom
       * @type {boolean}
       */
      this.selected = false;
      clickProcessed = true;
    }

    return clickProcessed;
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
   * Takes an array of recently deleted atoms
   */
  undo() {
    if (GlobalVariables.recentMoleculeRepresentation.length > 0) {
      let rawFile = JSON.parse(
        GlobalVariables.recentMoleculeRepresentation.pop()
      );
      const nodesCopy = [...GlobalVariables.topLevelMolecule.nodesOnTheScreen];
      // Delete nodes so deserialize doesn't repeat, could be useful to not delete for a diff in the future
      nodesCopy.forEach((atom, index) => {
        atom.deleteNode();
      });

      if (rawFile.fileTypeVersion == 1) {
        GlobalVariables.topLevelMolecule.deserialize(rawFile);
      }
      GlobalVariables.currentMolecule.selected = true;
    }
  }

  /**
   * Unselect this molecule
   */
  deselect() {
    this.selected = false;
  }

  /**
   * Grab values from the inputs and push them out to the input atoms.
   */
  updateValue(targetName) {
    //Molecules are fully transparent so we don't wait for all of the inputs to begin processing the things inside
    this.nodesOnTheScreen.forEach((atom) => {
      //Scan all the input atoms
      if (atom.atomType == "Input" && atom.name == targetName) {
        atom.updateValue(); //Tell that input to update it's value
      }
    });
  }

  compileBom() {
    let compiled = this.extractBomTags().then((result) => {
      let bomList = [];
      let compileBomItems = [];
      if (result) {
        result.forEach(function (bomElement) {
          if (bomElement.BOMitemName) {
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
            bomList[bomElement.BOMitemName].costUSD += bomElement.costUSD;
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
    bomContent = bomContent + "\n\n 3xCOG MSRP: $" + (3 * totalCost).toFixed(2);
    return bomContent;
  }

  createLevaBom() {
    let bomParams = {};
    if (this.compiledBom) {
      if (this.compiledBom.length > 0) {
        this.compiledBom.map((item) => {
          bomParams[item.BOMitemName] = {
            value: item.numberNeeded,
            label: item.BOMitemName + " x",
            disabled: true,
          };
        });
        bomParams["Download List of Materials"] = button(() => {
          var fileName =
            GlobalVariables.currentRepoName + "-Bill-of-Materials.txt";
          var fileContent = this.formatBom();
          var myFile = new Blob([fileContent], { type: "text/plain" });

          saveAs(myFile, fileName + "." + "txt");
        });

        return bomParams;
      }
    }
  }

  /**
   * Reads molecule's output atom ID to recompute the molecule in worker
   */
  recomputeMolecule(outputID) {
    //super.updateValue();
    console.log("recompute");

    try {
      this.processing = true;
      const centeredText = document.querySelector(".loading");
      centeredText.style.display = "flex";

      GlobalVariables.cad.molecule(this.uniqueID, outputID).then(() => {
        //If we're currently inside this molecule, we don't want to pass the update to the next level until we leave
        if (GlobalVariables.currentMolecule !== this) {
          this.basicThreadValueProcessing();
        } else {
          this.awaitingPropagationFlag = true;
        }

        this.compileBom().then((result) => {
          this.compiledBom = result;
        });
        if (this.selected) {
          this.sendToRender();
        }
      });
    } catch (err) {
      this.setAlert(err);
    }
  }

  /**
   * Sets atoms to wait on coming information.
   */
  waitOnComingInformation(inputName) {
    this.nodesOnTheScreen.forEach((atom) => {
      if (atom.name == inputName) {
        atom.waitOnComingInformation();
      }
    });
  }

  /**
   * Called when this molecules value changes
   */
  propagate() {
    try {
      this.updateValue();
      const loadingDots = document.querySelector(".loading");
      loadingDots.style.display = "none";
    } catch (err) {
      this.setAlert(err);
    }
  }

  /**
   * Walks through each of the atoms in this molecule and begins Propagation from them if they have no inputs to wait for
   */
  beginPropagation(force = false) {
    //Tell every atom inside this molecule to begin Propagation
    this.nodesOnTheScreen.forEach((node) => {
      node.beginPropagation(force);
    });
    this.inputs.forEach((input) => {
      input.beginPropagation();
    });
  }

  /**
   * Walks through each of the atoms in this molecule and takes a census of how many there are and how many are currently waiting to be processed.
   */
  census() {
    this.totalAtomCount = 0;
    this.toProcess = 0;

    this.nodesOnTheScreen.forEach((atom) => {
      const newInformation = atom.census();
      this.totalAtomCount = this.totalAtomCount + newInformation[0];
      this.toProcess = this.toProcess + newInformation[1];
    });

    return [this.totalAtomCount, this.toProcess];
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
      //Push any changes up to the next level if there are any changes waiting in the output
      if (GlobalVariables.currentMolecule.awaitingPropagationFlag == true) {
        GlobalVariables.currentMolecule.basicThreadValueProcessing();
        GlobalVariables.currentMolecule.awaitingPropagationFlag = false;
      }

      GlobalVariables.currentMolecule = GlobalVariables.currentMolecule.parent; //set parent this to be the currently displayed molecule
    }
  }

  async generateProjectThumbnail() {
    //Generate a thumbnail for the project
    return GlobalVariables.cad.generateThumbnail(this.uniqueID);
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
    thisAsObject.parentRepo = this.parentRepo;
    thisAsObject.unitsKey = this.unitsKey;
    thisAsObject.fileTypeVersion = 1;
    thisAsObject.compiledBom = this.compiledBom;

    return thisAsObject;
  }

  /**
   * Load the children of this from a JSON representation
   * @param {object} json - A json representation of the molecule
   * @param {object} values - An array of values to apply to this molecule before de-serializing it's contents. Used by githubmolecules to set top level correctly
   */
  deserialize(json, values = {}, forceBeginPropagation = false) {
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

        this.setValues([]); //Call set values again with an empty list to trigger loading of IO values from memory
      });
    }
    return Promise.all(promiseArray).then(() => {
      //Once all the atoms are placed we can finish
      this.setValues([]); //Call set values again with an empty list to trigger loading of IO values from memory

      if (this.topLevel) {
        GlobalVariables.totalAtomCount = GlobalVariables.numberOfAtomsToLoad;

        this.census();

        this.beginPropagation(forceBeginPropagation);
      }

      //Place the connectors
      if (json.allConnectors) {
        json.allConnectors.forEach((connector) => {
          this.placeConnector(connector);
        });
      }
    });
  }
  /**
   * Loads a project into this GitHub molecule from github based on the passed github ID. This function is async and execution time depends on project complexity, and network speed.
   * @param {number} id - The GitHub project ID for the project to be loaded.
   */
  async loadGithubMoleculeByName(
    item,
    oldObject = {},
    oldParentObjectConnectors = {}
  ) {
    let octokit = new Octokit();
    await octokit
      .request("GET /repos/{owner}/{repo}/contents/project.abundance", {
        owner: item.owner,
        repo: item.repoName,
      })
      .then((response) => {
        let rawFile = JSON.parse(atob(response.data.content));
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
            parentRepo: item,
            topLevel: false,
            ioValues: oldObject.ioValues,
          };
        } else {
          let xPos = 0.5;
          let yPos = 0.6;
          //If there's no last click default to middle of screen
          if (GlobalVariables.lastClick) {
            xPos = GlobalVariables.pixelsToWidth(GlobalVariables.lastClick[0]);
            yPos = GlobalVariables.pixelsToHeight(GlobalVariables.lastClick[1]);
          }
          valuesToOverwriteInLoadedVersion = {
            uniqueID: newMoleculeUniqueID,
            parentRepo: item,
            x: xPos,
            y: yPos,
            topLevel: false,
          };
        }

        GlobalVariables.currentMolecule
          .placeAtom(rawFileWithNewIds, true, valuesToOverwriteInLoadedVersion)
          .then(() => {
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
          });
      });
  }

  /** Gives new unique IDs to all atoms in a json object and remaps the connections with the attachment points */
  remapIDs(json) {
    let idPairs = {};
    if (json.allAtoms) {
      json.allAtoms.forEach((atom) => {
        let oldID = atom.uniqueID;
        let newID = GlobalVariables.generateUniqueID();
        idPairs[oldID] = newID;
        atom.uniqueID = newID;
      });
      json.allConnectors.forEach((connector) => {
        if (connector.ap1ID && idPairs[connector.ap1ID]) {
          connector.ap1ID = idPairs[connector.ap1ID];
        }
        if (connector.ap2ID && idPairs[connector.ap2ID]) {
          connector.ap2ID = idPairs[connector.ap2ID];
        }
        if (connector.ap2ID && idPairs[connector.ap2ID]) {
          connector.ap2ID = idPairs[connector.ap2ID];
        }
      });

      return json;
    }
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
   * Places a new atom inside the molecule
   * @param {object} newAtomObj - An object defining the new atom to be placed
   * @param {array} moleculeList - Only passed if we are placing an instance of Molecule.
   * @param {object} typesList - A dictionary of all of the available types with references to their constructors
   * @param {boolean} unlock - A flag to indicate if this atom should spawn in the unlocked state.
   */
  async placeAtom(newAtomObj, unlock, values) {
    try {
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
            promise = atom.deserialize(newAtomObj, values, true);

            if (unlock) {
              atom.beginPropagation();
            }
          }

          //reassign the name of the Inputs to preserve linking
          if (
            atom.atomType == "Input" &&
            typeof newAtomObj.name !== "undefined"
          ) {
            // For copied inputs (when unlock=true), apply name deduplication
            if (unlock) {
              atom.name = GlobalVariables.incrementVariableName(newAtomObj.name, this);
            } else {
              atom.name = newAtomObj.name; // Preserve exact name for normal loading
            }
            atom.type = newAtomObj.type;
            atom.draw(); //The poling happens in draw :roll_eyes:
          } else if (atom.atomType == "Input") {
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
            //Make this molecule spawn with all of it's parent's inputs
            if (atom.atomType == "Molecule") {
              //Not GitHubMolecule
              atom.copyInputsFromParent();

              //Make begin propagation from an atom when it is placed. This is used when copy and pasting molecules.
              if (promise != null) {
                promise.then(() => {
                  atom.beginPropagation();
                });
              } else {
                atom.beginPropagation();
              }
            }

            atom.updateValue();
            const flowCanvas = document.querySelector("#flow-canvas");
            if (!flowCanvas) {
              console.warn("Flow canvas element not found");
              return;
            }
            const mouseDownEvent = new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              clientX: GlobalVariables.widthToPixels(atom.x),
              clientY: GlobalVariables.heightToPixels(atom.y),
            });
            flowCanvas.dispatchEvent(mouseDownEvent);

            const mouseUpEvent = new MouseEvent("mouseup", {
              bubbles: true,
              cancelable: true,
              clientX: GlobalVariables.widthToPixels(atom.x),
              clientY: GlobalVariables.heightToPixels(atom.y),
            });
            flowCanvas.dispatchEvent(mouseUpEvent);
          }
        }
      }
      return promise;
    } catch (err) {
      console.warn("Unable to place: " + newAtomObj);
      console.warn(err);
      return Promise.resolve();
    }
  }
  /**
   * Places a new connector within the molecule
   * @param {object} connectorObj - An object representation of the connector specifying its inputs and outputs.
   */
  placeConnector(connectorObj) {
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
      new Connector({
        atomType: "Connector",
        attachmentPoint1: outputAttachmentPoint,
        attachmentPoint2: inputAttachmentPoint,
      });
    } else {
      console.warn("Unable to place connector");
    }
  }

  sendToRender() {
    //Send code to JSxCAD to render
    //console.log(this);
    GlobalVariables.writeToDisplay(this.uniqueID);
  }
}
