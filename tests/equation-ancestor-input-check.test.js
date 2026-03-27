/**
 * Tests that Equation atom recursively checks all ancestor molecules for inputs,
 * not just the immediate parent molecule.
 *
 * Bug: Equation atom's addAndRemoveInputs() and ensureInputsForEquation() only checked
 * this.parent.inputs (direct parent), not ancestor molecules higher up the hierarchy.
 * This caused the atom to create redundant local inputs for variables that were already
 * defined as inputs at a grandparent (or higher) molecule level.
 */
import { describe, it, expect } from "vitest";
import { parse } from "mathjs";

/**
 * Minimal mock implementation of getInputsFromAncestors + ensureInputsForEquation
 * mirroring the fixed logic in atom.js
 */
function makeAtom({ parent = null, inputs = [] } = {}) {
  return {
    atomType: "Equation",
    inputs,
    parent,

    extractVariablesFromEquation(equation) {
      let variables = [];
      try {
        const node = parse(equation);
        node.traverse(function (n, path, par) {
          if (
            n.isSymbolNode &&
            !(par && par.isFunctionNode && par.fn && par.fn.name === n.name)
          ) {
            variables.push(n.name);
          }
        });
        variables = [...new Set(variables)];
      } catch {
        variables = [];
      }
      return variables;
    },

    /** Mirrors the fixed getInputsFromAncestors() in atom.js */
    getInputsFromAncestors() {
      const allInputs = [];
      let current = this;
      while (current) {
        const parentInputs =
          (current.parent && current.parent.inputs) ||
          (current.parentMolecule && current.parentMolecule.inputs) ||
          null;
        if (parentInputs) {
          parentInputs.forEach((input) => {
            if (!allInputs.some((i) => i.name === input.name)) {
              allInputs.push(input);
            }
          });
        }
        current = current.parent || current.parentMolecule;
        if (current && !current.inputs) break;
      }
      return allInputs;
    },

    /** Mirrors the fixed ensureInputsForEquation() in atom.js */
    ensureInputsForEquation(equation) {
      if (this.atomType !== "Equation" && this.atomType !== "Code") return;

      const variables = this.extractVariablesFromEquation(equation);
      const BUILTIN_CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);
      const ancestorInputs = this.getInputsFromAncestors();
      const parentInputNames = ancestorInputs.map((i) => i.name);

      const inputsToAdd = [];
      for (const variable of variables) {
        if (BUILTIN_CONSTS.has(variable)) continue;
        const existsAsInput = this.inputs.some((i) => i.name === variable);
        const existsAsParentInput = parentInputNames.includes(variable);
        if (!existsAsInput && !existsAsParentInput) {
          inputsToAdd.push({ name: variable, value: 1 });
        }
      }
      this.inputs.push(...inputsToAdd);
    },

    /** Mirrors the fixed addAndRemoveInputs() in equation.js */
    addAndRemoveInputs(currentEquation) {
      const variables = this.extractVariablesFromEquation(currentEquation);
      const ancestorInputs = this.getInputsFromAncestors();
      const moleculeInputs = ancestorInputs.map((i) => i.name);

      // Remove inputs that are no longer needed or are now molecule-level inputs
      this.inputs = this.inputs.filter(
        (input) =>
          variables.includes(input.name) && !moleculeInputs.includes(input.name)
      );

      // Add inputs for variables that are not molecule-level
      for (const variable of variables) {
        if (
          !this.inputs.some((i) => i.name === variable) &&
          !moleculeInputs.includes(variable)
        ) {
          this.inputs.push({ name: variable, value: 1 });
        }
      }
    },
  };
}

describe("Equation atom recursive ancestor input checking", () => {
  it("should not create a local input for a variable defined in the immediate parent molecule", () => {
    const parentMolecule = {
      inputs: [{ name: "width", value: 100 }],
      parent: null,
    };
    const atom = makeAtom({ parent: parentMolecule });

    atom.ensureInputsForEquation("width * 2");

    expect(atom.inputs.find((i) => i.name === "width")).toBeUndefined();
    expect(atom.inputs.length).toBe(0);
  });

  it("should not create a local input for a variable defined in a grandparent molecule", () => {
    // Grandparent molecule has the input
    const grandparentMolecule = {
      inputs: [{ name: "thickness", value: 19 }],
      parent: null,
    };
    // Parent molecule has no inputs but its parent is the grandparent
    const parentMolecule = {
      inputs: [],
      parent: grandparentMolecule,
    };
    const atom = makeAtom({ parent: parentMolecule });

    atom.ensureInputsForEquation("thickness * 2");

    expect(atom.inputs.find((i) => i.name === "thickness")).toBeUndefined();
    expect(atom.inputs.length).toBe(0);
  });

  it("should not create a local input for a variable defined in a great-grandparent molecule", () => {
    const greatGrandparent = {
      inputs: [{ name: "depth", value: 50 }],
      parent: null,
    };
    const grandparent = {
      inputs: [],
      parent: greatGrandparent,
    };
    const parent = {
      inputs: [],
      parent: grandparent,
    };
    const atom = makeAtom({ parent });

    atom.ensureInputsForEquation("depth + 10");

    expect(atom.inputs.find((i) => i.name === "depth")).toBeUndefined();
    expect(atom.inputs.length).toBe(0);
  });

  it("should still create a local input for a variable not defined in any ancestor", () => {
    const parentMolecule = {
      inputs: [{ name: "knownVar", value: 5 }],
      parent: null,
    };
    const atom = makeAtom({ parent: parentMolecule });

    atom.ensureInputsForEquation("unknownVar * 3");

    expect(atom.inputs.find((i) => i.name === "unknownVar")).toBeDefined();
    expect(atom.inputs.length).toBe(1);
  });

  it("should handle mixed: some variables from ancestors, some needing local inputs", () => {
    const grandparent = {
      inputs: [{ name: "grandVar", value: 200 }],
      parent: null,
    };
    const parent = {
      inputs: [{ name: "parentVar", value: 100 }],
      parent: grandparent,
    };
    const atom = makeAtom({ parent });

    atom.ensureInputsForEquation("grandVar + parentVar + localVar");

    expect(atom.inputs.find((i) => i.name === "grandVar")).toBeUndefined();
    expect(atom.inputs.find((i) => i.name === "parentVar")).toBeUndefined();
    expect(atom.inputs.find((i) => i.name === "localVar")).toBeDefined();
    expect(atom.inputs.length).toBe(1);
  });

  it("addAndRemoveInputs should remove an existing local input when a grandparent molecule input already exists for that variable", () => {
    const grandparent = {
      inputs: [{ name: "sharedVar", value: 42 }],
      parent: null,
    };
    const parent = {
      inputs: [],
      parent: grandparent,
    };
    // Atom already has a local input for sharedVar (stale state from before grandparent had the input)
    const atom = makeAtom({
      parent,
      inputs: [{ name: "sharedVar", value: 1 }],
    });

    atom.addAndRemoveInputs("sharedVar * 2");

    // The local input should be removed because grandparent now defines it
    expect(atom.inputs.find((i) => i.name === "sharedVar")).toBeUndefined();
    expect(atom.inputs.length).toBe(0);
  });

  it("addAndRemoveInputs should not create a local input for a variable in a grandparent molecule", () => {
    const grandparent = {
      inputs: [{ name: "height", value: 300 }],
      parent: null,
    };
    const parent = {
      inputs: [],
      parent: grandparent,
    };
    const atom = makeAtom({ parent });

    atom.addAndRemoveInputs("height / 2");

    expect(atom.inputs.find((i) => i.name === "height")).toBeUndefined();
    expect(atom.inputs.length).toBe(0);
  });
});
