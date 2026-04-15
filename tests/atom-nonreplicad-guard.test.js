import { describe, it, expect, vi } from "vitest";

vi.mock("../src/js/globalvariables.js", () => ({
  default: {
    generateUniqueID: () => 1,
  },
}));

describe("Atom buildNonReplicadGeom", () => {
  it("handles undefined and primitive values without throwing", async () => {
    const { default: Atom } = await import("../src/prototypes/atom.js");
    const atom = new Atom({});

    expect(() => atom.buildNonReplicadGeom(undefined)).not.toThrow();
    expect(() => atom.buildNonReplicadGeom(null)).not.toThrow();
    expect(() => atom.buildNonReplicadGeom(123)).not.toThrow();

    expect(atom.nonReplicadGeom).toEqual({
      geometry: [],
      material: null,
      hideMainMesh: false,
    });
  });
});
