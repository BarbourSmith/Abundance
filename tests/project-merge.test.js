import { describe, it, expect } from "vitest";
import { mergeProjects } from "../src/js/projectMerge.js";

const atom = (uniqueID, atomType, ioValues = {}, extra = {}) => ({
  atomType,
  x: 0.5,
  y: 0.5,
  uniqueID,
  ioValues: Object.entries(ioValues).map(([name, ioValue]) => ({
    name,
    ioValue,
  })),
  ...extra,
});

const project = (allAtoms, allConnectors = []) => ({
  atomType: "Molecule",
  uniqueID: "id-1",
  name: "Test",
  topLevel: true,
  allAtoms,
  allConnectors,
});

const clone = (value) => structuredClone(value);

const ioValue = (proj, atomID, name) =>
  proj.allAtoms
    .find((a) => a.uniqueID === atomID)
    .ioValues.find((v) => v.name === name).ioValue;

describe("mergeProjects", () => {
  const base = project(
    [
      atom("id-2", "Circle", { diameter: 10 }),
      atom("id-3", "Move", { xDist: 0, yDist: 20 }),
      atom("id-4", "Move", { xDist: 30, yDist: 0 }),
    ],
    [{ ap2Name: "geometry", ap1ID: "id-2", ap2ID: "id-3" }],
  );

  it("merges changes to different atoms without conflicts", () => {
    const main = clone(base);
    main.allAtoms[1].ioValues[0].ioValue = 25;
    const head = clone(base);
    head.allAtoms[2].ioValues[0].ioValue = 33;

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    expect(ioValue(merged, "id-3", "xDist")).toBe(25);
    expect(ioValue(merged, "id-4", "xDist")).toBe(33);
  });

  it("ignores numeric currentEquation copies that saves add and drop", () => {
    const withEquation = clone(base);
    withEquation.allAtoms[0].ioValues[0].currentEquation = "10";
    const main = clone(withEquation);
    main.allAtoms[0].ioValues[0].ioValue = 20;
    main.allAtoms[0].ioValues[0].currentEquation = "20";
    const head = clone(base); // Saved without the copy

    const { merged, conflicts } = mergeProjects(withEquation, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allAtoms[0].ioValues[0]).toEqual({
      name: "diameter",
      ioValue: 20,
    });
  });

  it("keeps real equations", () => {
    const main = clone(base);
    main.allAtoms[0].ioValues[0].currentEquation = "width / 2";
    const head = clone(base);
    head.allAtoms[1].ioValues[0].ioValue = 5;

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allAtoms[0].ioValues[0].currentEquation).toBe("width / 2");
    expect(ioValue(merged, "id-3", "xDist")).toBe(5);
  });

  it("doesn't report atoms moved on both sides of the node editor", () => {
    const main = clone(base);
    main.allAtoms[1].y = 0.3;
    main.allAtoms[2].x = 0.9;
    const head = clone(base);
    head.allAtoms[1].y = 0.7;
    head.allAtoms[1].ioValues[0].ioValue = 12;

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allAtoms[1].y).toBe(0.7);
    expect(merged.allAtoms[2].x).toBe(0.9);
    expect(ioValue(merged, "id-3", "xDist")).toBe(12);
  });

  it("reports a conflict when both sides change the same value", () => {
    const main = clone(base);
    main.allAtoms[1].ioValues[0].ioValue = 25;
    const head = clone(base);
    head.allAtoms[1].ioValues[0].ioValue = 40;

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ base: 0, main: 25, head: 40 });
    expect(conflicts[0].label).toBe("Move › xDist");
    expect(ioValue(merged, "id-3", "xDist")).toBe(40);

    const resolved = mergeProjects(base, main, head, {
      [conflicts[0].id]: "main",
    });
    expect(ioValue(resolved.merged, "id-3", "xDist")).toBe(25);
  });

  it("keeps atoms and connectors added on both sides", () => {
    const main = clone(base);
    main.allAtoms.push(atom("id-5", "Rectangle", { "x length": 10 }));
    main.allConnectors.push({
      ap2Name: "geometry",
      ap1ID: "id-5",
      ap2ID: "id-4",
    });
    const head = clone(base);
    head.allAtoms.push(atom("id-6", "Extrude", { height: 5 }));
    head.allConnectors.push({
      ap2Name: "geometry",
      ap1ID: "id-3",
      ap2ID: "id-6",
    });

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allAtoms.map((a) => a.uniqueID)).toEqual([
      "id-2",
      "id-3",
      "id-4",
      "id-5",
      "id-6",
    ]);
    expect(merged.allConnectors).toHaveLength(3);
  });

  it("renumbers different atoms created with the same ID on both sides", () => {
    const main = clone(base);
    main.allAtoms.push(atom("id-5", "Rectangle", { "x length": 10 }));
    main.allConnectors.push({
      ap2Name: "geometry",
      ap1ID: "id-5",
      ap2ID: "id-4",
    });
    const head = clone(base);
    head.allAtoms.push(atom("id-5", "Extrude", { height: 5 }));
    head.allConnectors.push({
      ap2Name: "geometry",
      ap1ID: "id-3",
      ap2ID: "id-5",
    });

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    const rectangle = merged.allAtoms.find((a) => a.atomType === "Rectangle");
    const extrude = merged.allAtoms.find((a) => a.atomType === "Extrude");
    expect(rectangle.uniqueID).toBe("id-5");
    expect(extrude.uniqueID).toBe("id-6");
    expect(merged.allConnectors).toContainEqual({
      ap2Name: "geometry",
      ap1ID: "id-3",
      ap2ID: "id-6",
    });
    expect(merged.allConnectors).toContainEqual({
      ap2Name: "geometry",
      ap1ID: "id-5",
      ap2ID: "id-4",
    });
  });

  it("keeps a deletion when the other side left the atom alone", () => {
    const main = clone(base);
    main.allAtoms = main.allAtoms.filter((a) => a.uniqueID !== "id-4");
    const head = clone(base);
    head.allAtoms[0].ioValues[0].ioValue = 12;

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allAtoms.map((a) => a.uniqueID)).toEqual(["id-2", "id-3"]);
  });

  it("drops connectors to an atom the other side deleted", () => {
    const main = clone(base);
    main.allAtoms = main.allAtoms.filter((a) => a.uniqueID !== "id-4");
    const head = clone(base);
    head.allConnectors.push({
      ap2Name: "geometry",
      ap1ID: "id-3",
      ap2ID: "id-4",
    });

    const { merged, conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allConnectors).toEqual([
      { ap2Name: "geometry", ap1ID: "id-2", ap2ID: "id-3" },
    ]);
  });

  it("reports deleting an atom the other side changed", () => {
    const main = clone(base);
    main.allAtoms = main.allAtoms.filter((a) => a.uniqueID !== "id-4");
    const head = clone(base);
    head.allAtoms[2].ioValues[0].ioValue = 33;

    const { conflicts } = mergeProjects(base, main, head);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].main).toBeUndefined();
  });

  it("merges inside nested molecules", () => {
    const nested = (xDist) =>
      project([
        atom(
          "id-10",
          "Molecule",
          {},
          {
            allAtoms: [atom("id-11", "Move", { xDist, yDist: 0 })],
            allConnectors: [],
          },
        ),
        atom("id-12", "Circle", { diameter: 10 }),
      ]);
    const nestedBase = nested(0);
    const main = nested(0);
    main.allAtoms[1].ioValues[0].ioValue = 20;
    const head = nested(7);

    const { merged, conflicts } = mergeProjects(nestedBase, main, head);

    expect(conflicts).toEqual([]);
    expect(merged.allAtoms[0].allAtoms[0].ioValues[0].ioValue).toBe(7);
    expect(merged.allAtoms[1].ioValues[0].ioValue).toBe(20);
  });
});
