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
 * inputs met. Code atoms can still ask for it with `{ simplify: true }`.
 */

type BooleanOptions = { simplify?: boolean };

let installed = false;

/**
 * Patches replicad's 3D shapes so fuse, cut and intersect default to
 * `simplify: false`. Covers Abundance's own atoms and Code atoms, which call
 * these methods directly. Safe to call more than once.
 */
export function installOcctWorkarounds(): void {
  if (installed) return;
  installed = true;
  const proto = replicad._3DShape.prototype as any;

  for (const method of ["fuse", "cut", "intersect"]) {
    const original = proto[method];
    proto[method] = function (
      this: replicad.Shape3D,
      other: replicad.Shape3D,
      options?: BooleanOptions,
    ) {
      return original.call(this, other, { simplify: false, ...options });
    };
  }
}
