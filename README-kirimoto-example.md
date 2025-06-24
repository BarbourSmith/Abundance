# Minimal Kirimoto Example

This directory contains a minimal example demonstrating the integration with the Kirimoto engine for STL to G-code conversion. This example is designed to help the Kirimoto team understand how we use their engine and to assist in debugging any issues.

## Files

- `kirimoto-minimal-example.html` - A standalone HTML file that demonstrates the complete Kirimoto integration
- `README.md` - This documentation file

## What the Example Does

The minimal example demonstrates the complete workflow of using the Kirimoto engine:

1. **Engine Initialization**: Loads the Kirimoto engine from `https://grid.space/code/engine.js`
2. **STL Loading**: Allows user to select and load an STL file
3. **CAM Configuration**: Sets up CAM parameters including:
   - Tool configuration (endmill with configurable size)
   - Process parameters (outline operation)
   - Device settings (Generic GRBL)
4. **G-code Generation**: Processes the STL through the complete pipeline:
   - Load STL into engine
   - Set mode to CAM
   - Configure stock material
   - Set tools and process parameters
   - Slice, prepare, and export G-code

## Key Kirimoto API Usage

The example shows how we use the Kirimoto engine API:

```javascript
// Initialize engine
kiriEngine = window.kiri.newEngine();

// Load STL file
kiriEngine.load(stlUrl)
  .then(eng => eng.move(0, 0, 0))
  .then(eng => eng.setMode('CAM'))
  .then(eng => {
    // Configure stock material
    eng.setStock({ ... });
    return eng;
  })
  .then(eng => eng.setTools([ ... ]))
  .then(eng => {
    eng.setProcess({ ... });
    return eng;
  })
  .then(eng => eng.setDevice({ ... }))
  .then(eng => eng.slice())
  .then(eng => eng.prepare())
  .then(eng => eng.export())
  .then(gcode => {
    // Handle generated G-code
  });
```

## Configuration Details

### Tool Configuration
- Type: endmill
- Configurable diameter
- Standard flute and shaft lengths

### Process Configuration
- Operation: outline
- Configurable passes and speeds
- Dogbone corners enabled
- Outside cutting only

### Device Configuration
- Generic GRBL device
- Standard G-code preamble/postamble
- Metric units (G21)
- Absolute positioning (G90)

## How to Use

1. Open `kirimoto-minimal-example.html` in a web browser
2. The Kirimoto engine will automatically load from grid.space
3. Select an STL file using the file input
4. Adjust CAM parameters as needed
5. Click "Generate G-code" to process the file
6. View the generated G-code in the output area
7. Download the G-code file if needed

## Integration Points

This example isolates the Kirimoto integration from the larger Abundance application, making it easier to:

- Test Kirimoto engine changes independently
- Debug issues with specific STL files
- Verify G-code output
- Test different parameter combinations

## Browser Compatibility

The example requires a modern web browser with:
- ES6 Promise support
- File API support
- Blob API support
- Modern JavaScript features

## Debugging

The example includes:
- Console logging of all Kirimoto messages
- Status indicators for each step
- Error handling and display
- Clear separation of concerns

If you encounter issues, check the browser console for detailed error messages from the Kirimoto engine.