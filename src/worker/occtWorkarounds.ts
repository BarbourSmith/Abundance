import * as replicad from "replicad";

/**
 * Booleans skip replicad's face merge (SimplifyResult) unless asked for it.
 *
 * replicad merges faces that share a surface after every fuse, cut and
 * intersect. Under OpenCascade 8 that merge can leave an invalid solid, for
 * example when three equal tubes are fused at right angles, and fillets on the
 * result fail or grow spikes that assemblies then cut into neighbouring parts
 * (https://github.com/BarbourSmith/Abundance/issues/1934). The merge could
 * also edit an input's faces in place, which corrupted cached shapes (#1956).
 *
 * Without the merge, parts made by booleans keep seam edges where their
 * inputs met. Code atoms can still ask for it with `{ simplify: true }` or
 * call `simplify()`; both merge a copy of the shape, never the shape itself.
 * Some fillets and chamfers fail across those seams (a vertical-edge fillet
 * where a tab was fused onto a ring) while others only work without the merge
 * (the tubes in #1934), so a fillet or chamfer that fails or comes out invalid
 * is tried again on a merged copy of its shape.
 *
 * The booleans are built here rather than by replicad because deleting an
 * OpenCascade 8 boolean builder from JS doesn't free its intersection data
 * unless `Clear()` is called first. replicad never calls it, and leaves the
 * builder for the garbage collector, so every boolean leaked a few hundred KB
 * of WASM memory. Large projects ran the worker out of its 4 GB of memory in
 * one build, then failed with "index out of bounds" (Firefox) or "memory
 * access out of bounds" (Chrome).
 */

type BooleanOptions = {
  optimisation?: "none" | "commonFace" | "sameFace";
  simplify?: boolean;
};

const BOOLEAN_BUILDERS = {
  fuse: "BRepAlgoAPI_Fuse",
  cut: "BRepAlgoAPI_Cut",
  intersect: "BRepAlgoAPI_Common",
};

let installed = false;

// Deleting a BRepCheck_Analyzer from JS doesn't free its results either, so
// one analyzer is kept and re-initialised for each check.
let analyzer: any;
let emptyShape: any;

/**
 * Whether OpenCascade considers the shape valid. Used by the geometry checks
 * in the editor and the agent.
 */
export function checkShapeValid(shape: replicad.AnyShape): boolean {
  const oc = replicad.getOC() as any;
  if (!analyzer) {
    analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
    emptyShape = new oc.TopoDS_Compound();
    const builder = new oc.TopoDS_Builder();
    builder.MakeCompound(emptyShape);
    builder.delete();
  } else {
    analyzer.Init(shape.wrapped, true);
  }
  try {
    return analyzer.IsValid();
  } finally {
    // Don't keep the checked shape alive
    analyzer.Init(emptyShape, false);
  }
}

/**
 * Runs a boolean the way replicad does, without its face merge, then frees its
 * builder.
 */
function runBoolean(
  builderName: string,
  shape: replicad.Shape3D,
  other: replicad.Shape3D,
  { optimisation = "none" }: BooleanOptions,
): replicad.AnyShape {
  const oc = replicad.getOC() as any;
  const builder = new oc[builderName](shape.wrapped, other.wrapped);
  try {
    if (optimisation === "commonFace") {
      builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
    }
    if (optimisation === "sameFace") {
      builder.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
    }
    builder.Build();
    return replicad.cast(builder.Shape());
  } finally {
    builder.Clear();
    builder.delete();
  }
}

/**
 * A copy of the shape with faces that share a surface merged, as replicad's
 * booleans did. The shape is copied first because the merge edits faces in
 * place, even in its safe-input mode, and the faces may belong to a cached
 * shape.
 */
function mergedCopy(shape: replicad.Shape3D): replicad.AnyShape {
  const oc = replicad.getOC() as any;
  const identity = new oc.gp_Trsf();
  const copier = new oc.BRepBuilderAPI_Transform(
    shape.wrapped,
    identity,
    true,
    false,
  );
  const copy = copier.Shape();
  const unify = new oc.ShapeUpgrade_UnifySameDomain(copy, true, true, false);
  try {
    unify.SetAngularTolerance(0.001);
    unify.Build();
    return replicad.cast(unify.Shape());
  } finally {
    unify.delete();
    copy.delete();
    copier.delete();
    identity.delete();
  }
}

/**
 * Runs a fillet or chamfer, and if it throws or its result is invalid, runs it
 * again on a merged copy of the shape. The first result or error stands when
 * the retry doesn't do better.
 */
function withMergedRetry(
  shape: replicad.Shape3D,
  radiusConfig: any,
  run: (target: replicad.Shape3D, config: any) => replicad.Shape3D,
): replicad.Shape3D {
  // A finder passed as the config is deleted after use unless it's kept, and
  // the retry needs it.
  const finder =
    radiusConfig && typeof radiusConfig === "object" && !radiusConfig.keep
      ? radiusConfig.filter
      : undefined;
  const config = finder ? { ...radiusConfig, keep: true } : radiusConfig;
  try {
    let result: replicad.Shape3D | undefined;
    let error: unknown;
    try {
      result = run(shape, config);
      if (checkShapeValid(result)) return result;
    } catch (e) {
      // A crashed WASM module can't be retried
      if (e instanceof WebAssembly.RuntimeError) throw e;
      error = e;
    }

    let merged: replicad.AnyShape | undefined;
    try {
      merged = mergedCopy(shape);
      if (replicad.isShape3D(merged)) {
        const retried = run(merged, config);
        if (checkShapeValid(retried)) {
          result?.delete();
          return retried;
        }
        retried.delete();
      }
    } catch (e) {
      if (e instanceof WebAssembly.RuntimeError) throw e;
    } finally {
      merged?.delete();
    }

    if (result) return result;
    throw error;
  } finally {
    finder?.delete();
  }
}

/**
 * Patches replicad's 3D shapes so fuse, cut and intersect default to
 * `simplify: false` and free their builders, and fillet and chamfer retry on
 * a merged copy. Covers Abundance's own atoms and Code atoms, which call these
 * methods directly. Safe to call more than once.
 */
export function installOcctWorkarounds(): void {
  if (installed) return;
  installed = true;
  const proto = replicad._3DShape.prototype as any;

  for (const [method, builderName] of Object.entries(BOOLEAN_BUILDERS)) {
    proto[method] = function (
      this: replicad.Shape3D,
      other: replicad.Shape3D,
      options: BooleanOptions = {},
    ) {
      // replicad's intersect has no glue option
      if (method === "intersect") {
        options = { simplify: options.simplify };
      }
      let result = runBoolean(builderName, this, other, options);
      if (options.simplify && replicad.isShape3D(result)) {
        const unmerged = result;
        result = mergedCopy(unmerged);
        unmerged.delete();
      }
      if (!replicad.isShape3D(result)) {
        result.delete();
        throw new Error(`Could not ${method} as a 3d shape`);
      }
      return result;
    };
  }

  // replicad's simplify() merges faces in place, so it could change a cached
  // shape the way the booleans' merge did.
  proto.simplify = function (this: replicad.Shape3D) {
    const merged = mergedCopy(this);
    if (merged.constructor !== this.constructor) {
      merged.delete();
      throw new Error("unexpected types mismatch");
    }
    return merged;
  };

  for (const method of ["fillet", "chamfer"]) {
    const original = proto[method];
    proto[method] = function (
      this: replicad.Shape3D,
      radiusConfig: any,
      filter?: unknown,
    ) {
      return withMergedRetry(this, radiusConfig, (target, config) =>
        original.call(target, config, filter),
      );
    };
  }
}
