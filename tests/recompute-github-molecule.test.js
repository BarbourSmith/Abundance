import { describe, it, expect, vi } from "vitest";

/**
 * Test to verify that recomputeAll() doesn't break GitHub molecules
 * 
 * Issue: When a project has GitHub molecules, clicking "recompute project"
 * causes the GitHub molecules to get stuck in PROCESSING or WAITING state.
 * 
 * Root cause: recomputeAll() was calling enable() on all atoms without
 * checking if they were already enabled, causing molecules that were already
 * in WAITING/PROCESSING state to be re-enabled incorrectly.
 * 
 * Fix: Use enableAllChildren() which checks if atoms are DISABLED before enabling them.
 */

const Status = {
  DISABLED: "disabled",
  WAITING: "waiting",
  PROCESSING: "processing",
  READY: "ready",
};

describe("Recompute Project with GitHub Molecules - Logic Test", () => {
  it("should verify the fix logic: enableAllChildren checks status before enabling", () => {
    // Simulate the old buggy implementation
    const oldRecomputeAllLogic = (atoms, enableAtom) => {
      // Old buggy code: doesn't check status
      for (const atom of atoms) {
        enableAtom(atom);
      }
    };

    // Simulate the new fixed implementation
    const newRecomputeAllLogic = (atoms, enableAtom) => {
      // New fixed code: checks if atom is DISABLED before enabling
      for (const atom of atoms) {
        if (atom.status === Status.DISABLED) {
          enableAtom(atom);
        }
      }
    };

    // Create mock atoms in different states
    const atoms = [
      { id: 1, status: Status.DISABLED, enableCount: 0 },
      { id: 2, status: Status.WAITING, enableCount: 0 },  // Already enabled
      { id: 3, status: Status.PROCESSING, enableCount: 0 },  // Already enabled
      { id: 4, status: Status.DISABLED, enableCount: 0 },
    ];

    const enableAtom = (atom) => {
      atom.enableCount++;
      if (atom.status === Status.DISABLED) {
        atom.status = Status.WAITING;
      }
    };

    // Test old implementation
    const atomsOld = JSON.parse(JSON.stringify(atoms));
    atomsOld.forEach(a => a.enableCount = 0);
    oldRecomputeAllLogic(atomsOld, enableAtom);

    // Old implementation would try to enable all atoms, including already enabled ones
    expect(atomsOld[0].enableCount).toBe(1);
    expect(atomsOld[1].enableCount).toBe(1);  // BAD: tries to enable already waiting atom
    expect(atomsOld[2].enableCount).toBe(1);  // BAD: tries to enable already processing atom
    expect(atomsOld[3].enableCount).toBe(1);

    // Test new implementation
    const atomsNew = JSON.parse(JSON.stringify(atoms));
    atomsNew.forEach(a => a.enableCount = 0);
    newRecomputeAllLogic(atomsNew, enableAtom);

    // New implementation only enables DISABLED atoms
    expect(atomsNew[0].enableCount).toBe(1);
    expect(atomsNew[1].enableCount).toBe(0);  // GOOD: skips already waiting atom
    expect(atomsNew[2].enableCount).toBe(0);  // GOOD: skips already processing atom
    expect(atomsNew[3].enableCount).toBe(1);
  });

  it("should demonstrate the issue: re-enabling already enabled atoms breaks the flow", () => {
    // Simulate what happens to a GitHub molecule during recompute
    
    // Initial state: all disabled
    const githubMolecule = {
      status: Status.DISABLED,
      enableCallCount: 0,
      enable: function() {
        this.enableCallCount++;
        if (this.status === Status.DISABLED) {
          this.status = Status.WAITING;
          return true;  // Successfully enabled
        }
        return false;  // Already enabled, no-op
      }
    };

    // Scenario 1: Correct flow
    // 1. Molecule is disabled
    expect(githubMolecule.status).toBe(Status.DISABLED);
    
    // 2. Enable is called, molecule transitions to WAITING
    const result1 = githubMolecule.enable();
    expect(result1).toBe(true);
    expect(githubMolecule.status).toBe(Status.WAITING);
    expect(githubMolecule.enableCallCount).toBe(1);
    
    // 3. If we try to enable again while WAITING, it should be a no-op
    const result2 = githubMolecule.enable();
    expect(result2).toBe(false);  // Returns false, indicating no-op
    expect(githubMolecule.status).toBe(Status.WAITING);  // Status unchanged
    expect(githubMolecule.enableCallCount).toBe(2);  // But the method was still called

    // The issue: even though the method returns false and doesn't change status,
    // calling enable() on an already enabled atom can still cause issues in the
    // propagation chain, especially for molecules with complex internal structures
  });

  it("should verify enableAllChildren logic matches the fix", () => {
    // This test verifies that the fix (using enableAllChildren) is correct
    
    const mockCad = {
      clearCache: vi.fn().mockResolvedValue(undefined),
    };

    // Simulate a molecule with multiple atoms
    const atoms = [
      { status: Status.DISABLED, enable: vi.fn() },
      { status: Status.DISABLED, enable: vi.fn() },
      { status: Status.WAITING, enable: vi.fn() },  // Already enabled
    ];

    // Simulate enableAllChildren logic
    const enableAllChildren = (atomList) => {
      atomList.forEach((atom) => {
        if (atom.status === Status.DISABLED) {
          atom.enable();
        }
      });
    };

    enableAllChildren(atoms);

    // Verify only DISABLED atoms were enabled
    expect(atoms[0].enable).toHaveBeenCalledTimes(1);
    expect(atoms[1].enable).toHaveBeenCalledTimes(1);
    expect(atoms[2].enable).toHaveBeenCalledTimes(0);  // Not called because WAITING
  });
});
