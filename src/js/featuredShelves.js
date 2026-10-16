import { FEATURED_MODELS } from "./featuredModels.js";

/**
 * The Featured tab's themed shelves. Each starts with hand-picked projects
 * (all with a project.png) so the shelves look full while the community is
 * small. Projects from the featured feed that fit a shelf's theme are added
 * after them, most liked first, so the shelves fill in as people make and like
 * more. Trim the hand-picked lists once the feed carries enough on its own.
 */
export const FEATURED_SHELVES = [
  {
    id: "furniture",
    title: "Furniture and home",
    keywords: [
      "furniture",
      "chair",
      "table",
      "bench",
      "shelf",
      "bookshelf",
      "bed",
      "sofa",
      "desk",
      "stool",
      "lamp",
      "rack",
      "cabinet",
      "drawer",
      "home",
    ],
    projects: [
      { owner: "alzatin", repoName: "Adirondack-chair" },
      { owner: "BarbourSmith", repoName: "Blocky_Adorondac_Chair" },
      { owner: "alzatin", repoName: "Sofa-frame-velvet" },
      { owner: "alzatin", repoName: "Coffee-table-pill-design" },
      {
        owner: "wouldchuckit",
        repoName: "Table_With_Tapered_Legs_and_Rounded_Corners",
      },
      {
        owner: "wouldchuckit",
        repoName: "CurvedSupportBookshelfMultipleVerticals",
      },
      { owner: "CartoonHeroII", repoName: "Spaceship-Bed" },
      { owner: "BarbourSmith", repoName: "Parametric_Plant_Stand" },
      { owner: "alzatin", repoName: "shoe_closet_rack" },
      { owner: "BarbourSmith", repoName: "Spice_Rack_Holder" },
    ],
  },
  {
    id: "outdoors",
    title: "Big builds and outdoors",
    keywords: [
      "outdoor",
      "outdoors",
      "sauna",
      "boat",
      "barge",
      "trailer",
      "van",
      "shed",
      "house",
      "garden",
      "fire",
      "dome",
      "camping",
      "pergola",
      "deck",
    ],
    projects: [
      { owner: "BarbourSmith", repoName: "Sauna-Trailer" },
      { owner: "BarbourSmith", repoName: "Van-Build" },
      { owner: "BarbourSmith", repoName: "Gas-Fire-Pit" },
      { owner: "BarbourSmith", repoName: "Parametric_Geodesic_Dome" },
      { owner: "BarbourSmith", repoName: "Rolling-Barge-Platform" },
      { owner: "BarbourSmith", repoName: "Swimming_ladder" },
      { owner: "BarbourSmith", repoName: "Tree_House" },
      { owner: "BarbourSmith", repoName: "Maya-s-Play-House" },
      { owner: "BarbourSmith", repoName: "Sauna_Boat_2.0" },
      { owner: "BarbourSmith", repoName: "Maslow_Shed" },
    ],
  },
  {
    id: "shop",
    title: "Maslow and the shop",
    keywords: [
      "maslow",
      "cnc",
      "jig",
      "shop",
      "sled",
      "router",
      "spindle",
      "workshop",
      "dust",
      "fixture",
    ],
    projects: [
      { owner: "BarbourSmith", repoName: "Maslow_4_Assembly" },
      { owner: "BarbourSmith", repoName: "Belt_Guard" },
      { owner: "alzatin", repoName: "Belt_Guard_-_Hollander" },
      {
        owner: "wouldchuckit",
        repoName: "Maslow4_Router_core_replacement_cylinder",
      },
      { owner: "wouldchuckit", repoName: "Maslow4_Crosshairs_for_centering" },
      { owner: "BarbourSmith", repoName: "Sauna_Boat_Controller" },
    ],
  },
  {
    id: "parts",
    title: "Small parts and signs",
    keywords: [
      "hardware",
      "bracket",
      "bearing",
      "sign",
      "mold",
      "clamp",
      "nut",
      "hinge",
      "knob",
      "holder",
    ],
    projects: [
      { owner: "tristan-huber", repoName: "Simple_Angle_Bracket" },
      { owner: "BarbourSmith", repoName: "148ZZ_Bearing" },
      { owner: "IDAbbott", repoName: "Modified_Tri_Clamp-copy" },
      { owner: "BarbourSmith", repoName: "RotatePattern" },
      { owner: "BarbourSmith", repoName: "Dinosaur_Sign" },
      { owner: "Moldudley", repoName: "real_boattail_mold_" },
    ],
  },
];

/** The most projects a shelf shows. */
export const SHELF_SIZE = 12;

// Feed projects that are placeholders rather than designs
const NOT_A_DESIGN = /\b(test|hello[ _-]?world|please ignore)\b/i;

const keyOf = ({ owner, repoName }) => `${owner}/${repoName}`;

/** Lowercase words describing a project, for matching a shelf's keywords. */
function projectWords(node) {
  const text = [
    ...(node.topics || []),
    node.repoName || "",
    node.description || "",
  ].join(" ");
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

const popularity = (node) => (node.likes || 0) + (node.forks || 0);

/**
 * The shelves to show: each shelf's hand-picked projects, then feed projects
 * that match its keywords, most popular first. A project appears on one shelf
 * only, and feed projects without a thumbnail are left out.
 *
 * @param {object[]} featuredNodes - Projects from the featured feed
 * @returns {{id, title, items: {owner, repoName, node?}[]}[]}
 */
export function buildShelves(featuredNodes = []) {
  const byKey = new Map(featuredNodes.map((node) => [keyOf(node), node]));
  const placed = new Set();
  const shelves = FEATURED_SHELVES.map((shelf) => {
    const items = shelf.projects.map((project) => {
      placed.add(keyOf(project));
      return { ...project, node: byKey.get(keyOf(project)) };
    });
    return { ...shelf, items };
  });

  const candidates = featuredNodes
    .filter(
      (node) =>
        (node.pngURL || node.svgURL) &&
        !placed.has(keyOf(node)) &&
        !NOT_A_DESIGN.test(`${node.repoName} ${node.description || ""}`),
    )
    .sort((a, b) => popularity(b) - popularity(a));

  for (const node of candidates) {
    const words = projectWords(node);
    const shelf = shelves.find(
      (s) =>
        s.items.length < SHELF_SIZE && s.keywords.some((k) => words.has(k)),
    );
    if (!shelf) continue;
    shelf.items.push({ owner: node.owner, repoName: node.repoName, node });
    placed.add(keyOf(node));
  }
  return shelves.map(({ id, title, items }) => ({
    id,
    title,
    items: items.slice(0, SHELF_SIZE),
  }));
}

/** Projects that can be the spotlight: the ones with a 3D model. */
export const SPOTLIGHT_PROJECTS = FEATURED_MODELS;

/** Which spotlight project to start on: a different one each week. */
export function weeklySpotlightIndex(date = new Date()) {
  const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
  return week % SPOTLIGHT_PROJECTS.length;
}

/** A project name for display: "Gas-Fire-Pit" becomes "Gas Fire Pit". */
export function displayName(repoName) {
  return repoName.replace(/[-_]+/g, " ").trim();
}
