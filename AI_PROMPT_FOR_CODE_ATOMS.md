# Abundance Code Atom Development Guide

You are assisting with writing code for an Abundance Code Atom. Abundance is a web-based CAD platform that uses the Replicad library for 3D geometry operations.

## Scope: One Part, and Only What Built-in Atoms Can't Do

A code atom helps build **one physical part**, inside that part's own molecule. Every board, panel, or bracket in a design gets its own molecule; left and right copies are one molecule placed twice with Move or Rotate. Never generate several parts from one code atom.

Inside the part's molecule, use built-in atoms (Rectangle, Circle, Difference, Extrude, Rotate, Move, Tag, Add-BOM-Tag) and library molecules for everything they can do. Keep the code atom to the piece they can't, such as an unusual 2D outline, and return it so built-in atoms extrude, place, and tag it. Don't model slots or holes for mating parts: position the parts overlapping and let an Assembly cut them. The same goes for clearance around hardware already in the design, such as pockets over bolt heads: keepout shapes around the hardware, assembled after the part, cut them. Standard hardware such as bolts and nuts comes from shared molecules (search_molecules), not code. A code atom is never a way to fit many features in one place because built-ins would take many atoms; give each feature a molecule of its own.

Code made only of boxes, cylinders, regular polygons, `translate`, `rotate`, `fuse`, `cut`, and `intersect` is refused by the agent bridge, because built-in atoms do all of it: Rectangle or Circle → Extrude for the solid, Rotate to point a cylinder along X or Y or lean a part, Move to place it, Difference or an Assembly for holes, and a pattern library molecule for repeated features. A code atom earns its place by drawing what those can't: a custom outline (`draw().lineTo()`, arcs, splines), a loft, revolve, or sweep, fillets, or geometry computed from a reference file's data.

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
): Assembly {
  // ... implementation ...
  return result;
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

Every example below draws something built-in atoms can't. Boxes, cylinders, polygons, holes, moves, rotations, and plain booleans are built-in atoms (Rectangle, Circle, RegularPolygon, Extrude, Move, Rotate, Difference, Fusion, Assembly), so they never get a code atom of their own.

### 1. An Outline Computed from Inputs

```typescript
/** Teardrop outline: a round end of the given radius tapering to a point. */
function run(radius: number = 15, length: number = 50): Assembly {
  const angle = Math.asin(radius / length); // where the straight sides meet the circle
  const tx = radius * Math.sin(angle);
  const ty = radius * Math.cos(angle);
  const outline = replicad
    .draw([length, 0])
    .lineTo([tx, ty])
    .threePointArcTo([tx, -ty], [-radius, 0])
    .close();
  // Return the 2D outline; an Extrude atom beside this one gives it thickness.
  return new Assembly({ geometry: outline, tags: ["teardrop"] });
}
```

### 2. Revolving a Profile

```typescript
/** A turned knob: a profile drawn in XZ and revolved about Z. */
function run(diameter: number = 30, height: number = 20): Assembly {
  const r = diameter / 2;
  const profile = replicad
    .draw([0, 0])
    .lineTo([r, 0])
    .lineTo([r, height * 0.6])
    .sagittaArcTo([0, height], r * 0.3)
    .close();
  const knob = profile.sketchOnPlane("XZ").revolve();
  return new Assembly({ geometry: knob, color: "#333333", tags: ["knob"] });
}
```

### 3. A Curved Slot

An arc-shaped slot with round ends, such as an adjustment slot for a pivot. The code returns only the slot's outline; an Extrude atom makes it a cutter and a Difference atom cuts it from the part.

```typescript
function run(
  radius: number = 40, // radius of the slot's centerline
  width: number = 8, // slot width
  sweepDeg: number = 60, // angle the slot covers
): Assembly {
  const a = (sweepDeg * Math.PI) / 180;
  const ro = radius + width / 2,
    ri = radius - width / 2;
  const pt = (r: number, t: number) => [r * Math.cos(t), r * Math.sin(t)];
  // Each round end bulges out along the slot's direction at that end.
  const endCapMid = [
    radius * Math.cos(a) - (width / 2) * Math.sin(a),
    radius * Math.sin(a) + (width / 2) * Math.cos(a),
  ];
  const startCapMid = [radius, -width / 2];
  const outline = replicad
    .draw(pt(ro, 0))
    .threePointArcTo(pt(ro, a), pt(ro, a / 2)) // outer edge
    .threePointArcTo(pt(ri, a), endCapMid) // far round end
    .threePointArcTo(pt(ri, 0), pt(ri, a / 2)) // inner edge
    .threePointArcTo(pt(ro, 0), startCapMid) // near round end
    .close();
  return new Assembly({ geometry: outline, tags: ["slot"] });
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

### 5. Returning a 2D Outline for Built-in Atoms

When only a part's outline needs code, return the sketch and let Extrude, Rotate, Move, and Tag atoms in the molecule do the rest:

```typescript
function run(
  width: number = 90,
  height: number = 580,
  sweep: number = 20,
): Assembly {
  const offset = height * Math.tan((sweep * Math.PI) / 180);
  const outline = replicad
    .draw([0, 0])
    .lineTo([width, 0])
    .lineTo([width + offset, height])
    .lineTo([offset, height])
    .close();
  return new Assembly({ geometry: outline });
}
```

### 5b. An Outline Traced from a Reference

trace_reference returns a shape's outline from a photo or drawing as points in project units. Paste them into a code atom that draws a smooth closed curve through them (a Catmull-Rom spline, drawn as cubic Béziers), and extrude it with an Extrude atom:

```typescript
/** Body outline traced from the reference photo, in mm. */
const POINTS: number[][] = [
  [-0.9, -430.5], [8.7, -431.6], [18.2, -432.9], // ...every point trace_reference returned
];

function run(): Assembly {
  const n = POINTS.length;
  const p = (i: number) => POINTS[(i + n) % n];
  let pen = replicad.draw(p(0));
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6];
    pen = pen.cubicBezierCurveTo(c, c1, c2);
  }
  return new Assembly({ geometry: pen.close() });
}
```

### 5c. Reading a Reference Image's Pixels

Images, PDFs, and glTF models from Import atoms reach code atoms as reference parts: `part.isReference()` is true and `part.geometryType` is `"image"`, `"pdf"`, or `"gltf"` (it's undefined for replicad shapes). `part.metadata.reference` describes the file (name, mimeType, pixel size, page). `await part.file()` returns the file as a Blob, and for images `await part.pixels()` returns `{ width, height, data }` with RGBA bytes, row by row from the top. `part.placement` is a 4x4 column-major matrix from the file's own coordinates to the project's: an image is a rectangle one unit per pixel, centered on its origin, +Y up. A reference can't be cut, moved, or changed in code; return it as it is to keep it in the output. This builds a block per pixel from a heightmap, with red as height:

```typescript
async function run(map: Assembly, maxHeight: number = 10): Promise<Assembly> {
  const { width, height, data } = await map.pixels();
  const m = map.placement; // m[0] and m[5] are mm per pixel when not rotated
  const blocks: Assembly[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const z = (data[(row * width + col) * 4] / 255) * maxHeight;
      if (z <= 0) continue;
      const x = (col + 0.5 - width / 2) * m[0] + m[12];
      const y = (height / 2 - row - 0.5) * m[5] + m[13];
      blocks.push(new Assembly({
        geometry: replicad.makeBaseBox(m[0], m[5], z).translate([x, y, 0]),
      }));
    }
  }
  return new Assembly({ geometry: blocks });
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
4. **Leave BOM entries to an Add-BOM-Tag atom** after the code atom in the part's molecule, and only for purchased parts (not parts cut from stock), where the user can see and edit them; use the `bom` field only when the entry depends on values computed in code
5. **Use console.log** for debugging parameter values
6. **Handle undefined/null inputs** gracefully—check if optional parameters exist before using
7. **Center geometry appropriately** using translate() for better visual alignment
8. **Return one Assembly** for geometry (one part, or a 2D outline of one part); primitives (number/string) for calculations
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
8. ❌ Building several parts in one code atom instead of one molecule per part
9. ❌ Cutting slots, tabs' mating holes, or dogbones for other parts by hand instead of letting an Assembly cut them
10. ❌ Using a code atom for what built-in atoms do: boxes, cylinders (along any axis), hex heads, holes, moves, rotations, repeated features, and booleans of those. The agent bridge refuses such code.

## Example: Complete TypeScript Code Atom

```typescript
/**
 * Disc cam outline from its motion: the follower rises by `lift` over
 * `riseDeg` with a smooth (cycloidal) motion, dwells, then falls back over
 * the same angle. Returns the 2D outline; in the cam's molecule an Extrude atom
 * gives it thickness and a Circle with a Difference atom cuts the shaft bore.
 */
function run(
  baseRadius: number = 25, // follower distance at its lowest
  lift: number = 10, // how far the follower rises
  riseDeg: number = 120, // cam rotation over which it rises (and falls)
  steps: number = 180, // points around the outline
): Assembly {
  const rise = (riseDeg * Math.PI) / 180;
  const radiusAt = (t: number) => {
    if (t <= rise)
      return (
        baseRadius +
        lift * (t / rise - Math.sin((2 * Math.PI * t) / rise) / (2 * Math.PI))
      );
    const fallStart = 2 * Math.PI - rise;
    if (t >= fallStart) return radiusAt(2 * Math.PI - t);
    return baseRadius + lift;
  };
  const points = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const r = radiusAt(t);
    points.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  let pen = replicad.draw(points[0]);
  for (const p of points.slice(1)) pen = pen.lineTo(p);
  const outline = pen.close();
  console.log(`Cam: ${baseRadius} to ${baseRadius + lift} mm`);
  return new Assembly({ geometry: outline, color: "#4A90E2", tags: ["cam"] });
}
```

## TypeScript Tips for Clarity

- Use **descriptive parameter names** that match their visual effect
- Add **comments with units** (e.g., `// depth in mm`)
- Use **console.log() to inspect** intermediate geometry during development
- Extend `Assembly | undefined` for optional geometry inputs
- Keep each code atom to **one part**; parts that stay separate in the BOM or cut layout each get their own molecule
