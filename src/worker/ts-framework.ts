/**
 * Canonical source for the AbundanceObj class exposed to TypeScript Code atoms.
 *
 * This file is used to generate both the JS runtime context which is injected
 * into user code sandbox and the type declarations which are provided to users
 * in the Monaco editor.
 *
 *   src/worker/ts-framework.ts  ──npm run build:ts-framework──▶  src/worker/generated/
 *     ├── ts-framework.generated.js   ← prepended to user code sandbox
 *     └── ts-framework.generated.d.ts ← injected into Monaco for IntelliSense
 *
 * To regenerate after changes:
 *   npm run build:ts-framework
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULES FOR EDITING THIS FILE
 * ─────────────────────────────────────────────────────────────────────────
 *  • Do NOT import from replicad. The `replicad` global is injected into the
 *    sandbox at runtime — type it as `any` here so this file compiles standalone.
 *    Full replicad typings come from public/replicad.d.ts which Monaco fetches
 *    separately; the generated .d.ts re-exports proper types from there.
 *  • This file must compile and run in isolation. Avoid external deps like
 *     imports from ./util, ./geometryProvider, etc.
 *  • After editing, always run `npm run build:ts-framework` then commit both
 *    this file and the updated files in src/worker/generated/.
 */

// `replicad` is injected as a global at sandbox runtime. Typed `any` here so
// this file compiles standalone; the generated .d.ts gives it proper typing.
declare const replicad: any;

/*
 * Representation of Abundance Assemblies for use in code atoms.
 *
 * Generic over `G` — the type of the `geometry` field. The build-script
 * post-processor rewrites this in the emitted `.d.ts` so that users see
 * the proper replicad-typed bounds:
 *
 *   - `LeafGeom` = `replicad.AnyShape | replicad.Drawing`
 *   - `AnyGeom`  = `LeafGeom | Assembly[]`
 *   - `class Assembly<G extends AnyGeom = AnyGeom>`
 *   - `geometry: any` → `geometry: G`
 *   - `Assembly<any>` (in iterator, isLeaf, onLeafs callback) → `Assembly<LeafGeom>`
 *
 * Inside this source file we leave everything loose (`any`) because
 * `replicad` is only available as a runtime value, not a type namespace,
 * and because deep-cloning a generic `G` would otherwise be unsound.
 * See scripts/build-ts-framework.mjs for the full set of rewrites.
 */
export class Assembly<G = any> {
  // Structural marker set on the prototype below — used by the worker to
  // recognise AbundanceObj return values across the sandbox boundary without
  // relying on `instanceof` (which would fail because the class is defined
  // inside the sandboxed Function scope).
  declare __abundance: string;

  // `geometry` is intentionally typed `any` here so this file compiles
  // standalone. The generated `.d.ts` post-processor rewrites
  // `geometry: any` to `geometry: G` so callers see the generic parameter
  // narrowed to the proper replicad union. See scripts/build-ts-framework.mjs.
  geometry: any = [];
  color: string = "#aad7f2";
  tags: string[] = [];
  bom: string[] = [];
  plane: any = replicad.makePlane();

  constructor(other?: Partial<Assembly>) {
    if (other) {
      this.color = other.color ?? this.color;
      this.tags = other.tags?.slice() ?? this.tags;
      this.bom = other.bom?.slice() ?? this.bom;
      this.plane = other.plane?.clone() ?? this.plane;
      // Deep clone
      if (other && other.isLeaf && other.isLeaf()) {
        this.geometry = other.geometry.clone();
      } else if (other && Array.isArray(other.geometry)) {
        this.geometry = other.geometry.map((child: any) => {
          return new Assembly(child);
        });
      } else if (
        other.geometry instanceof replicad.Shape ||
        other.geometry instanceof replicad.Drawing
      ) {
        this.geometry = other.geometry.clone();
      }
    }
  }

  /**
   * User-defined type guard. Lets callers narrow an `Assembly` to a leaf
   * (where `geometry` is a single replicad shape/drawing rather than an
   * `Assembly[]` branch) without manually checking `Array.isArray(...)`.
   */
  isLeaf(): this is Assembly<any> {
    return !Array.isArray(this.geometry);
  }

  // Apply function to all leafs in this assembly. Modifies this Assembly
  // in place. If fn returns null that leaf is dropped from the assembly.
  // Empty branches are recursively dropped as well.
  //
  // The callback's `leaf` parameter is typed `Assembly<LeafGeom>` in the
  // generated .d.ts, so users can read `leaf.geometry` as the proper
  // replicad union without having to handle the array branch.
  onLeafs(fn: (leaf: Assembly<any>) => Assembly<any> | null): Assembly | null {
    if (Array.isArray(this.geometry)) {
      this.geometry = this.geometry
        .map((child: any) => {
          child.onLeafs(fn);
          return child;
        })
        .filter((child: any) => {
          return child !== null;
        });
      if (this.geometry.length === 0) {
        return null;
      }
      return this;
    } else {
      return fn(this);
    }
  }

  /**
   * True when this assembly is (or contains, for branches) 2D geometry —
   * i.e. a replicad `Drawing`. For a branch node this defers to the first
   * leaf yielded by depth-first traversal; a branch with no leaves is
   * considered 3D.
   */
  is2D(): boolean {
    if (Array.isArray(this.geometry)) {
      return this.geometry.length > 0 && this.geometry[0].is2D();
    }
    const g = this.geometry as any;
    return !!g && !("_wrapped" in g);
  }

  /** True when this assembly's first leaf is a replicad Wire (1D curve). */
  isWire(): boolean {
    if (Array.isArray(this.geometry)) {
      return this.geometry.length > 0 && this.geometry[0].isWire();
    }
    return this.geometry instanceof replicad.Wire;
  }

  isPoint(): boolean {
    if (Array.isArray(this.geometry)) {
      return this.geometry.length > 0 && this.geometry[0].isPoint();
    }
    return this.geometry instanceof replicad.Vertex;
  }

  /** True when this assembly's first leaf is a 3D replicad solid (not a Wire or Point3D). */
  is3D(): boolean {
    if (Array.isArray(this.geometry)) {
      return this.geometry.length > 0 && this.geometry[0].is3D();
    }
    return replicad.isShape3D(this.geometry);
  }

  toJSON() {
    let geomString = "unknown";
    if (Array.isArray(this.geometry)) {
      geomString = JSON.stringify(this.geometry);
    } else if (
      this.geometry instanceof replicad.Shape ||
      this.geometry instanceof replicad.Drawing
    ) {
      geomString = this.geometry.constructor.name;
    }
    const planeString = this.plane ? "replicad.plane" : "null";
    return `{__isRawAbundanceObj: true, color: ${this.color}, tags: ${JSON.stringify(this.tags)}, bom: ${JSON.stringify(this.bom)}, plane: ${planeString}, geometry: ${geomString}}`;
  }
}

// Structural marker (set as non-enumerable on the prototype) used by the
// worker to recognise AbundanceObj values across the sandbox boundary.
Assembly.prototype.__abundance = "Assembly";

// -----------------------------------------------------------------------
// __promoteInput — internal sandbox helper
// -----------------------------------------------------------------------

/**
 * @internal
 * Wrap a raw POJO (tagged `__isRawAbundanceObj: true`) produced by the worker
 * into a real `Assembly`. Non-geometry values (numbers / strings /
 * booleans / null) pass through unchanged. Arrays are mapped element-wise so
 * that a geometry input typed `Assembly[]` arrives as an array of real
 * class instances inside user code.
 *
 * This function is prepended to every transpiled Code atom before execution
 * and is NOT part of the public API surface available to atom authors.
 */
export function __promoteInput(value: any): any {
  if (!value || value.__isRawAbundanceObj !== true) return value;

  const result = new Assembly(value);
  if (Array.isArray(result.geometry)) {
    result.geometry = result.geometry.map(__promoteInput);
  }
  return result;
}
