/**
 * Projects shown as 3D models on the landing page. Each needs a GLB at
 * public/featured/models/<owner>_<repoName>.glb, made with Developer settings >
 * Landing Page Model > Export GLB while the project is open on the local dev
 * server. Keep each file small (aim for under 1-2 MB).
 */
export const FEATURED_MODELS = [
  { owner: "alzatin", repoName: "Adirondack-chair" },
  { owner: "BarbourSmith", repoName: "Sauna_Boat_Controller" },
  { owner: "BarbourSmith", repoName: "Parametric_Geodesic_Dome" },
  { owner: "BarbourSmith", repoName: "Belt_Guard" },
  { owner: "alzatin", repoName: "Belt_Guard_-_Hollander" },
  { owner: "BarbourSmith", repoName: "Blocky_Adorondac_Chair" },
  { owner: "BarbourSmith", repoName: "Van-Build" },
  { owner: "BarbourSmith", repoName: "Swimming_ladder" },
  { owner: "BarbourSmith", repoName: "Parametric_Plant_Stand" },
  { owner: "BarbourSmith", repoName: "Gas-Fire-Pit" },
  { owner: "alzatin", repoName: "Coffee-table-pill-design" },
  { owner: "alzatin", repoName: "Sofa-frame-velvet" },
  { owner: "BarbourSmith", repoName: "Rolling-Barge-Platform" },
  { owner: "CartoonHeroII", repoName: "Spaceship-Bed" },
  { owner: "tristan-huber", repoName: "sitting_person_for_scale" },
  { owner: "Moldudley", repoName: "real_boattail_mold_" },
  {
    owner: "wouldchuckit",
    repoName: "Maslow4_Router_core_replacement_cylinder",
  },
  {
    owner: "wouldchuckit",
    repoName: "Table_With_Tapered_Legs_and_Rounded_Corners",
  },
  {
    owner: "wouldchuckit",
    repoName: "CurvedSupportBookshelfMultipleVerticals",
  },
  { owner: "wouldchuckit", repoName: "Maslow4_Crosshairs_for_centering" },
  { owner: "IDAbbott", repoName: "Modified_Tri_Clamp-copy" },
];

/**
 * URL of a featured project's GLB. The files sit one folder deeper than the
 * name needs: the site's Cloudflare worker (cloudflare/worker.js) treats any
 * two-segment path like /featured/<file> as a /<owner>/<repo> project page and
 * answers it with the app's HTML instead of the file.
 */
export function featuredModelUrl({ owner, repoName }) {
  return `${import.meta.env.VITE_APP_PATH_FOR_PICS}/featured/models/${owner}_${repoName}.glb`;
}

/** URL of a featured project's thumbnail, shown while its model loads. */
export function featuredImageUrl({ owner, repoName }) {
  return `https://raw.githubusercontent.com/${owner}/${repoName}/main/project.png`;
}
