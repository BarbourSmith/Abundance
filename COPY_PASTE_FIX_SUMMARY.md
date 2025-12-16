# Copy/Paste Functionality Fix - Summary

## Problem Statement
Users reported that copying and pasting nodes had several critical issues:
1. **Did not take into account mouse position** - Pasted atoms appeared at their original locations with only a tiny offset (0.05), making them hard to distinguish from the originals
2. **Pasted on top of other nodes** - The small offset caused overlapping
3. **Made weird connections** - Unintended connections were being created
4. **Did not preserve internal connections** - Connections between copied nodes were lost

## Root Cause Analysis
The original implementation had these limitations:
- **No mouse position tracking** - The system didn't track where the mouse cursor was during paste
- **Fixed small offset** - Atoms were serialized with a hardcoded offset of (0.05, 0.05), which was barely visible
- **No selection center calculation** - There was no reference point to intelligently position the pasted group
- **Missing connector preservation** - While `copyWithConnectors()` existed, the logic needed refinement

## Solution Implemented

### 1. Mouse Position Tracking
**File:** `src/js/globalvariables.js`
- Added `lastMousePosition` property to track cursor position in canvas coordinates (0-1 range)
- Added `connectorsSelected` array to store copied connectors
- Added `copiedSelectionCenter` to track the geometric center of copied atoms

**File:** `src/components/main-routes/flowCanvas.jsx`
- Updated `mouseMove` handler to continuously track mouse position
- Converts pixel coordinates to canvas coordinates using `pixelsToWidth()` and `pixelsToHeight()`

### 2. Selection Center Calculation
**File:** `src/molecules/molecule.js` - `copyWithConnectors()` function
- Calculate bounding box of selected atoms (minX, maxX, minY, maxY)
- Compute geometric center: `centerX = (minX + maxX) / 2`
- Store center point in `GlobalVariables.copiedSelectionCenter`
- Removed the hardcoded offset during serialization (changed from `{ x: 0.05, y: 0.05 }` to `{ x: 0, y: 0 }`)

### 3. Mouse-Based Paste Positioning
**File:** `src/components/main-routes/flowCanvas.jsx` - Paste handler (Ctrl+V)
- Calculate offset: `offsetX = mouseX - centerX`, `offsetY = mouseY - centerY`
- Apply offset to all pasted atoms before placing them
- Atoms now appear centered at the mouse cursor position
- Maintains relative positions between atoms in the copied group

### 4. Preserved Internal Connections
**File:** `src/molecules/molecule.js` - `copyWithConnectors()` function
- Already filters connectors to only include internal connections (both endpoints in selected atoms)
- Paste logic uses `remapIDs()` to assign new unique IDs
- Restores connectors with updated IDs after atoms are placed

## Code Changes

### Key Files Modified:
1. **src/js/globalvariables.js** - Added mouse tracking and copy state properties
2. **src/components/main-routes/flowCanvas.jsx** - Updated mouse tracking and paste logic
3. **src/molecules/molecule.js** - Enhanced copy functions to calculate center and remove fixed offset

### Testing:
- Created comprehensive unit tests in `tests/copy-paste-fix.test.js`
- All 7 new tests pass successfully
- Verified no regression in existing tests (540/580 pass, pre-existing failures)
- Build completes successfully

## User-Facing Changes

### Before:
- Pasted atoms appeared at almost the same location as originals (tiny 0.05 offset)
- Hard to see which atoms were pasted
- Internal connections were lost
- Unpredictable behavior

### After:
- Pasted atoms appear at the mouse cursor location
- Relative positions between atoms are preserved
- Internal connections are maintained
- Predictable, intuitive behavior

## Technical Details

### Mouse Position Tracking:
```javascript
// In mouseMove handler
GlobalVariables.lastMousePosition = {
  x: GlobalVariables.pixelsToWidth(e.clientX),
  y: GlobalVariables.pixelsToHeight(e.clientY),
};
```

### Selection Center Calculation:
```javascript
// In copyWithConnectors()
const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
GlobalVariables.copiedSelectionCenter = { x: centerX, y: centerY };
```

### Paste Offset Application:
```javascript
// In paste handler (Ctrl+V)
const offsetX = mouseX - centerX;
const offsetY = mouseY - centerY;

remappedData.allAtoms.forEach((atomData) => {
  atomData.x = (atomData.x || 0) + offsetX;
  atomData.y = (atomData.y || 0) + offsetY;
});
```

## Backward Compatibility
- The changes are backward compatible
- Existing saved projects will load correctly
- Legacy `copy()` function updated to match new behavior
- No breaking changes to API or data structures

## Future Enhancements (Optional)
- Add visual feedback during copy (e.g., highlight copied atoms)
- Support for multiple paste operations (Ctrl+V multiple times)
- Keyboard shortcuts for "paste in place" (same location) vs "paste at cursor"
- Copy/paste across different molecules/projects

## Related Issue
Fixes the issue reported: "Copying and pasting seems to be somewhat broken"
