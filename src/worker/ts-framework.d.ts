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
export declare class Assembly<G = any> {
    __abundance: string;
    geometry: any;
    color: string;
    tags: string[];
    bom: string[];
    plane: any;
    constructor(other?: Partial<Assembly>);
    /**
     * User-defined type guard. Lets callers narrow an `Assembly` to a leaf
     * (where `geometry` is a single replicad shape/drawing rather than an
     * `Assembly[]` branch) without manually checking `Array.isArray(...)`.
     */
    isLeaf(): this is Assembly<any>;
    onLeafs(fn: (leaf: Assembly<any>) => Assembly<any> | null): Assembly | null;
    /**
     * True when this assembly is (or contains, for branches) 2D geometry —
     * i.e. a replicad `Drawing`. For a branch node this defers to the first
     * leaf yielded by depth-first traversal; a branch with no leaves is
     * considered 3D.
     */
    is2D(): boolean;
    /** True when this assembly's first leaf is a 3D replicad shape. */
    is3D(): boolean;
    toJSON(): string;
}
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
export declare function __promoteInput(value: any): any;
