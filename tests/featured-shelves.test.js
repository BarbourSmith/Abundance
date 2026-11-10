/**
 * The Featured tab's shelves start with hand-picked projects and fill in with
 * feed projects that fit their theme, most popular first.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/featured-shelves.test.js
 */
import { describe, expect, it } from "vitest";
import {
  FEATURED_SHELVES,
  SHELF_SIZE,
  SPOTLIGHT_PROJECTS,
  buildShelves,
  displayName,
  weeklySpotlightIndex,
} from "../src/js/featuredShelves.js";

const project = (repoName, extra = {}) => ({
  owner: "maker",
  repoName,
  pngURL: `https://example.com/${repoName}.png`,
  userRanking: 0,
  topics: [],
  ...extra,
});

const shelf = (shelves, id) => shelves.find((s) => s.id === id);
const names = (s) => s.items.map((item) => item.repoName);

describe("Featured shelves", () => {
  it("shows the hand-picked projects when the feed is empty", () => {
    const shelves = buildShelves([]);
    expect(shelves.map((s) => s.id)).toEqual(FEATURED_SHELVES.map((s) => s.id));
    shelves.forEach((s, i) => {
      expect(names(s)).toEqual(
        FEATURED_SHELVES[i].projects
          .slice(0, SHELF_SIZE)
          .map((p) => p.repoName),
      );
    });
  });

  it("adds feed projects to the shelf whose theme they match, most popular first", () => {
    const shelves = buildShelves([
      project("Quiet-Stool", { topics: ["furniture"], userRanking: 2 }),
      project("Popular-Desk", {
        description: "A standing desk",
        userRanking: 10.4,
      }),
      project("Garden-Shed", { topics: ["outdoor"] }),
    ]);
    const furniture = names(shelf(shelves, "furniture"));
    expect(furniture.slice(-2)).toEqual(["Popular-Desk", "Quiet-Stool"]);
    expect(names(shelf(shelves, "outdoors"))).toContain("Garden-Shed");
  });

  it("leaves out feed projects without a thumbnail or placeholders, and keeps unmatched ones off themed shelves", () => {
    const shelves = buildShelves([
      project("No-Picture-Chair", { topics: ["furniture"], pngURL: null }),
      project("Test-Chair", { topics: ["furniture"] }),
      project("Test_Colab", { userRanking: 5 }),
      project("Mystery-Thing"),
    ]);
    const themed = shelves.filter((s) => s.id !== "popular").flatMap(names);
    expect(shelves.flatMap(names)).not.toContain("No-Picture-Chair");
    expect(shelves.flatMap(names)).not.toContain("Test-Chair");
    expect(shelves.flatMap(names)).not.toContain("Test_Colab");
    expect(themed).not.toContain("Mystery-Thing");
  });

  it("attaches feed data to a hand-picked project and doesn't repeat it", () => {
    const [picked] = FEATURED_SHELVES[0].projects;
    const node = project(picked.repoName, {
      owner: picked.owner,
      topics: ["furniture"],
      userRanking: 9,
    });
    const furniture = shelf(buildShelves([node]), "furniture");
    const matches = furniture.items.filter(
      (i) => i.repoName === picked.repoName,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].node).toBe(node);
  });

  it("puts popular projects that fit no theme on the last shelf", () => {
    const shelves = buildShelves([
      project("Mystery-Thing", { userRanking: 1 }),
      project("Spinny-wheel", { userRanking: 9 }),
      project("Garden-Shed", { topics: ["outdoor"], userRanking: 20 }),
    ]);
    const popular = shelves[shelves.length - 1];
    expect(popular.id).toBe("popular");
    expect(names(popular)).toEqual(["Spinny-wheel", "Mystery-Thing"]);
  });

  it("hides the popular shelf when nothing is left for it", () => {
    expect(buildShelves([]).map((s) => s.id)).not.toContain("popular");
  });

  it("shows each design once, skipping copies by other makers", () => {
    const shelves = buildShelves([
      project("Laundry-Shelf", { owner: "anna", userRanking: 3 }),
      project("Laundry-Shelf", { owner: "barbour", userRanking: 2 }),
      project("Laundry-Shelf-copy", { owner: "someone", userRanking: 1 }),
    ]);
    const all = shelves.flatMap((s) => s.items);
    const shelfCopies = all.filter((i) => /laundry/i.test(i.repoName));
    expect(shelfCopies).toHaveLength(1);
    expect(shelfCopies[0].owner).toBe("anna");
  });

  it("caps each shelf", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      project(`Chair-${i}`, { topics: ["chair"] }),
    );
    expect(shelf(buildShelves(many), "furniture").items).toHaveLength(
      SHELF_SIZE,
    );
  });
});

describe("Spotlight", () => {
  it("picks a project with a 3D model, changing week to week", () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const now = new Date("2026-10-16T12:00:00Z");
    const a = weeklySpotlightIndex(now);
    const b = weeklySpotlightIndex(new Date(now.getTime() + week));
    expect(SPOTLIGHT_PROJECTS[a]).toBeDefined();
    expect(b).toBe((a + 1) % SPOTLIGHT_PROJECTS.length);
  });

  it("shows readable project names", () => {
    expect(displayName("Gas-Fire-Pit")).toBe("Gas Fire Pit");
    expect(displayName("Sauna_Boat_Controller")).toBe("Sauna Boat Controller");
  });
});
