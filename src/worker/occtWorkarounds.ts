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
 */

type BooleanOptions = { optimisation?: "none" | "commonFace" | "sameFace" };

const BOOLEAN_BUILDERS = {
  fuse: "BRepAlgoAPI_Fuse",
  cut: "BRepAlgoAPI_Cut",
  intersect: "BRepAlgoAPI_Common",
} as const;

let installed = false;

function isValidShape(shape: replicad.AnyShape): boolean {
  const oc = replicad.getOC() as any;
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
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
 * Patches replicad's 3D shapes so a boolean whose merged result is invalid
 * returns the unmerged result instead. Covers Abundance's own atoms and Code
 * atoms, which call these methods directly. Safe to call more than once.
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
      const result = original.call(this, other, options);
      if (isValidShape(result)) return result;

      const unmerged = unmergedBoolean(builderName, this, other, options);
      if (!replicad.isShape3D(unmerged) || !isValidShape(unmerged)) {
        unmerged.delete();
        return result;
      }
      result.delete();
      return unmerged;
    };
  }
}
