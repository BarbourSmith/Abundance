# How the Featured tab chooses projects

The Featured tab in the project browser has a **spotlight** at the top, four
**themed shelves** below it, and a last shelf of **more popular projects**. Both use the projects the tab already loads
from the featured feed (`queryFeaturedProjects`); nothing extra is fetched.
The code is in `src/js/featuredShelves.js` and
`src/components/main-routes/FeaturedShowcase.jsx`.

## Shelves

| Shelf                   | Keywords                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Furniture and home      | furniture, chair, table, bench, shelf, bookshelf, bed, sofa, desk, stool, lamp, rack, cabinet, drawer, home  |
| Big builds and outdoors | outdoor, outdoors, sauna, boat, barge, trailer, van, shed, house, garden, fire, dome, camping, pergola, deck |
| Maslow and the shop     | maslow, cnc, jig, shop, sled, router, spindle, workshop, dust, fixture                                       |
| Small parts and signs   | hardware, bracket, bearing, sign, mold, clamp, nut, hinge, knob, holder                                      |

Each shelf is built like this:

1. **Hand-picked projects first.** Every shelf starts with a list of
   hand-picked projects (`projects` in `FEATURED_SHELVES`), in the order
   listed. They were chosen because they have a `project.png`, so the shelves
   look full while the community is still small.
2. **Then projects from the feed that fit the theme.** A feed project joins a
   shelf when one of the shelf's keywords appears as a whole word in its
   GitHub topics, its repository name or its description. Words are split on
   anything that isn't a letter or digit, so `Spice_Rack_Holder` matches
   _rack_ and _holder_, but _shelving_ doesn't match _shelf_.
3. **Most liked first.** Feed projects are added in order of the feed's like
   score (`userRanking`: about 2 per like plus 0.2 per fork), the same score
   "Most Liked" sorts by and the cards show next to the red heart.
4. **One shelf per project, and one card per design.** Shelves are tried in
   the order of the table, and a project goes on the first one that matches
   and still has room. A hand-picked project is never repeated by the feed; it
   just gets the feed's like score. Copies of a design already shown are
   skipped: the same repository name under another maker, or one ending in
   "copy" (names are compared ignoring case and separators), so the most liked
   copy wins.
5. **Up to 12 per shelf** (`SHELF_SIZE`), hand-picked projects included.
6. **Left out:** feed projects without a thumbnail (`pngURL` or `svgURL`),
   placeholders whose name or description says "test", "hello world" or
   "please ignore" (`_` and `-` count as spaces, so `Test_Colab` is one), and
   projects that match no shelf, which go to the last shelf below instead.
7. **Thumbnails:** a card tries, in order, the stored `pngURL`, the
   repository's `main/project.png`, the stored `svgURL` and
   `main/project.svg`. Many older projects still store a `master` branch
   address that no longer loads, so the fallbacks matter. A card hides itself
   if none load, and a shelf hides its heading if all its cards do.

### More popular projects

After the themed shelves, a last shelf, **More popular projects**, catches
feed projects that didn't fit any theme: up to 12, in order of like score,
with the same exclusions as above (no thumbnail, placeholders). It has no
hand-picked projects, and like any shelf it's hidden when it has nothing to
show.

So the shelves change on their own as people tag, describe and like their
projects. Tagging a project with one of the keywords as a GitHub topic is the
surest way to get it on the right shelf.

### Maintaining the shelves

- **Trim the hand-picked lists** as the feed fills in. Once a shelf has
  enough popular community projects, remove hand-picked ones so newer projects
  get the room.
- **Add keywords** when a theme is missed, or a **new shelf** by adding an
  entry to `FEATURED_SHELVES` with an `id`, `title`, `keywords` and
  `projects`. Shelf order matters: earlier shelves win when a project matches
  several.
- **Only hand-pick projects with a `project.png`**, at
  `https://raw.githubusercontent.com/<owner>/<repo>/main/project.png`.

## Spotlight

- **Which projects:** the curated list in `src/js/featuredModels.js`
  (`FEATURED_MODELS`), the same one the landing page rotates through. Every
  project there has a 3D model in `public/featured/models/`.
- **Which one shows:** a different project each week, in list order (the week
  number modulo the list length), so everyone sees the same spotlight that
  week. **Show another** steps to the next one for that visit.
- **What it shows:** the rotating 3D model, the name and maker, and, when the
  feed has the project, its description and like score.

The spotlight doesn't grow on its own. To add a project:

1. Open it on the local dev server (`npm start`) and export its model from
   Developer Settings (Ctrl+Shift+D, or Cmd+Shift+D on a Mac) with
   **Export GLB**. On the dev server this saves it to
   `public/featured/models/<owner>_<repo>.glb`.
2. Add `{ owner, repoName }` to `FEATURED_MODELS`.
3. Commit both. The project then appears on the landing page and in the
   spotlight rotation.
