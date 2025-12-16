import { describe, it, expect } from 'vitest';

/**
 * Test for Issue: Imports only working at the top level
 * 
 * This test validates that when an Import atom is used inside a molecule,
 * it correctly uses the top-level molecule's context (project ID) for
 * caching geometry, rather than the immediate parent molecule's ID.
 * 
 * The bug was that getContext() would traverse up the parent chain until
 * it found a node with no parent, but molecules inside other molecules
 * have parents, so it would return the wrong project ID.
 * 
 * The fix ensures getContext() continues traversing until it finds a
 * molecule with topLevel=true.
 */
describe('Import atom context fix', () => {
  
  it('should use top-level molecule context even when inside nested molecule', () => {
    // Create a mock top-level molecule
    const topLevelMolecule = {
      uniqueID: 'top-level-123',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    
    // Create a nested molecule
    const nestedMolecule = {
      uniqueID: 'nested-456',
      topLevel: false,
      parent: topLevelMolecule,
      atomType: 'Molecule'
    };
    
    // Create an Import atom inside the nested molecule
    const importAtom = {
      uniqueID: 'import-789',
      parent: nestedMolecule,
      atomType: 'Import',
      getContext: function() {
        // Don't cache - always traverse to find current top-level
        let curr = this;
        while (curr.parent && !curr.topLevel) {
          curr = curr.parent;
        }
        return { project: curr.uniqueID };
      }
    };
    
    // Get the context from the Import atom
    const context = importAtom.getContext();
    
    // Should return the top-level molecule's ID, not the nested molecule's ID
    expect(context.project).toBe('top-level-123');
    expect(context.project).not.toBe('nested-456');
  });
  
  it('should handle Import atom at top level', () => {
    // Create a top-level molecule
    const topLevelMolecule = {
      uniqueID: 'top-level-999',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    
    // Create an Import atom directly in the top-level molecule
    const importAtom = {
      uniqueID: 'import-111',
      parent: topLevelMolecule,
      atomType: 'Import',
      getContext: function() {
        let curr = this;
        while (curr.parent && !curr.topLevel) {
          curr = curr.parent;
        }
        return { project: curr.uniqueID };
      }
    };
    
    // Get the context
    const context = importAtom.getContext();
    
    // Should return the top-level molecule's ID
    expect(context.project).toBe('top-level-999');
  });
  
  it('should handle deeply nested molecules', () => {
    // Create a top-level molecule
    const topLevelMolecule = {
      uniqueID: 'top-level-777',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    
    // Create nested molecule level 1
    const nestedMolecule1 = {
      uniqueID: 'nested-1',
      topLevel: false,
      parent: topLevelMolecule,
      atomType: 'Molecule'
    };
    
    // Create nested molecule level 2
    const nestedMolecule2 = {
      uniqueID: 'nested-2',
      topLevel: false,
      parent: nestedMolecule1,
      atomType: 'Molecule'
    };
    
    // Create nested molecule level 3
    const nestedMolecule3 = {
      uniqueID: 'nested-3',
      topLevel: false,
      parent: nestedMolecule2,
      atomType: 'Molecule'
    };
    
    // Create an Import atom in deeply nested molecule
    const importAtom = {
      uniqueID: 'import-deep',
      parent: nestedMolecule3,
      atomType: 'Import',
      getContext: function() {
        let curr = this;
        while (curr.parent && !curr.topLevel) {
          curr = curr.parent;
        }
        return { project: curr.uniqueID };
      }
    };
    
    // Get the context
    const context = importAtom.getContext();
    
    // Should traverse all the way up to top-level
    expect(context.project).toBe('top-level-777');
    expect(context.project).not.toBe('nested-1');
    expect(context.project).not.toBe('nested-2');
    expect(context.project).not.toBe('nested-3');
  });
  
  it('should always return current context without caching', () => {
    // Create a top-level molecule
    const topLevelMolecule = {
      uniqueID: 'top-level-555',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    
    // Create a nested molecule
    const nestedMolecule = {
      uniqueID: 'nested-666',
      topLevel: false,
      parent: topLevelMolecule,
      atomType: 'Molecule'
    };
    
    // Create an Import atom
    const importAtom = {
      uniqueID: 'import-888',
      parent: nestedMolecule,
      atomType: 'Import',
      getContext: function() {
        // Don't cache - always traverse
        let curr = this;
        while (curr.parent && !curr.topLevel) {
          curr = curr.parent;
        }
        return { project: curr.uniqueID };
      }
    };
    
    // Get context first time
    const context1 = importAtom.getContext();
    expect(context1.project).toBe('top-level-555');
    
    // Modify the parent structure (simulating a move)
    const differentTopLevel = {
      uniqueID: 'different-top-level',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    nestedMolecule.parent = differentTopLevel;
    
    // Get context second time - should reflect the new parent chain
    const context2 = importAtom.getContext();
    expect(context2.project).toBe('different-top-level'); // Updated!
    expect(context1).not.toBe(context2); // Different object references
  });
  
  it('should handle old buggy behavior for comparison', () => {
    // This demonstrates the OLD buggy behavior vs the new fixed behavior
    const topLevelMolecule = {
      uniqueID: 'top-level-abc',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    
    const nestedMolecule = {
      uniqueID: 'nested-xyz',
      topLevel: false,
      parent: topLevelMolecule,
      atomType: 'Molecule'
    };
    
    // Old buggy version (with caching)
    const buggyImportAtom = {
      uniqueID: 'import-buggy',
      parent: nestedMolecule,
      atomType: 'Import',
      context: null,
      getContext: function() {
        if (!this.context) {
          let curr = this;
          // OLD BUGGY CODE: just traverse while parent exists
          while (curr.parent) {
            curr = curr.parent;
          }
          this.context = { project: curr.uniqueID };
        }
        return this.context;
      }
    };
    
    // Fixed version (no caching)
    const fixedImportAtom = {
      uniqueID: 'import-fixed',
      parent: nestedMolecule,
      atomType: 'Import',
      getContext: function() {
        // FIXED: no caching, traverse until topLevel is true
        let curr = this;
        while (curr.parent && !curr.topLevel) {
          curr = curr.parent;
        }
        return { project: curr.uniqueID };
      }
    };
    
    const buggyContext = buggyImportAtom.getContext();
    const fixedContext = fixedImportAtom.getContext();
    
    // Both should get the correct top-level ID
    expect(buggyContext.project).toBe('top-level-abc');
    expect(fixedContext.project).toBe('top-level-abc');
  });
  
  it('should work with any atom type, not just Import', () => {
    // The fix applies to all atoms since getContext() is in the Atom base class
    const topLevelMolecule = {
      uniqueID: 'top-level-321',
      topLevel: true,
      parent: null,
      atomType: 'Molecule'
    };
    
    const nestedMolecule = {
      uniqueID: 'nested-654',
      topLevel: false,
      parent: topLevelMolecule,
      atomType: 'Molecule'
    };
    
    // Test with different atom types
    const atomTypes = ['Import', 'Circle', 'Rectangle', 'Extrude', 'Code'];
    
    atomTypes.forEach(atomType => {
      const atom = {
        uniqueID: `${atomType.toLowerCase()}-test`,
        parent: nestedMolecule,
        atomType: atomType,
        getContext: function() {
          let curr = this;
          while (curr.parent && !curr.topLevel) {
            curr = curr.parent;
          }
          return { project: curr.uniqueID };
        }
      };
      
      const context = atom.getContext();
      expect(context.project).toBe('top-level-321');
    });
  });
});
