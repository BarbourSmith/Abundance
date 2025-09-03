# $1000 Bounty: Kiri:Moto CAM API Configuration for Precise CNC Pass Control

## Problem Statement

We need help configuring the Kiri:Moto CAM API for CNC operations to achieve precise control over cutting passes with the following requirements:

1. **Precise Pass Control**: Pass a specific number of passes and get exactly that many evenly-spaced cutting operations
2. **Cut-Through Integration**: Include a cut-through depth that ensures complete material separation
3. **Dual Operation Sequence**: Perform interior profile cuts first, then exterior profile cuts for each pass depth
4. **Bug Resolution**: Address the known `camZTop` (ztop) parameter bug that causes unexpected extra cutting passes

## Current Issue

### The Problem with `steps` Parameter

Our current configuration causes Kiri:Moto to generate an extra cutting pass beyond what we request:

```javascript
// CURRENT PROBLEMATIC CONFIGURATION
const currentConfig = {
  step: (materialThickness + cutThrough) / requestedPasses,  // e.g., 3.25mm per pass
  steps: 1,                                                   // ❌ Always 1 - THIS IS THE ISSUE
  down: (materialThickness + cutThrough) / requestedPasses,   // e.g., 3.25mm per operation
};
```

**Example**: For 5mm material + 1.5mm cut-through = 6.5mm total depth, requesting 2 passes:
- Expected: 2 passes at 3.25mm each
- Current result: 3 passes (Kiri:Moto adds an extra pass)

### The ZTop Bug

We suspect the issue is related to the documented `camZTop` bug in Grid.Space CAM API where certain values of `camZThru` cause unexpected behavior in pass calculation.

## Desired Solution

### 1. Correct Pass Configuration

We need the proper API parameter combination that results in exactly the requested number of passes:

```javascript
// DESIRED WORKING CONFIGURATION
const targetConfig = {
  step: ???,     // What should this be?
  steps: ???,    // Should this be the requested pass count?
  down: ???,     // Total depth or per-pass depth?
  // Other parameters?
};
```

### 2. Interior-First Cutting Sequence

For each cutting depth, we need two operations:
1. **Interior cuts first** (inside: true, outside: false) - cuts internal profiles while part is secured
2. **Exterior cuts second** (inside: false, outside: true) - cuts external profiles

Example sequence for 2 passes:
```
Pass 1 (3.25mm depth):
  → Interior cuts at 3.25mm
  → Exterior cuts at 3.25mm
Pass 2 (6.5mm depth - final):
  → Interior cuts at 6.5mm  
  → Exterior cuts at 6.5mm (releases part)
```

### 3. Complete API Configuration

Here's our current setup that needs fixing:

```javascript
// Current process configuration
eng.setProcess({
  camEaseAngle: 10,
  camEaseDown: true,
  camZAnchor: "bottom",
  camDepthFirst: false,
  camZThru: 0.01,              // ⚠️  Suspected to cause ztop bug
  camZClearance: 3,
  camZTop: 0,                  // ⚠️  Known bug with this parameter
  camZBottom: -totalDepth,     // Currently using negative value as workaround
  camToolInit: true,
  ops: [
    // Interior operation
    {
      type: "outline",
      tool: 1000,
      step: ???,                // NEEDS CORRECT VALUE
      steps: ???,               // NEEDS CORRECT VALUE  
      down: ???,                // NEEDS CORRECT VALUE
      inside: true,
      outside: false,
      // ... other parameters
    },
    // Exterior operation  
    {
      type: "outline", 
      tool: 1000,
      step: ???,                // NEEDS CORRECT VALUE
      steps: ???,               // NEEDS CORRECT VALUE
      down: ???,                // NEEDS CORRECT VALUE
      inside: false,
      outside: true,
      // ... other parameters
    }
  ]
});
```

## Technical Requirements

### Input Parameters
- `materialThickness`: Actual part thickness (e.g., 5mm)
- `cutThrough`: Additional depth to ensure complete cut (e.g., 1.5mm)
- `requestedPasses`: Number of cutting passes desired (e.g., 2)
- `totalDepth`: materialThickness + cutThrough (e.g., 6.5mm)

### Expected Output
- Exactly `requestedPasses` cutting operations
- Each pass cuts to depth: `(totalDepth / requestedPasses) * passNumber`
- No extra passes beyond the requested count
- Interior cuts before exterior cuts at each depth level

### Current Test Cases

We have comprehensive test cases that demonstrate the issue:

```javascript
// Test case: 2 passes, 5mm material, 1.5mm cut-through
const requestedPasses = 2;
const materialThickness = 5;
const cutThrough = 1.5;
const totalDepth = 6.5;

// Expected result: 2 passes at 3.25mm each
// Current result: 3 passes (extra pass added)
```

## What We've Tried

1. **Various step/steps/down combinations** - No success in eliminating extra pass
2. **Different camZTop values** - Workaround using negative camZBottom
3. **Adjusting camZThru values** - Still triggers the bug
4. **Manual pass calculation** - Kiri:Moto overrides our calculations

## Bounty Details

**Reward**: $1000 USD

**Acceptance Criteria**:
1. Provide working Kiri:Moto API configuration that produces exactly the requested number of passes
2. Configuration must handle interior-first cutting sequence  
3. Solution must address or work around the camZTop bug
4. Include explanation of the correct parameter relationships
5. Provide test cases demonstrating the fix works for various pass counts (1, 2, 3, 4+ passes)

**Payment**: Via PayPal, Venmo, or bank transfer upon successful verification of the solution

## Additional Context

- Using Kiri:Moto engine via Grid.Space CAM API
- CNC application (not 3D printing)
- Material: Various thicknesses from 3mm to 25mm
- Tool: Endmill operations only
- Part complexity: Mix of interior and exterior profiles

## How to Claim

1. Post your solution with working API configuration
2. Include explanation of parameter relationships
3. Provide test cases showing exact pass counts
4. We'll verify the solution works in our application
5. Payment sent within 24 hours of verification

---

**Contact**: Reply to this thread or DM for questions about implementation details or bounty clarification.

This bounty is open until resolved. First correct solution wins the full amount.