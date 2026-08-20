import { beforeAll, describe, expect, it } from "vitest";
import { ClipperWrapper } from "geometry-utils";
// @ts-ignore - the vendored wasm package ships no types for this export
import { ready } from "wasm-nesting";

/**
 * Offsetting a part outwards by half the part padding is how the nesting engine
 * enforces spacing between parts. Where an outline has a gap narrower than that
 * offset opening into something wider - a letter counter, a serif gap, the space
 * between two spikes - the offset bridges the gap and seals the wider region
 * into an enclosed void. The offset then returns several paths: the real outer
 * contour plus one small sliver per sealed void.
 *
 * ClipperWrapper used to treat anything other than exactly one path as a hard
 * error. That threw straight out of `packer.start`, so a single lettered or
 * spiky part meant Cut Layout produced no layout at all for the whole sheet and
 * silently fell back to stacking every part at the middle of the sheet.
 *
 * Observed on a real sign project: one 350x350 part offset into 5 paths (the
 * 100932mm^2 outer contour plus four ~41mm^2 slivers) and another into 9.
 */

const SPACING = 10.4; // 10mm part padding + 2 * 0.2mm tolerance, the app default

function toF32(points: number[][]): Float32Array {
  const memSeg = new Float32Array(points.length * 2 + 2);
  points.forEach(([x, y], i) => {
    memSeg[i * 2] = x;
    memSeg[i * 2 + 1] = y;
  });
  memSeg[points.length * 2] = points[0][0];
  memSeg[points.length * 2 + 1] = points[0][1];
  return memSeg;
}

/**
 * A 200x200 plate with a keyhole cut into its top edge: a 4mm mouth - narrower
 * than the 10.4mm the offset closes over - opening into a 25mm chamber that
 * stays open. Offsetting this seals the chamber into a void.
 */
function keyholedPlate(originX = 0): Float32Array {
  const mouthWidth = 4;
  const chamberRadius = 25;
  const neckLength = 10;
  const centreX = originX + 100;
  const chamberY = 200 - neckLength - chamberRadius;
  const points: number[][] = [
    [originX, 0],
    [originX + 200, 0],
    [originX + 200, 200],
    [centreX + mouthWidth / 2, 200],
    [centreX + mouthWidth / 2, 200 - neckLength],
  ];
  for (let i = 0; i <= 16; i++) {
    const angle = -Math.PI / 2 + (i / 16) * 2 * Math.PI;
    points.push([
      centreX + chamberRadius * Math.sin(angle),
      chamberY + chamberRadius * Math.cos(angle),
    ]);
  }
  points.push(
    [centreX - mouthWidth / 2, 200 - neckLength],
    [centreX - mouthWidth / 2, 200],
    [originX, 200],
  );
  return toF32(points);
}

function plainPlate(originX: number): Float32Array {
  return toF32([
    [originX, 0],
    [originX + 200, 0],
    [originX + 200, 200],
    [originX, 200],
  ]);
}

describe("clipper offset when a gap seals into a void", () => {
  beforeAll(async () => {
    await ready;
  });

  const config = {
    curveTolerance: 0.1,
    spacing: SPACING,
    rotations: 4,
    populationSize: 8,
    mutationRate: 50,
    useHoles: false,
  };

  it("keeps a part whose offset encloses a void", () => {
    const nodes = new ClipperWrapper(config as any).generateTree(
      [keyholedPlate()],
      false,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].memSeg.length).toBeGreaterThan(0);
  });

  it("does not take the rest of the sheet down with it", () => {
    // The damage was collateral: one part that could not be offset threw out of
    // generateTree and took every other part on the sheet with it.
    const nodes = new ClipperWrapper(config as any).generateTree(
      [plainPlate(0), keyholedPlate(300), plainPlate(600)],
      false,
    );

    expect(nodes).toHaveLength(3);
  });

  it("keeps the outer contour, not the sealed void", () => {
    // Of the paths the offset returns, the one to keep is the outer boundary
    // grown by half the spacing: the 200x200 plate plus 5.2mm on each side.
    // Keeping a void instead would handto the packer a part a fraction of the
    // true size and let parts overlap on the sheet.
    const nodes = new ClipperWrapper(config as any).generateTree(
      [keyholedPlate()],
      false,
    );

    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < nodes[0].memSeg.length; i += 2) {
      xs.push(nodes[0].memSeg[i]);
      ys.push(nodes[0].memSeg[i + 1]);
    }

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200 + SPACING, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200 + SPACING, 0);
  });
});
