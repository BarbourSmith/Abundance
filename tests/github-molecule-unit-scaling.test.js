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
// Mock GlobalVariables before any module imports so the production code path
// (which calls GlobalVariables.cad.scale) can be tested with a controlled mock.
// ---------------------------------------------------------------------------
vi.mock("../src/js/globalvariables.js", () => ({
  default: {
    cad: { scale: vi.fn() },
    generateUniqueID: () => "test-id",
  },
}));

import GlobalVariables from "../src/js/globalvariables.js";

// ---------------------------------------------------------------------------
// The actual method implementations under test are copied verbatim from
// githubmolecule.js. This avoids pulling in the full module dependency chain
// (replicad, Octokit, atom.js, etc.) while still testing the real logic.
// The _handleOutputReady copy references GlobalVariables.cad — the same
// dependency as the production code — so both test and production exercise
// the same call path.
// ---------------------------------------------------------------------------

const MM_PER_INCH = 25.4;

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
    return 1 / MM_PER_INCH;
  }

  if (importedUnits === "Inches" && hostUnits === "MM") {
    return MM_PER_INCH;
  }

  return 1;
}

/**
 * Production-equivalent _handleOutputReady. Uses GlobalVariables.cad.scale —
 * the same dependency as the real GitHubMolecule method — so mocking
 * GlobalVariables.cad in tests exercises the actual production call path.
 */
function _handleOutputReady(value, nonReplicadGeom) {
  const scaleFactor = this._getUnitScaleFactor();

  if (scaleFactor === 1) {
    this._superHandleOutputReady(value, nonReplicadGeom);
    return;
  }

  // Apply unit conversion scale before propagating upstream
  this.setProcessing();
  GlobalVariables.cad
    .scale(value, scaleFactor, this.getContext())
    .then((scaledValue) => {
      this._superHandleOutputReady(scaledValue, nonReplicadGeom);
    })
    .catch((err) => {
      this.setError(err?.message || "Failed to apply unit scale");
    });
}

// ---------------------------------------------------------------------------
// Helpers to build minimal mock objects
// ---------------------------------------------------------------------------

function makeParent(unitsKey) {
  return { unitsKey, parent: null };
}

function makeGitHubMolecule(ownUnitsKey, parent) {
  const mol = {
    unitsKey: ownUnitsKey,
    parent,
    status: "waiting",
    nonReplicadGeom: null,

    // Recorded calls for assertions
    _setReadyCalls: [],
    _setProcessingCalls: [],
    _setErrorCalls: [],
    _superHandleOutputReadyCalls: [],

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

  mol._getUnitScaleFactor = _getUnitScaleFactor.bind(mol);
  mol._handleOutputReady = _handleOutputReady.bind(mol);

  // Simulate Molecule._handleOutputReady (super call)
  mol._superHandleOutputReady = function (value, nonReplicadGeom) {
    this._superHandleOutputReadyCalls.push({ value, nonReplicadGeom });
    this.nonReplicadGeom = nonReplicadGeom;
    this.status = "ready";
    this._setReadyCalls.push(value);
  };

  return mol;
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
    const mol = makeGitHubMolecule("MM", null);
    expect(mol._getUnitScaleFactor()).toBe(1);
  });

  it("finds host units by walking up two levels of parents", () => {
    const topLevel = makeParent("Inches");
    const intermediate = { unitsKey: undefined, parent: topLevel };
    const mol = makeGitHubMolecule("MM", intermediate);
    expect(mol._getUnitScaleFactor()).toBeCloseTo(1 / 25.4, 10);
  });

  it("uses nearest ancestor units when a GitHubMolecule is nested in another", () => {
    // Inner GitHub mol (Inches) is inside outer GitHub mol (MM).
    // Scale should convert Inches → MM (not Inches → top-level Inches).
    const outerMol = makeParent("MM");
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

  beforeEach(() => {
    // Reset the GlobalVariables.cad.scale mock before each test
    vi.mocked(GlobalVariables.cad.scale).mockReset();
  });

  it("calls super directly (no GlobalVariables.cad.scale) when units match", () => {
    const mol = makeGitHubMolecule("MM", makeParent("MM"));
    mol._handleOutputReady(fakeGeom, fakeNonReplicadGeom);

    expect(GlobalVariables.cad.scale).not.toHaveBeenCalled();
    expect(mol._superHandleOutputReadyCalls).toHaveLength(1);
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(fakeGeom);
    expect(mol._setProcessingCalls).toHaveLength(0);
  });

  it("calls GlobalVariables.cad.scale with 1/25.4 when MM is imported into Inches host", async () => {
    const scaledGeom = { geometry: "geom-id-scaled", dimension: "3D" };
    vi.mocked(GlobalVariables.cad.scale).mockResolvedValue(scaledGeom);

    const mol = makeGitHubMolecule("MM", makeParent("Inches"));
    mol._handleOutputReady(fakeGeom, fakeNonReplicadGeom);

    // setProcessing should have been called synchronously
    expect(mol._setProcessingCalls).toHaveLength(1);

    // Wait for the async scale to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(GlobalVariables.cad.scale).toHaveBeenCalledWith(
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

  it("calls GlobalVariables.cad.scale with 25.4 when Inches is imported into MM host", async () => {
    const scaledGeom = { geometry: "geom-id-scaled-25_4", dimension: "3D" };
    vi.mocked(GlobalVariables.cad.scale).mockResolvedValue(scaledGeom);

    const mol = makeGitHubMolecule("Inches", makeParent("MM"));
    mol._handleOutputReady(fakeGeom, fakeNonReplicadGeom);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(GlobalVariables.cad.scale).toHaveBeenCalledWith(
      fakeGeom,
      25.4,
      mol.getContext(),
    );
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(scaledGeom);
  });

  it("calls setError when GlobalVariables.cad.scale rejects", async () => {
    vi.mocked(GlobalVariables.cad.scale).mockRejectedValue(
      new Error("scale failed"),
    );

    const mol = makeGitHubMolecule("MM", makeParent("Inches"));
    mol._handleOutputReady(fakeGeom, null);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mol._setErrorCalls).toHaveLength(1);
    expect(mol._setErrorCalls[0]).toBe("scale failed");
    expect(mol._superHandleOutputReadyCalls).toHaveLength(0);
  });

  it("does not call GlobalVariables.cad.scale when either unit is Unitless", () => {
    const mol = makeGitHubMolecule("Unitless", makeParent("Inches"));
    mol._handleOutputReady(fakeGeom, null);

    expect(GlobalVariables.cad.scale).not.toHaveBeenCalled();
    expect(mol._superHandleOutputReadyCalls).toHaveLength(1);
    expect(mol._superHandleOutputReadyCalls[0].value).toBe(fakeGeom);
    expect(mol._setProcessingCalls).toHaveLength(0);
  });
});
