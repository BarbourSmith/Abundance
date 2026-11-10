/**
 * Thumbnails for the Getting started tab, drawn in the landing page's
 * flow-canvas style (landing.css): white atom nodes with line icons on the
 * dark canvas, joined by wires. Each tutorial's shows the atoms it teaches.
 */

const CANVAS = "#2b2e33";
const WIRE = "#8f8a97";
const NODE = "#ffffff";
const INK = "#3f4243";
const ACCENT = "#c4a3d5";

// Line icons on a 24-unit grid, the same style as the landing page's
const ICONS = {
  cursor: '<path d="M7 4l11 7-5 1.5-2.5 5z" stroke-linejoin="round"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  box:
    '<g stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>' +
    '<path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></g>',
  sliders:
    '<g stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/>' +
    '<circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></g>',
  layers:
    '<g stroke-linejoin="round"><path d="M12 4l8 4-8 4-8-4z"/>' +
    '<path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></g>',
  fork:
    '<g stroke-linecap="round"><circle cx="6" cy="5" r="2"/>' +
    '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/>' +
    '<path d="M6 7v10M18 10c0 4-6 3-11.5 7"/></g>',
  book:
    '<g stroke-linejoin="round"><path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/>' +
    '<path d="M12 6v13.5"/></g>',
  question:
    '<g stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
    '<path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/>' +
    '<path d="M12 17h.01"/></g>',
  chat:
    '<g stroke-linejoin="round"><path d="M3 4h12v8H8l-4 3v-3H3z"/>' +
    '<path d="M17 8h4v8h-1v3l-4-3h-5v-2"/></g>',
  dot: "",
};

/** A white node of radius r at (x, y), with an icon drawn at a 2px line. */
function node(x, y, icon, r = 18) {
  const scale = (r * 1.15) / 24;
  const iconSvg = ICONS[icon]
    ? `<g transform="translate(${x - 12 * scale} ${y - 12 * scale}) scale(${scale})" fill="none" stroke="${INK}" stroke-width="${(2 / scale).toFixed(2)}">${ICONS[icon]}</g>`
    : "";
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${NODE}"/>${iconSvg}`;
}

/** A wire from (x1, y1) to (x2, y2), curved like the canvas's connectors. */
function wire(x1, y1, x2, y2) {
  const mid = (x1 + x2) / 2;
  return `<path d="M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" fill="none" stroke="${WIRE}" stroke-width="2.5"/>`;
}

/** An input atom: the canvas's tag shape pointing right. */
function inputTag(x, y) {
  return `<path d="M${x - 20} ${y - 11}h28l10 11-10 11h-28z" fill="${NODE}"/>`;
}

const svg = (body) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="${CANVAS}"/>${body}</svg>`,
  );

export const TUTORIAL_THUMBNAILS = {
  // Getting around the canvas
  canvasBasics: svg(node(80, 60, "cursor", 22)),
  // Sketch a shape and extrude it: the first part
  gettingStarted: svg(
    wire(54, 60, 106, 60) + node(52, 60, "square") + node(108, 60, "box"),
  ),
  // An input feeding a parameter
  inputsSteps: svg(
    wire(64, 60, 104, 60) +
      inputTag(48, 60) +
      `<g transform="translate(34 53) scale(0.6)" fill="none" stroke="${INK}" stroke-width="2.6">${ICONS.sliders}</g>` +
      node(108, 60, "box"),
  ),
  // Several parts combined into one assembly
  assemblySteps: svg(
    wire(46, 28, 108, 60) +
      wire(46, 60, 108, 60) +
      wire(46, 92, 108, 60) +
      node(44, 28, "dot", 11) +
      node(44, 60, "dot", 11) +
      node(44, 92, "dot", 11) +
      node(110, 60, "layers", 20),
  ),
  // Atoms grouped into a molecule
  Molecules: svg(
    `<rect x="28" y="26" width="104" height="68" rx="14" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="6 5"/>` +
      wire(56, 48, 80, 72) +
      wire(80, 72, 104, 48) +
      node(56, 48, "dot", 10) +
      node(80, 72, "dot", 10) +
      node(104, 48, "dot", 10),
  ),
  // Someone else's design, reused from GitHub
  GitHubMolecule: svg(
    wire(56, 60, 106, 60) + node(52, 60, "fork") + node(108, 60, "box"),
  ),
};

export const HELP_THUMBNAILS = {
  userGuide: svg(node(80, 60, "book", 22)),
  faq: svg(node(80, 60, "question", 22)),
  forums: svg(node(80, 60, "chat", 22)),
};
