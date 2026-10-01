import { describe, expect, it } from "vitest";

import { computePositions } from "../src/worker/cutlayout";
import chairOutlines from "./fixtures/cutlayout-chair-outlines.json";

// The flat outlines of the 16 plywood parts in BarbourSmith/Blocky_Adorondac_Chair,
// as prepShapesForLayout produces them from the project's Cut Orient output.
const outlines = chairOutlines as number[][][];

type XY = { x: number; y: number };

function placedOutline(points: number[][], degrees: number, at: XY): XY[] {
  // Same transform applyLayout uses: rotate about the origin, then translate.
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([x, y]) => ({
    x: x * cos - y * sin + at.x,
    y: x * sin + y * cos + at.y,
  }));
}

function segmentsCross(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function contains(polygon: XY[], point: XY): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function overlap(a: XY[], b: XY[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (
        segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])
      ) {
        return true;
      }
    }
  }
  return contains(b, a[0]) || contains(a, b[0]);
}

describe("cut layout nesting quality", () => {
  it("nests the chair parts on one sheet without overlaps and packs them tightly", async () => {
    const sheet = { width: 2438, height: 1219 };
    const positions = await computePositions(
      outlines.map((points, id) => ({
        id,
        shape: points.map(([x, y]) => ({ x, y })),
      })),
      () => {},
      () => {},
      { ...sheet, partPadding: 6.35, rotations: 12 },
    );

    expect(positions).toBeDefined();
    // About half a 4x8 sheet of parts: they belong on one sheet.
    expect(positions!).toHaveLength(1);
    const placements = positions![0];
    expect(placements.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      outlines.map((_, id) => id),
    );

    const placed = placements.map((p) => ({
      id: p.id,
      outline: placedOutline(outlines[p.id as number], p.rotate, p.translate),
    }));

    // Every part sits on the sheet.
    let usedWidth = 0;
    for (const { outline } of placed) {
      for (const point of outline) {
        expect(point.x).toBeGreaterThan(-0.1);
        expect(point.y).toBeGreaterThan(-0.1);
        expect(point.x).toBeLessThan(sheet.width + 0.1);
        expect(point.y).toBeLessThan(sheet.height + 0.1);
        usedWidth = Math.max(usedWidth, point.x);
      }
    }

    // No two parts overlap once the placements are applied the way applyLayout
    // applies them. Parts rotated 330 degrees used to overlap because the packer
    // rotated them by 327.3 degrees.
    const overlaps: string[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (overlap(placed[i].outline, placed[j].outline)) {
          overlaps.push(`${placed[i].id}-${placed[j].id}`);
        }
      }
    }
    expect(overlaps).toEqual([]);

    // Layouts are packed towards one end of the sheet. A sign error in the
    // packer's fitness made wider layouts score better, so every layout spread
    // across the full 2438 mm; a working search gets these parts into ~1700 mm.
    expect(usedWidth).toBeLessThan(2000);
  }, 120000);
});
