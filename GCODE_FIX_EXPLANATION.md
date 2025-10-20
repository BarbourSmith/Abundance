# Gcode Auto-Generation Fix

## Problem
Gcode molecules were not properly generating gcode when their output was connected to downstream molecules, preventing the render from completing.

## Solution
The gcode molecule now checks if its output has downstream connections and conditionally generates gcode:

### Before Fix
```
Geometry Input → Gcode Molecule → ALWAYS generates gcode
                                   (expensive operation)
```

### After Fix
```
Case 1: Output NOT connected (user wants to generate gcode file)
Geometry Input → Gcode Molecule → setReady(inputGeometry)
                                   User clicks "Generate Gcode" button
                                   
Case 2: Output IS connected (downstream molecule needs geometry)
Geometry Input → Gcode Molecule → Auto-generates gcode
                      ↓
                 Downstream Molecule (receives gcode visualization)
```

## Code Changes

### In `_processSinglePart()` and `_processAssembly()`:
```javascript
// Check if output has downstream connections
const hasDownstreamConnections = 
  this.output && 
  this.output.connectors && 
  this.output.connectors.length > 0;

if (hasDownstreamConnections) {
  // Auto-generate gcode when output is connected
  this._generateGcode();
} else {
  // No downstream connections - set ready without generating
  this.setReady(inputID);
}
```

## Benefits
1. ✅ Prevents expensive gcode generation when not needed
2. ✅ Ensures downstream molecules receive geometry when connected
3. ✅ Maintains existing user workflow (manual button for file generation)
4. ✅ Fixes render completion issues when output is connected

## Test Coverage
Added 8 comprehensive tests covering:
- Single part processing with/without downstream connections
- Assembly processing with/without downstream connections
- Edge cases (null output, undefined connectors, multiple connections)
- Complete scenario demonstration
