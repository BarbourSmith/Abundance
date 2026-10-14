import GlobalVariables from "./globalvariables.js";

/**
 * Flags atoms whose output contains geometry OpenCascade reports as invalid,
 * which may render, cut or combine incorrectly. The flag marks where broken
 * geometry starts: an atom is only checked on the parts it made, not parts
 * passed through from its inputs, and isn't flagged when an input is already
 * broken (moving or cutting a broken part makes another broken part). Checks
 * run in the mesh workers, one at a time, and are remembered per part.
 */

const EMPTY_SHAPE = "emptyshape";
// Per atom, so one huge output can't hold up the rest for long
const BUDGET_MS = 5000;

// `${project}|${geometry id}` -> whether the part is valid
const validity = new Map();
let queue = Promise.resolve();

/** The geometry ids of every part in an atom's value. */
function partIds(value, ids = new Set()) {
  if (!value || typeof value !== "object") return ids;
  if (typeof value.geometry === "string") {
    if (value.geometry !== EMPTY_SHAPE) ids.add(value.geometry);
  } else if (Array.isArray(value.geometry)) {
    value.geometry.forEach((child) => partIds(child, ids));
  }
  return ids;
}

function warningFor(invalidCount, partCount) {
  const what =
    partCount === 1
      ? "the shape this atom made"
      : invalidCount === partCount
        ? `all ${partCount} parts this atom made`
        : `${invalidCount} of the ${partCount} parts this atom made`;
  const it = invalidCount === 1 ? "it" : "they";
  return `Broken geometry: OpenCascade reports ${what} as invalid, so ${it} may render, cut or combine incorrectly.`;
}

/**
 * Checks the parts `atom` made in `value`, its newly computed output, and
 * flags the atom if any are invalid. Safe to call on every compute: work for a
 * value the atom has since replaced is skipped.
 */
export function checkAtomGeometry(atom, value) {
  if (!GlobalVariables.pool || atom.nodesOnTheScreen) return;
  const made = partIds(value);
  if (!made.size) return;
  const inherited = new Set();
  atom.inputs.forEach((input) => partIds(input.getState?.().value, inherited));
  const fresh = [...made].filter((id) => !inherited.has(id));
  if (!fresh.length) return;

  const context = atom.getContext();
  const key = (id) => `${context?.project ?? ""}|${id}`;
  const isCurrent = () => atom.value === value;

  queue = queue
    .then(async () => {
      if (!isCurrent()) return;
      const unknown = fresh.filter((id) => !validity.has(key(id)));
      if (unknown.length) {
        const worker = await GlobalVariables.pool.proxy();
        const { checked, invalid } = await worker.findInvalidParts(
          unknown,
          context,
          BUDGET_MS,
        );
        const bad = new Set(invalid);
        checked.forEach((id) => validity.set(key(id), !bad.has(id)));
      }
      if (!isCurrent()) return;
      const brokenInput = [...inherited].some(
        (id) => validity.get(key(id)) === false,
      );
      if (brokenInput) return;
      const invalidCount = fresh.filter(
        (id) => validity.get(key(id)) === false,
      ).length;
      if (invalidCount) {
        atom.setGeometryWarning(warningFor(invalidCount, fresh.length));
      }
    })
    .catch((err) => {
      // The check is advisory; never let it break computing.
      console.warn("Geometry check failed:", err);
    });
}
