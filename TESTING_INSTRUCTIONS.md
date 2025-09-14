# GitHub Molecule Circular Menu Fix - Testing Instructions

## Issue Summary
The right-click circular menu was not opening the GitHub search panel when "GitHubMolecule" was clicked, preventing users from placing GitHub atoms from the menu.

## Root Cause
The `createCMenu` function in `src/js/NewMenu.js` was only saving click coordinates when GitHubMolecule was clicked, but not triggering the callback to open the GitHub search panel.

## Fix Applied
1. **Modified `createCMenu` function** to accept a callback parameter `onGitHubMoleculeClick`
2. **Updated GitHubMolecule click handler** to call the callback when clicked
3. **Updated flowCanvas** to pass `() => setExpandedMenu("git-search")` as the callback

## Manual Testing Steps

### Before Fix (Broken Behavior)
1. Right-click on canvas → circular menu appears
2. Navigate to "Import/Export" submenu
3. Click "GitHubMolecule" option
4. ❌ Nothing happens (GitHub search panel doesn't open)

### After Fix (Expected Behavior)
1. Right-click on canvas → circular menu appears
2. Navigate to "Import/Export" submenu  
3. Click "GitHubMolecule" option
4. ✅ GitHub search panel opens on the left side
5. User can search for and place GitHub atoms

## Code Changes Verification

The validation script confirms:
- ✅ `createCMenu` accepts `onGitHubMoleculeClick` callback parameter
- ✅ GitHubMolecule click handler calls the callback
- ✅ flowCanvas passes `setExpandedMenu("git-search")` as callback
- ✅ `setExpandedMenu` is available as prop in flowCanvas

## Files Modified
1. `src/js/NewMenu.js` - Added callback parameter and call
2. `src/components/main-routes/flowCanvas.jsx` - Pass correct callback
3. `.env` - Uncommented dev environment variables for local testing

## Testing Environment Setup
For local testing, ensure:
1. Environment variables are uncommented in `.env`
2. `vite.config.js` has `base: "/"` 
3. Development server is running on port 4444

The fix is minimal and surgical - it only adds the missing callback functionality without changing any other behavior.