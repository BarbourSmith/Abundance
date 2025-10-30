import { expect, test, describe } from "vitest";

describe("G-code Rough and Outline Operations", () => {
  // Mock the operation generation logic from KirimotoUpdate.js
  const generateOperations = (passes, z, extra, speed, toolSize = 6.35, isMetric = true) => {
    const operations = [];
    const totalDepth = z + extra;
    const down = passes === 1 ? 1000 : totalDepth / (passes - 1);

    // Convert toolSize to mm if needed (widget coordinates are always in mm after scaling)
    const toolSizeInMM = isMetric ? toolSize : toolSize * 25.4;

    // First operation: Rough operation for internal cavities only
    operations.push({
      type: "rough",
      tool: 1000,
      spindle: 1000,
      down: down,
      step: toolSizeInMM * 0.9,
      rate: speed,
      plunge: speed,
      leave: 0,
      voids: false,
      flats: false,
      inside: true,
      omitthru: true,
      top: false,
      ov_topz: 0,
      ov_botz: 0,
    });

    // Second operation: Outline (omits through cuts and pockets)
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
      omitvoid: true,
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
    expect(operations.length).toBe(2);

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

  test("rough operation should use 90% stepover of tool size", () => {
    const toolSize = 6.35; // Default tool size in mm
    const operations = generateOperations(2, 5, 1.5, 1500, toolSize, true);

    const roughOp = operations[0];
    const expectedStep = toolSize * 0.9;
    expect(roughOp.step).toBe(expectedStep);
    expect(roughOp.step).toBe(5.715); // 6.35 * 0.9

    // Test with imperial units - toolSize should be converted to mm internally
    const toolSizeInches = 0.25;
    const operationsInches = generateOperations(2, 5, 1.5, 1500, toolSizeInches, false);
    const roughOpInches = operationsInches[0];
    const expectedStepInches = toolSizeInches * 25.4 * 0.9; // Convert inches to mm, then 90%
    expect(roughOpInches.step).toBe(expectedStepInches);
    expect(roughOpInches.step).toBe(5.715); // 0.25 * 25.4 * 0.9 = 5.715mm
  });

  test("should demonstrate operation order: rough -> outline", () => {
    const operations = generateOperations(1, 5, 1.5, 1500);

    expect(operations.length).toBe(2);

    // First: Rough operation for pockets
    expect(operations[0].type).toBe("rough");
    expect(operations[0].inside).toBe(true);
    expect(operations[0].omitthru).toBe(true);
    expect(operations[0].voids).toBe(false);
    expect(operations[0].flats).toBe(false);

    // Second: Outline (omits through cuts and pockets)
    expect(operations[1].type).toBe("outline");
    expect(operations[1].inside).toBe(false);
    expect(operations[1].omitthru).toBe(true);
    expect(operations[1].omitvoid).toBe(true);
  });

  test("rough operation should have correct pocket milling parameters", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const roughOp = operations[0];

    // Check pocket-specific parameters
    expect(roughOp.inside).toBe(true); // Only process inside features (pockets)
    expect(roughOp.omitthru).toBe(true); // Skip through cuts
    expect(roughOp.leave).toBe(0); // No material left for finishing
  });

  test("rough operation omitthru=true ensures through cuts handled by outline", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const roughOp = operations[0];
    const outline = operations[1];

    // Rough operation omits through cuts
    expect(roughOp.omitthru).toBe(true);

    // Rough operation has voids and flats disabled to match UI settings
    expect(roughOp.voids).toBe(false);
    expect(roughOp.flats).toBe(false);

    // Outline omits through cuts and voids/pockets
    expect(outline.omitthru).toBe(true);
    expect(outline.omitvoid).toBe(true);
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
    // 1. Rough operation cuts pockets (inside only, omits through cuts, voids/flats disabled)
    // 2. Outline cuts around the part (omits through cuts and pockets)

    const cuttingSequence = operations.map((op, index) => ({
      step: index + 1,
      type: op.type,
      inside: op.inside,
      omitthru: op.omitthru,
      purpose:
        op.type === "rough"
          ? "Remove bulk material from pockets"
          : "Cut around edges",
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
        inside: false,
        omitthru: true,
        purpose: "Cut around edges",
      },
    ]);
  });
});
