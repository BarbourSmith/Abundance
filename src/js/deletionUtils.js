import GlobalVariables from "./globalvariables.js";

/**
 * Check if there are any selected atoms or connectors
 */
export const hasSelectedItems = () => {
  // Check for selected atoms
  const hasSelectedAtoms = GlobalVariables.currentMolecule.nodesOnTheScreen.some(atom => atom.selected);
  
  // Check for selected connectors by looking at all input attachment points
  const hasSelectedConnectors = GlobalVariables.currentMolecule.nodesOnTheScreen.some(atom => 
    atom.inputs.some(input => 
      input.connectors.some(connector => connector.selected)
    )
  );
  
  return hasSelectedAtoms || hasSelectedConnectors;
};

/**
 * Handle deletion of selected atoms and connectors (same logic as keyboard delete)
 */
export const deleteSelectedItems = () => {
  // Save undo state before deletion
  GlobalVariables.saveUndoState("DELETE", "Deleted selected atoms");

  // First, collect selected atoms for deletion
  GlobalVariables.atomsSelected = [];
  GlobalVariables.currentMolecule.copy(); // This populates atomsSelected with selected atoms

  // Delete selected atoms
  GlobalVariables.atomsSelected.forEach((item) => {
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((nodeOnTheScreen) => {
      if (nodeOnTheScreen.uniqueID == item.uniqueID) {
        nodeOnTheScreen.deleteNode();
      }
    });
  });

  // Delete selected connectors by forwarding keyPress to all atoms
  GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
    molecule.keyPress("Delete");
  });
};