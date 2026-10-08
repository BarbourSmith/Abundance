import GlobalVariables from "./globalvariables.js";
import { Status } from "../prototypes/observableEntity.js";

/**
 * True while any atom is computing or CAD worker calls are in flight. Atoms
 * left WAITING (for example behind an error) don't count, since they may never
 * run. Same test the agent bridge's wait_for_settle uses.
 */
export const isModelComputing = () => {
  if (GlobalVariables.cad?._pendingCalls?.length > 0) {
    return true;
  }
  const hasProcessingAtom = (molecule) =>
    (molecule.nodesOnTheScreen || []).some(
      (atom) => atom.status === Status.PROCESSING || hasProcessingAtom(atom),
    );
  return GlobalVariables.topLevelMolecule
    ? hasProcessingAtom(GlobalVariables.topLevelMolecule)
    : false;
};

export const SWEEP_RETRY_MS = 2000;
export const SWEEP_MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * Delete cached geometry the project no longer uses, once nothing is
 * computing. The sweep keeps only the ids the atoms hold right now, so running
 * it mid-computation deletes shapes that in-flight work (an Assembly batch, for
 * example) has written but not yet handed to an atom, and later reads of them
 * fail with "not found in cache". Skipping a sweep only leaves extra shapes in
 * the cache until the next save.
 */
export const sweepCacheWhenIdle = (
  topLevelMolecule,
  startedAt = Date.now(),
) => {
  if (GlobalVariables.topLevelMolecule !== topLevelMolecule) {
    return; // A different project was opened while waiting.
  }
  if (isModelComputing()) {
    if (Date.now() - startedAt > SWEEP_MAX_WAIT_MS) {
      console.warn("Skipping cache sweep: the model is still computing.");
      return;
    }
    setTimeout(
      () => sweepCacheWhenIdle(topLevelMolecule, startedAt),
      SWEEP_RETRY_MS,
    );
    return;
  }
  GlobalVariables.cad
    .sweepCache(topLevelMolecule.deepGeomList(), topLevelMolecule.getContext())
    .catch((error) => {
      console.error("Error during cache sweep:", error);
    });
};
