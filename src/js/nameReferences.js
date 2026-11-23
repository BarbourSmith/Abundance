import GlobalVariables from "./globalvariables.js";

/**
 * Equations refer to Input and Constant atoms by name. These helpers find the
 * equations that use a name and rewrite them when the atom is renamed, so a
 * rename doesn't quietly cut them loose from the value they followed.
 */

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

/**
 * Replaces the variable `oldName` with `newName` in an equation. Quoted text,
 * function names (`max(`) and parts of longer names are left alone.
 * @returns {string} the rewritten equation (unchanged if nothing matched)
 */
export function replaceVariableName(equation, oldName, newName) {
  if (typeof equation !== "string" || !oldName || oldName === newName) {
    return equation;
  }
  let result = "";
  let i = 0;
  while (i < equation.length) {
    const char = equation[i];
    if (char === '"' || char === "'") {
      // Copy quoted text through untouched
      const end = equation.indexOf(char, i + 1);
      const stop = end === -1 ? equation.length : end + 1;
      result += equation.slice(i, stop);
      i = stop;
      continue;
    }
    if (
      /[A-Za-z_]/.test(char) &&
      !IDENTIFIER_CHAR.test(equation[i - 1] ?? "")
    ) {
      let j = i;
      while (j < equation.length && IDENTIFIER_CHAR.test(equation[j])) j++;
      const word = equation.slice(i, j);
      const isFunctionCall = /^\s*\(/.test(equation.slice(j));
      result += word === oldName && !isFunctionCall ? newName : word;
      i = j;
      continue;
    }
    result += char;
    i++;
  }
  return result;
}

/** True if `name` is used as a variable in `equation`. */
export function equationUsesName(equation, name) {
  return (
    typeof equation === "string" &&
    replaceVariableName(equation, name, `${name}\u0000`) !== equation
  );
}

function isMolecule(atom) {
  return atom?.atomType === "Molecule" || atom?.atomType === "GitHubMolecule";
}

function declaresName(molecule, name, except) {
  return (molecule.nodesOnTheScreen || []).some(
    (atom) =>
      atom !== except &&
      GlobalVariables.isReferencableByName(atom) &&
      atom.name === name,
  );
}

/**
 * Every equation that resolves `name` to the Input or Constant `owner`: typed
 * port values, Equation atoms and Constant atoms in the owner's molecule and
 * the molecules inside it. A molecule with its own atom of that name hides
 * the owner from everything inside it, and a GitHub molecule's insides
 * belong to another project, so neither is searched.
 * @returns {{atom: object, ap?: object, kind: "port"|"equation"|"constant", equation: string}[]}
 */
export function findNameReferences(owner, name = owner?.name) {
  const references = [];
  const scope = owner?.parent;
  if (!scope || !name) return references;
  // Equation and Constant atoms look names up among the molecule's input
  // ports, which only Inputs make. Typed port values find Constants too.
  const portsOnly = owner.atomType !== "Input";

  const visitAtom = (atom) => {
    if (atom === owner) return;
    (atom.inputs || []).forEach((ap) => {
      if (ap.type !== "input" || ap.valueType === "geometry") return;
      if (equationUsesName(ap.currentEquation, name)) {
        references.push({
          atom,
          ap,
          kind: "port",
          equation: ap.currentEquation,
        });
      }
    });
    if (portsOnly) return;
    if (
      atom.atomType === "Equation" &&
      equationUsesName(atom.currentEquation, name)
    ) {
      references.push({
        atom,
        kind: "equation",
        equation: atom.currentEquation,
      });
    }
    if (
      atom.atomType === "Constant" &&
      equationUsesName(atom.currentEquation, name)
    ) {
      references.push({
        atom,
        kind: "constant",
        equation: atom.currentEquation,
      });
    }
  };

  const visitMolecule = (molecule) => {
    (molecule.nodesOnTheScreen || []).forEach((atom) => {
      visitAtom(atom); // its own ports are typed in this molecule
      if (atom.atomType === "Molecule" && !declaresName(atom, name, owner)) {
        visitMolecule(atom);
      }
    });
  };

  visitMolecule(scope);
  return references;
}

/**
 * Rewrites every equation that uses the owner's old name to use its new one.
 * Call after the owner has its new name, so ports find it when they
 * re-subscribe. An equation that already uses the new name for something
 * else is left alone rather than merging two variables into one; its old
 * name then shows as not found.
 * @returns {object[]} the references that were rewritten
 */
export function renameNameReferences(owner, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return [];
  const updated = [];
  findNameReferences(owner, oldName).forEach((reference) => {
    if (equationUsesName(reference.equation, newName)) return;
    const equation = replaceVariableName(reference.equation, oldName, newName);
    const { atom, ap } = reference;
    try {
      if (reference.kind === "port") {
        ap.currentEquation = equation; // re-subscribes under the new name
      } else if (reference.kind === "equation") {
        atom.setEquation(equation);
      } else if (reference.kind === "constant") {
        atom.setEquationText(equation);
      }
      updated.push({ ...reference, equation });
    } catch (err) {
      console.warn(`Couldn't update "${reference.equation}"`, err);
    }
  });
  return updated;
}
