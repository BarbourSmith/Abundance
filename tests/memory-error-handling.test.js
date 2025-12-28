import { describe, it, expect } from "vitest";
import { wrapMemoryError } from "../src/worker/util.ts";

describe("Memory Error Handling", () => {
  it("should wrap allocation size overflow errors with user-friendly message", () => {
    const originalError = new Error("InternalError: allocation size overflow");
    const wrappedError = wrapMemoryError(originalError, "exporting to STL");

    expect(wrappedError.message).toContain("Memory error while exporting to STL");
    expect(wrappedError.message).toContain("The geometry is too large or complex");
    expect(wrappedError.message).toContain("Suggestions:");
    expect(wrappedError.message).toContain("Simplify your geometry");
    expect(wrappedError.message).toContain("Break your model into smaller parts");
  });

  it("should wrap allocation size overflow errors without 'InternalError:' prefix", () => {
    const originalError = new Error("allocation size overflow");
    const wrappedError = wrapMemoryError(originalError, "generating mesh");

    expect(wrappedError.message).toContain("Memory error while generating mesh");
    expect(wrappedError.message).toContain("too large or complex");
  });

  it("should wrap out of memory errors", () => {
    const originalError = new Error("out of memory");
    const wrappedError = wrapMemoryError(originalError, "processing geometry");

    expect(wrappedError.message).toContain("Memory error while processing geometry");
  });

  it("should handle string errors", () => {
    const originalError = "InternalError: allocation size overflow";
    const wrappedError = wrapMemoryError(originalError, "exporting");

    expect(wrappedError.message).toContain("Memory error while exporting");
  });

  it("should pass through non-memory errors unchanged", () => {
    const originalError = new Error("Some other error");
    const wrappedError = wrapMemoryError(originalError, "exporting");

    expect(wrappedError).toBe(originalError);
    expect(wrappedError.message).toBe("Some other error");
  });

  it("should include original error message in wrapped error", () => {
    const originalError = new Error("InternalError: allocation size overflow in module X");
    const wrappedError = wrapMemoryError(originalError, "exporting to STEP");

    expect(wrappedError.message).toContain("Original error:");
    expect(wrappedError.message).toContain("allocation size overflow in module X");
  });

  it("should provide suggestions for different operations", () => {
    const error = new Error("allocation size overflow");
    
    const exportError = wrapMemoryError(error, "exporting to STL");
    expect(exportError.message).toContain("For STL export: Consider using STEP format instead");
    
    const meshError = wrapMemoryError(error, "generating display mesh");
    expect(meshError.message).toContain("Reduce the complexity of boolean operations");
  });

  it("should handle Maximum call stack errors", () => {
    const originalError = new Error("Maximum call stack size exceeded");
    const wrappedError = wrapMemoryError(originalError, "processing");

    expect(wrappedError.message).toContain("Memory error while processing");
    expect(wrappedError.message).toContain("too large or complex");
  });
});
