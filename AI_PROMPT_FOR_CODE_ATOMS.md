# Abundance Code Atom Development Guide

You are assisting with writing code for an Abundance Code Atom. Abundance is a web-based CAD platform that uses the Replicad library for 3D geometry operations.

## Code Structure Requirements

### Default: TypeScript with `run()` Function

All new code atoms use **TypeScript with a `run()` function**. Input parameters are declared as function parameters with type annotations:

```typescript
function run(
  width: number = 40,
  depth: number = 30,
  thickness: number = 5,
  color: string = "#5B9BD5",
  addFillet: boolean = true,
): Assembly[] {
  // return Assembly or Assembly[]
  // ... implementation ...
  return results;
}
```

**Parameter types:**

- `number` → numeric slider input
- `string` → text input (great for hex colors, labels)
- `boolean` → true/false toggle
- `Assembly` → geometry input (wire from another atom's output)
- `Assembly?` or with `= undefined` → optional parameter

### Legacy: JavaScript with `Inputs` Array (Deprecated)

Old atoms used a separate `Inputs` array. This is still supported but new atoms should use TypeScript:

```javascript
// DEPRECATED - shown only for backwards compatibility
const Inputs = [
  { inputName: "shape", type: "geometry", defaultValue: null },
  { inputName: "radius", type: "number", defaultValue: 5 },
];
```

## Assembly Class

All geometry in Abundance is wrapped in the `Assembly` class:

```typescript
new Assembly({
  geometry: replicad.makeCylinder(5, 10), // replicad solid or drawing
  color: "#A3CE5B", // hex color for 3D display
  tags: ["cylinder", "part"], // string[] for filtering/identification
  bom: ["1x Steel cylinder"], // Bill of Materials entries
});
```

**When to use:**

- Always wrap replicad geometry before returning
- Attach metadata (color, tags, BOM info) to parts
- Enables filtering in downstream atoms (cut layout, BOM)

## Replicad API

The Replicad library is available as the global `replicad`. Here are commonly used methods:

### Creating 2D Sketches

- `replicad.drawCircle(radius)` → Drawing
- `replicad.drawRectangle(width, height)` → Drawing
- `replicad.drawRoundedRectangle(width, height, cornerRadius)` → Drawing
- `replicad.drawPolygon(points)` → Drawing

### Building Custom 2D Sketches (Drawing Chain Methods)

- `drawing.moveTo(x, y)` → Drawing (move to point without drawing)
- `drawing.lineTo(x, y)` → Drawing (draw line to point)
- `drawing.threePointArc(x, y, xMid, yMid)` → Drawing (arc through point)
- `drawing.tangentArc(x, y)` → Drawing (arc tangent to last line)
- `drawing.quadraticCurveTo(controlX, controlY, x, y)` → Drawing (quadratic curve)
- `drawing.bezierCurveTo(c1X, c1Y, c2X, c2Y, x, y)` → Drawing (cubic Bezier curve)
- `drawing.close()` → Drawing (close the sketch to form a shape)

### Creating 3D Geometry

- `replicad.makePlane()` → Plane
- `replicad.makeBaseBox(width, depth, height)` → Shape (corner at origin)
- `replicad.makeSphere(radius)` → Shape
- `replicad.makeCylinder(radius, height)` → Shape
- `replicad.makeWedge(width, depth, height, slope)` → Shape

### Sketches to 3D

- `drawing.sketchOnPlane()` → Sketch
- `sketch.extrude(distance)` → Shape3D
- `sketch.extrude(distance, {}) → Shape3D with options

### Boolean Operations

- `shape.fuse(otherShape)` → Shape (union)
- `shape.cut(tool)` → Shape (difference)
- `shape.intersect(tool)` → Shape (intersection)

### Post-Processing

- `shape.fillet(radius)` → Shape (round all edges)
- `shape.fillet(radius, filter)` → Shape (round filtered edges)
  - Example: `shape.fillet(1, (e) => e.inPlane("XY", z))` rounds only top-face edges
- `shape.chamfer(distance)` → Shape (bevel all edges)
- `shape.translate(x, y, z)` → Shape (move)
- `shape.rotate(angle, [x, y, z])` → Shape (rotate around axis)
- `shape.scale(factor)` → Shape (uniform scale)

**Note:** For complete Replicad API documentation, refer to https://replicad.xyz

## Common Patterns

### 1. Basic Geometry Creation with Default Parameters

```typescript
function run(
  width: number = 40,
  depth: number = 30,
  height: number = 20,
  color: string = "#5B9BD5",
): Assembly {
  // Create a box with one corner at origin
  const box = replicad.makeBaseBox(width, depth, height);

  // Center it by translating
  const centered = box.translate(-width / 2, -depth / 2, 0);

  // Wrap in Assembly with metadata
  return new Assembly({
    geometry: centered,
    color: color,
    tags: ["box"],
    bom: [`Box ${width}×${depth}×${height} mm`],
  });
}
```

### 2. Creating and Extruding Sketches

```typescript
function run(radius: number = 10, height: number = 20): Assembly {
  const cylinder = replicad.drawCircle(radius).sketchOnPlane().extrude(height);

  return new Assembly({
    geometry: cylinder,
    color: "#FF6B6B",
    tags: ["cylinder"],
  });
}
```

### 2b. Building Custom Sketches with Path Methods

```typescript
function run(width: number = 30, height: number = 20): Assembly {
  // Build a custom shape using drawing chain
  const customShape = replicad
    .drawRectangle(width, height)
    .moveTo(0, 0)
    .lineTo(width / 2, height / 2) // draw diagonal line
    .close();

  const extruded = customShape.sketchOnPlane().extrude(10);

  return new Assembly({
    geometry: extruded,
    tags: ["custom"],
  });
}
```

### 2c. Drawing with Curves

```typescript
function run(): Assembly {
  const curved = replicad
    .drawRectangle(20, 20)
    .moveTo(10, 0)
    .bezierCurveTo(15, 5, 15, 15, 10, 20) // cubic Bezier curve
    .close();

  return new Assembly({
    geometry: curved.sketchOnPlane().extrude(5),
  });
}
```

### 3. Boolean Operations (Union & Cut)

```typescript
function run(baseSize: number = 40, holeRadius: number = 6): Assembly {
  // Create base plate
  const plate = replicad.makeBaseBox(baseSize, baseSize, 5);

  // Create hole cutter
  const holeCutter = replicad
    .drawCircle(holeRadius)
    .sketchOnPlane()
    .extrude(7)
    .translate(0, 0, -1); // Start below surface to ensure clean cut

  // Cut the hole
  const result = plate.cut(holeCutter);

  return new Assembly({
    geometry: result,
    tags: ["plate-with-hole"],
  });
}
```

### 4. Using Imported Geometry

```typescript
function run(
  baseShape: Assembly | undefined = undefined,
  extraHeight: number = 10,
): Assembly {
  if (!baseShape) {
    throw new Error("Must connect a shape to this atom");
  }

  // baseShape is already an Assembly, use it
  return baseShape;
}
```

### 5. Returning Multiple Parts as Array

```typescript
function run(count: number = 3, size: number = 10): Assembly[] {
  const parts: Assembly[] = [];

  for (let i = 0; i < count; i++) {
    const part = replicad
      .makeBaseBox(size, size, size)
      .translate(i * size * 1.2, 0, 0);

    parts.push(
      new Assembly({
        geometry: part,
        tags: ["part", `part-${i}`],
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      }),
    );
  }

  return parts;
}
```

### 6. Adding Fillets and Chamfers

```typescript
function run(size: number = 30, filletRadius: number = 2): Assembly {
  let box = replicad.makeBaseBox(size, size, size);

  // Fillet only the top edges
  box = box.fillet(filletRadius, (edge) => edge.inPlane("XY", size));

  return new Assembly({ geometry: box });
}
```

### 7. Using console.log for Debugging

```typescript
function run(input: Assembly | undefined): Assembly {
  console.log("Input received:", input);
  console.log("Input type:", typeof input);

  if (!input) {
    console.warn("No input connected");
    return new Assembly({ geometry: replicad.makeSphere(5) });
  }

  return input;
}
```

## Best Practices

1. **Always provide default values** for parameters so the atom produces geometry immediately
2. **Wrap all replicad geometry** in `new Assembly()` before returning
3. **Use meaningful tags** to identify parts (e.g., `["screw", "M8", "fastener"]`)
4. **Include BOM entries** for manufacturing and cost tracking
5. **Use console.log** for debugging parameter values
6. **Handle undefined/null inputs** gracefully—check if optional parameters exist before using
7. **Center geometry appropriately** using translate() for better visual alignment
8. **Return Assembly or Assembly[]** for geometry; primitives (number/string) for calculations
9. **Use templateStrings for dynamic BOM** e.g., `` `Box ${width}×${depth} mm` ``
10. **Comment complex geometric operations** to help LLMs understand the intent

## Common Mistakes to Avoid

1. ❌ Forgetting to wrap replicad geometry in `new Assembly()`
2. ❌ Using undefined parameters without checking if they're connected
3. ❌ Forgetting to translate shapes that default to corner-at-origin
4. ❌ Creating geometry that overlaps (causes boolean operation failures)
5. ❌ Not providing reasonable default values for all parameters
6. ❌ Returning raw replicad objects instead of Assembly instances
7. ❌ Using old JavaScript `Inputs` array syntax in new code

## Example: Complete TypeScript Code Atom

```typescript
/**
 * Mounting plate with optional countersunk holes.
 */
function run(
  width: number = 50,
  depth: number = 40,
  thickness: number = 5,
  holeRadius: number = 4,
  holeCount: number = 2,
  color: string = "#4A90E2",
): Assembly {
  console.log(
    `Creating plate: ${width}×${depth}×${thickness} with ${holeCount} holes`,
  );

  // Create base plate, centered
  let plate = replicad
    .makeBaseBox(width, depth, thickness)
    .translate(-width / 2, -depth / 2, 0);

  // Create holes
  for (let i = 0; i < holeCount; i++) {
    const x = (i - (holeCount - 1) / 2) * (width / (holeCount + 1));
    const holeCutter = replicad
      .drawCircle(holeRadius)
      .sketchOnPlane()
      .extrude(thickness + 2)
      .translate(x, 0, -1);

    plate = plate.cut(holeCutter);
  }

  // Soften top edges
  plate = plate.fillet(0.5, (e) => e.inPlane("XY", thickness));

  return new Assembly({
    geometry: plate,
    color: color,
    tags: ["mounting-plate", "drilled"],
    bom: [
      `Mounting plate ${width}×${depth}×${thickness}mm with ${holeCount} holes`,
    ],
  });
}
```

## TypeScript Tips for Clarity

- Use **descriptive parameter names** that match their visual effect
- Add **comments with units** (e.g., `// depth in mm`)
- Use **console.log() to inspect** intermediate geometry during development
- Extend `Assembly | undefined` for optional geometry inputs
- Use **array return types** when parts should remain separate in BOM/cut-layout atoms
