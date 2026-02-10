# Fix for GitHub Molecule Recompute Issue

## Problem
When a project contains GitHub molecules, clicking the "recompute project" button would cause the GitHub molecules to get stuck in a "processing" or "waiting" state, breaking functionality that was previously working correctly.

## Root Cause
The `recomputeAll()` method in `src/molecules/molecule.js` was calling `enable()` on all atoms without checking their current status. After the initial `this.enable()` call, some atoms (including GitHub molecules) would already be in a WAITING or PROCESSING state. The subsequent loop that called `atom.enable()` on all atoms would try to re-enable these already-enabled atoms, causing the enable chain to break.

## Solution
The fix replaces the manual loop with a call to `enableAllChildren()`, which is the existing method designed for this purpose. This method checks if each atom is in DISABLED status before enabling it, preventing the issue of re-enabling already-enabled atoms.

### Code Change
**Before:**
```javascript
async recomputeAll() {
  this.disable();
  await GlobalVariables.cad.clearCache(this.getContext());
  this.enable();
  for (const atom of this.nodesOnTheScreen) {
    atom.enable();  // Bug: doesn't check status
  }
}
```

**After:**
```javascript
async recomputeAll() {
  this.disable();
  await GlobalVariables.cad.clearCache(this.getContext());
  this.enable();
  this.enableAllChildren();  // Fix: checks status before enabling
}
```

## Testing

### Automated Test
A new test file `tests/recompute-github-molecule.test.js` has been added to verify the fix logic:
```bash
npm run unit -- tests/recompute-github-molecule.test.js
```

### Manual Testing
To manually verify the fix:

1. Start the development server:
   ```bash
   npm start
   ```

2. Navigate to http://localhost:4444

3. Create or open a project that contains GitHub molecules

4. Ensure the GitHub molecules are working correctly (visible and processing)

5. Click the "Recompute Project" button in the top menu

6. Verify that:
   - The GitHub molecules remain functional
   - They are not stuck in "processing" or "waiting" state
   - The project recomputes correctly

### Test Projects
The following GitHub projects can be used for testing:
- Wall-Anchor
- Test-Everything-Fully

These projects are referenced in `Puppet/projects_to_test.js` and can be imported as GitHub molecules for testing.

## Impact
This is a minimal, surgical fix that:
- Changes only one method (3 lines of code)
- Uses an existing method designed for this purpose
- Maintains backward compatibility
- Fixes the reported issue without affecting other functionality

The fix ensures that the recompute operation respects the current state of atoms and only enables those that are truly disabled, preventing the enable chain from breaking.
