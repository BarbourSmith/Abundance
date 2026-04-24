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
 */
export class Assembly implements Iterable<Assembly> {
  // Structural marker set on the prototype below — used by the worker to
  // recognise AbundanceObj return values across the sandbox boundary without
  // relying on `instanceof` (which would fail because the class is defined
  // inside the sandboxed Function scope).
  declare __abundance: string;

  // `geometry` is intentionally typed `any` here so this file compiles
  // standalone (the `replicad` global is only available as a value, not as
  // a namespace, in this build context). The generated `.d.ts` post-
  // processor rewrites both occurrences of `geometry: any` back to the
  // proper `replicad.AnyShape | replicad.Drawing | Assembly[]` union so
  // users see real IntelliSense in Monaco. See scripts/build-ts-framework.mjs.
  geometry: any;
  color: string = "#ffffff";
  tags: string[] = [];
  bom: string[] = [];
  plane: any = replicad.makePlane();

  constructor(geometry: any, other?: Partial<Assembly>) {
    if (other) {
      this.color = other.color ?? this.color;
      this.tags = other.tags ?? this.tags;
      this.bom = other.bom ?? this.bom;
      this.plane = other.plane ?? this.plane;
    }
    this.geometry = geometry;
  }

  // Iterates over leaf nodes of the assembly tree. A node is a leaf when its
  // `geometry` is a replicad shape or drawing (i.e. not an `Assembly[]`).
  // Branch nodes are traversed depth-first, left-to-right, and are NOT
  // themselves yielded — callers only ever see leaves.
  *[Symbol.iterator](): Iterator<Assembly> {
    if (Array.isArray(this.geometry)) {
      for (const child of this.geometry) yield* child;
    } else {
      yield this;
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

  /** True when this assembly's first leaf is a 3D replicad shape. */
  is3D(): boolean {
    return !this.is2D();
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

  const result = new Assembly(value.geometry, value);
  if (Array.isArray(result.geometry)) {
    result.geometry = result.geometry.map(__promoteInput);
  }
  return result;
}
