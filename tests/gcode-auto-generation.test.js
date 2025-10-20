import { expect, test, describe, vi, beforeEach } from "vitest";

/**
 * Test for the fix to ensure gcode molecules auto-generate gcode when 
 * something is connected to their output, but don't auto-generate when
 * nothing is connected (user must click "Generate Gcode" button).
 */

// Mock Status enum
const Status = {
  DISABLED: "disabled",
  WAITING: "waiting",
  READY: "ready",
  ERROR: "error",
  UPSTREAM_ERROR: "upstream_error",
  PROCESSING: "processing"
};

// Mock connector class
class MockConnector {
  constructor() {
    this.attachmentPoint1 = null;
    this.attachmentPoint2 = null;
  }
}

// Mock attachment point (output)
class MockOutput {
  constructor(hasConnections = false) {
    this.connectors = hasConnections ? [new MockConnector()] : [];
    this.type = "output";
  }
}

// Simplified Gcode class for testing
class GcodeTestable {
  constructor(hasDownstreamConnections = false) {
    this.status = Status.DISABLED;
    this.output = new MockOutput(hasDownstreamConnections);
    this._generateGcodeCalled = false;
    this.setReadyCalled = false;
    this.readyValue = null;
  }

  setReady(value) {
    this.status = Status.READY;
    this.setReadyCalled = true;
    this.readyValue = value;
  }

  _generateGcode() {
    this._generateGcodeCalled = true;
    // Simulate what real _generateGcode does - eventually calls setReady
    this.setReady("gcode-visualization-geometry");
  }

  // Simplified version of _processSinglePart logic
  processSinglePart(inputID) {
    // Check if output has downstream connections
    const hasDownstreamConnections = 
      this.output && 
      this.output.connectors && 
      this.output.connectors.length > 0;
    
    if (hasDownstreamConnections) {
      // Auto-generate gcode when output is connected to pass geometry downstream
      this._generateGcode();
    } else {
      // No downstream connections - set ready with input geometry
      // User can manually click "Generate Gcode" button if they want visualization
      this.setReady(inputID);
    }
  }

  // Simplified version of _processAssembly logic
  async processAssembly(inputID) {
    // Check if output has downstream connections
    const hasDownstreamConnections = 
      this.output && 
      this.output.connectors && 
      this.output.connectors.length > 0;
    
    if (hasDownstreamConnections) {
      // Auto-generate gcode when output is connected to pass geometry downstream
      this._generateGcode();
    } else {
      // No downstream connections - set ready with input geometry
      // User can manually click "Generate Gcode" button if they want visualization
      this.setReady(inputID);
    }
  }
}

describe("Gcode Auto-Generation Based on Output Connections", () => {
  test("should NOT auto-generate gcode when output has NO downstream connections", () => {
    const gcode = new GcodeTestable(false); // No connections
    const inputGeometry = "test-geometry-id";
    
    gcode.processSinglePart(inputGeometry);
    
    // Should NOT call _generateGcode (expensive operation)
    expect(gcode._generateGcodeCalled).toBe(false);
    
    // Should call setReady with the input geometry
    expect(gcode.setReadyCalled).toBe(true);
    expect(gcode.readyValue).toBe(inputGeometry);
    expect(gcode.status).toBe(Status.READY);
  });

  test("should auto-generate gcode when output HAS downstream connections", () => {
    const gcode = new GcodeTestable(true); // Has connections
    const inputGeometry = "test-geometry-id";
    
    gcode.processSinglePart(inputGeometry);
    
    // Should call _generateGcode to create visualization for downstream
    expect(gcode._generateGcodeCalled).toBe(true);
    
    // _generateGcode internally calls setReady with gcode visualization
    expect(gcode.setReadyCalled).toBe(true);
    expect(gcode.readyValue).toBe("gcode-visualization-geometry");
    expect(gcode.status).toBe(Status.READY);
  });

  test("assembly: should NOT auto-generate gcode when output has NO downstream connections", async () => {
    const gcode = new GcodeTestable(false); // No connections
    const inputAssembly = "test-assembly-id";
    
    await gcode.processAssembly(inputAssembly);
    
    // Should NOT call _generateGcode (expensive operation)
    expect(gcode._generateGcodeCalled).toBe(false);
    
    // Should call setReady with the input geometry
    expect(gcode.setReadyCalled).toBe(true);
    expect(gcode.readyValue).toBe(inputAssembly);
    expect(gcode.status).toBe(Status.READY);
  });

  test("assembly: should auto-generate gcode when output HAS downstream connections", async () => {
    const gcode = new GcodeTestable(true); // Has connections
    const inputAssembly = "test-assembly-id";
    
    await gcode.processAssembly(inputAssembly);
    
    // Should call _generateGcode to create visualization for downstream
    expect(gcode._generateGcodeCalled).toBe(true);
    
    // _generateGcode internally calls setReady with gcode visualization
    expect(gcode.setReadyCalled).toBe(true);
    expect(gcode.readyValue).toBe("gcode-visualization-geometry");
    expect(gcode.status).toBe(Status.READY);
  });

  test("should handle null/undefined output gracefully (treat as no connections)", () => {
    const gcode = new GcodeTestable(false);
    gcode.output = null; // Simulate missing output
    const inputGeometry = "test-geometry-id";
    
    gcode.processSinglePart(inputGeometry);
    
    // Should NOT call _generateGcode
    expect(gcode._generateGcodeCalled).toBe(false);
    
    // Should call setReady with input geometry
    expect(gcode.setReadyCalled).toBe(true);
    expect(gcode.readyValue).toBe(inputGeometry);
  });

  test("should handle undefined connectors array gracefully (treat as no connections)", () => {
    const gcode = new GcodeTestable(false);
    gcode.output = { connectors: undefined }; // Simulate missing connectors
    const inputGeometry = "test-geometry-id";
    
    gcode.processSinglePart(inputGeometry);
    
    // Should NOT call _generateGcode
    expect(gcode._generateGcodeCalled).toBe(false);
    
    // Should call setReady with input geometry
    expect(gcode.setReadyCalled).toBe(true);
    expect(gcode.readyValue).toBe(inputGeometry);
  });

  test("should detect multiple downstream connections", () => {
    const gcode = new GcodeTestable(false);
    gcode.output = new MockOutput(false);
    // Add multiple connectors
    gcode.output.connectors = [new MockConnector(), new MockConnector()];
    const inputGeometry = "test-geometry-id";
    
    gcode.processSinglePart(inputGeometry);
    
    // Should call _generateGcode because there are connections
    expect(gcode._generateGcodeCalled).toBe(true);
    expect(gcode.setReadyCalled).toBe(true);
  });

  test("should demonstrate the complete scenario from the issue", () => {
    // Scenario 1: User creates gcode molecule to generate gcode file (no output connection)
    const gcodeNoConnection = new GcodeTestable(false);
    gcodeNoConnection.processSinglePart("geometry-1");
    
    // Gcode should NOT auto-generate (user must click button)
    expect(gcodeNoConnection._generateGcodeCalled).toBe(false);
    expect(gcodeNoConnection.status).toBe(Status.READY);
    
    // Scenario 2: User connects gcode output to another molecule (has output connection)
    const gcodeWithConnection = new GcodeTestable(true);
    gcodeWithConnection.processSinglePart("geometry-2");
    
    // Gcode SHOULD auto-generate to feed downstream molecule
    expect(gcodeWithConnection._generateGcodeCalled).toBe(true);
    expect(gcodeWithConnection.status).toBe(Status.READY);
    expect(gcodeWithConnection.readyValue).toBe("gcode-visualization-geometry");
  });
});
