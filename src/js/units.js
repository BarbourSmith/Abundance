/**
 * Helpers for projects and GitHub molecules that use different units.
 *
 * A GitHub molecule keeps the unitsKey of the project it was imported from, so
 * its inputs and insides stay in those units. Its output is scaled into the
 * units of whatever contains it: the nearest enclosing GitHub molecule, or
 * the top-level project.
 */

const MM_PER_UNIT = { MM: 1, Inches: 25.4 };

/** Short label for showing a unit next to a value. */
export function unitAbbreviation(unitsKey) {
  if (unitsKey === "MM") return "mm";
  if (unitsKey === "Inches") return "in";
  return unitsKey || "";
}

/**
 * Scale factor that converts a length in fromUnits to toUnits, or null when
 * no conversion applies (same units, Unitless, or a unit is unknown).
 */
export function unitScaleFactor(fromUnits, toUnits) {
  const from = MM_PER_UNIT[fromUnits];
  const to = MM_PER_UNIT[toUnits];
  if (!from || !to || from === to) return null;
  return from / to;
}

/**
 * The units the given atom's geometry is in: those of the nearest enclosing
 * GitHub molecule or top-level molecule (the atom itself counts). Plain
 * molecules don't set units; they use their container's. So do Unitless
 * molecules and ones saved before projects recorded units, since they work
 * in whatever units they're given.
 */
export function unitsContextOf(atom) {
  let curr = atom;
  while (curr) {
    if (
      (curr.atomType === "GitHubMolecule" || curr.topLevel) &&
      curr.unitsKey in MM_PER_UNIT
    ) {
      return curr.unitsKey;
    }
    curr = curr.parent;
  }
  return undefined;
}

/**
 * Recompute the output scaling of every GitHub molecule whose units are
 * relative to root, e.g. after the project's units change. Molecules nested
 * inside a GitHub molecule with its own units are relative to that one, so
 * they're skipped.
 */
export function refreshUnitScaling(root) {
  const visit = (molecule) => {
    (molecule.nodesOnTheScreen || []).forEach((atom) => {
      if (atom.atomType === "GitHubMolecule" && atom.unitsKey in MM_PER_UNIT) {
        atom.onUpstreamChange();
      } else if (
        atom.atomType === "Molecule" ||
        atom.atomType === "GitHubMolecule"
      ) {
        visit(atom);
      }
    });
  };
  visit(root);
}
