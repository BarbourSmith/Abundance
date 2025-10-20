# TopMenu and Progress Bar Conflict Fix

## Issue
The SaveBar, RenameBar, and DuplicateBar progress indicators were causing priority conflicts with the TopMenu dropdown menu. When these progress bars updated their state during save/rename/duplicate operations, they would force the TopMenu component to re-render, making it impossible to use the dropdown menu during these operations.

## Root Cause
The progress bar components (SaveBar, RenameBar, DuplicateBar) were defined and rendered inside the TopMenu component. Any state change in these bars triggered a full re-render of TopMenu, which disrupted the dropdown menu's open/close state.

## Solution
Moved the progress bar components out of TopMenu and into CreateMode:

1. **Extracted Components**: SaveBar, RenameBar, and DuplicateBar are now exported from TopMenu.jsx instead of being internal components
2. **Moved State Management**: Progress state (duplicateProgress, duplicatingProject, renameProgress, renamingProject) moved from TopMenu to CreateMode
3. **Separated Rendering**: Progress bars now render directly in CreateMode, independent of TopMenu

## Architecture Before
```
CreateMode
  └── TopMenu
       ├── SaveBar (internal component - causes re-render)
       ├── RenameBar (internal component - causes re-render)
       ├── DuplicateBar (internal component - causes re-render)
       └── Navbar (dropdown menu - gets disrupted)
```

## Architecture After
```
CreateMode
  ├── SaveBar (external component - independent rendering)
  ├── RenameBar (external component - independent rendering)
  ├── DuplicateBar (external component - independent rendering)
  └── TopMenu
       └── Navbar (dropdown menu - no longer affected)
```

## Benefits
- TopMenu no longer re-renders when progress bars update
- Dropdown menu remains fully functional during save/rename/duplicate operations
- Cleaner separation of concerns
- Consistent with RenderProgressBar, which was already in CreateMode

## Files Changed
- `src/components/secondary/TopMenu.jsx`: Exported progress bar components, removed local state and rendering
- `src/components/main-routes/CreateMode.jsx`: Added state management and rendering for progress bars

## Testing
The fix has been verified to:
- Build successfully without errors
- Start the development server correctly
- Load the application without runtime errors

To manually test the fix:
1. Open a project in Abundance
2. Open the TopMenu dropdown (hamburger menu)
3. Trigger a save operation (Ctrl+S or click Save)
4. Verify the dropdown menu remains accessible while the SaveBar is visible
5. Same test applies for rename and duplicate operations
