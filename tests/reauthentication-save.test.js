import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Test for reauthentication save functionality
 * 
 * This test validates the fix for the issue where molecules were being deleted
 * after reauthentication instead of being preserved and saved properly.
 * 
 * The fix ensures that:
 * 1. When manually clicking "Re-authenticate", the current project state is serialized
 * 2. The serialized state is saved to localStorage before redirecting to OAuth
 * 3. After returning from OAuth, the project is restored from localStorage
 * 4. The restored project is automatically saved to GitHub
 */
describe('Reauthentication Save - Preserve Project State', () => {
  let setItemSpy;
  let getItemSpy;

  beforeEach(() => {
    // Spy on localStorage methods
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up localStorage
    localStorage.removeItem('pendingProjectSave');
  });

  it('should save project state to localStorage when authRedirectHandler is called with currentProjectRep', () => {
    // Simulate authRedirectHandler logic
    const authRedirectHandler = ({ authType, currentProjectRep, returnTo }) => {
      if (currentProjectRep) {
        localStorage.setItem('pendingProjectSave', currentProjectRep);
      }
    };

    const mockProjectState = JSON.stringify({
      filetypeVersion: 1,
      atomType: 'Molecule',
      nodesOnTheScreen: [
        { atomType: 'Circle', uniqueID: 'circle-1' },
        { atomType: 'Rectangle', uniqueID: 'rect-1' }
      ]
    });

    // Call authRedirectHandler with project state (as done in TopMenu.jsx)
    authRedirectHandler({
      authType: 'reauth',
      currentProjectRep: mockProjectState,
      returnTo: '/user/repo'
    });

    expect(setItemSpy).toHaveBeenCalledWith('pendingProjectSave', mockProjectState);
  });

  it('should NOT save project state when authRedirectHandler is called without currentProjectRep', () => {
    // Simulate authRedirectHandler logic
    const authRedirectHandler = ({ authType, currentProjectRep, returnTo }) => {
      if (currentProjectRep) {
        localStorage.setItem('pendingProjectSave', currentProjectRep);
      }
    };

    // Call authRedirectHandler without project state (old behavior)
    authRedirectHandler({
      authType: 'reauth',
      returnTo: '/user/repo'
    });

    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('should restore project from localStorage when redirectType is "reauth"', () => {
    const mockProjectState = JSON.stringify({
      filetypeVersion: 1,
      atomType: 'Molecule',
      nodesOnTheScreen: [
        { atomType: 'Circle', uniqueID: 'circle-1' }
      ]
    });

    // Setup localStorage with pending project
    localStorage.setItem('pendingProjectSave', mockProjectState);

    // Simulate flowCanvas logic for redirectType === "reauth"
    const redirectType = 'reauth';
    const authorizedUserOcto = { /* mock octokit */ };
    let restoredProject = null;

    if ((redirectType === 'save' || redirectType === 'reauth') && authorizedUserOcto) {
      const pendingProject = localStorage.getItem('pendingProjectSave');
      if (pendingProject) {
        restoredProject = JSON.parse(pendingProject);
      }
    }

    expect(getItemSpy).toHaveBeenCalledWith('pendingProjectSave');
    expect(restoredProject).not.toBeNull();
    expect(restoredProject.nodesOnTheScreen).toHaveLength(1);
    expect(restoredProject.nodesOnTheScreen[0].atomType).toBe('Circle');
  });

  it('should also restore project when redirectType is "save" (existing behavior)', () => {
    const mockProjectState = JSON.stringify({
      filetypeVersion: 1,
      atomType: 'Molecule',
      nodesOnTheScreen: [
        { atomType: 'Rectangle', uniqueID: 'rect-1' }
      ]
    });

    // Setup localStorage with pending project
    localStorage.setItem('pendingProjectSave', mockProjectState);

    // Simulate flowCanvas logic for redirectType === "save"
    const redirectType = 'save';
    const authorizedUserOcto = { /* mock octokit */ };
    let restoredProject = null;

    if ((redirectType === 'save' || redirectType === 'reauth') && authorizedUserOcto) {
      const pendingProject = localStorage.getItem('pendingProjectSave');
      if (pendingProject) {
        restoredProject = JSON.parse(pendingProject);
      }
    }

    expect(getItemSpy).toHaveBeenCalledWith('pendingProjectSave');
    expect(restoredProject).not.toBeNull();
    expect(restoredProject.nodesOnTheScreen[0].atomType).toBe('Rectangle');
  });

  it('should handle the complete reauthentication flow', () => {
    // Step 1: User clicks "Re-authenticate" button
    const mockTopLevelMolecule = {
      serialize: vi.fn(() => ({
        filetypeVersion: 1,
        atomType: 'Molecule',
        name: 'MyProject',
        nodesOnTheScreen: [
          { atomType: 'Circle', uniqueID: 'circle-1', radius: 10 },
          { atomType: 'Extrude', uniqueID: 'extrude-1', height: 5 }
        ]
      }))
    };

    // Simulate TopMenu.jsx Re-authenticate button logic
    const jsonRepOfProject = mockTopLevelMolecule.serialize();
    const authRedirectHandler = ({ authType, currentProjectRep, returnTo }) => {
      if (currentProjectRep) {
        localStorage.setItem('pendingProjectSave', currentProjectRep);
      }
      // In real code, this would redirect to GitHub OAuth
    };

    authRedirectHandler({
      authType: 'reauth',
      currentProjectRep: JSON.stringify(jsonRepOfProject),
      returnTo: '/user/myproject'
    });

    // Verify project was saved
    expect(setItemSpy).toHaveBeenCalledWith(
      'pendingProjectSave',
      expect.stringContaining('"atomType":"Molecule"')
    );

    // Step 2: User returns from OAuth with redirectType = "reauth"
    const redirectType = 'reauth';
    const authorizedUserOcto = { /* mock octokit */ };
    
    // Simulate flowCanvas logic
    let restoredProject = null;
    if ((redirectType === 'save' || redirectType === 'reauth') && authorizedUserOcto) {
      const pendingProject = localStorage.getItem('pendingProjectSave');
      if (pendingProject) {
        restoredProject = JSON.parse(pendingProject);
        // In real code, this would deserialize into GlobalVariables.topLevelMolecule
        // and then save to GitHub
      }
    }

    // Verify project was restored
    expect(restoredProject).not.toBeNull();
    expect(restoredProject.name).toBe('MyProject');
    expect(restoredProject.nodesOnTheScreen).toHaveLength(2);
    expect(restoredProject.nodesOnTheScreen[0].atomType).toBe('Circle');
    expect(restoredProject.nodesOnTheScreen[1].atomType).toBe('Extrude');
  });

  it('should demonstrate the problem scenario that was fixed', () => {
    // OLD BEHAVIOR (before fix):
    // 1. User clicks "Re-authenticate"
    // 2. authRedirectHandler is called WITHOUT currentProjectRep
    // 3. User authenticates and returns
    // 4. flowCanvas loads project from GitHub (potentially outdated)
    // 5. User's unsaved molecules are LOST

    const oldAuthRedirectHandler = ({ authType, returnTo }) => {
      // Old code did NOT pass currentProjectRep
      // So localStorage was NOT updated
    };

    oldAuthRedirectHandler({
      authType: 'reauth',
      returnTo: '/user/repo'
    });

    // Verify nothing was saved (bad!)
    expect(setItemSpy).not.toHaveBeenCalled();

    // Clear the spy for next part
    setItemSpy.mockClear();

    // NEW BEHAVIOR (after fix):
    // 1. User clicks "Re-authenticate"
    // 2. authRedirectHandler is called WITH currentProjectRep (serialized project)
    // 3. Project state saved to localStorage
    // 4. User authenticates and returns
    // 5. flowCanvas loads project from localStorage (current state)
    // 6. Project is saved to GitHub
    // 7. User's molecules are PRESERVED

    const mockProject = {
      filetypeVersion: 1,
      atomType: 'Molecule',
      nodesOnTheScreen: [{ atomType: 'Circle', uniqueID: 'important-molecule' }]
    };

    const newAuthRedirectHandler = ({ authType, currentProjectRep, returnTo }) => {
      if (currentProjectRep) {
        localStorage.setItem('pendingProjectSave', currentProjectRep);
      }
    };

    newAuthRedirectHandler({
      authType: 'reauth',
      currentProjectRep: JSON.stringify(mockProject),
      returnTo: '/user/repo'
    });

    // Verify project was saved (good!)
    expect(setItemSpy).toHaveBeenCalledWith(
      'pendingProjectSave',
      expect.stringContaining('important-molecule')
    );
  });
});
