# Validation Fixes Apply to Both New Project and Export Popups

## Summary
The validation fixes from PR #1012 apply to **BOTH** the "Create New Project" popup AND the "Export Molecule to GitHub" popup because they use the **same component** (`NewProjectPopUp.jsx`).

## Component Usage

### 1. Create New Project (LoginMode.jsx)
```jsx
<NewProjectPopUp
  {...{ setExportPopUp, authorizedUserOcto, exporting: false }}
/>
```
- Used when creating a brand new project from the home page
- `exporting: false` displays "Create a New Project" as header

### 2. Export Molecule (CreateMode.jsx)
```jsx
<NewProjectPopUp
  {...{ setExportPopUp, exporting: true, authorizedUserOcto }}
/>
```
- Used when exporting a molecule to GitHub from within a project
- `exporting: true` displays "Export this molecule to Github" as header

## Validation Logic (NewProjectPopUp.jsx)

### Validation Functions
Both popups use these validation functions defined in `NewProjectPopUp.jsx` (lines 9-86):

#### 1. `validateProjectName(name)` 
Validates project names:
- ❌ Empty names
- ❌ Spaces (must use hyphens)
- ❌ Invalid characters (only a-z, A-Z, 0-9, ., _, -)
- ❌ Names starting/ending with hyphen
- ❌ Names > 100 characters

#### 2. `validateTopics(topics)`
Validates and sanitizes topics:
- ✅ Converts to lowercase
- ✅ Removes spaces and special characters
- ❌ Rejects topics starting with hyphen
- ❌ Rejects topics > 50 characters
- ❌ Rejects topics with only invalid characters
- Returns: `{ errors: [], sanitized: [] }`

### Validation Triggers

Both popups validate identically:

1. **On Enter Key** (lines 135-146):
   ```javascript
   const handleKeyDown = (e, fieldType) => {
     if (e.key === "Enter") {
       e.preventDefault();
       if (fieldType === "name") {
         validateNameField();
       } else if (fieldType === "topic") {
         validateTopicField();
       }
     }
   };
   ```

2. **On Form Submit** (lines 149-213):
   ```javascript
   const handleSubmit = async (e) => {
     e.preventDefault();
     
     // Validate project name
     const nameErrors = validateProjectName(projectName);
     
     // Validate and sanitize topics
     const topicValidation = validateTopics(projectTopic);
     
     // Collect all validation errors
     const allErrors = [...nameErrors, ...topicValidation.errors];
     
     if (allErrors.length > 0) {
       setValidationErrors(allErrors);
       window.alert(
         "Please fix the following issues before submitting:\n\n" +
         allErrors.join("\n")
       );
       return; // Block submission
     }
     
     // ... proceed with creation/export
   };
   ```

### UI Display (lines 238-247)

Both popups display validation errors identically:
```jsx
{validationErrors.length > 0 && (
  <div className="validation-errors">
    <strong>Validation Issues:</strong>
    <ul>
      {validationErrors.map((error, index) => (
        <li key={index}>{error}</li>
      ))}
    </ul>
  </div>
)}
```

## The `exporting` Prop

The `exporting` prop is used in **ONLY TWO PLACES**:

### 1. Header Text (lines 234-237)
```jsx
<h2>
  {exporting
    ? "Export this molecule to Github"
    : "Create a New Project"}
</h2>
```

### 2. Passed to createProject (line 199)
```javascript
createProject(
  authorizedUserOcto,
  [projectName, sanitizedTopics, projectDescription, projectLicense, projectUnits],
  molecule,
  exporting,  // <-- Only used to determine if molecule should be exported
  setNewProjectBar
)
```

The `exporting` prop does **NOT** affect validation logic in any way.

## Conclusion

✅ **The validation fixes from PR #1012 are ALREADY applied to both popups**

Both the "Create New Project" and "Export Molecule" flows:
- Use the same validation functions
- Display errors in the same way
- Block submission on validation failures
- Sanitize topics identically
- Show the same user alerts

The only difference is the header text and whether an existing molecule is being exported vs. creating a new empty project.
