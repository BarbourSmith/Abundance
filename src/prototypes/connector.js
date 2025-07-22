import GlobalVariables from "../js/globalvariables.js";

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

    this.attachmentPoint1.connectors.push(this); //Give input and output references to the connector
    if (this.attachmentPoint2 != null) {
      this.attachmentPoint2.connectors.push(this);
    }
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
        molecule.inputs.forEach((attachmentPoint) => {
          //For each of their attachment points
          if (attachmentPoint.wasConnectionMade(x, y) && !attachmentMade) {
            /** Prevent it from connecting to itself  */
            if (
              this.attachmentPoint1.parentMolecule !==
              attachmentPoint.parentMolecule
            ) {
              //Check to make sure we haven't already attached somewhere else
              attachmentMade = true;
              this.attachmentPoint2 = attachmentPoint;
              attachmentPoint.attach(this);
              this.propogate();
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
          const dist = GlobalVariables.distBetweenPoints(x, xInPixels, y, yInPixels);
          const radiusInPixels = GlobalVariables.widthToPixels(atom.radius);
          
          // If mouse is over the atom and we haven't made a connection yet
          if (dist <= radiusInPixels && !attachmentMade) {
            // Ensure we're not trying to connect to the same atom
            if (this.attachmentPoint1.parentMolecule !== atom) {
              // Find the first available input attachment point
              for (let i = 0; i < atom.inputs.length; i++) {
                const input = atom.inputs[i];
                // Check if this input has no connectors and is an input type
                if (input.type === "input" && input.connectors.length === 0) {
                  attachmentMade = true;
                  this.attachmentPoint2 = input;
                  input.attach(this);
                  this.propogate();
                  break; // Stop after finding the first available input
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
                inputName = GlobalVariables.incrementVariableName(inputName, atom);
                
                // Create a new Input atom within the target molecule
                const newInputAtom = new GlobalVariables.availableTypes.input.creator({
                  atomType: "Input",
                  name: inputName,
                  parent: atom,
                  parentMolecule: atom,
                  x: atom.x - 0.15, // Position to the left of the molecule
                  y: atom.y,
                  uniqueID: GlobalVariables.generateUniqueID(),
                  type: "geometry" // Default type, can be changed later
                });
                
                // Add the new input atom to the molecule's nodes
                atom.nodesOnTheScreen.push(newInputAtom);
                
                // The Input constructor automatically creates an input attachment point on the parent molecule
                // Find this newly created input attachment point on the target molecule
                const newInputAP = atom.inputs.find(input => 
                  input.name === inputName && input.type === "input" && input.connectors.length === 0
                );
                
                if (newInputAP) {
                  attachmentMade = true;
                  this.attachmentPoint2 = newInputAP;
                  newInputAP.attach(this);
                  this.propogate();
                }
              }
            }
          }
        });
      }
      
      // If no attachment point was found or connection was made, delete the connector
      if (!attachmentMade) {
        this.deleteSelf();
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

  /**
   * Called when any key is pressed. If the key is delete or backspace and the connector is selected then the connector is deleted.
   * @param {string} key - The key which was pressed
   */
  keyPress(key) {
    if (this.selected) {
      if (["Delete", "Backspace"].includes(key)) {
        this.deleteSelf();
      }
    }
  }

  /**
   * Deletes the connector by calling its attachmentPoints to tell them to delete their references to this connector.
   */
  deleteSelf(silent = false) {
    //Remove this connector from the output it is attached to
    this.attachmentPoint1.deleteConnector(this);

    //Free up the input to which this was attached
    if (this.attachmentPoint2 != null) {
      this.attachmentPoint2.deleteConnector(this);
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
        ap2Primary: this.attachmentPoint2.primary,
        ap1ID: this.attachmentPoint1.parentMolecule.uniqueID,
        ap2ID: this.attachmentPoint2.parentMolecule.uniqueID,
      };
      return object;
    }
  }

  /**
   * Passes a lock call to the connected input.
   */
  waitOnComingInformation() {
    if (this.attachmentPoint2) {
      this.attachmentPoint2.waitOnComingInformation();
    }
  }

  /**
   * Pass the value of the attached output to the attached input
   */
  propogate() {
    //takes the input and passes it to the output
    if (this.attachmentPoint1.ready && this.attachmentPoint2) {
      this.attachmentPoint2.setValue(this.attachmentPoint1.getValue());
    }
  }

  /**
   * Used to walk back out the tree generating a list of constants...used for evolve
   */
  walkBackForConstants(callback) {
    this.attachmentPoint1.parentMolecule.walkBackForConstants(callback);
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
