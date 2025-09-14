# Touch Screen Deletion Implementation Test Plan

## Overview
This document describes the implementation of touch screen deletion functionality for atoms and connectors in Abundance, addressing issue #860.

## Problem Statement
Previously, deletion of atoms and connectors was only possible via keyboard (Backspace/Delete keys), making it impossible for touch screen users to delete items.

## Solution
Added a "Delete" option to the existing circular menu that appears on long press (touch) or right-click (desktop).

## Implementation Details

### Files Modified
1. `src/js/NewMenu.js` - Added dynamic menu creation with delete option
2. `src/components/main-routes/flowCanvas.jsx` - Updated to call menu update before showing
3. `src/styles/menuIcons.css` - Added delete icon styling

### Key Functions Added

#### hasSelectedItems()
- Checks for selected atoms by iterating through `GlobalVariables.currentMolecule.nodesOnTheScreen`
- Checks for selected connectors by examining input attachment points
- Returns true if any items are selected

#### deleteSelectedItems()
- Replicates the exact logic from keyboard deletion (keyDown handler in flowCanvas.jsx)
- Calls `GlobalVariables.saveUndoState()` for undo functionality
- Populates `GlobalVariables.atomsSelected` via `copy()` method
- Deletes atoms by calling `deleteNode()` on selected items
- Deletes connectors by forwarding `keyPress("Delete")` to atoms

#### updateMenu()
- Dynamically reconfigures the circular menu before showing
- Adds "Delete" option at the top of menu when selected items exist
- Preserves all existing menu categories (Actions, Inputs, Tags, etc.)

## Testing Scenarios

### Scenario 1: No Items Selected
1. Long press on empty canvas area
2. **Expected**: Circular menu appears with standard options (Actions, Inputs, Tags, etc.)
3. **Expected**: No "Delete" option visible

### Scenario 2: Atom Selected
1. Click on an atom to select it (should turn dark/selected color)
2. Long press on canvas
3. **Expected**: Circular menu appears with "Delete" option at the top
4. Click "Delete" option
5. **Expected**: Selected atom is deleted, undo state is saved

### Scenario 3: Connector Selected  
1. Click on an input attachment point to select its connector (should turn thick/selected)
2. Long press on canvas
3. **Expected**: Circular menu appears with "Delete" option at the top
4. Click "Delete" option
5. **Expected**: Selected connector is deleted, undo state is saved

### Scenario 4: Multiple Items Selected
1. Select multiple atoms and/or connectors
2. Long press on canvas
3. **Expected**: Circular menu appears with "Delete" option at the top
4. Click "Delete" option
5. **Expected**: All selected items are deleted, undo state is saved

### Scenario 5: Desktop Compatibility
1. Right-click on canvas with selected items
2. **Expected**: Same behavior as touch long press - delete option appears
3. **Expected**: No regression in existing desktop functionality

## Technical Verification

### Code Flow
1. User triggers long press (500ms) or right-click
2. `cmenu.updateMenu()` is called in flowCanvas.jsx
3. `updateMenu()` calls `createMenuConfig()` in NewMenu.js
4. `createMenuConfig()` calls `hasSelectedItems()` to check for selections
5. If items are selected, delete option is added to menu configuration
6. `cmenu.config()` rebuilds the menu with new configuration
7. Menu is shown with appropriate options

### Deletion Logic Parity
The `deleteSelectedItems()` function exactly replicates the keyboard deletion logic:
```javascript
// Original keyboard logic (flowCanvas.jsx lines 140-160)
if (e.key == "Backspace" || e.key == "Delete") {
  GlobalVariables.saveUndoState("DELETE", "Deleted selected atoms");
  GlobalVariables.atomsSelected = [];
  GlobalVariables.currentMolecule.copy(); // Populates atomsSelected
  GlobalVariables.atomsSelected.forEach((item) => {
    // Delete each selected atom
  });
  GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
    molecule.keyPress(e.key); // Deletes selected connectors
  });
}

// New touch deletion logic (NewMenu.js)
const deleteSelectedItems = () => {
  GlobalVariables.saveUndoState("DELETE", "Deleted selected atoms");
  GlobalVariables.atomsSelected = [];
  GlobalVariables.currentMolecule.copy();
  GlobalVariables.atomsSelected.forEach((item) => {
    // Same deletion logic
  });
  GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
    molecule.keyPress("Delete"); // Same connector deletion
  });
};
```

## Verification Tests Passed
- ✅ Build: `npm run build` - No errors
- ✅ Unit Tests: `npm run unit` - All 131 tests pass
- ✅ Code Integration: Hot module reload shows changes load correctly
- ✅ Menu System: Circular menu configuration system accepts dynamic updates

## Expected User Experience
1. **Touch Users**: Can now delete items by selecting them and long pressing to access delete option
2. **Desktop Users**: Retain all existing functionality, with additional delete option in right-click menu
3. **Consistency**: Same deletion behavior across input methods (keyboard, touch, mouse)
4. **Discoverability**: Delete option only appears when relevant (items are selected)

## Benefits
- ✅ Solves the core issue: touch users can now delete atoms and connectors
- ✅ Non-breaking: All existing functionality preserved
- ✅ Consistent: Uses same deletion logic as keyboard input
- ✅ Discoverable: Delete option only appears when applicable
- ✅ Accessible: Works on both touch and desktop devices