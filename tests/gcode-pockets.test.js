import { expect, test, describe } from "vitest";

describe("G-code Pocket Operations", () => {
  // Mock the operation generation logic from KirimotoUpdate.js
  const generateOperations = (passes, z, extra, speed, toolSize = 6.35, isMetric = true) => {
    const operations = [];
    const totalDepth = z + extra;
    const down = passes === 1 ? 1000 : totalDepth / (passes - 1);

    // Convert toolSize to mm if needed (widget coordinates are always in mm after scaling)
    const toolSizeInMM = isMetric ? toolSize : toolSize * 25.4;

    // First operation: Pocket operation for internal cavities only
    operations.push({
      type: "pocket",
      tool: 1000,
      spindle: 1000,
      down: down,
      step: toolSizeInMM * 0.9,
      rate: speed,
      plunge: speed,
      leave: 0,
      inside: true,
      omitthru: true,
      ov_topz: 0,
      ov_botz: 0,
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

  test("should have pocket operation as first operation", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    // Should have 3 operations: rough, outline (inside), outline (outside)
    expect(operations.length).toBe(3);

    // First operation should be rough
    const firstOp = operations[0];
    expect(firstOp.type).toBe("pocket");
  });

  test("pocket operation should have inside=true and omitthru=true", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const pocketOp = operations[0];
    expect(pocketOp.type).toBe("pocket");
    expect(pocketOp.inside).toBe(true);
    expect(pocketOp.omitthru).toBe(true);
  });

  test("pocket operation should use speed parameter for rate and plunge", () => {
    const speed = 1500;
    const operations = generateOperations(2, 5, 1.5, speed);

    const pocketOp = operations[0];
    expect(pocketOp.rate).toBe(speed);
    expect(pocketOp.plunge).toBe(speed);
  });

  test("pocket operation should use dynamic down parameter", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const pocketOp = operations[0];
    const expectedDown = (5 + 1.5) / (2 - 1); // totalDepth / (passes - 1)
    expect(pocketOp.down).toBe(expectedDown);
  });

  test("pocket operation should use 90% stepover of tool size", () => {
    const toolSize = 6.35; // Default tool size in mm
    const operations = generateOperations(2, 5, 1.5, 1500, toolSize, true);

    const pocketOp = operations[0];
    const expectedStep = toolSize * 0.9;
    expect(pocketOp.step).toBe(expectedStep);
    expect(pocketOp.step).toBe(5.715); // 6.35 * 0.9

    // Test with imperial units - toolSize should be converted to mm internally
    const toolSizeInches = 0.25;
    const operationsInches = generateOperations(2, 5, 1.5, 1500, toolSizeInches, false);
    const pocketOpInches = operationsInches[0];
    const expectedStepInches = toolSizeInches * 25.4 * 0.9; // Convert inches to mm, then 90%
    expect(pocketOpInches.step).toBe(expectedStepInches);
    expect(pocketOpInches.step).toBe(5.715); // 0.25 * 25.4 * 0.9 = 5.715mm
  });

  test("should demonstrate operation order: rough -> inside outline -> outside outline", () => {
    const operations = generateOperations(1, 5, 1.5, 1500);

    expect(operations.length).toBe(3);

    // First: Pocket operation for pockets
    expect(operations[0].type).toBe("pocket");
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

  test("pocket operation should have correct pocket milling parameters", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const pocketOp = operations[0];

    // Check pocket-specific parameters
    expect(pocketOp.inside).toBe(true); // Only process inside features (pockets)
    expect(pocketOp.omitthru).toBe(true); // Skip through cuts
    expect(pocketOp.leave).toBe(0); // No material left for finishing
  });

  test("pocket operation omitthru=true ensures through cuts handled by outline", () => {
    const operations = generateOperations(2, 5, 1.5, 1500);

    const pocketOp = operations[0];
    const insideOutline = operations[1];
    const outsideOutline = operations[2];

    // Pocket operation omits through cuts
    expect(pocketOp.omitthru).toBe(true);

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
    // 1. Pocket operation cuts pockets (inside only, omits through cuts)
    // 2. Inside outline refines inside edges (handles through cuts)
    // 3. Outside outline cuts around the part (omits through cuts already handled)

    const cuttingSequence = operations.map((op, index) => ({
      step: index + 1,
      type: op.type,
      inside: op.inside,
      omitthru: op.omitthru,
      purpose:
        op.type === "pocket"
          ? "Remove bulk material from pockets"
          : op.inside
          ? "Refine inside edges"
          : "Cut outside edges",
    }));

    expect(cuttingSequence).toEqual([
      {
        step: 1,
        type: "pocket",
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
