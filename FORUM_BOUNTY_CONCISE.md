# 💰 $1000 BOUNTY: Fix Kiri:Moto CNC Pass Control Bug

## TL;DR
We'll pay $1000 for the correct Kiri:Moto API settings that give us exact pass control for CNC operations with interior-first cutting.

## The Problem
**Current issue**: When we request 2 passes, Kiri:Moto gives us 3. When we request 3 passes, we get 4. There's always one extra pass.

**Suspected cause**: The known `camZTop` bug combined with incorrect `step`/`steps`/`down` parameter configuration.

## What We Need

### 1. Exact Pass Control
```javascript
// INPUT: Request 2 passes for 6.5mm total depth
// WANTED OUTPUT: Exactly 2 passes at 3.25mm each  
// CURRENT OUTPUT: 3 passes (one extra)
```

### 2. Interior-First Cutting
For each depth level:
1. Cut interior profiles first (part stays secured)
2. Cut exterior profiles second  

Example: 2-pass sequence
- Pass 1: Interior at 3.25mm → Exterior at 3.25mm
- Pass 2: Interior at 6.5mm → Exterior at 6.5mm (final cut)

## Current Broken Configuration

```javascript
// THIS DOESN'T WORK - gives extra passes
{
  step: totalDepth / requestedPasses,  // e.g., 3.25mm
  steps: 1,                           // ❌ Always 1 - THE PROBLEM?
  down: totalDepth / requestedPasses,  // e.g., 3.25mm  
}
```

## The ZTop Bug Context
We're hitting the documented Grid.Space issue where `camZTop` + `camZThru` values cause extra passes. Currently using `camZBottom: -totalDepth` as a workaround but it's not solving the pass count issue.

## What We'll Pay $1000 For

✅ **Working API configuration** that produces exactly the requested number of passes  
✅ **Parameter explanation** - what each value should be and why  
✅ **Interior-first sequence** - how to configure the dual operations  
✅ **Test verification** - works for 1, 2, 3, and 4+ pass scenarios  

## Test Case
```javascript
materialThickness = 5mm
cutThrough = 1.5mm  
totalDepth = 6.5mm
requestedPasses = 2

WANTED: 2 passes at 3.25mm each
GETTING: 3 passes (extra unwanted pass)
```

## Our Current Setup
```javascript
eng.setProcess({
  camZTop: 0,                    // ⚠️ Known bug parameter
  camZThru: 0.01,               // ⚠️ Affects pass calculation  
  camZBottom: -6.5,             // Negative workaround
  ops: [
    {
      type: "outline",
      step: 3.25,               // ❓ Is this wrong?
      steps: 1,                 // ❓ Should this be 2?
      down: 3.25,               // ❓ Or should this be 6.5?
      inside: true, outside: false
    },
    {
      type: "outline", 
      step: 3.25, steps: 1, down: 3.25,
      inside: false, outside: true  
    }
  ]
});
```

## How to Claim the Bounty

1. **Post the correct parameter values** for `step`, `steps`, `down`
2. **Explain the relationship** between these parameters  
3. **Show it works** for different pass counts
4. **We verify** in our application
5. **$1000 sent** within 24 hours

---

**Why this bounty matters**: We're building a production CAD/CAM application and this bug is blocking our CNC workflow. The first person who solves this gets the full $1000.

**Questions?** Reply here or DM. Bounty open until solved!