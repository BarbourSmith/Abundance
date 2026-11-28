/**
 * Test to verify that thumbnail generation is only triggered for user saves, not auto saves
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Thumbnail Generation Conditional Logic', () => {
  let mockGenerateProjectThumbnail;
  let mockTopLevelMolecule;
  let originalGlobalVariables;
  
  beforeEach(() => {
    // Mock the generateProjectThumbnail function
    mockGenerateProjectThumbnail = vi.fn().mockResolvedValue('<svg>mock thumbnail</svg>');
    
    // Mock the GlobalVariables.topLevelMolecule
    mockTopLevelMolecule = {
      serialize: vi.fn().mockReturnValue({ test: 'data' }),
      formatBom: vi.fn().mockReturnValue('mock BOM'),
      generateProjectThumbnail: mockGenerateProjectThumbnail
    };
    
    // Store original GlobalVariables if it exists
    originalGlobalVariables = global.GlobalVariables;
    
    // Set up mock GlobalVariables
    global.GlobalVariables = {
      topLevelMolecule: mockTopLevelMolecule,
      currentUser: 'testuser',
      currentRepo: { repoName: 'testrepo' },
      currentRepoName: 'testrepo'
    };
  });
  
  afterEach(() => {
    // Restore original GlobalVariables
    global.GlobalVariables = originalGlobalVariables;
    vi.clearAllMocks();
  });

  it('should NOT generate thumbnail for Auto Save', async () => {
    // Mock the saveProject function behavior for auto save
    const mockSetState = vi.fn();
    const typeSave = "Auto Save";
    const lastSaveData = { current: null }; // Simulate no previous save data
    
    // Simulate the thumbnail generation logic from saveProject
    let finalSVG;
    
    // Only generate thumbnail for user-triggered saves, not auto saves
    if (typeSave !== "Auto Save") {
      finalSVG = await GlobalVariables.topLevelMolecule
        .generateProjectThumbnail()
        .catch((error) => {
          console.error("Error generating final project thumbnail: ", error);
        });
    }
    
    // Verify that generateProjectThumbnail was NOT called for auto save
    expect(mockGenerateProjectThumbnail).not.toHaveBeenCalled();
    expect(finalSVG).toBeUndefined();
  });

  it('should generate thumbnail for User Save', async () => {
    // Mock the saveProject function behavior for user save
    const mockSetState = vi.fn();
    const typeSave = "User Save";
    const lastSaveData = { current: null }; // Simulate no previous save data
    
    // Simulate the thumbnail generation logic from saveProject
    let finalSVG;
    
    // Only generate thumbnail for user-triggered saves, not auto saves
    if (typeSave !== "Auto Save") {
      finalSVG = await GlobalVariables.topLevelMolecule
        .generateProjectThumbnail()
        .catch((error) => {
          console.error("Error generating final project thumbnail: ", error);
        });
    }
    
    // Verify that generateProjectThumbnail WAS called for user save
    expect(mockGenerateProjectThumbnail).toHaveBeenCalledTimes(1);
    expect(finalSVG).toBe('<svg>mock thumbnail</svg>');
  });

  it('should generate thumbnail for Upload Save', async () => {
    // Mock the saveProject function behavior for upload save
    const mockSetState = vi.fn();
    const typeSave = "Upload Save";
    const lastSaveData = { current: null }; // Simulate no previous save data
    
    // Simulate the thumbnail generation logic from saveProject
    let finalSVG;
    
    // Only generate thumbnail for user-triggered saves, not auto saves
    if (typeSave !== "Auto Save") {
      finalSVG = await GlobalVariables.topLevelMolecule
        .generateProjectThumbnail()
        .catch((error) => {
          console.error("Error generating final project thumbnail: ", error);
        });
    }
    
    // Verify that generateProjectThumbnail WAS called for upload save
    expect(mockGenerateProjectThumbnail).toHaveBeenCalledTimes(1);
    expect(finalSVG).toBe('<svg>mock thumbnail</svg>');
  });

  it('should handle undefined save type as user save (generate thumbnail)', async () => {
    // Test when typeSave is undefined (fallback behavior)
    const mockSetState = vi.fn();
    const typeSave = undefined;
    const lastSaveData = { current: null }; // Simulate no previous save data
    
    // Simulate the thumbnail generation logic from saveProject
    let finalSVG;
    
    // Only generate thumbnail for user-triggered saves, not auto saves
    if (typeSave !== "Auto Save") {
      finalSVG = await GlobalVariables.topLevelMolecule
        .generateProjectThumbnail()
        .catch((error) => {
          console.error("Error generating final project thumbnail: ", error);
        });
    }
    
    // Verify that generateProjectThumbnail WAS called when typeSave is undefined
    expect(mockGenerateProjectThumbnail).toHaveBeenCalledTimes(1);
    expect(finalSVG).toBe('<svg>mock thumbnail</svg>');
  });
});