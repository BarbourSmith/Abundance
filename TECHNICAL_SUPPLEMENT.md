# Technical Supplement: Kiri:Moto API Configuration Issue

## Exact Current Implementation

### KirimotoUpdate.js - Current Configuration
```javascript
// Line 125-134: Pass calculation
const bounds = eng.widget.getBoundingBox();
const z = bounds.max.z - bounds.min.z;
const zBottom = z + CUT_THROUGH; // ensure cut through stock bottom
const epsilon = 0.0001;
const validPasses = Math.max(1, Math.floor(Number(passes) || 1));

const down = validPasses == 1 ? 1000 : Math.abs(zBottom) / validPasses;

// Line 135-145: Process setup
return eng.setProcess({
  camEaseAngle: 10,
  camEaseDown: true,
  camZAnchor: "bottom",
  camDepthFirst: false,
  camZThru: 0.01,                    // ⚠️ Bug trigger?
  camZClearance: 3,
  camZTop: 0,                        // ⚠️ Known bug parameter
  camZBottom: -zBottom,              // Negative workaround for setTopZ bug
  camToolInit: true,
  ops: [
    {
      type: "outline",
      tool: 1000,
      spindle: speed,
      step: 0.4,                     // ❓ Fixed value - should this be calculated?
      steps: 1,                      // ❓ Always 1 - is this the issue?
      down: down,                    // ❓ Per-pass depth or total depth?
      rate: 635,
      plunge: 51,
      dogbones: false,
      omitvoid: false,
      omitthru: false,
      outside: false,
      inside: false,                 // ❓ Should be true for interior operation
      wide: false,
      top: false,
      ov_topz: 0,
      ov_botz: 0,
      ov_conv: true,
    }
    // Second operation commented out but needs to be:
    // inside: false, outside: true for exterior cuts
  ]
});
```

## Test Cases That Demonstrate the Issue

### From gcode-passes.test.js
```javascript
test("should demonstrate the current issue with steps parameter", () => {
  // Current configuration in KirimotoUpdate.js
  const passes = 2;
  const z = 5;
  const extra = 1.5;
  
  const currentConfig = {
    step: (z + extra) / passes,  // 3.25mm per pass
    steps: 1,                    // Only 1 step (THIS IS THE ISSUE)
    down: (z + extra) / passes,  // 3.25mm per pass
  };
  
  // With current config:
  // - step = 3.25mm (depth per pass)
  // - steps = 1 (number of incremental steps)  
  // - down = 3.25mm (total depth per operation)
  // 
  // Kiri:Moto likely interprets this as:
  // "Cut 3.25mm deep, in 1 step, then repeat until reaching bottom"
  // Total depth = 6.5mm
  // Number of operations = ceil(6.5 / 3.25) = 2, but it adds one more = 3 passes
  
  expect(currentConfig.step).toBe(3.25);
  expect(currentConfig.steps).toBe(1);
  expect(currentConfig.down).toBe(3.25);
});

test("should show the correct configuration that fixes the issue", () => {
  const requestedPasses = 2;
  const z = 5;
  const extra = 1.5;
  const totalDepth = z + extra;
  
  // CORRECT FIX: Set steps to the number of passes and down to total depth
  const fixedConfig = {
    step: totalDepth / requestedPasses, // 3.25mm per pass
    steps: requestedPasses,             // Set to actual number of passes
    down: totalDepth,                   // Set to total depth
  };
  
  expect(fixedConfig.step).toBe(3.25);
  expect(fixedConfig.steps).toBe(2);
  expect(fixedConfig.down).toBe(6.5);
  
  // This should tell Kiri:Moto:
  // "Cut 6.5mm total depth, in 2 steps of 3.25mm each"
});
```

### Interior-First Cutting from gcode-interior-exterior-order.test.js
```javascript
const generateOperations = (passes, z, extra, speed) => {
  const operations = [];
  const totalDepth = z + extra;
  const depthPerPass = totalDepth / passes;
  
  // Create two operations for each pass: interior cuts first, then exterior cuts
  for (let i = 1; i <= passes; i++) {
    const currentDepth = depthPerPass * i;
    
    // First operation: Cut interior shapes (inside cuts)
    operations.push({
      type: "outline",
      step: depthPerPass,           // Depth for this specific pass
      steps: 1,                     // Single step per operation
      down: currentDepth,           // Depth for this pass
      inside: true,                 // Cut inside/interior shapes first
      outside: false,               // Do NOT cut outside edges
      // ... other parameters
    });
    
    // Second operation: Cut exterior shapes (outside cuts)
    operations.push({
      type: "outline", 
      step: depthPerPass,           // Depth for this specific pass
      steps: 1,                     // Single step per operation
      down: currentDepth,           // Depth for this pass
      inside: false,                // Do NOT cut inside shapes
      outside: true,                // Cut outside edges after interior
      // ... other parameters
    });
  }
  
  return operations;
};
```

## Key Questions for Bounty Solution

1. **What should `step` be?**
   - Current: Fixed 0.4mm or calculated per-pass depth
   - Should it be: Total depth / passes, or something else?

2. **What should `steps` be?**
   - Current: Always 1
   - Should it be: The requested number of passes?

3. **What should `down` be?**
   - Current: Per-pass depth (totalDepth / passes)
   - Should it be: Total depth, or keep as per-pass?

4. **How do these parameters interact with camZTop/camZThru bug?**
   - Current workaround: camZBottom = -totalDepth
   - Is there a better approach?

## Expected Working Solution Format

```javascript
// For 2 passes, 5mm material, 1.5mm cut-through (6.5mm total):
const WORKING_CONFIG = {
  // Process level:
  camZTop: ???,        // What value avoids the bug?
  camZThru: ???,       // What value works with camZTop?
  camZBottom: ???,     // Positive or negative? 
  
  // Operation level:
  step: ???,           // Total/passes? Fixed value? Something else?
  steps: ???,          // Number of passes? Always 1? Calculated?
  down: ???,           // Total depth? Per-pass? Something else?
};

// RESULT: Exactly 2 passes at 3.25mm each, no extra passes
```

## Verification Tests

The solution must pass these test cases:

```javascript
// Test 1: Single pass
materialThickness: 3mm, cutThrough: 1mm, passes: 1
Expected: 1 pass at 4mm depth

// Test 2: Two passes  
materialThickness: 5mm, cutThrough: 1.5mm, passes: 2
Expected: 2 passes at 3.25mm each

// Test 3: Three passes
materialThickness: 6mm, cutThrough: 2mm, passes: 3  
Expected: 3 passes at 2.67mm each

// Test 4: Four passes
materialThickness: 8mm, cutThrough: 2mm, passes: 4
Expected: 4 passes at 2.5mm each
```

All tests must produce exactly the requested number of passes with no extras.