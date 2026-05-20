import {
  init,
  is3D,
  isWireGeometry,
  isPoint3D,
  defaultColor,
  XYPlane,
} from "../src/worker/util.ts";
import { extrude } from "../src/worker/actions.ts";
import {
  difference,
  fusion,
  loftShapes,
  intersect,
} from "../src/worker/interaction.ts";

/**
 * Create a minimal AbundanceLeaf mock with the given dimension.
 * The geometry string is a placeholder — these tests only need the
 * dimension discriminant field, not a real replicad object.
 */
function makeLeaf(dimension) {
  return {
    dimension,
    geometry: "mock-id",
    tags: [],
    color: defaultColor,
    bom: [],
    plane: XYPlane,
  };
}

function makeBranch(leaves) {
  return {
    geometry: leaves,
    tags: [],
    color: defaultColor,
    bom: [],
    plane: XYPlane,
  };
}

// ---------------------------------------------------------------------------
// Type guard correctness — no replicad init needed (pure field checks)
// ---------------------------------------------------------------------------

describe("isWireGeometry()", () => {
  it("returns true for Wire leaf", () => {
    expect(isWireGeometry(makeLeaf("Wire"))).toBe(true);
  });
  it("returns false for 2D leaf", () => {
    expect(isWireGeometry(makeLeaf("2D"))).toBe(false);
  });
  it("returns false for 3D leaf", () => {
    expect(isWireGeometry(makeLeaf("3D"))).toBe(false);
  });
  it("returns false for Point3D leaf", () => {
    expect(isWireGeometry(makeLeaf("Point3D"))).toBe(false);
  });
  it("returns true for branch containing a Wire leaf", () => {
    expect(
      isWireGeometry(makeBranch([makeLeaf("Wire"), makeLeaf("Wire")])),
    ).toBe(true);
  });
  it("returns false for branch with no Wire leaves", () => {
    expect(isWireGeometry(makeBranch([makeLeaf("3D"), makeLeaf("3D")]))).toBe(
      false,
    );
  });
});

describe("isPoint3D()", () => {
  it("returns true for Point3D leaf", () => {
    expect(isPoint3D(makeLeaf("Point3D"))).toBe(true);
  });
  it("returns false for 3D leaf", () => {
    expect(isPoint3D(makeLeaf("3D"))).toBe(false);
  });
  it("returns false for Wire leaf", () => {
    expect(isPoint3D(makeLeaf("Wire"))).toBe(false);
  });
  it("returns false for 2D leaf", () => {
    expect(isPoint3D(makeLeaf("2D"))).toBe(false);
  });
  it("returns true for branch containing a Point3D leaf", () => {
    expect(isPoint3D(makeBranch([makeLeaf("Point3D")]))).toBe(true);
  });
});

describe("is3D()", () => {
  it("returns true for 3D leaf", () => {
    expect(is3D(makeLeaf("3D"))).toBe(true);
  });
  it("returns false for 2D leaf", () => {
    expect(is3D(makeLeaf("2D"))).toBe(false);
  });
  it("returns false for Wire leaf", () => {
    expect(is3D(makeLeaf("Wire"))).toBe(false);
  });
  it("returns false for Point3D leaf", () => {
    expect(is3D(makeLeaf("Point3D"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rejection in actions — extrude() type checks run before util.init()
// ---------------------------------------------------------------------------

describe("extrude() rejects new primitive types", () => {
  it("throws when extruding a Wire", async () => {
    await expect(extrude(makeLeaf("Wire"), 10, {})).rejects.toThrow(
      "Cannot extrude a Wire",
    );
  });
  it("throws when extruding a Point3D", async () => {
    await expect(extrude(makeLeaf("Point3D"), 10, {})).rejects.toThrow(
      "Cannot extrude a Point3D",
    );
  });
});

// ---------------------------------------------------------------------------
// Rejection in interaction — these call util.init() before the checks so
// replicad must be initialised.
// ---------------------------------------------------------------------------

describe("interaction rejection for new primitive types", () => {
  beforeAll(async () => {
    await init();
  });

  describe("difference()", () => {
    it("throws when target is a Wire", async () => {
      await expect(
        difference(makeLeaf("Wire"), makeLeaf("3D"), {}),
      ).rejects.toThrow("difference() target");
    });
    it("throws when target is a Point3D", async () => {
      await expect(
        difference(makeLeaf("Point3D"), makeLeaf("3D"), {}),
      ).rejects.toThrow("difference() target");
    });
    it("throws when cutter is a Wire", async () => {
      await expect(
        difference(makeLeaf("3D"), makeLeaf("Wire"), {}),
      ).rejects.toThrow("difference() cutter");
    });
  });

  describe("fusion()", () => {
    it("throws for Wire inputs", async () => {
      await expect(
        fusion([makeLeaf("Wire"), makeLeaf("Wire")], {}),
      ).rejects.toThrow("fusion()");
    });
    it("throws for Point3D inputs", async () => {
      await expect(fusion([makeLeaf("Point3D")], {})).rejects.toThrow(
        "fusion()",
      );
    });
  });

  describe("loftShapes()", () => {
    it("throws for Wire inputs", async () => {
      await expect(
        loftShapes([makeLeaf("Wire"), makeLeaf("2D")], {}),
      ).rejects.toThrow("2D sketches");
    });
    it("throws for Point3D inputs", async () => {
      await expect(
        loftShapes([makeLeaf("Point3D"), makeLeaf("2D")], {}),
      ).rejects.toThrow("2D sketches");
    });
  });

  describe("intersect()", () => {
    it("throws when shape1 is a Wire", async () => {
      await expect(
        intersect(makeLeaf("Wire"), makeLeaf("3D"), {}),
      ).rejects.toThrow("intersect()");
    });
    it("throws when shape1 is a Point3D", async () => {
      await expect(
        intersect(makeLeaf("Point3D"), makeLeaf("3D"), {}),
      ).rejects.toThrow("intersect()");
    });
  });
});
