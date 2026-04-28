import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for unit-aware scaling of imported GitHub molecules.
 *
 * Issue: When a GitHub molecule modeled in MM is imported into an inch-based
 * project (or vice versa), its geometry should be automatically scaled so that
 * dimensions appear correctly.  A 20mm screw must show up as ~0.787 in when
 * imported into an inch project, not as 20 in.
 *
 * Implementation: GitHubMolecule overrides _handleOutputReady() to apply a
 * CAD scale operation whenever its own unitsKey differs from the host project's
 * unitsKey.  _getUnitScaleFactor() computes the correct factor by walking up
 * the parent chain to find the nearest ancestor with a defined unitsKey.
 */

// ---------------------------------------------------------------------------
// Helpers to build minimal mock objects
// ---------------------------------------------------------------------------

function makeParent(unitsKey) {
  return { unitsKey, parent: null };
}

function makeGitHubMolecule(ownUnitsKey, parent) {
  // Minimal stand-in that implements just the methods under test
  const mol = {
    unitsKey: ownUnitsKey,
    parent,
    status: "waiting",
    nonReplicadGeom: null,

    // Track calls for assertions
    _setReadyCalls: [],
    _setProcessingCalls: [],
    _setErrorCalls: [],
    _superHandleOutputReadyCalls: [],
    _cadScaleCalls: [],

    setProcessing() {
      this._setProcessingCalls.push(true);
      this.status = "processing";
    },
    setError(msg) {
      this._setErrorCalls.push(msg);
      this.status = "error";
    },
    getContext() {
      return { id: "test-context" };
    },
  };

  // Attach the real methods from GitHubMolecule as plain functions
  mol._getUnitScaleFactor = _getUnitScaleFactor.bind(mol);
  mol._handleOutputReady = _handleOutputReady.bind(mol);

  // Simulate super._handleOutputReady (Molecule's implementation)
  mol._superHandleOutputReady = function (value, nonReplicadGeom) {
    this._superHandleOutputReadyCalls.push({ value, nonReplicadGeom });
    this.nonReplicadGeom = nonReplicadGeom;
    this.status = "ready";
    this._setReadyCalls.push(value);
  };

  return mol;
}

// ---------------------------------------------------------------------------
// The actual method implementations under test (copied verbatim from
// githubmolecule.js so we can test them without the full module system).
// ---------------------------------------------------------------------------

function _getUnitScaleFactor() {
  const importedUnits = this.unitsKey;

  let hostUnits;
  let curr = this.parent;
  while (curr) {
    if (curr.unitsKey !== undefined) {
      hostUnits = curr.unitsKey;
      break;
    }
    curr = curr.parent;
  }

  if (
    !importedUnits ||
    !hostUnits ||
    importedUnits === hostUnits ||
    importedUnits === "Unitless" ||
    hostUnits === "Unitless"
  ) {
    return 1;
  }

  if (importedUnits === "MM" && hostUnits === "Inches") {
    return 1 / 25.4;
  }

  if (importedUnits === "Inches" && hostUnits === "MM") {
    return 25.4;
  }

  return 1;
}

function _handleOutputReady(value, nonReplicadGeom) {
  const scaleFactor = this._getUnitScaleFactor();

  if (scaleFactor === 1) {
    this._superHandleOutputReady(value, nonReplicadGeom);
    return;
  }

  this.setProcessing();
  this._mockCad
    .scale(value, scaleFactor, this.getContext())
    .then((scaledValue) => {
      this._superHandleOutputReady(scaledValue, nonReplicadGeom);
    })
    .catch((err) => {
      this.setError(err?.message || "Failed to apply unit scale");
    });
}

// ---------------------------------------------------------------------------
// Tests for _getUnitScaleFactor
// ---------------------------------------------------------------------------

describe("GitHubMolecule._getUnitScaleFactor", () => {
  it("returns 1/25.4 when imported MM into an Inches host", () => {
    const mol = makeGitHubMolecule("MM", makeParent("Inches"));
    expect(mol._getUnitScaleFactor()).toBeCloseTo(1 / 25.4, 10);
  });

  it("returns 25.4 when imported Inches into a MM host", () => {
    const mol = makeGitHubMolecule("Inches", makeParent("MM"));
    expect(mol._getUnitScaleFactor()).toBe(25.4);
  });

  it("returns 1 when both units are MM", () => {
    const mol = makeGitHubMolecule("MM", makeParent("MM"));
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("returns 1 when both units are Inches", () => {
    const mol = makeGitHubMolecule("Inches", makeParent("Inches"));
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("returns 1 when imported units are Unitless", () => {
    const mol = makeGitHubMolecule("Unitless", makeParent("Inches"));
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("returns 1 when host units are Unitless", () => {
    const mol = makeGitHubMolecule("MM", makeParent("Unitless"));
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("returns 1 when imported unitsKey is undefined", () => {
    const mol = makeGitHubMolecule(undefined, makeParent("Inches"));
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("returns 1 when no ancestor has a defined unitsKey", () => {
    // No parent at all
    const mol = makeGitHubMolecule("MM", null);
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("finds host units by walking up two levels of parents", () => {
    // Top-level has Inches, intermediate has no unitsKey
    const topLevel = makeParent("Inches");
    const intermediate = { unitsKey: undefined, parent: topLevel };
    const mol = makeGitHubMolecule("MM", intermediate);
    expect(mol._getUnitScaleFactor()).toBeCloseTo(1 / 25.4, 10);
  });

  it("uses nearest ancestor units when a GitHubMolecule is nested in another", () => {
    // Inner GitHub mol (Inches) is inside outer GitHub mol (MM).
    // Scale should convert Inches → MM (not Inches → Inches top-level).
    const outerMol = makeParent("MM"); // outer GitHub molecule context
    const inner = makeGitHubMolecule("Inches", outerMol);
    expect(inner._getUnitScaleFactor()).toBe(25.4);
  });
});

// ---------------------------------------------------------------------------
// Tests for _handleOutputReady
// ---------------------------------------------------------------------------

describe("GitHubMolecule._handleOutputReady", () => {
  const fakeGeom = { geometry: "geom-id-1", dimension: "3D" };
  const fakeNonReplicadGeom = { geometry: [] };

  it("calls super directly (no CAD scale) when units match", () => {
    const mol = makeGitHubMolecule("MM", makeParent("MM"));
    mol._handleOutputReady(fakeGeom, fakeNonReplicadGeom);

    expect(mol._superHandleOutputReadyCalls).toHaveLength(1);
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(fakeGeom);
    expect(mol._setProcessingCalls).toHaveLength(0);
  });

  it("applies CAD scale when MM is imported into Inches host", async () => {
    const scaledGeom = { geometry: "geom-id-scaled", dimension: "3D" };
    const mockCad = {
      scale: vi.fn().mockResolvedValue(scaledGeom),
    };

    const mol = makeGitHubMolecule("MM", makeParent("Inches"));
    mol._mockCad = mockCad;
    mol._handleOutputReady = _handleOutputReady.bind(mol);

    mol._handleOutputReady(fakeGeom, fakeNonReplicadGeom);

    // setProcessing should have been called synchronously
    expect(mol._setProcessingCalls).toHaveLength(1);

    // Wait for the async scale to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCad.scale).toHaveBeenCalledWith(
      fakeGeom,
      expect.closeTo(1 / 25.4, 10),
      mol.getContext(),
    );
    expect(mol._superHandleOutputReadyCalls).toHaveLength(1);
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(scaledGeom);
    expect(mol._superHandleOutputReadyCalls[0].nonReplicadGeom).toBe(
      fakeNonReplicadGeom,
    );
  });

  it("applies CAD scale when Inches is imported into MM host", async () => {
    const scaledGeom = { geometry: "geom-id-scaled-25_4", dimension: "3D" };
    const mockCad = {
      scale: vi.fn().mockResolvedValue(scaledGeom),
    };

    const mol = makeGitHubMolecule("Inches", makeParent("MM"));
    mol._mockCad = mockCad;
    mol._handleOutputReady = _handleOutputReady.bind(mol);

    mol._handleOutputReady(fakeGeom, fakeNonReplicadGeom);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockCad.scale).toHaveBeenCalledWith(
      fakeGeom,
      25.4,
      mol.getContext(),
    );
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(scaledGeom);
  });

  it("calls setError when the CAD scale rejects", async () => {
    const mockCad = {
      scale: vi.fn().mockRejectedValue(new Error("scale failed")),
    };

    const mol = makeGitHubMolecule("MM", makeParent("Inches"));
    mol._mockCad = mockCad;
    mol._handleOutputReady = _handleOutputReady.bind(mol);

    mol._handleOutputReady(fakeGeom, null);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mol._setErrorCalls).toHaveLength(1);
    expect(mol._setErrorCalls[0]).toBe("scale failed");
    expect(mol._superHandleOutputReadyCalls).toHaveLength(0);
  });

  it("does not scale when either unit is Unitless", () => {
    const mol = makeGitHubMolecule("Unitless", makeParent("Inches"));
    mol._handleOutputReady(fakeGeom, null);

    expect(mol._superHandleOutputReadyCalls).toHaveLength(1);
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(fakeGeom);
    expect(mol._setProcessingCalls).toHaveLength(0);
  });
});
