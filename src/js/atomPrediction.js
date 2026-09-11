// Map of likely next atoms for each main atom type.
//
// Most entries below were measured rather than guessed: the two designs in
// "Example Projects" were parsed, every connector read as a "B follows A" edge,
// and the top three successors kept. Repeated sub-molecules were counted once
// each so that popular reusable parts don't dominate. Output, GitHubMolecule,
// Input and Molecule are never suggested, since none of them is useful as a
// one-click placement. Types the example projects barely exercise (Text,
// CutLayout, Constant, Gcode, Import, Code) keep their original hand-picked
// lists.
const ATOM_PREDICTIONS = {
  Intersection: ["Extrude", "Difference", "Assembly"],
  Difference: ["Extrude", "Tag", "Assembly"],
  Assembly: ["ExtractTag", "Move", "Assembly"],
  Fusion: ["Difference", "Color", "Tag"],
  Loft: ["Fusion", "Difference", "Assembly"],
  ShrinkWrap: ["Extrude", "Difference", "Intersection"],
  Readme: [],
  "Add-BOM-Tag": ["Assembly", "Color"],
  Color: ["Assembly", "Move", "Tag"],
  Tag: ["Assembly", "Color", "Move"],
  ExtractTag: ["Export", "Fusion", "Assembly"],
  CutLayout: ["Export", "Gcode", "Tag"],
  RegularPolygon: ["Extrude"],
  Constant: ["Equation", "Rotate", "Tag"],
  Circle: ["Extrude", "Move", "Difference"],
  Text: ["Move", "Color", "Tag"],
  Rectangle: ["Extrude", "Move", "Difference"],
  // Molecule atoms never show suggestions (see Atom.createPredictedParams),
  // but the measured list would be:
  //Molecule: ["Move", "Rotate", "Assembly"],
  Input: ["Code", "Equation", "Extrude"],
  Equation: ["Move", "Extrude", "Add-BOM-Tag"],
  //Code: ["Input", "Equation"],
  Rotate: ["Move", "Assembly", "Fusion"],
  Extrude: ["Move", "Fusion", "Color"],
  Move: ["Assembly", "Fusion", "Difference"],
  Gcode: ["Export", "Tag"],
  Import: ["Gcode", "Move", "Tag"],
  //Export: ["Gcode", "Import"],
  GitHubMolecule: ["Extrude", "Move", "Rotate"],
  Output: [],
  // Add more as needed
};

/**
 * Returns an array of likely next atom types for a given atom type.
 * @param {string} currentAtomType - The type of the atom just placed.
 * @returns {string[]} - Array of suggested next atom types.
 */
export function getPredictedAtoms(currentAtomType) {
  return ATOM_PREDICTIONS[currentAtomType] || [];
}
