import { describe, it, expect } from "vitest";
import { scrub } from "../src/js/bugReport.js";

describe("bug report scrub", () => {
  it("masks GitHub tokens, pairing tokens, auth headers and emails", () => {
    const input = [
      "token ghp_abcdefghijklmnopqrstuvwxyz0123",
      "pat github_pat_11ABCDEFG0123456789_xyz",
      "pair abd-1234567890abcdef",
      '{"Authorization":"Bearer secretvalue123"}',
      "contact jane.doe@example.com",
    ].join("\n");
    const out = scrub(input);
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz0123");
    expect(out).not.toContain("0123456789_xyz");
    expect(out).not.toContain("1234567890abcdef");
    expect(out).not.toContain("secretvalue123");
    expect(out).not.toContain("jane.doe@example.com");
    expect(out).toContain("[email]");
  });

  it("leaves ordinary text alone", () => {
    expect(scrub("Extrude failed at height 10")).toBe(
      "Extrude failed at height 10",
    );
  });
});
