import { describe, it, expect } from "vitest";
import Fonts from "../src/js/fonts.js";

/**
 * Tests for font configuration
 * Verifies that cursive fonts are available for the Text atom
 */
describe("Font Configuration", () => {
  it("should export a fonts object", () => {
    expect(Fonts).toBeDefined();
    expect(typeof Fonts).toBe("object");
  });

  it("should have at least 10 fonts available", () => {
    const fontKeys = Object.keys(Fonts);
    expect(fontKeys.length).toBeGreaterThanOrEqual(10);
  });

  it("should include the original cursive font AGUAFINA", () => {
    expect(Fonts.AGUAFINA).toBeDefined();
    expect(Fonts.AGUAFINA).toContain("aguafinascript");
    expect(Fonts.AGUAFINA).toContain(".ttf");
  });

  it("should include the new cursive font KAUSHAN_SCRIPT", () => {
    expect(Fonts.KAUSHAN_SCRIPT).toBeDefined();
    expect(Fonts.KAUSHAN_SCRIPT).toContain("kaushanscript");
    expect(Fonts.KAUSHAN_SCRIPT).toContain(".ttf");
  });

  it("should include the new cursive font PACIFICO", () => {
    expect(Fonts.PACIFICO).toBeDefined();
    expect(Fonts.PACIFICO).toContain("pacifico");
    expect(Fonts.PACIFICO).toContain(".ttf");
  });

  it("should include the new cursive font GREAT_VIBES", () => {
    expect(Fonts.GREAT_VIBES).toBeDefined();
    expect(Fonts.GREAT_VIBES).toContain("greatvibes");
    expect(Fonts.GREAT_VIBES).toContain(".ttf");
  });

  it("should have at least 4 cursive/script style fonts", () => {
    const cursiveFonts = ["AGUAFINA", "KAUSHAN_SCRIPT", "PACIFICO", "GREAT_VIBES"];
    const availableCursiveFonts = cursiveFonts.filter((font) => Fonts[font]);
    expect(availableCursiveFonts.length).toBeGreaterThanOrEqual(4);
  });

  it("should have valid Google Fonts URLs for all cursive fonts", () => {
    const cursiveFonts = ["AGUAFINA", "KAUSHAN_SCRIPT", "PACIFICO", "GREAT_VIBES"];
    cursiveFonts.forEach((font) => {
      expect(Fonts[font]).toMatch(/^https:\/\/fonts\.gstatic\.com/);
    });
  });

  it("should maintain backward compatibility with existing fonts", () => {
    // Check that original non-cursive fonts are still present
    const originalFonts = ["ANTON", "ROBOTO", "NOTOSANS", "OPEN_SANS", "INCONSOLATA"];
    originalFonts.forEach((font) => {
      expect(Fonts[font]).toBeDefined();
    });
  });
});
