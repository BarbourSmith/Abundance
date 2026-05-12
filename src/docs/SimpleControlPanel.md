# SimpleControlPanel API Reference

This document describes the available control types and their properties for use with the `SimpleControlPanel` component.

---

## Common Properties (all controls)

- `type` (string): The type of control. See below for supported types.
- `label` (string, optional): The label to display next to the control.
- `disabled` (boolean, optional): If true, disables the control.

---

## Control Types

### 1. `string`

- `type`: "string"
- `value`: string | number
- `label`: string
- `placeholder`: string (optional)
- `multiline`: boolean (optional)
- `rows`: number (optional, for multiline)
- `onChange`: function(value)

### 2. `number`

- `type`: "number"
- `value`: number
- `label`: string
- `min`: number (optional)
- `max`: number (optional)
- `step`: number (optional)
- `onChange`: function(value)

### 3. `color`

- `type`: "color"
- `value`: string (hex color)
- `label`: string
- `onChange`: function(value)

### 4. `select`

- `type`: "select"
- `value`: string | number
- `label`: string
- `options`: array or object (array of values, or object of value:label pairs)
- `onChange`: function(value)

### 5. `checkbox`

- `type`: "checkbox"
- `value`: boolean
- `label`: string
- `onChange`: function(checked)

### 6. `button`

- `type`: "button"
- `label`: string (optional if `icon` is provided)
- `icon`: React node (optional, replaces label if present)
- `onClick`: function()
- `lowOpacity`: boolean (optional, renders button with lower opacity)

### 7. `buttongroup`

- `type`: "buttongroup"
- `buttons`: array of button configs (see `button` above)
  - Each button can have its own `label`, `icon`, `onClick`, `lowOpacity`, etc.
- Example:
  ```js
  {
    type: "buttongroup",
    buttons: [
      { label: "A", onClick: ... },
      { label: "B", icon: <Icon/>, onClick: ... }
    ]
  }
  ```

### 8. `spacer`

- `type`: "spacer"
- `height`: number (optional, px)

### 9. `label`

- `type`: "label"
- `value`: string | number
- `label`: string (optional)

Renders the value as plain, non-interactive text. Useful for displaying read-only information such as computed values or settings that cannot be changed in the current mode.

---

## Example Usage

```js
const controls = {
  name: { type: "string", value: "foo", label: "Name", onChange: ... },
  color: { type: "color", value: "#ff0000", label: "Color", onChange: ... },
  myButton: { type: "button", label: "Click Me", onClick: ... },
  group: {
    type: "buttongroup",
    buttons: [
      { label: "A", onClick: ... },
      { label: "B", icon: <Icon/>, onClick: ... }
    ]
  },
  sep: { type: "spacer", height: 16 },
};
```

---

## Notes

- All controls can be disabled by setting `disabled: true`.
- For custom layouts, use `spacer` controls to add vertical space or separators.
- `icon` can be any valid React node (SVG, component, etc).
- `buttongroup` is for horizontal button rows.

---

_Last updated: September 2025_
