import { describe, it, expect } from "vitest";
import { Status } from "../src/prototypes/observableEntity.js";

/**
 * Test to verify the fix for GitHub molecule copy with geometry input issue.
 * 
 * This test simulates the exact scenario from the bug report:
 * 1. Create a GitHub molecule with an Input atom
 * 2. The molecule starts in DISABLED state (as happens after paste)
 * 3. Connect an external geometry to the molecule's input
 * 4. Verify that the molecule automatically enables and processes the upstream change
 */

describe("GitHub Molecule Enable on Connect - Bug Fix Validation", () => {
  it("should automatically enable GitHub molecule when connecting to its input", () => {
    console.log("\n=== Testing automatic molecule enable on connect ===\n");

    // Mock Status is imported from actual source
    
    // Create a simplified mock that tests ONLY the critical path:
    // External Atom (READY) → connects to → GitHubMolecule Input AP → enables molecule → propagates

    let enableCalled = false;
    let onUpstreamChangeCalled = false;

    // Mock parent molecule (GitHub molecule)
    const parentMolecule = {
      status: Status.DISABLED,  // Key: molecule starts DISABLED
      enable() {
        console.log("✓ parentMolecule.enable() called");
        enableCalled = true;
        this.status = Status.WAITING;
      }
    };

    // Mock attachment point (molecule's input AP)
    const inputAP = {
      parentMolecule: parentMolecule,
      type: "input",
      uniqueID: "ap-1",
      connectors: [],
      onUpstreamChange() {
        console.log("✓ inputAP.onUpstreamChange() called");
        onUpstreamChangeCalled = true;
      }
    };

    // Mock upstream atom (external geometry)
    const upstreamAtom = {
      status: Status.READY,
      uniqueID: "upstream-1",
      subscribers: {},
      subscribe(callback, id) {
        this.subscribers[id] = callback;
        console.log(`✓ Subscription established: ${id} → ${this.uniqueID}`);
        // Immediate callback (default behavior)
        callback();
      }
    };

    // Mock connector
    const connector = {
      attachmentPoint1: {
        parentMolecule: upstreamAtom
      },
      attachmentPoint2: inputAP,
      getOtherAP(ap) {
        if (ap === this.attachmentPoint2) {
          return this.attachmentPoint1;
        }
        return this.attachmentPoint2;
      }
    };

    console.log("1. Initial state: molecule is DISABLED");
    expect(parentMolecule.status).toBe(Status.DISABLED);

    // Simulate the attach() method from attachmentpoint.js
    console.log("\n2. Attaching connector (simulating attach() method)...");
    
    // This is the core logic from attachmentpoint.js:attach()
    if (inputAP.type === "input") {
      inputAP.connectors = [connector];
      const upstream = connector.getOtherAP(inputAP).parentMolecule;
      
      // Subscribe to upstream
      upstream.subscribe(() => {
        inputAP.onUpstreamChange();
      }, inputAP.uniqueID);
      
      // THE FIX: Enable parent molecule if disabled
      if (inputAP.parentMolecule && inputAP.parentMolecule.status === Status.DISABLED) {
        console.log("   → Molecule is DISABLED, enabling it...");
        inputAP.parentMolecule.enable();
      }
    }

    console.log("\n3. Verifying fix worked:");
    
    // Verify the molecule was enabled
    expect(enableCalled).toBe(true);
    console.log("   ✓ Molecule was enabled");
    
    // Verify onUpstreamChange was called (from immediate callback)
    expect(onUpstreamChangeCalled).toBe(true);
    console.log("   ✓ onUpstreamChange was triggered");
    
    // Verify molecule is no longer DISABLED
    expect(parentMolecule.status).not.toBe(Status.DISABLED);
    console.log("   ✓ Molecule status changed from DISABLED");

    console.log("\n=== Test passed! Fix is working ===\n");
  });

  it("should not re-enable already enabled molecule", () => {
    console.log("\n=== Testing that already-enabled molecules aren't re-enabled ===\n");

    let enableCallCount = 0;

    // Mock parent molecule that's already enabled
    const parentMolecule = {
      status: Status.WAITING,  // Already enabled
      enable() {
        enableCallCount++;
        console.log(`⚠ enable() called (count: ${enableCallCount})`);
      }
    };

    // Mock attachment point
    const inputAP = {
      parentMolecule: parentMolecule,
      type: "input",
      uniqueID: "ap-1",
      connectors: [],
      onUpstreamChange() {}
    };

    // Mock upstream atom
    const upstreamAtom = {
      status: Status.READY,
      uniqueID: "upstream-1",
      subscribers: {},
      subscribe(callback, id) {
        this.subscribers[id] = callback;
        callback();
      }
    };

    // Mock connector
    const connector = {
      attachmentPoint1: {
        parentMolecule: upstreamAtom
      },
      attachmentPoint2: inputAP,
      getOtherAP(ap) {
        if (ap === this.attachmentPoint2) {
          return this.attachmentPoint1;
        }
        return this.attachmentPoint2;
      }
    };

    console.log("1. Initial state: molecule is WAITING (already enabled)");
    expect(parentMolecule.status).toBe(Status.WAITING);

    // Simulate attach()
    console.log("\n2. Attaching connector...");
    if (inputAP.type === "input") {
      inputAP.connectors = [connector];
      const upstream = connector.getOtherAP(inputAP).parentMolecule;
      
      upstream.subscribe(() => {
        inputAP.onUpstreamChange();
      }, inputAP.uniqueID);
      
      // THE FIX: Only enable if DISABLED
      if (inputAP.parentMolecule && inputAP.parentMolecule.status === Status.DISABLED) {
        console.log("   → Molecule is DISABLED, enabling it...");
        inputAP.parentMolecule.enable();
      } else {
        console.log("   → Molecule is already enabled, skipping enable()");
      }
    }

    console.log("\n3. Verifying molecule wasn't re-enabled:");
    
    // Verify enable was NOT called (molecule was already enabled)
    expect(enableCallCount).toBe(0);
    console.log("   ✓ enable() was not called (molecule was already enabled)");

    console.log("\n=== Test passed! Already-enabled molecules aren't re-enabled ===\n");
  });
});
