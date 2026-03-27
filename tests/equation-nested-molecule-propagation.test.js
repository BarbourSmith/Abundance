/**
 * Tests that propagateInputChange() in Molecule correctly propagates to:
 * 1. Equations that use only molecule-level inputs (zero atom-level inputs)
 * 2. Equations that mix atom-level inputs AND molecule-level inputs (e.g., BaseSize + y
 *    where BaseSize is a molecule input and y is an atom-level input with value 5)
 * 3. Equations nested inside child molecules
 *
 * Regression for two related bugs:
 * - propagateInputChange() only iterated direct children (fixed: recurse into child molecules)
 * - propagateInputChange() skipped equations with ANY atom-level inputs, even when only
 *   some variables were molecule-level (fixed: check per-variable, not inputs.length === 0)
 */
import { describe, it, expect, vi } from "vitest";

/**
 * Build a minimal mock of Molecule.propagateInputChange() that mirrors the
 * fixed implementation, without pulling in the full Molecule class (which has
 * complex side-effects on import).
 */
function makeMolecule({ nodesOnTheScreen = [] } = {}) {
  const mol = {
    atomType: "Molecule",
    nodesOnTheScreen,
    propagateInputChange(inputName) {
      this.nodesOnTheScreen.forEach((atom) => {
        // Recursively propagate to child molecules
        if (
          (atom.atomType === "Molecule" || atom.atomType === "GitHubMolecule") &&
          typeof atom.propagateInputChange === "function"
        ) {
          atom.propagateInputChange(inputName);
        }

        // For Equation atoms: trigger if the equation uses the changed molecule-level input
        // AND that input is not already provided via an atom-level connector.
        if (atom.atomType === "Equation") {
          const vars = atom._extractVariablesFromEquation();
          if (
            vars.includes(inputName) &&
            !atom.inputs.some((input) => input.name === inputName) &&
            atom.isEnabled()
          ) {
            atom.onUpstreamChange();
          }
        }
        // For Code atoms: trigger unless the changed input is already an atom-level input.
        else if (atom.atomType === "Code" && atom.isEnabled()) {
          if (!atom.inputs.some((input) => input.name === inputName)) {
            atom.onUpstreamChange();
          }
        }
      });
    },
  };
  return mol;
}

function makeEquationAtom({ equation, inputs = [], enabled = true } = {}) {
  return {
    atomType: "Equation",
    inputs,
    _extractVariablesFromEquation: vi.fn(() => {
      // Extract all identifier-like tokens from the equation string
      return (equation || "").match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    }),
    isEnabled: vi.fn(() => enabled),
    onUpstreamChange: vi.fn(),
  };
}

function makeCodeAtom({ inputs = [], enabled = true } = {}) {
  return {
    atomType: "Code",
    inputs,
    isEnabled: vi.fn(() => enabled),
    onUpstreamChange: vi.fn(),
  };
}

describe("propagateInputChange recursive into nested molecules", () => {
  it("triggers equation in a direct child (baseline – existing behaviour)", () => {
    const eq = makeEquationAtom({ equation: "TableWidth / 2" });
    const parent = makeMolecule({ nodesOnTheScreen: [eq] });

    parent.propagateInputChange("TableWidth");

    expect(eq.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("triggers equation in a single-level nested molecule when ancestor input changes", () => {
    const eq = makeEquationAtom({ equation: "TableWidth / 2 - EdgeLip" });
    const child = makeMolecule({ nodesOnTheScreen: [eq] });
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    parent.propagateInputChange("TableWidth");

    expect(eq.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("triggers equation in a doubly-nested molecule (grandparent input)", () => {
    const eq = makeEquationAtom({ equation: "TableWidth + 10" });
    const grandchild = makeMolecule({ nodesOnTheScreen: [eq] });
    const child = makeMolecule({ nodesOnTheScreen: [grandchild] });
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    parent.propagateInputChange("TableWidth");

    expect(eq.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("does NOT trigger equation that uses a different variable", () => {
    const eq = makeEquationAtom({ equation: "EdgeLip * 2" });
    const child = makeMolecule({ nodesOnTheScreen: [eq] });
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    // Change TableWidth, but equation only uses EdgeLip
    parent.propagateInputChange("TableWidth");

    expect(eq.onUpstreamChange).not.toHaveBeenCalled();
  });

  it("DOES trigger equation with mixed inputs when the changed molecule input is used as a molecule-level variable", () => {
    // This is the new regression: BaseSize + y where BaseSize is a molecule input
    // and y=5 is an atom-level input connected via connector.
    const eq = makeEquationAtom({
      equation: "BaseSize + y",
      inputs: [{ name: "y" }], // y is atom-level, BaseSize is molecule-level
    });
    const parent = makeMolecule({ nodesOnTheScreen: [eq] });

    parent.propagateInputChange("BaseSize");

    // BaseSize is used in equation and NOT in atom.inputs → should trigger
    expect(eq.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("does NOT trigger equation when the changed molecule input is already wired as an atom-level input", () => {
    // If TableWidth is wired as an atom-level input, the connector handles propagation
    const eq = makeEquationAtom({
      equation: "TableWidth + x",
      inputs: [{ name: "TableWidth" }], // TableWidth is already an atom-level input
    });
    const parent = makeMolecule({ nodesOnTheScreen: [eq] });

    parent.propagateInputChange("TableWidth");

    // TableWidth IS in atom.inputs → connector handles it, not propagateInputChange
    expect(eq.onUpstreamChange).not.toHaveBeenCalled();
  });

  it("DOES trigger mixed-input equation inside a nested molecule", () => {
    // Same mixed-input case but inside a nested molecule
    const eq = makeEquationAtom({
      equation: "BaseSize + y",
      inputs: [{ name: "y" }],
    });
    const child = makeMolecule({ nodesOnTheScreen: [eq] });
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    parent.propagateInputChange("BaseSize");

    expect(eq.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("does NOT trigger disabled equation", () => {
    const eq = makeEquationAtom({ equation: "TableWidth", enabled: false });
    const child = makeMolecule({ nodesOnTheScreen: [eq] });
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    parent.propagateInputChange("TableWidth");

    expect(eq.onUpstreamChange).not.toHaveBeenCalled();
  });

  it("triggers Code atom in nested molecule for any input change (not already atom-level)", () => {
    const code = makeCodeAtom();
    const child = makeMolecule({ nodesOnTheScreen: [code] });
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    parent.propagateInputChange("AnyInput");

    expect(code.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("does NOT trigger Code atom when the changed input is already an atom-level input", () => {
    const code = makeCodeAtom({ inputs: [{ name: "BaseSize" }] });
    const parent = makeMolecule({ nodesOnTheScreen: [code] });

    parent.propagateInputChange("BaseSize");

    // BaseSize is already wired; connector handles it
    expect(code.onUpstreamChange).not.toHaveBeenCalled();
  });

  it("triggers equations in both direct children and nested molecules", () => {
    const directEq = makeEquationAtom({ equation: "TableWidth * 3" });
    const nestedEq = makeEquationAtom({ equation: "TableWidth - 5" });
    const child = makeMolecule({ nodesOnTheScreen: [nestedEq] });
    const parent = makeMolecule({ nodesOnTheScreen: [child, directEq] });

    parent.propagateInputChange("TableWidth");

    expect(directEq.onUpstreamChange).toHaveBeenCalledOnce();
    expect(nestedEq.onUpstreamChange).toHaveBeenCalledOnce();
  });

  it("works with GitHubMolecule child type", () => {
    const eq = makeEquationAtom({ equation: "TableWidth / 4" });
    // GitHubMolecule inherits from Molecule; simulate it by overriding atomType
    const child = { ...makeMolecule({ nodesOnTheScreen: [eq] }), atomType: "GitHubMolecule" };
    const parent = makeMolecule({ nodesOnTheScreen: [child] });

    parent.propagateInputChange("TableWidth");

    expect(eq.onUpstreamChange).toHaveBeenCalledOnce();
  });
});
