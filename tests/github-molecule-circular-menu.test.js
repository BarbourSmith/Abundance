import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('GitHub Molecule Circular Menu Fix', () => {
  let mockSetExpandedMenu;
  let mockCmenu;
  let NewMenuModule;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock the global variables
    global.GlobalVariables = {
      availableTypes: {
        GitHubMolecule: {
          atomType: 'GitHubMolecule',
          atomCategory: 'ImportExport'
        },
        Circle: {
          atomType: 'Circle', 
          atomCategory: 'Shapes'
        }
      },
      lastClick: null,
      pixelsToWidth: vi.fn(() => 0.5),
      pixelsToHeight: vi.fn(() => 0.5),
      generateUniqueID: vi.fn(() => 'test-id'),
      currentMolecule: {
        placeAtom: vi.fn()
      }
    };

    // Mock circular menu
    mockCmenu = {
      _container: {
        style: {
          left: '100px',
          top: '200px'
        }
      },
      hide: vi.fn()
    };

    // Mock DOM elements
    global.document = {
      getElementById: vi.fn(() => ({
        addEventListener: vi.fn(),
        focus: vi.fn()
      }))
    };

    // Mock the circular menu constructor
    global.CMenu = vi.fn(() => ({
      config: vi.fn(() => mockCmenu)
    }));

    // Create mock callback
    mockSetExpandedMenu = vi.fn();
  });

  it('should call the GitHub search callback when GitHubMolecule is clicked from circular menu', async () => {
    // Import the module after mocks are set up
    const { createCMenu } = await import('../src/js/NewMenu.js');

    // Create a mock target element
    const mockTargetElement = { current: { addEventListener: vi.fn() } };

    // Create the menu with callback
    createCMenu(mockTargetElement, mockSetExpandedMenu);

    // Verify CMenu was called with proper config
    expect(global.CMenu).toHaveBeenCalled();
    const configCall = global.CMenu.mock.calls[0][0];
    expect(configCall).toBe(mockTargetElement.current);
    
    const menuConfig = global.CMenu().config.mock.calls[0][0];
    expect(menuConfig.menus).toBeDefined();

    // Find the ImportExport menu which should contain GitHubMolecule
    const importExportMenu = menuConfig.menus.find(menu => menu.title === 'Import/Export');
    expect(importExportMenu).toBeDefined();
    expect(importExportMenu.menus).toBeDefined();

    // Find the GitHubMolecule submenu
    const gitHubMoleculeItem = importExportMenu.menus.find(item => item.name === 'GitHubMolecule');
    expect(gitHubMoleculeItem).toBeDefined();

    // Simulate clicking on GitHubMolecule
    const mockEvent = {
      type: 'click',
      target: { id: 'GitHubMolecule' }
    };
    const mockTitle = { icon: 'GitHubMolecule', name: 'GitHubMolecule' };

    // Call the click handler
    gitHubMoleculeItem.click(mockEvent, mockTitle);

    // Verify the callback was called
    expect(mockSetExpandedMenu).toHaveBeenCalledWith();

    // Verify lastClick was set
    expect(global.GlobalVariables.lastClick).toEqual([100, 200]);
  });

  it('should not call the callback for non-GitHubMolecule items', async () => {
    const { createCMenu } = await import('../src/js/NewMenu.js');

    const mockTargetElement = { current: { addEventListener: vi.fn() } };
    createCMenu(mockTargetElement, mockSetExpandedMenu);

    const menuConfig = global.CMenu().config.mock.calls[0][0];
    const shapesMenu = menuConfig.menus.find(menu => menu.title === 'Shapes');
    expect(shapesMenu).toBeDefined();

    // Find a non-GitHubMolecule item (Circle)
    const circleItem = shapesMenu.menus.find(item => item.name === 'Circle');
    expect(circleItem).toBeDefined();

    // Simulate clicking on Circle
    const mockEvent = {
      type: 'click',
      target: { id: 'Circle' }
    };
    const mockTitle = { icon: 'Circle', name: 'Circle' };

    // Call the click handler
    circleItem.click(mockEvent, mockTitle);

    // Verify the callback was NOT called
    expect(mockSetExpandedMenu).not.toHaveBeenCalled();

    // Verify placeAtom was called for regular atoms
    expect(global.GlobalVariables.currentMolecule.placeAtom).toHaveBeenCalled();
  });

  it('should handle touch events for GitHubMolecule correctly', async () => {
    const { createCMenu } = await import('../src/js/NewMenu.js');

    const mockTargetElement = { current: { addEventListener: vi.fn() } };
    createCMenu(mockTargetElement, mockSetExpandedMenu);

    const menuConfig = global.CMenu().config.mock.calls[0][0];
    const importExportMenu = menuConfig.menus.find(menu => menu.title === 'Import/Export');
    const gitHubMoleculeItem = importExportMenu.menus.find(item => item.name === 'GitHubMolecule');

    // Simulate touch event
    const mockTouchEvent = {
      type: 'touchend',
      target: { id: 'GitHubMolecule' },
      preventDefault: vi.fn()
    };
    const mockTitle = { icon: 'GitHubMolecule', name: 'GitHubMolecule' };

    // Call the click handler
    gitHubMoleculeItem.click(mockTouchEvent, mockTitle);

    // Verify the callback was still called
    expect(mockSetExpandedMenu).toHaveBeenCalled();

    // Verify touch-specific behavior
    expect(mockCmenu.hide).toHaveBeenCalled();
    expect(mockTouchEvent.preventDefault).toHaveBeenCalled();
  });
});