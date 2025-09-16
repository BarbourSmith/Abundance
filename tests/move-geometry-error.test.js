// Test file for reproducing and fixing the Move geometry error (Issue #891)
import { beforeAll, describe, it, expect, vi } from "vitest";
import { init } from "../src/worker/util.js";
import { move } from "../src/worker/worker.js";

describe("Move Geometry Error Fix - Issue #891", () => {
  beforeAll(async () => {
    await init();
  });

  describe("toGeometry function handling undefined inputs", () => {
    it("should handle undefined input gracefully in move operation", async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        // This should reproduce the "can't access property 'geometry', r is undefined" error
        await move(undefined, 1, 2, 3, "target-id");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // The error should be descriptive and not the confusing "can't access property" error
        expect(error.message).toContain("move-geometry value cannot be interpreted as geometry");
        expect(error.message).not.toContain("can't access property");
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Error moving geometry"),
          expect.anything()
        );
      }

      consoleSpy.mockRestore();
    });

    it("should handle null input gracefully in move operation", async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        // This should also be handled gracefully
        await move(null, 1, 2, 3, "target-id");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // The error should be descriptive
        expect(error.message).toContain("move-geometry value cannot be interpreted as geometry");
        expect(error.message).not.toContain("can't access property");
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Error moving geometry"),
          expect.anything()
        );
      }

      consoleSpy.mockRestore();
    });

    it("should handle empty object input gracefully in move operation", async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        // This should also be handled gracefully
        await move({}, 1, 2, 3, "target-id");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // The error should be descriptive
        expect(error.message).toContain("move-geometry value cannot be interpreted as geometry");
        expect(error.message).not.toContain("can't access property");
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Error moving geometry"),
          expect.anything()
        );
      }

      consoleSpy.mockRestore();
    });
  });

  describe("edge cases in toGeometry conversion", () => {
    it("should handle object with undefined geometry property", async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        const invalidGeom = { geometry: undefined };
        await move(invalidGeom, 1, 2, 3, "target-id");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toContain("move-geometry value cannot be interpreted as geometry");
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Error moving geometry"),
          expect.anything()
        );
      }

      consoleSpy.mockRestore();
    });

    it("should handle object with null geometry property", async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        const invalidGeom = { geometry: null };
        await move(invalidGeom, 1, 2, 3, "target-id");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toContain("move-geometry value cannot be interpreted as geometry");
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Error moving geometry"),
          expect.anything()
        );
      }

      consoleSpy.mockRestore();
    });
  });

  describe("regression test for original issue", () => {
    it("should prevent the original 'can't access property geometry' error", async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      try {
        // Simulate the exact scenario from the issue report where geometry is undefined
        // This was causing: "Error: Failed to move geometry: can't access property "geometry", r is undefined"
        await move(undefined, 5, 10, 0, "moved-geometry");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // The error should now be clear and helpful, not the confusing original error
        expect(error.message).toContain("Failed to move geometry: move-geometry value cannot be interpreted as geometry.");
        expect(error.message).not.toContain("can't access property");
        expect(error.message).not.toContain("r is undefined");
        
        // Verify that the error handling wrapper in worker.js was called
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Error moving geometry"),
          expect.anything()
        );
      }

      consoleSpy.mockRestore();
    });

    it("should handle performance degradation scenario", async () => {
      // Test that the fix doesn't impact performance significantly
      const consoleSpy = vi.spyOn(console, 'warn');
      consoleSpy.mockImplementation(() => {});

      const startTime = performance.now();
      
      try {
        // Try multiple undefined moves quickly - this should fail fast, not hang
        for (let i = 0; i < 10; i++) {
          try {
            await move(undefined, i, i, i, `target-${i}`);
          } catch (e) {
            // Expected to fail, just checking it fails quickly
            expect(e.message).toContain("move-geometry value cannot be interpreted as geometry");
          }
        }
      } catch (error) {
        // Should not reach here since errors are caught in the loop
      }

      const endTime = performance.now();
      const elapsed = endTime - startTime;
      
      // Should complete very quickly (under 100ms for 10 operations)
      expect(elapsed).toBeLessThan(100);

      consoleSpy.mockRestore();
    });
  });
});