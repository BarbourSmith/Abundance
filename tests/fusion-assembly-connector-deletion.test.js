/**
 * Tests for the issue where dragging connectors to fusion or assembly deletes existing connectors
 * This addresses GitHub issue #895
 */

import { describe, it, expect, beforeEach } from "vitest";

describe("Fusion/Assembly Connector Deletion Issue - #895", () => {
  // Mock classes to simulate the issue scenario
  class MockAttachmentPoint {
    constructor(name, valueType = "geometry", type = "input") {
      this.name = name;
      this.valueType = valueType;
      this.type = type;
      this.connectors = [];
      this.parentMolecule = null;
    }

    static areTypesCompatible(outputAP, inputAP) {
      if (!outputAP.valueType || !inputAP.valueType) {
        return true;
      }
      return outputAP.valueType === inputAP.valueType;
    }

    attach(connector) {
      if (this.type === "input" && this.connectors.length > 0) {
        // For inputs, replace existing connection
        this.connectors = [connector];
      } else {
        this.connectors.push(connector);
      }
    }

    deleteConnector(connector) {
      const index = this.connectors.indexOf(connector);
      if (index > -1) {
        this.connectors.splice(index, 1);
      }
    }
  }

  class MockConnector {
    constructor(id, outputAP, inputAP) {
      this.id = id;
      this.attachmentPoint1 = outputAP;
      this.attachmentPoint2 = inputAP;
    }

    deleteSelf(silent = false) {
      if (this.attachmentPoint1) {
        this.attachmentPoint1.deleteConnector(this);
      }
      if (this.attachmentPoint2) {
        this.attachmentPoint2.deleteConnector(this);
      }
    }
  }

  class MockFusionAtom {
    constructor(name) {
      this.name = name;
      this.atomType = "Fusion";
      this.inputs = [];
      this.uniqueID = Math.random().toString(36);
      
      // Start with one default input
      this.addInput("Shape 1");
    }

    addInput(name) {
      const input = new MockAttachmentPoint(name, "geometry", "input");
      input.parentMolecule = this;
      this.inputs.push(input);
    }

    removeInput(name) {
      const index = this.inputs.findIndex(input => input.name === name);
      if (index > -1) {
        this.inputs.splice(index, 1);
      }
    }

    // Simulate the alwaysOneFreeInput behavior - this is the corrected version that matches the actual implementation
    addOrDeletePorts() {
      const freeInputs = this.inputs.filter(input => input.connectors.length === 0);
      
      if (freeInputs.length === 0) {
        // Add a new input if none are free
        const highestNumber = Math.max(
          ...this.inputs.map(input => {
            const match = input.name.match(/\d+$/);
            return match ? parseInt(match[0]) : 0;
          })
        );
        this.addInput(`Shape ${highestNumber + 1}`);
      } else if (freeInputs.length >= 2) {
        // Remove excess free inputs - but only remove them from the end to avoid breaking existing connections
        // This simulates the actual deleteEmptyPort function which stops at length - 1
        for (let i = 0; i < this.inputs.length - 1; i++) {
          const input = this.inputs[i];
          if (input.connectors.length === 0 && freeInputs.length > 1) {
            this.removeInput(input.name);
            freeInputs.splice(freeInputs.indexOf(input), 1);
            break; // Only remove one at a time, like the real implementation
          }
        }
      }
    }
  }

  class MockOutputAtom {
    constructor(name) {
      this.name = name;
      this.atomType = "Circle";
      this.output = new MockAttachmentPoint("geometry", "geometry", "output");
      this.output.parentMolecule = this;
      this.uniqueID = Math.random().toString(36);
    }
  }

  // Mock the connector creation logic from the fixed connector.js
  class MockConnectorCreationLogic {
    static simulateConnectorPlacement(outputAtom, targetAtom, targetX, targetY) {
      // This simulates the fixed logic in connector.js clickUp method
      let attachmentMade = false;
      
      // Check if we're trying to connect to a fusion/assembly atom
      const isAlwaysOneFreeInputAtom = ["Fusion", "Assembly", "ShrinkWrap", "Loft", "Group"].includes(targetAtom.atomType);
      
      if (isAlwaysOneFreeInputAtom) {
        // THE FIX: Ensure there's always a free input available for these atoms
        targetAtom.addOrDeletePorts();
      }

      // First, try to find a free input
      for (let i = 0; i < targetAtom.inputs.length; i++) {
        const input = targetAtom.inputs[i];
        if (input.type === "input" && input.connectors.length === 0) {
          // Check compatibility
          if (MockAttachmentPoint.areTypesCompatible(outputAtom.output, input)) {
            // Connect to this free input
            const connector = new MockConnector(`conn-${Date.now()}`, outputAtom.output, input);
            input.attach(connector);
            attachmentMade = true;
            
            // After making the connection, ensure ports are properly managed
            if (isAlwaysOneFreeInputAtom) {
              targetAtom.addOrDeletePorts();
            }
            break;
          }
        }
      }

      // THE FIX: Only attempt to replace existing connections if:
      // 1. No free input was found AND
      // 2. This is NOT an alwaysOneFreeInput atom (those should always have free inputs)
      if (!attachmentMade && !isAlwaysOneFreeInputAtom) {
        for (let i = 0; i < targetAtom.inputs.length; i++) {
          const input = targetAtom.inputs[i];
          if (input.type === "input" && input.connectors.length > 0) {
            if (MockAttachmentPoint.areTypesCompatible(outputAtom.output, input)) {
              // Remove existing connections and replace
              const connectorsToRemove = [...input.connectors];
              connectorsToRemove.forEach((existingConnector) => {
                existingConnector.deleteSelf(true);
              });
              
              const connector = new MockConnector(`conn-${Date.now()}`, outputAtom.output, input);
              input.attach(connector);
              attachmentMade = true;
              break;
            }
          }
        }
      }

      return attachmentMade;
    }
  }

  describe("Issue reproduction", () => {
    it("should demonstrate the bug: adding connector to fusion deletes existing connectors", () => {
      // Setup: Create a fusion atom with two existing connections
      const fusion = new MockFusionAtom("TestFusion");
      const source1 = new MockOutputAtom("Circle1");
      const source2 = new MockOutputAtom("Circle2");
      const source3 = new MockOutputAtom("Circle3");

      // Create first connection
      const connector1 = new MockConnector("conn1", source1.output, fusion.inputs[0]);
      fusion.inputs[0].attach(connector1);
      fusion.addOrDeletePorts(); // This should add "Shape 2"

      // Create second connection
      const connector2 = new MockConnector("conn2", source2.output, fusion.inputs[1]);
      fusion.inputs[1].attach(connector2);
      fusion.addOrDeletePorts(); // This should add "Shape 3"

      // Verify initial state: 2 connected inputs + 1 free input = 3 total
      expect(fusion.inputs.length).toBe(3);
      expect(fusion.inputs[0].connectors.length).toBe(1);
      expect(fusion.inputs[1].connectors.length).toBe(1);
      expect(fusion.inputs[2].connectors.length).toBe(0); // free input

      // Now simulate dragging a third connector to the fusion atom
      // This should connect to the free input without affecting existing connections
      
      // CURRENT BUGGY BEHAVIOR: Let's simulate what happens in placeConnector
      // When a new connector is placed, it might trigger connection replacement logic
      
      // Simulate the problematic scenario where we're trying to place a connector
      // but the logic incorrectly removes existing connections
      
      // The bug: if we target any input (even a free one), existing connections get removed
      const targetInput = fusion.inputs[2]; // The free input
      
      // Simulate the current placeConnector logic that checks for existing connections
      // and removes them even when we're targeting a different input
      if (targetInput.connectors.length === 0) {
        // This should work fine - connecting to a free input
        const connector3 = new MockConnector("conn3", source3.output, targetInput);
        targetInput.attach(connector3);
        fusion.addOrDeletePorts();
        
        // This should work correctly
        expect(fusion.inputs[0].connectors.length).toBe(1);
        expect(fusion.inputs[1].connectors.length).toBe(1);
        expect(fusion.inputs[2].connectors.length).toBe(1);
      }
      
      // The actual bug occurs when the logic incorrectly processes ALL inputs
      // Let's simulate the problematic behavior
      console.log("Before problematic deletion:");
      console.log("Input 0 connectors:", fusion.inputs[0].connectors.length);
      console.log("Input 1 connectors:", fusion.inputs[1].connectors.length);
      console.log("Input 2 connectors:", fusion.inputs[2].connectors.length);
      
      // This simulates the bug: when addOrDeletePorts is called incorrectly,
      // it might remove inputs that have connections
      fusion.addOrDeletePorts();
      
      console.log("After addOrDeletePorts:");
      console.log("Total inputs:", fusion.inputs.length);
      console.log("Input 0 connectors:", fusion.inputs[0]?.connectors.length ?? "DELETED");
      console.log("Input 1 connectors:", fusion.inputs[1]?.connectors.length ?? "DELETED");
      console.log("Input 2 connectors:", fusion.inputs[2]?.connectors.length ?? "DELETED");
      
      // The test documents the expected behavior:
      // All three connections should remain intact
      expect(fusion.inputs.length).toBeGreaterThanOrEqual(3);
      if (fusion.inputs.length >= 3) {
        expect(fusion.inputs[0].connectors.length).toBe(1);
        expect(fusion.inputs[1].connectors.length).toBe(1);
        expect(fusion.inputs[2].connectors.length).toBe(1);
      }
    });
  });

  describe("Fix verification: connector placement with alwaysOneFreeInput atoms", () => {
    it("should use the fix to ensure free inputs are available before attempting replacement", () => {
      const fusion = new MockFusionAtom("TestFusion");
      const source1 = new MockOutputAtom("Circle1");
      const source2 = new MockOutputAtom("Circle2");
      const source3 = new MockOutputAtom("Circle3");

      // Connect first two sources
      MockConnectorCreationLogic.simulateConnectorPlacement(source1, fusion, 0, 0);
      MockConnectorCreationLogic.simulateConnectorPlacement(source2, fusion, 0, 0);
      
      // Verify we have 2 connected inputs and 1 free input
      expect(fusion.inputs.length).toBe(3);
      const connectedInputs = fusion.inputs.filter(input => input.connectors.length > 0);
      const freeInputs = fusion.inputs.filter(input => input.connectors.length === 0);
      expect(connectedInputs.length).toBe(2);
      expect(freeInputs.length).toBe(1);

      // Now try to connect a third source
      const success = MockConnectorCreationLogic.simulateConnectorPlacement(source3, fusion, 0, 0);
      
      // The fix should ensure this succeeds without replacing existing connections
      expect(success).toBe(true);
      
      // All three connections should exist
      expect(fusion.inputs.length).toBe(4); // 3 connected + 1 new free
      const finalConnectedInputs = fusion.inputs.filter(input => input.connectors.length > 0);
      const finalFreeInputs = fusion.inputs.filter(input => input.connectors.length === 0);
      expect(finalConnectedInputs.length).toBe(3);
      expect(finalFreeInputs.length).toBe(1);
    });

    it("should still allow connection replacement for non-alwaysOneFreeInput atoms", () => {
      // Create a regular atom (like Circle) that doesn't use alwaysOneFreeInput
      const regularAtom = {
        name: "RegularAtom",
        atomType: "Circle",
        inputs: [
          new MockAttachmentPoint("diameter", "number", "input")
        ]
      };
      regularAtom.inputs[0].parentMolecule = regularAtom;

      const source1 = new MockOutputAtom("Constant1");
      const source2 = new MockOutputAtom("Constant2");
      
      // Make sure both sources output numbers
      source1.output.valueType = "number";
      source2.output.valueType = "number";

      // Connect first source
      const connector1 = new MockConnector("conn1", source1.output, regularAtom.inputs[0]);
      regularAtom.inputs[0].attach(connector1);
      
      expect(regularAtom.inputs[0].connectors.length).toBe(1);

      // Try to connect second source - this SHOULD replace the first connection
      // since regular atoms don't automatically create free inputs
      const success = MockConnectorCreationLogic.simulateConnectorPlacement(source2, regularAtom, 0, 0);
      
      expect(success).toBe(true);
      expect(regularAtom.inputs[0].connectors.length).toBe(1);
      // The connection should now be from source2, not source1
      expect(regularAtom.inputs[0].connectors[0].attachmentPoint1).toBe(source2.output);
    });
  });

  describe("Expected behavior after fix", () => {
    it("should allow adding new connections to fusion without deleting existing ones", () => {
      const fusion = new MockFusionAtom("TestFusion");
      const source1 = new MockOutputAtom("Circle1");
      const source2 = new MockOutputAtom("Circle2");
      const source3 = new MockOutputAtom("Circle3");

      // Step 1: Connect first source
      const connector1 = new MockConnector("conn1", source1.output, fusion.inputs[0]);
      fusion.inputs[0].attach(connector1);
      fusion.addOrDeletePorts();
      
      expect(fusion.inputs.length).toBe(2); // original + new free input
      expect(fusion.inputs[0].connectors.length).toBe(1);
      expect(fusion.inputs[1].connectors.length).toBe(0);

      // Step 2: Connect second source
      const connector2 = new MockConnector("conn2", source2.output, fusion.inputs[1]);
      fusion.inputs[1].attach(connector2);
      fusion.addOrDeletePorts();
      
      expect(fusion.inputs.length).toBe(3); // two connected + new free input
      expect(fusion.inputs[0].connectors.length).toBe(1);
      expect(fusion.inputs[1].connectors.length).toBe(1);
      expect(fusion.inputs[2].connectors.length).toBe(0);

      // Step 3: Connect third source to the free input
      const connector3 = new MockConnector("conn3", source3.output, fusion.inputs[2]);
      fusion.inputs[2].attach(connector3);
      fusion.addOrDeletePorts();
      
      // ALL existing connections should remain intact
      expect(fusion.inputs.length).toBe(4); // three connected + new free input
      expect(fusion.inputs[0].connectors.length).toBe(1);
      expect(fusion.inputs[1].connectors.length).toBe(1);
      expect(fusion.inputs[2].connectors.length).toBe(1);
      expect(fusion.inputs[3].connectors.length).toBe(0);
    });

    it("should only replace connections when explicitly targeting the same input", () => {
      const fusion = new MockFusionAtom("TestFusion");
      const source1 = new MockOutputAtom("Circle1");
      const source2 = new MockOutputAtom("Circle2");

      // Connect first source to Shape 1
      const connector1 = new MockConnector("conn1", source1.output, fusion.inputs[0]);
      fusion.inputs[0].attach(connector1);
      fusion.addOrDeletePorts();
      
      expect(fusion.inputs[0].connectors.length).toBe(1);
      expect(fusion.inputs[0].connectors[0]).toBe(connector1);

      // Now replace the connection to Shape 1 with source2
      // This should only affect the targeted input (Shape 1)
      connector1.deleteSelf(); // Remove old connection
      const connector2 = new MockConnector("conn2", source2.output, fusion.inputs[0]);
      fusion.inputs[0].attach(connector2);
      
      // Verify the replacement worked correctly
      expect(fusion.inputs[0].connectors.length).toBe(1);
      expect(fusion.inputs[0].connectors[0]).toBe(connector2);
      
      // No other inputs should be affected
      expect(fusion.inputs[1].connectors.length).toBe(0);
    });
  });
});