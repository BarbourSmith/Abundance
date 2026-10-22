import * as replicad from "replicad";

/**
 * Workarounds for OpenCascade 8 (replicad 1.x) regressions that break older
 * projects. See https://github.com/BarbourSmith/Abundance/issues/1910.
 *
 * replicad simplifies the result of every boolean, merging faces that share a
 * surface, as it did before the upgrade. Under OpenCascade 8 that merge can
 * leave an invalid solid, for example when three equal tubes are fused at right
 * angles. Fillets on such a solid fail, or grow spikes several times the
 * part's size that assemblies then cut into neighbouring parts.
 *
 * Falling back to the unmerged result keeps these booleans valid. Fillets on a
 * valid merged solid can still fail under OpenCascade 8; atoms whose output is
 * invalid are flagged in the editor (src/js/geometryCheck.js).
 *
 * replicad's booleans can also modify the shapes they are given. After the
 * boolean, replicad merges faces in the result (SimplifyResult). Where the
 * result reuses an input's own faces, as when a cut changes nothing, the merge
 * edits them in place and so changes the input: cutting a channel by the
 * keepout that fills it reversed one of the channel's faces. replicad's
 * clone() shares the underlying shape, so a boolean on a cached shape
 * corrupted the cache, and a batch then saved the corrupted shape over the
 * stored one. Booleans therefore run on copies of their inputs.
 */

type BooleanOptions = { optimisation?: "none" | "commonFace" | "sameFace" };

const BOOLEAN_BUILDERS = {
  fuse: "BRepAlgoAPI_Fuse",
  cut: "BRepAlgoAPI_Cut",
  intersect: "BRepAlgoAPI_Common",
} as const;

let installed = false;

// Shapes are immutable, so each is checked once
const validity = new WeakMap<object, boolean>();

function isValidShape(shape: replicad.AnyShape): boolean {
  const known = validity.get(shape);
  if (known !== undefined) return known;
  const oc = replicad.getOC() as any;
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
  try {
    const valid = analyzer.IsValid();
    validity.set(shape, valid);
    return valid;
  } finally {
    analyzer.delete();
  }
}

/** A copy of a shape that shares no geometry or topology with it. */
function copyShape<T extends replicad.AnyShape>(shape: T): T {
  const oc = replicad.getOC() as any;
  const identity = new oc.gp_Trsf();
  const builder = new oc.BRepBuilderAPI_Transform(
    shape.wrapped,
    identity,
    true,
    false,
  );
  try {
    return replicad.cast(builder.ModifiedShape(shape.wrapped)) as T;
  } finally {
    builder.delete();
    identity.delete();
  }
}

/** The boolean as replicad builds it, without merging faces afterwards. */
function unmergedBoolean(
  builderName: string,
  shape: replicad.Shape3D,
  other: replicad.Shape3D,
  { optimisation = "none" }: BooleanOptions = {},
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
    builder.delete();
  }
}

/**
 * Runs a boolean on copies of its inputs, which it may modify.
 *
 * TODO: once replicad lets booleans skip SimplifyResult and we turn that step
 * off, try removing the copies, since only that step changed the inputs.
 */
function onCopies<T>(
  shape: replicad.Shape3D,
  other: replicad.Shape3D,
  boolean: (shape: replicad.Shape3D, other: replicad.Shape3D) => T,
): T {
  const shapeCopy = copyShape(shape);
  const otherCopy = copyShape(other);
  try {
    return boolean(shapeCopy, otherCopy);
  } finally {
    shapeCopy.delete();
    otherCopy.delete();
  }
}

/**
 * Patches replicad's 3D shapes so booleans leave their inputs unchanged, and
 * so a boolean whose merged result is invalid returns the unmerged result
 * instead. Covers Abundance's own atoms and Code atoms, which call these
 * methods directly. Safe to call more than once.
 */
export function installOcctWorkarounds(): void {
  if (installed) return;
  installed = true;
  const proto = replicad._3DShape.prototype as any;

  for (const [method, builderName] of Object.entries(BOOLEAN_BUILDERS)) {
    const original = proto[method];
    proto[method] = function (
      this: replicad.Shape3D,
      other: replicad.Shape3D,
      options?: BooleanOptions,
    ) {
      const result = onCopies(this, other, (shape, tool) =>
        original.call(shape, tool, options),
      );
      // Only a merge that broke valid inputs can be undone; skip the extra
      // work for inputs that were already broken.
      if (
        isValidShape(result) ||
        !isValidShape(this) ||
        !isValidShape(other)
      ) {
        return result;
      }

      const unmerged = onCopies(this, other, (shape, tool) =>
        unmergedBoolean(builderName, shape, tool, options),
      );
      if (!replicad.isShape3D(unmerged) || !isValidShape(unmerged)) {
        unmerged.delete();
        return result;
      }
      result.delete();
      return unmerged;
    };
  }
}
