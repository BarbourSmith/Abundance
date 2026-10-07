import { fetchGitHubFileContent } from "./githubFileUtils.js";

/**
 * A loaded BOM baseline is text or null (file absent). Undefined means unknown.
 * Only a contents-API 404 means absent; other failures must reach the load UI.
 */
export async function loadSavedBom(octokit, owner, repo) {
  let response;
  try {
    response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "BillOfMaterials.md",
    });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
  return fetchGitHubFileContent(response.data, { octokit });
}

/**
 * Compare authored inputs, not wired values or evaluated expression results.
 * This is separate from the saved payload: serialize() remains unchanged.
 * Retain other persisted properties, including user-selected cut orientations
 * and placements, rather than treating every computed property as disposable.
 */
export function serializeProjectForChangeDetection(
  molecule,
  serialized = molecule.serialize(),
) {
  const normalize = (atom, saved) => {
    const snapshot = { ...saved };
    const children = atom.nodesOnTheScreen || [];
    const inputs = new Map((atom.inputs || []).map((ap) => [ap.name, ap]));
    // Match molecule.serialize's support for Input atoms absent from inputs.
    for (const child of children) {
      if (child.atomType === "Input" && child.parentAP) {
        inputs.set(child.parentAP.name, child.parentAP);
      }
    }
    const ioValues = new Map(
      (saved.ioValues || []).map((io) => [io.name, { ...io }]),
    );
    for (const ap of inputs.values()) {
      if (ap.valueType === "geometry" || ap.connectors.length > 0) {
        // Geometry definitions and wiring live in Input atoms/connectors.
        // Spare geometry sockets can be added automatically during computation.
        ioValues.delete(ap.name);
      } else if (
        typeof ap.currentEquation === "string" &&
        ap.currentEquation.trim() !== ""
      ) {
        // serialize() omits equations while their value is null (e.g. WAITING).
        ioValues.set(ap.name, {
          name: ap.name,
          currentEquation: ap.currentEquation,
        });
      }
    }
    if (ioValues.size > 0) {
      snapshot.ioValues = [...ioValues.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    } else {
      delete snapshot.ioValues;
    }
    if (saved.allAtoms) {
      const childrenById = new Map(
        children.map((child) => [child.uniqueID, child]),
      );
      snapshot.allAtoms = saved.allAtoms.map((child) => {
        const liveChild = childrenById.get(child.uniqueID);
        if (!liveChild) {
          throw new Error(
            `Cannot compare project: atom ${child.uniqueID} is missing`,
          );
        }
        return normalize(liveChild, child);
      });
    }
    if (atom.atomType === "Code") {
      delete snapshot.compiledCode;
    }
    return snapshot;
  };

  return JSON.stringify(
    { ...normalize(molecule, serialized), filetypeVersion: 1 },
    (_, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
          )
        : value,
  );
}

export function hasProjectChanges(
  lastSaved,
  projectKey,
  currentSerialized,
  bomContent,
) {
  return (
    !lastSaved ||
    lastSaved.projectKey !== projectKey ||
    lastSaved.json !== currentSerialized ||
    (bomContent != null && bomContent !== lastSaved.bom)
  );
}
