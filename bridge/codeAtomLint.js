/**
 * Static checks on Code atom source before the bridge sends it to the page.
 *
 * Agents reach for Code atoms because one set_code call is less work than a
 * chain of built-in atoms, not because built-ins can't do the job. Code made
 * only of shapes and operations that built-in atoms (or library molecules)
 * already provide is refused, with the built-in recipe for each call it used.
 * Code that draws something built-ins can't (custom curves, lofts, revolves,
 * fillets, text) or builds from a reference file's data passes, with advice
 * when it also piles up primitive features.
 */

/** Replicad calls a built-in atom or library molecule already covers. */
const BUILTIN_EQUIVALENTS = {
  makeBaseBox: "Rectangle → Extrude",
  makeBox: "Rectangle → Extrude",
  makeCylinder: "Circle → Extrude (Rotate to point it along X or Y)",
  drawRectangle: "Rectangle",
  drawRoundedRectangle: "a rounded rectangle library molecule",
  drawCircle: "Circle",
  drawPolysides: "RegularPolygon",
  sketchOnPlane: "(part of Extrude)",
  extrude: "Extrude",
  translate: "Move",
  rotate: "Rotate",
  fuse: "Fusion or Assembly",
  cut: "Difference, or an Assembly with keepout geometry",
  intersect: "Intersection",
};

/**
 * Calls that draw or shape what built-ins can't, or read a reference file's
 * contents (pixels, file) to compute geometry from them.
 */
const CUSTOM_CALLS = [
  "pixels",
  "file",
  "draw",
  "lineTo",
  "line",
  "hLine",
  "vLine",
  "hLineTo",
  "vLineTo",
  "polarLine",
  "polarLineTo",
  "threePointArc",
  "tangentArc",
  "tangentArcTo",
  "sagittaArc",
  "sagittaArcTo",
  "ellipse",
  "ellipseTo",
  "halfEllipse",
  "quadraticCurveTo",
  "quadraticBezierCurveTo",
  "bezierCurveTo",
  "cubicBezierCurveTo",
  "smoothSpline",
  "smoothSplineTo",
  "drawPointsInterpolation",
  "drawEllipse",
  "drawText",
  "sketchText",
  "drawProjection",
  "drawFaceOutline",
  "makeSphere",
  "makeEllipsoid",
  "makeHelix",
  "makeOffset",
  "makePolygon",
  "makeSolid",
  "loft",
  "loftWith",
  "revolve",
  "sweep",
  "sweepSketch",
  "twistExtrude",
  "fillet",
  "chamfer",
  "shell",
  "offset",
  "mirror",
  "thicken",
];

/** More primitive calls than this in one atom earns advice to split it up. */
export const MANY_PRIMITIVES = 8;

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, '""');
}

function countCalls(code, names) {
  const counts = {};
  for (const name of names) {
    const matches = code.match(new RegExp(`(?<![\\w$])${name}\\s*\\(`, "g"));
    if (matches) counts[name] = matches.length;
  }
  return counts;
}

/**
 * @param {string} source Code atom source (TypeScript or JavaScript).
 * @returns {{ refuse: string | null, advice: string | null, primitives: Record<string, number>, custom: Record<string, number> }}
 */
export function lintCodeAtom(source) {
  const code = stripCommentsAndStrings(String(source ?? ""));
  const primitives = countCalls(code, Object.keys(BUILTIN_EQUIVALENTS));
  const custom = countCalls(code, CUSTOM_CALLS);
  const primitiveTotal = Object.values(primitives).reduce((a, b) => a + b, 0);
  const customTotal = Object.values(custom).reduce((a, b) => a + b, 0);

  if (primitiveTotal > 0 && customTotal === 0) {
    const recipes = Object.keys(primitives)
      .filter((name) => name !== "sketchOnPlane")
      .map((name) => `${name} → ${BUILTIN_EQUIVALENTS[name]}`);
    return {
      refuse:
        "This code only uses shapes and operations that built-in atoms already do, so build it with them instead of a Code atom: " +
        `${recipes.join("; ")}. ` +
        "Put each feature in a small molecule of its own, repeat identical features with a pattern library molecule, and cut holes with Difference or an Assembly. " +
        "Use a Code atom only for what built-ins can't draw, such as a custom outline (draw().lineTo(), arcs, splines), a loft or revolve, or geometry computed from a reference image's pixels. " +
        "get_modeling_guide lists the built-in recipe for each common feature.",
      advice: null,
      primitives,
      custom,
    };
  }
  if (primitiveTotal > MANY_PRIMITIVES) {
    return {
      refuse: null,
      advice:
        `This Code atom also makes ${primitiveTotal} boxes, cylinders, moves, and booleans that built-in atoms can do. ` +
        "Keep the code to the part only it can draw and return that, and build the other features from built-in atoms in feature molecules beside it.",
      primitives,
      custom,
    };
  }
  return { refuse: null, advice: null, primitives, custom };
}
