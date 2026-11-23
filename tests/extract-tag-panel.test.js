/**
 * Extract Tag's panel keeps a checkbox for each ticked tag, including one the
 * input no longer has, so it can always be unticked.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/extract-tag-panel.test.js
 */
import { describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import ExtractTag from "../src/molecules/extracttag.js";

function makeAtom(tags, selectedTags) {
  const atom = new ExtractTag({ uniqueID: "x", selectedTags });
  atom.tagList = { source: "geom", tags: ["Select Tag", ...tags] };
  atom.onUpstreamChange = () => {};
  return atom;
}

const tagLabels = (params) =>
  Object.entries(params)
    .filter(([key]) => key.startsWith("xtag_"))
    .map(([, param]) => [param.label, param.value]);

describe("Extract Tag panel", () => {
  it("shows a ticked tag the input no longer has, and unticks it", () => {
    const atom = makeAtom(["wood"], ["wood", "plan"]);
    let changed = 0;
    const params = atom.createInputParams(() => changed++);

    expect(tagLabels(params)).toEqual([
      ["wood", true],
      ["plan (missing)", true],
    ]);

    params.xtag_plan.onChange(false);
    expect(atom.selectedTags).toEqual(["wood"]);
    expect(atom.name).toBe("Extract wood");
    expect(changed).toBe(1);
    expect(tagLabels(atom.createInputParams(() => {}))).toEqual([
      ["wood", true],
    ]);
  });

  it("drops the missing label when the tag comes back", () => {
    const atom = makeAtom(["wood"], ["plan"]);
    atom.tagList = { source: "geom2", tags: ["Select Tag", "wood", "plan"] };
    expect(tagLabels(atom.createInputParams(() => {}))).toEqual([
      ["wood", false],
      ["plan", true],
    ]);
  });

  it("marks nothing missing before the input's tags are known", () => {
    const atom = makeAtom([], ["plan"]);
    atom.tagList = { source: undefined, tags: [] };
    expect(tagLabels(atom.createInputParams(() => {}))).toEqual([]);
  });
});
