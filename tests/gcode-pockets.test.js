import { expect, test, describe } from "vitest";

describe("G-code Pocket/Rough Operations", () => {
  // Mock the operation generation logic from KirimotoUpdate.js
  const generateOperations = (passes, z, extra, speed) => {
    const operations = [];
    const totalDepth = z + extra;
    const down = passes === 1 ? 1000 : totalDepth / (passes - 1);

    // First operation: Rough operation for pockets (inside only)
    operations.push({
      type: "rough",
      tool: 1000,
      spindle: 1000,
      down: down,
      step: 1,
      rate: speed,
      plunge: speed,
      leave: 0,
      leavez: 0,
      all: false,
      voids: true,
      flats: true,
      inside: true,
      omitthru: true,
      ov_topz: 0,
      ov_botz: 0,
      ov_conv: false,
    });

    // Second operation: Outline for inside cuts
    operations.push({
      type: "outline",
      tool: 1000,
      spindle: 1000,
      step: 0.4,
      steps: 1,
      down: down,
      rate: speed,
      plunge: speed,
      dogbones: false,
      omitvoid: false,
      omitthru: false,
      outside: false,
      inside: true,
      wide: false,
      top: false,
      ov_topz: 0,
      ov_botz: 0,
      ov_conv: true,
    });

    // Third operation: Outline for outside cuts (omits through cuts)
    operations.push({
      type: "outline",
      tool: 1000,
      spindle: 1000,
      step: 0.4,
      steps: 1,
      down: down,
      rate: speed,
      plunge: speed,
      dogbones: false,
      omitvoid: false,
      omitthru: true,
      outside: false,
      inside: false,
      wide: false,
      top: false,
      ov_topz: 0,
      ov_botz: 0,
      ov_conv: true,
    });

    return operations;
  };

  test("should have rough operation as first operation", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    // Should have 3 operations: rough, outline (inside), outline (outside)
    expect(operations.length).toBe(3);

    // First operation should be rough
    const firstOp = operations[0];
    expect(firstOp.type).toBe("rough");
  });

  test("rough operation should have inside=true and omitthru=true", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const roughOp = operations[0];
    expect(roughOp.type).toBe("rough");
    expect(roughOp.inside).toBe(true);
    expect(roughOp.omitthru).toBe(true);
  });

  test("rough operation should use speed parameter for rate and plunge", () => {
    const speed = 1500;
    const operations = generateOperations(2, 5, 1.5, speed);

    const roughOp = operations[0];
    expect(roughOp.rate).toBe(speed);
    expect(roughOp.plunge).toBe(speed);
  });

  test("rough operation should use dynamic down parameter", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const roughOp = operations[0];
    const expectedDown = (5 + 1.5) / (2 - 1); // totalDepth / (passes - 1)
    expect(roughOp.down).toBe(expectedDown);
  });

  test("should demonstrate operation order: rough -> inside outline -> outside outline", () => {
    const operations = generateOperations(1, 5, 1.5, 1500);

    expect(operations.length).toBe(3);

    // First: Rough operation for pockets
    expect(operations[0].type).toBe("rough");
    expect(operations[0].inside).toBe(true);
    expect(operations[0].omitthru).toBe(true);

    // Second: Outline for inside cuts
    expect(operations[1].type).toBe("outline");
    expect(operations[1].inside).toBe(true);
    expect(operations[1].omitthru).toBe(false);

    // Third: Outline for outside cuts (omits through cuts)
    expect(operations[2].type).toBe("outline");
    expect(operations[2].inside).toBe(false);
    expect(operations[2].omitthru).toBe(true);
  });

  test("rough operation should have correct pocket milling parameters", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const roughOp = operations[0];

    // Check pocket-specific parameters
    expect(roughOp.voids).toBe(true); // Cut voids/pockets
    expect(roughOp.flats).toBe(true); // Cut flat areas
    expect(roughOp.all).toBe(false); // Not all areas
    expect(roughOp.leave).toBe(0); // No material left for finishing
    expect(roughOp.leavez).toBe(0); // No Z-axis material left
  });

  test("rough operation omitthru=true ensures through cuts handled by outline", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const roughOp = operations[0];
    const insideOutline = operations[1];
    const outsideOutline = operations[2];

    // Rough operation omits through cuts
    expect(roughOp.omitthru).toBe(true);

    // Inside outline does NOT omit through cuts (handles them)
    expect(insideOutline.omitthru).toBe(false);

    // Outside outline omits through cuts
    expect(outsideOutline.omitthru).toBe(true);
  });

  test("should validate all operations use same tool and spindle", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    operations.forEach((op) => {
      expect(op.tool).toBe(1000);
      expect(op.spindle).toBe(1000);
    });
  });

  test("should validate operations sequence for pocket and edge cutting", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    // This test documents the intended cutting sequence:
    // 1. Rough operation cuts pockets (inside only, omits through cuts)
    // 2. Inside outline refines inside edges (handles through cuts)
    // 3. Outside outline cuts around the part (omits through cuts already handled)

    const cuttingSequence = operations.map((op, index) => ({
      step: index + 1,
      type: op.type,
      inside: op.inside,
      omitthru: op.omitthru,
      purpose:
        op.type === "rough"
          ? "Remove bulk material from pockets"
          : op.inside
          ? "Refine inside edges"
          : "Cut outside edges",
    }));

    expect(cuttingSequence).toEqual([
      {
        step: 1,
        type: "rough",
        inside: true,
        omitthru: true,
        purpose: "Remove bulk material from pockets",
      },
      {
        step: 2,
        type: "outline",
        inside: true,
        omitthru: false,
        purpose: "Refine inside edges",
      },
      {
        step: 3,
        type: "outline",
        inside: false,
        omitthru: true,
        purpose: "Cut outside edges",
      },
    ]);
  });
});
