import Atom from "../prototypes/atom.js";
import Connector from "../prototypes/connector.js";
import GlobalVariables from "../js/globalvariables.js";
//import saveAs from '../lib/FileSaver.js'

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
     * A flag to indicate if this molecule should simplify it's output.
     * @type {boolean}
     */
    this.simplify = false;
    /**
     * The threshold for simplification. This is the maximum fraction of vertices which will be removed.
     * @type {float}
     */
    this.threshold = 0.8;
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
     * A list of available units.
     * @type {object}
     */
    this.units = { MM: 1, Inches: 25.4 };
    /**
     * The index of the currently selected unit.
     * @type {array}
     */
    this.unitsIndex = 0;
    /**
     * List of BOM items.
     * @type {array}
     */
    this.BOMlist;

    this.setValues(values);
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
            null,
            GlobalVariables.availableTypes,
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
   * Create Leva Menu Inputs for BOM list  - returns to ParameterEditor - will be table or list of totals
   */
  createLevaBomInputs() {
    let bomParams = [];
    if (this.output.value != undefined) {
      bomParams = this.extractBomTags(this.output.value);

      bomParams.then((result) => {
        if (result) {
          if (result.length > 0) {
            result.map((item) => {
              bomParams[item.BOMitemName] = {
                value: item.BOMitemName,
                label: item.BOMitemName,
                disabled: false,
              };
            });
          } else {
            let item = result;
            bomParams[item.BOMitemName] = {
              value: item.BOMitemName,
              label: item.BOMitemName,
              disabled: false,
            };
          }
        }
      });
    }
    return bomParams;
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
          atom.serialize({ x: 0.03, y: 0.03 })
        );
      }
    });
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
    console.log("molecule value updating sending to worker");
    this.nodesOnTheScreen.forEach((atom) => {
      //Scan all the input atoms
      if (atom.atomType == "Input" && atom.name == targetName) {
        atom.updateValue(); //Tell that input to update it's value
      }
      if (atom.atomType == "Output") {
        console.log(atom);
      }
    });

    try {
      let outputID = this.readOutputID();
      GlobalVariables.cad.molecule(this.uniqueID, outputID).then(() => {
        this.basicThreadValueProcessing();
        console.log("sending to render in updateValue");
        this.sendToRender();
      });
    } catch (err) {
      this.setAlert(err);
    }
  }

  /**
   * Reads the ID of this molecule's output atom
   */
  readOutputID() {
    var returnOutputID = "";
    this.nodesOnTheScreen.forEach((atom) => {
      //If we have found this molecule's output atom use it to update the path here
      if (atom.atomType == "Output") {
        returnOutputID = atom.uniqueID;
      }
    });
    return returnOutputID;
  }

  /**
   * Sets the atom to wait on coming information. Basically a pass through, but used for molecules
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
   * Computes and returns an array of BOMEntry objects after looking at the tags of a geometry.*/
  extractBomTags() {
    try {
      var tag = "BOMitem";
      let bomList = GlobalVariables.cad.extractBom(this.output.value, tag);

      return bomList;
    } catch (err) {
      this.setAlert("Unable to read BOM");
    }
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
        GlobalVariables.currentMolecule.propagate();
        GlobalVariables.currentMolecule.awaitingPropagationFlag = false;
      }

      GlobalVariables.currentMolecule = GlobalVariables.currentMolecule.parent; //set parent this to be the currently displayed molecule
    }
  }

  /**
   * Check to see if any of this molecules children have contributions to make to the README file. Children closer to the top left will be applied first. TODO: No contribution should be made if it's just a title.
   */
  requestReadme() {
    var generatedReadme = super.requestReadme();

    var sortableAtomsList = this.nodesOnTheScreen;
    sortableAtomsList.sort(function (a, b) {
      return (
        GlobalVariables.distBetweenPoints(a.x, 0, a.y, 0) -
        GlobalVariables.distBetweenPoints(b.x, 0, b.y, 0)
      );
    });

    sortableAtomsList.forEach((atom) => {
      generatedReadme = generatedReadme.concat(atom.requestReadme());
    });

    //Check to see if any of the children added anything if not, remove the bit we added
    if (generatedReadme[generatedReadme.length - 1] == "## " + this.name) {
      generatedReadme.pop();
    }

    return generatedReadme;
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
    thisAsObject.fileTypeVersion = 1;
    thisAsObject.simplify = this.simplify;
    thisAsObject.unitsIndex = this.unitsIndex;

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
        this.loadTree(); //Walks back up the tree from this molecule loading input values from any connected atoms

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
   * Triggers the loadTree process from this molecules output
   */
  loadTree() {
    //We want to walk the tree from this's output and anything which has nothing coming out of it. Basically all the graph end points.
    this.nodesOnTheScreen.forEach((atom) => {
      //If we have found this molecule's output atom use it to update the path here
      if (atom.atomType == "Output") {
        atom.loadTree();
      }
      //If we have found an atom with nothing connected to it
      if (atom.output) {
        if (atom.output.connectors.length == 0) {
          atom.loadTree();
        }
      }
    });

    return this.path;
  }

  /**
   * Places a new atom inside the molecule
   * @param {object} newAtomObj - An object defining the new atom to be placed
   * @param {array} moleculeList - Only passed if we are placing an instance of Molecule.
   * @param {object} typesList - A dictionary of all of the available types with references to their constructors
   * @param {boolean} unlock - A flag to indicate if this atom should spawn in the unlocked state.
   */
  async placeAtom(newAtomObj, unlock) {
    try {
      GlobalVariables.numberOfAtomsToLoad =
        GlobalVariables.numberOfAtomsToLoad + 1; //Indicate that one more atom needs to be loaded

      let promise = null;

      for (var key in GlobalVariables.availableTypes) {
        if (
          GlobalVariables.availableTypes[key].atomType == newAtomObj.atomType
        ) {
          newAtomObj.parent = this;
          var atom = new GlobalVariables.availableTypes[key].creator(
            newAtomObj
          );

          //reassign the name of the Inputs to preserve linking
          if (
            atom.atomType == "Input" &&
            typeof newAtomObj.name !== "undefined"
          ) {
            atom.name = newAtomObj.name;
            atom.draw(); //The poling happens in draw :roll_eyes:
          }

          //If this is a molecule, de-serialize it
          if (atom.atomType == "Molecule") {
            promise = atom.deserialize(newAtomObj);
          }

          //If this is a github molecule load it from the web
          if (atom.atomType == "GitHubMolecule") {
            promise = await atom.loadProjectByID(atom.projectID);
            if (unlock) {
              atom.beginPropagation();
            }
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

          //Add the atom to the list to display
          this.nodesOnTheScreen.push(atom);
          // fakes a click on newly placed atom
          //atom.selected = false;

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
    try {
      GlobalVariables.writeToDisplay(this.uniqueID);
    } catch (err) {
      this.setAlert(err);
    }
  }
}
