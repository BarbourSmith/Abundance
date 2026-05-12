import GlobalVariables from "./globalvariables.js";

/**
 * Command that reverses deletion of one or more atoms.
 * Stores atom serializations and their connector topology so they can be
 * restored without triggering full project recomputation.
 */
export class DeleteAtomsCommand {
  constructor(atomSnapshots, connectorSnapshots, parentMolecule) {
    this.atomSnapshots = atomSnapshots; // array of atom.serialize() results
    this.connectorSnapshots = connectorSnapshots; // array of {ap1ID, ap2ID, ap2Name}
    this.parentMolecule = parentMolecule;
    this.description = `Delete ${atomSnapshots.length} atom${atomSnapshots.length !== 1 ? "s" : ""}`;
  }

  async undo() {
    GlobalVariables.isUndoing = true;
    try {
      // Re-place atoms without unlock (preserves IDs, no auto-connect, no cascading undo saves)
      for (const snapshot of this.atomSnapshots) {
        await this.parentMolecule.placeAtom(snapshot, false);
      }
      // Restore connectors between re-placed atoms and the rest of the graph
      for (const connData of this.connectorSnapshots) {
        this.parentMolecule.placeConnector(connData);
      }
      // Enable only the re-placed atoms; their downstream chain recomputes naturally
      for (const snapshot of this.atomSnapshots) {
        const atom = this.parentMolecule.nodesOnTheScreen.find(
          (a) => a.uniqueID === snapshot.uniqueID,
        );
        if (atom) atom.enable();
      }
    } finally {
      GlobalVariables.isUndoing = false;
    }
  }
}

/**
 * Command that reverses the addition of a single atom.
 * Stores only the atom's uniqueID — much cheaper than a full snapshot.
 */
export class AddAtomCommand {
  constructor(atomUniqueID, parentMolecule, description = "Add atom") {
    this.atomUniqueID = atomUniqueID;
    this.parentMolecule = parentMolecule;
    this.description = description;
  }

  async undo() {
    GlobalVariables.isUndoing = true;
    try {
      const atom = this.parentMolecule.nodesOnTheScreen.find(
        (a) => a.uniqueID === this.atomUniqueID,
      );
      if (atom) atom.deleteNode();
    } finally {
      GlobalVariables.isUndoing = false;
    }
  }
}

/**
 * Command that reverses a connector replacement.
 * Stores the old connector endpoints so the previous wiring can be restored
 * by reconnecting only the affected input — no full recomputation needed.
 */
export class ReplaceConnectionCommand {
  constructor(oldConnectors, newConnectorData, parentMolecule) {
    this.oldConnectors = oldConnectors; // array of {ap1ID, ap2ID, ap2Name}
    this.newConnectorData = newConnectorData; // {ap1ID, ap2ID, ap2Name}
    this.parentMolecule = parentMolecule;
    this.description =
      oldConnectors.length > 0 ? "Replace connection" : "Add connection";
  }

  async undo() {
    GlobalVariables.isUndoing = true;
    try {
      // Remove the new connector from the target input
      this.parentMolecule.nodesOnTheScreen.forEach((atom) => {
        if (atom.uniqueID === this.newConnectorData.ap2ID) {
          atom.inputs.forEach((input) => {
            if (input.name === this.newConnectorData.ap2Name) {
              [...input.connectors].forEach((c) => c.deleteSelf(true));
            }
          });
        }
      });
      // Restore the old connector(s)
      for (const connData of this.oldConnectors) {
        this.parentMolecule.placeConnector(connData);
      }
    } finally {
      GlobalVariables.isUndoing = false;
    }
  }
}

/**
 * Command that reverses the deletion of a single connector.
 * Stores the connector data so it can be restored via placeConnector().
 */
export class DeleteConnectorCommand {
  constructor(connectorData, parentMolecule) {
    this.connectorData = connectorData; // {ap1ID, ap2ID, ap2Name}
    this.parentMolecule = parentMolecule;
    this.description = "Delete connector";
  }

  async undo() {
    GlobalVariables.isUndoing = true;
    try {
      this.parentMolecule.placeConnector(this.connectorData);
    } finally {
      GlobalVariables.isUndoing = false;
    }
  }
}

/**
 * Command that reverses a parameter value change on an atom.
 * Consecutive changes to the same atom+field are merged so rapid typing
 * produces only a single undo step.
 *
 * @param {string} atomUniqueID - ID of the atom whose value changed
 * @param {object} parentMolecule - The molecule containing the atom
 * @param {string} fieldKey - Logical key for the field (used for merge detection)
 * @param {*} oldValue - The value before the change
 * @param {Function} applyOldValue - (atom, oldValue) => void  restores the value and triggers recomputation
 * @param {string} description - Human-readable label shown in undo notification
 */
export class ValueChangeCommand {
  constructor(
    atomUniqueID,
    parentMolecule,
    fieldKey,
    oldValue,
    applyOldValue,
    description,
  ) {
    this.atomUniqueID = atomUniqueID;
    this.parentMolecule = parentMolecule;
    this.fieldKey = fieldKey;
    this.oldValue = oldValue;
    this.applyOldValue = applyOldValue;
    this.description = description;
  }

  async undo() {
    GlobalVariables.isUndoing = true;
    try {
      const atom = this.parentMolecule.nodesOnTheScreen.find(
        (a) => a.uniqueID === this.atomUniqueID,
      );
      if (atom) {
        this.applyOldValue(atom, this.oldValue);
      }
    } finally {
      GlobalVariables.isUndoing = false;
    }
  }
}
