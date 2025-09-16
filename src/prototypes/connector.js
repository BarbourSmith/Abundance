import GlobalVariables from "../js/globalvariables.js";
import AttachmentPoint from "./attachmentpoint.js";
import { addOrDeletePorts } from "../js/alwaysOneFreeInput.js";

/**
 * The connector class defines how an output can be connected to an input. It appears on the screen as a black line extending from an output to an input.
 */
export default class Connector {
  /**
   * The constructor function.
   * @param {object} values An array of values passed in which will be assigned to the class as this.x
   */
  constructor(values) {
    /**
     * True if the connector is currently being created and is in the process of extending
     * @type {boolean}
     */
    this.isMoving = false;
    /**
     * The connectors current color
     * @type {string}
     */
    this.color = "black";
    /**
     * The type of this connector
     * @type {string}
     */
    this.atomType = "Connector";
    /**
     * True if this connector has been selected
     * @type {boolean}
     */
    this.selected = false;
    /**
     * The first attachment point this connector is connected to (an ouput)
     * @type {object}
     */
    this.attachmentPoint1 = null;
    /**
     * The second attachment point this connector is connected to (an input)
     * @type {object}
     */
    this.attachmentPoint2 = null;

    for (var key in values) {
      /**
       * Assign each of the values in values as this.key
       */
      this[key] = values[key];
    }

    /**
     * The starting X cordinate for the connector. Should really be referenced to attachmentPoint1.
     * @type {number}
     */
    this.startX = this.attachmentPoint1.parentMolecule.outputX;
    /**
     * The starting Y cordinate for the connector. Should really be referenced to attachmentPoint1.
     * @type {number}
     */
    this.startY = this.attachmentPoint1.parentMolecule.y;

    if (this.attachmentPoint2) {
      this.endX = this.attachmentPoint2.parentMolecule.x;
      this.endY = this.attachmentPoint2.parentMolecule.y;
      this.attachmentPoint2.attach(this);
    }
    this.attachmentPoint1.attach(this);
  }

  /**
   * Draw the connector as a bezier curve on the screen
   */
  draw() {
    let startXInPixels = GlobalVariables.widthToPixels(this.startX);
    let startYInPixels = GlobalVariables.heightToPixels(this.startY);
    let endXInPixels = GlobalVariables.widthToPixels(this.endX);
    let endYInPixels = GlobalVariables.heightToPixels(this.endY);

    GlobalVariables.c.beginPath();
    GlobalVariables.c.fillStyle = this.color;
    GlobalVariables.c.strokeStyle = this.color;
    GlobalVariables.c.globalCompositeOperation = "destination-over"; //draw under other elements;
    if (this.selected) {
      GlobalVariables.c.lineWidth = 3;
    } else {
      GlobalVariables.c.lineWidth = 1;
    }
    GlobalVariables.c.moveTo(startXInPixels, startYInPixels);
    GlobalVariables.c.bezierCurveTo(
      startXInPixels + 100,
      startYInPixels,
      endXInPixels - 100,
      endYInPixels,
      endXInPixels,
      endYInPixels
    );
    GlobalVariables.c.stroke();
    GlobalVariables.c.globalCompositeOperation = "source-over"; //switch back to drawing on top
  }

  /**
   * clickUp checks to see if the mouse button has been released over an input attachment point. If it has then the connector is created there.
   * If the mouse is over an atom, it will connect to the first available input attachment point on that atom.
   * If not, then the connector is deleted.
   * @param {number} x - The x cordinate of the click
   * @param {number} y - The y cordinate of the click
   */
  clickUp(x, y) {
    if (this.isMoving) {
      //we only want to attach the connector which is currently moving
      var attachmentMade = false;

      // First, try the traditional way - check if mouse is directly over an input attachment point
      GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
        //For every molecule on the screen
        molecule.inputs.forEach((input) => {
          const attachmentPoint = input;
          //For each of their attachment points
          if (attachmentPoint.wasConnectionMade(x, y, this.attachmentPoint1) && !attachmentMade) {
            /** Prevent it from connecting to itself  */
            if (
              this.attachmentPoint1.parentMolecule !==
              attachmentPoint.parentMolecule
            ) {
              // If there are existing connections, remove them first
              if (attachmentPoint.connectors.length > 0) {
                // Save undo state before replacing connection
                GlobalVariables.saveUndoState("MODIFY", `Connection replacement: ${this.attachmentPoint1.parentMolecule.name} → ${attachmentPoint.parentMolecule.name}.${attachmentPoint.name}`);
                
                // Make a copy of the connectors array to avoid modification during iteration
                const connectorsToRemove = [...attachmentPoint.connectors];
                connectorsToRemove.forEach((existingConnector) => {
                  existingConnector.deleteSelf(true); // silent deletion to avoid value reset
                });
              }
              
              //Check to make sure we haven't already attached somewhere else
              attachmentMade = true;
              this.attachmentPoint2 = attachmentPoint;
              attachmentPoint.attach(this);
            }
          }
        });
      });

      // If no direct connection was made to an attachment point, check if we're over an atom
      if (!attachmentMade) {
        GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((atom) => {
          // Check if the mouse is over this atom
          const xInPixels = GlobalVariables.widthToPixels(atom.x);
          const yInPixels = GlobalVariables.heightToPixels(atom.y);
          const dist = GlobalVariables.distBetweenPoints(
            x,
            xInPixels,
            y,
            yInPixels
          );
          const radiusInPixels = GlobalVariables.widthToPixels(atom.radius);

          // If mouse is over the atom and we haven't made a connection yet
          if (dist <= radiusInPixels && !attachmentMade) {
            // Ensure we're not trying to connect to the same atom
            if (this.attachmentPoint1.parentMolecule !== atom) {
              // For fusion/assembly atoms that use alwaysOneFreeInput pattern,
              // ensure there's a free input available before trying to replace connections
              const isAlwaysOneFreeInputAtom = ["Fusion", "Assembly", "ShrinkWrap", "Loft", "Group"].includes(atom.atomType);
              
              if (isAlwaysOneFreeInputAtom) {
                // Ensure there's always a free input available for these atoms
                addOrDeletePorts(atom);
              }

              // Find the first compatible input attachment point
              for (let i = 0; i < atom.inputs.length; i++) {
                const input = atom.inputs[i];
                // Check if this input is compatible with our output
                if (input.type === "input") {
                  // Check if this input is available
                  if (input.connectors.length === 0) {
                    // Available input - check compatibility
                    if (AttachmentPoint.areTypesCompatible(this.attachmentPoint1, input)) {
                      attachmentMade = true;
                      this.attachmentPoint2 = input;
                      input.attach(this);
                      //  this.propogate();
                      break; // Stop after finding the first compatible input
                    }
                  }
                }
              }

              // Only attempt to replace existing connections if:
              // 1. No free input was found AND
              // 2. This is NOT an alwaysOneFreeInput atom (those should always have free inputs)
              if (!attachmentMade && !isAlwaysOneFreeInputAtom) {
                for (let i = 0; i < atom.inputs.length; i++) {
                  const input = atom.inputs[i];
                  if (input.type === "input" && input.connectors.length > 0) {
                    // Input has existing connections - check if we can replace them
                    if (AttachmentPoint.areTypesCompatible(this.attachmentPoint1, input)) {
                      // Save undo state before replacing connection
                      GlobalVariables.saveUndoState("MODIFY", `Connection replacement: ${this.attachmentPoint1.parentMolecule.name} → ${atom.name}.${input.name}`);
                      
                      // Remove existing connections
                      const connectorsToRemove = [...input.connectors];
                      connectorsToRemove.forEach((existingConnector) => {
                        existingConnector.deleteSelf(true); // silent deletion
                      });
                      
                      attachmentMade = true;
                      this.attachmentPoint2 = input;
                      input.attach(this);
                      //  this.propogate();
                      break; // Stop after making the replacement
                    }
                  }
                }
              }

              // If no available input was found and this is a molecule, create a new input
              if (!attachmentMade && atom.atomType === "Molecule") {
                // Determine the name for the new input
                let inputName = "input";

                // Special case: if the connector comes from an Input atom, use its name
                if (this.attachmentPoint1.parentMolecule.atomType === "Input") {
                  inputName = this.attachmentPoint1.parentMolecule.name;
                }

                // Ensure the name is unique within the target molecule
                inputName = GlobalVariables.incrementVariableName(
                  inputName,
                  atom
                );

                // Determine the type for the new input based on the source
                let inputType;
                if (this.attachmentPoint1.parentMolecule.atomType === "Input") {
                  // If source is an Input atom, inherit its type
                  inputType =
                    this.attachmentPoint1.parentMolecule.type ||
                    this.attachmentPoint1.valueType;
                } else {
                  // Otherwise, use the attachment point's valueType
                  inputType = this.attachmentPoint1.valueType;
                }

                // Create a new Input atom within the target molecule
                const newInputAtom =
                  new GlobalVariables.availableTypes.input.creator({
                    atomType: "Input",
                    name: inputName,
                    parent: atom,
                    parentMolecule: atom,
                    x: atom.x - 0.15, // Position to the left of the molecule
                    y: atom.y,
                    uniqueID: GlobalVariables.generateUniqueID(),
                    type: inputType, // Inherit type from source attachment point
                  });

                // Add the new input atom to the molecule's nodes
                atom.nodesOnTheScreen.push(newInputAtom);

                // The Input constructor automatically creates an input attachment point on the parent molecule
                // Find this newly created input attachment point on the target molecule
                const newInputAP = atom.inputs.find(
                  (input) =>
                    input.name === inputName &&
                    input.type === "input" &&
                    input.connectors.length === 0
                );

                if (newInputAP) {
                  attachmentMade = true;
                  this.attachmentPoint2 = newInputAP;
                  newInputAP.attach(this);
                  //   this.propogate();
                }
              }
            }
          }
        });
      }

      // If no attachment point was found or connection was made, delete the connector
      if (!attachmentMade) {
        this.attachmentPoint1.deleteConnector(this);
      }
      this.isMoving = false;
    }
  }

  /**
   * Handle movements of the mouse while connector is being created. As long as the mouse is pressed down,
   * the end of the connector stays attached to the mouse.
   * @param {number} x - The x cordinate of the click
   * @param {number} y - The y cordinate of the click
   */
  mouseMove(x, y) {
    if (this.isMoving == true) {
      /**
       * The s cordinate of the end of the connector.
       */
      this.endX = GlobalVariables.pixelsToWidth(x);
      /**
       * The y cordinate of the end of the connector.
       */
      this.endY = GlobalVariables.pixelsToHeight(y);
    }
  }

  getOtherAP(attachmentPoint) {
    if (attachmentPoint === this.attachmentPoint1) {
      return this.attachmentPoint2;
    } else if (attachmentPoint === this.attachmentPoint2) {
      return this.attachmentPoint1;
    }
    throw new Error("Invalid attachment point");
  }

  /**
   * Called when any key is pressed. If the key is delete or backspace and the connector is selected then the connector is deleted.
   * @param {string} key - The key which was pressed
   */
  keyPress(key) {
    // no op.
  }

  /**
   * Deletes the connector by calling its attachmentPoints to tell them to delete their references to this connector.
   */
  deleteSelf(silent = false) {
    //Remove this connector from the output it is attached to
    this.attachmentPoint1.deleteConnector(this, silent);

    //Free up the input to which this was attached
    if (this.attachmentPoint2 != null) {
      this.attachmentPoint2.deleteConnector(this, silent);
      if (!silent) {
        this.attachmentPoint2.setDefault();
      }
    }
  }

  /**
   * Generates an object used to save the connector.
   */
  serialize() {
    if (this.attachmentPoint2 != null) {
      var object = {
        ap1Name: this.attachmentPoint1.name,
        ap2Name: this.attachmentPoint2.name,
        ap1ID: this.attachmentPoint1.parentMolecule.uniqueID,
        ap2ID: this.attachmentPoint2.parentMolecule.uniqueID,
      };
      return object;
    }
  }

  /**
   * Computes the connectors position and draw it to the screen.
   */
  update() {
    this.startX = this.attachmentPoint1.x;
    this.startY = this.attachmentPoint1.y;
    if (this.attachmentPoint2) {
      //check to see if the attachment point is defined
      this.endX = this.attachmentPoint2.x;
      this.endY = this.attachmentPoint2.y;
    }
    this.draw();
  }
}
