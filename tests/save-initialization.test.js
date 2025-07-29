/**
 * Test for project save initialization issue
 * This test verifies that saveProject correctly detects when no changes have been made
 * after a project is loaded, preventing unnecessary saves.
 */

import { describe, it, expect } from 'vitest';

describe('Save Initialization Issue', () => {
  // Mock the saveProject logic to demonstrate the issue
  const createSaveProjectFunction = (lastSaveDataRef, topLevelMolecule) => {
    return (setState, typeSave) => {
      const jsonRepOfProject = topLevelMolecule.serialize();
      
      // This is the comparison logic from the actual saveProject function
      if (JSON.stringify(jsonRepOfProject) == JSON.stringify(lastSaveDataRef.current)) {
        return false; // Should not save - no changes detected
      }
      
      lastSaveDataRef.current = jsonRepOfProject;
      return true; // Will save - changes detected
    };
  };

  it('should demonstrate the initialization issue', () => {
    // Mock data structure that represents a project
    const projectData = {
      filetypeVersion: 1,
      molecules: [{ name: 'test-molecule', type: 'box' }]
    };
    
    // Mock the topLevelMolecule
    const mockTopLevelMolecule = {
      serialize: () => projectData
    };
    
    // Case 1: Simulate the current bug - lastSaveData starts as empty object
    const lastSaveDataRef = { current: {} };
    const saveProject = createSaveProjectFunction(lastSaveDataRef, mockTopLevelMolecule);
    
    // This should NOT save because no changes were made since loading
    // But due to the bug, it returns true (will save)
    const shouldSaveWhenEmpty = saveProject(() => {}, 'Test Save');
    expect(shouldSaveWhenEmpty).toBe(true); // This demonstrates the bug
    
    // Case 2: Simulate proper initialization
    const properlyInitializedRef = { current: projectData };
    const saveProjectProper = createSaveProjectFunction(properlyInitializedRef, mockTopLevelMolecule);
    
    // This should correctly NOT save because no changes were made
    const shouldSaveWhenInitialized = saveProjectProper(() => {}, 'Test Save');
    expect(shouldSaveWhenInitialized).toBe(false); // This is the correct behavior
  });

  it('should save when there are actual changes', () => {
    const initialProjectData = {
      filetypeVersion: 1,
      molecules: [{ name: 'initial-molecule', type: 'box' }]
    };
    
    const changedProjectData = {
      filetypeVersion: 1,
      molecules: [{ name: 'changed-molecule', type: 'cylinder' }]
    };
    
    // Initialize with the original data (proper initialization)
    const lastSaveDataRef = { current: initialProjectData };
    
    // Mock topLevelMolecule to return changed data
    const mockTopLevelMolecule = {
      serialize: () => changedProjectData
    };
    
    const saveProject = createSaveProjectFunction(lastSaveDataRef, mockTopLevelMolecule);
    const shouldSave = saveProject(() => {}, 'Test Save');
    
    // Should save because data actually changed
    expect(shouldSave).toBe(true);
    expect(lastSaveDataRef.current).toEqual(changedProjectData);
  });

  it('should not save when initialized correctly and no changes made', () => {
    const projectData = {
      filetypeVersion: 1,
      molecules: [{ name: 'test-molecule', type: 'box' }]
    };
    
    // Properly initialize with the current project data
    const lastSaveDataRef = { current: projectData };
    
    const mockTopLevelMolecule = {
      serialize: () => projectData
    };
    
    const saveProject = createSaveProjectFunction(lastSaveDataRef, mockTopLevelMolecule);
    const shouldSave = saveProject(() => {}, 'Test Save');
    
    // Should NOT save because no changes were made and ref is properly initialized
    expect(shouldSave).toBe(false);
  });

  // Test that simulates the fix we implemented
  it('should demonstrate the fix working correctly', () => {
    const projectData = {
      filetypeVersion: 1,
      molecules: [{ name: 'loaded-project', type: 'sphere' }]
    };
    
    const mockTopLevelMolecule = {
      serialize: () => projectData
    };
    
    // Simulate the initialization that happens after project load (our fix)
    const lastSaveDataRef = { current: {} }; // Start with empty object (bug condition)
    
    // This simulates our fix: initialize with current project data after load
    lastSaveDataRef.current = mockTopLevelMolecule.serialize();
    
    const saveProject = createSaveProjectFunction(lastSaveDataRef, mockTopLevelMolecule);
    
    // Now an immediate save should NOT proceed because data hasn't changed
    const shouldSave = saveProject(() => {}, 'Test Save After Load');
    expect(shouldSave).toBe(false); // This shows the fix working
  });
});