/**
 * A GitHub molecule made in other units than its project scales its output to
 * the project's units. Molecules placed before unit scaling existed were built
 * expecting no scaling, so they keep it off; new imports turn it on.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/github-molecule-unit-scaling-default.test.js
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";

let top;

/** A GitHub molecule as an Inches project saves it: an MM project's copy. */
function savedGitHubMolecule(extra = {}) {
  return {
    atomType: "GitHubMolecule",
    name: "Rounded-rectangle",
    uniqueID: GlobalVariables.generateUniqueID(),
    x: 0.4,
    y: 0.4,
    topLevel: false,
    unitsKey: "MM",
    parentRepo: { owner: "tester", repoName: "Rounded-rectangle" },
    allAtoms: [],
    allConnectors: [],
    ...extra,
  };
}

/** Stands in for GitHub, serving one project.abundance. */
function fakeOctokit(project) {
  return {
    request: async () => ({
      data: {
        path: "project.abundance",
        encoding: "base64",
        content: btoa(JSON.stringify(project)),
      },
    }),
  };
}

async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out");
}

const githubMolecules = () =>
  top.nodesOnTheScreen.filter((a) => a.atomType === "GitHubMolecule");

beforeEach(() => {
  const canvas = document.createElement("canvas");
  GlobalVariables.canvas = { current: canvas };
  GlobalVariables.c = canvas.getContext("2d");
  GlobalVariables.writeToDisplay = () => {};
  top = new Molecule({
    x: 0.5,
    y: 0.5,
    parent: null,
    uniqueID: GlobalVariables.generateUniqueID(),
    topLevel: true,
    unitsKey: "Inches",
  });
  GlobalVariables.topLevelMolecule = top;
  GlobalVariables.currentMolecule = top;
});

describe("GitHub molecule unit scaling default", () => {
  it("keeps scaling off for a molecule saved before unit scaling", async () => {
    const atom = await top.placeAtom(savedGitHubMolecule(), false);

    expect(atom.scaleToProjectUnits).toBe(false);
    expect(atom.getOutputScaleFactor()).toBeNull();
    // Still flagged, so the user can see the units differ and turn it on
    expect(atom.hasUnitMismatch()).toBe(true);
    expect(atom.serialize()).not.toHaveProperty("scaleToProjectUnits");
  });

  it("keeps scaling on for a molecule saved with it on", async () => {
    const atom = await top.placeAtom(
      savedGitHubMolecule({ scaleToProjectUnits: true }),
      false,
    );

    expect(atom.scaleToProjectUnits).toBe(true);
    expect(atom.getOutputScaleFactor()).toBeCloseTo(1 / 25.4);
    expect(atom.serialize().scaleToProjectUnits).toBe(true);
  });

  it("turns scaling on for a newly imported molecule", async () => {
    const project = { ...savedGitHubMolecule(), atomType: "Molecule" };
    await top.loadGithubMoleculeByName(
      { owner: "tester", repoName: "Rounded-rectangle" },
      {},
      [],
      { x: 0.3, y: 0.3 },
      fakeOctokit(project),
      [],
    );
    const [atom] = await waitFor(
      () => githubMolecules().length && githubMolecules(),
    );

    expect(atom.scaleToProjectUnits).toBe(true);
    expect(atom.getOutputScaleFactor()).toBeCloseTo(1 / 25.4);
    expect(atom.serialize().scaleToProjectUnits).toBe(true);
  });

  it("keeps a molecule's setting when it's reloaded from GitHub", async () => {
    const project = { ...savedGitHubMolecule(), atomType: "Molecule" };
    for (const saved of [{}, { scaleToProjectUnits: true }]) {
      top.nodesOnTheScreen
        .filter((a) => a.atomType === "GitHubMolecule")
        .forEach((a) => a.deleteNode(false, false, true));
      const old = savedGitHubMolecule(saved);
      await top.loadGithubMoleculeByName(
        old.parentRepo,
        old,
        [],
        null,
        fakeOctokit(project),
        [],
      );
      const [atom] = await waitFor(
        () => githubMolecules().length && githubMolecules(),
      );
      expect(atom.scaleToProjectUnits).toBe(saved.scaleToProjectUnits === true);
    }
  });
});
