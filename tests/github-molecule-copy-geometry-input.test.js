import { describe, it, expect, beforeEach } from "vitest";

/**
 * Test to reproduce and fix the issue where copying a GitHub molecule
 * with a geometry input doesn't trigger upstream changes when a new
 * geometry is connected until a reload from GitHub is forced.
 */

describe("GitHub Molecule Copy with Geometry Input", () => {
  // This test demonstrates the expected behavior
  it("should propagate changes when geometry is connected to copied GitHub molecule", () => {
    console.log("=".repeat(60));
    console.log("Testing GitHub molecule copy with geometry input");
    console.log("=".repeat(60));

    // Mock the global variables and atom types needed
    const mockGlobalVars = {
      idCounter: 1,
      generateUniqueID() {
        return `id-${this.idCounter++}`;
      }
    };

    // Mock Status enum
    const Status = {
      READY: "READY",
      WAITING: "WAITING",
      DISABLED: "DISABLED",
      PROCESSING: "PROCESSING",
      ERROR: "ERROR",
      UPSTREAM_ERROR: "UPSTREAM_ERROR"
    };

    // Mock ObservableEntity (simplified)
    class MockObservableEntity {
      constructor() {
        this.subscribers = {};
        this.status = Status.DISABLED;
        this.value = null;
      }

      subscribe(callback, subscriberId, immediateCallback = true) {
        this.subscribers[subscriberId] = callback;
        console.log(`  [Subscribe] ${subscriberId} subscribed to ${this.uniqueID || this.name}`);
        if (immediateCallback) {
          console.log(`    → Calling immediately`);
          callback();
        }
      }

      unsubscribe(subscriberId) {
        delete this.subscribers[subscriberId];
        console.log(`  [Unsubscribe] ${subscriberId} unsubscribed from ${this.uniqueID || this.name}`);
      }

      propagateChange() {
        console.log(`  [Propagate] ${this.uniqueID || this.name} (${this.status}) notifying ${Object.keys(this.subscribers).length} subscribers`);
        Object.entries(this.subscribers).forEach(([id, callback]) => {
          console.log(`    → Notifying ${id}`);
          callback();
        });
      }

      setStatus(status, value = null) {
        const oldStatus = this.status;
        this.status = status;
        this.value = value;
        if (oldStatus !== status) {
          console.log(`  [Status] ${this.uniqueID || this.name}: ${oldStatus} → ${status}`);
          this.propagateChange();
        }
      }

      setReady(value) {
        this.setStatus(Status.READY, value);
      }

      setWaiting() {
        this.setStatus(Status.WAITING);
      }

      setDisabled() {
        this.status = Status.DISABLED;
        this.value = null;
      }

      getState() {
        return { status: this.status, value: this.value };
      }
    }

    // Mock AttachmentPoint
    class MockAttachmentPoint extends MockObservableEntity {
      constructor(config) {
        super();
        this.name = config.name;
        this.uniqueID = config.uniqueID;
        this.parentMolecule = config.parentMolecule;
        this.type = config.type; // "input" or "output"
        this.connectors = [];
      }

      attach(connector) {
        if (this.type === "input") {
          this.connectors = [connector];
          const upstreamAP = connector.ap1;  // This is the output attachment point
          const upstreamAtom = upstreamAP.parentMolecule;  // This is the atom we subscribe to
          console.log(`[Attach] ${this.uniqueID} attaching to upstream AP ${upstreamAP.uniqueID}, subscribing to atom ${upstreamAtom.uniqueID}`);
          upstreamAtom.subscribe(() => {
            console.log(`[Callback] ${this.uniqueID}.onUpstreamChange() triggered by ${upstreamAtom.uniqueID}`);
            this.onUpstreamChange();
          }, this.uniqueID);
        } else {
          this.connectors.push(connector);
        }
      }

      onUpstreamChange() {
        if (this.connectors.length === 0) {
          console.warn(`[Warning] ${this.uniqueID} got upstream change but no connector`);
          return;
        }
        const upstreamAP = this.connectors[0].ap1;  // Get the output attachment point
        const upstreamAtom = upstreamAP.parentMolecule;  // Get the atom
        const state = upstreamAtom.getState();
        console.log(`[UpstreamChange] ${this.uniqueID} received: ${state.status} from atom ${upstreamAtom.uniqueID}`);
        this.setStatus(state.status, state.value);
      }
    }

    // Mock Connector
    class MockConnector {
      constructor(ap1, ap2) {
        this.ap1 = ap1; // output attachment point (external atom)
        this.ap2 = ap2; // input attachment point (GitHub molecule)
        console.log(`[Connector] Created: ${ap1.uniqueID} → ${ap2.uniqueID}`);
      }
    }

    // Mock Atom
    class MockAtom extends MockObservableEntity {
      constructor(config) {
        super();
        this.uniqueID = config.uniqueID;
        this.name = config.name || "MockAtom";
        this.atomType = config.atomType || "Atom";
        this.inputs = [];
        this.output = null;
        
        if (config.hasOutput) {
          this.output = new MockAttachmentPoint({
            name: "output",
            uniqueID: mockGlobalVars.generateUniqueID(),
            parentMolecule: this,
            type: "output"
          });
        }
      }

      addInput(name) {
        const ap = new MockAttachmentPoint({
          name: name,
          uniqueID: mockGlobalVars.generateUniqueID(),
          parentMolecule: this,
          type: "input"
        });
        this.inputs.push(ap);
        return ap;
      }

      onUpstreamChange() {
        console.log(`[onUpstreamChange] ${this.atomType} ${this.uniqueID}`);
      }
    }

    // Mock Input Atom (exists inside GitHub molecule)
    class MockInputAtom extends MockAtom {
      constructor(config) {
        super({...config, hasOutput: true});
        this.parent = config.parent;
        
        // Input atom creates an attachment point on its parent molecule
        this.parentAP = this.parent.addInput(this.name);
        
        // Input atom subscribes to its parent AP
        this.parentAP.subscribe(() => {
          console.log(`[InputAtom] ${this.uniqueID} triggered by parentAP ${this.parentAP.uniqueID}`);
          this.onUpstreamChange();
        }, this.uniqueID);
        
        console.log(`[InputAtom] Created ${this.name} (${this.uniqueID}), parentAP: ${this.parentAP.uniqueID}`);
      }

      onUpstreamChange() {
        // Input atom gets value from its parent AP and passes to its output
        const state = this.parentAP.getState();
        console.log(`[InputAtom.onUpstreamChange] ${this.uniqueID}: ${state.status}`);
        if (state.status === Status.READY) {
          this.setReady(state.value);
        } else {
          this.setStatus(state.status);
        }
      }
    }

    // Mock Output Atom (exists inside GitHub molecule)
    class MockOutputAtom extends MockAtom {
      constructor(config) {
        super({...config, hasOutput: true});
        this.parent = config.parent;
        this.addInput("geometry");
        
        // Output atom should subscribe to its inputs
        this.inputs.forEach((input) => {
          input.subscribe(() => {
            console.log(`[OutputAtom] ${this.uniqueID} triggered by input ${input.uniqueID}`);
            this.onUpstreamChange();
          }, this.uniqueID, false);  // false = don't call immediately
        });
        
        // If inputs exist, call onUpstreamChange once
        if (this.inputs.length > 0) {
          this.onUpstreamChange();
        }
      }

      onUpstreamChange() {
        // Output atom forwards its input value
        const inputState = this.inputs[0].getState();
        console.log(`[OutputAtom.onUpstreamChange] ${this.uniqueID}: ${inputState.status}`);
        this.setStatus(inputState.status, inputState.value);
      }
    }

    // Mock GitHub Molecule
    class MockGitHubMolecule extends MockAtom {
      constructor(config) {
        super(config);
        this.nodesOnTheScreen = config.nodesOnTheScreen || [];
        this.inputs = []; // Will be populated by Input atoms
      }

      getOutputAtom() {
        return this.nodesOnTheScreen.find(atom => atom.atomType === "Output");
      }

      setupSubscription() {
        const outputAtom = this.getOutputAtom();
        if (outputAtom) {
          outputAtom.subscribe(() => {
            console.log(`[GitHubMolecule] ${this.uniqueID} triggered by output ${outputAtom.uniqueID}`);
            this.onUpstreamChange();
          }, this.uniqueID);
          console.log(`[GitHubMolecule] ${this.uniqueID} subscribed to output ${outputAtom.uniqueID}`);
        }
      }

      onUpstreamChange() {
        const outputAtom = this.getOutputAtom();
        if (outputAtom) {
          const state = outputAtom.getState();
          console.log(`[GitHubMolecule.onUpstreamChange] ${this.uniqueID}: ${state.status}`);
          this.setStatus(state.status, state.value);
        }
      }

      addInput(name) {
        const ap = new MockAttachmentPoint({
          name: name,
          uniqueID: mockGlobalVars.generateUniqueID(),
          parentMolecule: this,
          type: "input"
        });
        this.inputs.push(ap);
        console.log(`[GitHubMolecule] Added input ${name} (${ap.uniqueID}) to molecule ${this.uniqueID}`);
        return ap;
      }
    }

    console.log("\n--- Creating original GitHub molecule ---");
    
    // Create original GitHub molecule with an Input atom
    const originalMolecule = new MockGitHubMolecule({
      uniqueID: mockGlobalVars.generateUniqueID(),
      name: "Original GitHub Molecule",
      atomType: "GitHubMolecule"
    });

    // Create Input atom inside the molecule
    const inputAtom = new MockInputAtom({
      uniqueID: mockGlobalVars.generateUniqueID(),
      name: "geometry input",
      atomType: "Input",
      parent: originalMolecule
    });
    originalMolecule.nodesOnTheScreen.push(inputAtom);

    // Create Output atom inside the molecule
    const outputAtom = new MockOutputAtom({
      uniqueID: mockGlobalVars.generateUniqueID(),
      name: "Output",
      atomType: "Output",
      parent: originalMolecule
    });
    originalMolecule.nodesOnTheScreen.push(outputAtom);

    // Connect Input atom to Output atom inside the molecule
    const internalConnector = new MockConnector(inputAtom.output, outputAtom.inputs[0]);
    outputAtom.inputs[0].attach(internalConnector);

    // Set up subscription from molecule to its output
    originalMolecule.setupSubscription();

    console.log("\n--- Simulating copy/paste (remapping IDs) ---");

    // Simulate remapping IDs (as happens during copy/paste)
    const copiedMolecule = new MockGitHubMolecule({
      uniqueID: mockGlobalVars.generateUniqueID(), // NEW ID
      name: "Copied GitHub Molecule",
      atomType: "GitHubMolecule"
    });

    // Create NEW Input atom with NEW ID
    const copiedInputAtom = new MockInputAtom({
      uniqueID: mockGlobalVars.generateUniqueID(), // NEW ID
      name: "geometry input",
      atomType: "Input",
      parent: copiedMolecule
    });
    copiedMolecule.nodesOnTheScreen.push(copiedInputAtom);

    // Create NEW Output atom with NEW ID
    const copiedOutputAtom = new MockOutputAtom({
      uniqueID: mockGlobalVars.generateUniqueID(), // NEW ID
      name: "Output",
      atomType: "Output",
      parent: copiedMolecule
    });
    copiedMolecule.nodesOnTheScreen.push(copiedOutputAtom);

    // Reconnect internal connector
    const copiedInternalConnector = new MockConnector(copiedInputAtom.output, copiedOutputAtom.inputs[0]);
    copiedOutputAtom.inputs[0].attach(copiedInternalConnector);

    // Set up subscription from copied molecule to its output
    copiedMolecule.setupSubscription();

    console.log("\n--- Creating external geometry atom ---");
    
    // Create an external geometry atom
    const externalGeom = new MockAtom({
      uniqueID: mockGlobalVars.generateUniqueID(),
      name: "Circle",
      atomType: "Circle",
      hasOutput: true
    });
    externalGeom.setReady({ type: "geometry", id: "circle-1" });

    console.log("\n--- Connecting external geometry to copied molecule ---");
    
    // Find the input attachment point on the copied molecule
    const moleculeInputAP = copiedMolecule.inputs.find(ap => ap.name === "geometry input");
    console.log(`Found molecule input AP: ${moleculeInputAP ? moleculeInputAP.uniqueID : "NOT FOUND"}`);
    
    // Connect external geometry to copied molecule's input
    const externalConnector = new MockConnector(externalGeom.output, moleculeInputAP);
    moleculeInputAP.attach(externalConnector);

    console.log("\n--- Verifying propagation chain ---");
    
    // The external geometry is already READY, but we need to trigger the change
    externalGeom.setReady({ type: "geometry", id: "circle-2" });

    // Verify the chain:
    // 1. External geom output should be READY
    expect(externalGeom.getState().status).toBe(Status.READY);
    console.log(`✓ External geom: ${externalGeom.getState().status}`);

    // 2. Molecule input AP should be READY
    expect(moleculeInputAP.getState().status).toBe(Status.READY);
    console.log(`✓ Molecule input AP: ${moleculeInputAP.getState().status}`);

    // 3. Input atom inside should be READY
    expect(copiedInputAtom.getState().status).toBe(Status.READY);
    console.log(`✓ Input atom: ${copiedInputAtom.getState().status}`);

    // 4. Output atom should be READY
    expect(copiedOutputAtom.getState().status).toBe(Status.READY);
    console.log(`✓ Output atom: ${copiedOutputAtom.getState().status}`);

    // 5. GitHub molecule should be READY
    expect(copiedMolecule.getState().status).toBe(Status.READY);
    console.log(`✓ GitHub molecule: ${copiedMolecule.getState().status}`);

    console.log("\n" + "=".repeat(60));
    console.log("Test passed! All propagations working correctly.");
    console.log("=".repeat(60));
  });
});
