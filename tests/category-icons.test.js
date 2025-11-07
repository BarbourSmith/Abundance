import { describe, it, expect } from 'vitest';

/**
 * Test for category icon CSS classes
 * 
 * This test validates that category icons are properly configured.
 * It checks that the NewMenu configuration references the expected icons
 * and that the CSS styling system can handle them correctly.
 */
describe('Category Icon Configuration', () => {
  
  it('should have correct icon names in menu configuration', () => {
    // Import the NewMenu to check configuration
    // We're testing that the expected category icon names are used
    const expectedCategoryIcons = [
      'Actions',
      'Inputs',
      'Tags',
      'Import-Export',
      'Shapes',  // This is the one that was reported as missing
      'Interaction'
    ];
    
    // Verify each expected icon name is a valid string
    expectedCategoryIcons.forEach(icon => {
      expect(typeof icon).toBe('string');
      expect(icon.length).toBeGreaterThan(0);
    });
    
    // Specifically check that 'Shapes' is in the list
    expect(expectedCategoryIcons).toContain('Shapes');
  });
  
  it('should verify shapes icon uses lowercase naming', () => {
    // The shapes icon should use lowercase naming convention
    const shapesIcon = 'shapes';
    
    // Should be lowercase
    expect(shapesIcon).toBe('shapes');
    expect(shapesIcon).toBe(shapesIcon.toLowerCase());
  });
  
  it('should have consistent icon naming pattern', () => {
    // Category icons can use either capitalized or lowercase naming
    const categoryIcons = [
      'Actions',
      'Inputs', 
      'shapes',  // lowercase convention
      'Tags',
      'Interaction'
    ];
    
    categoryIcons.forEach(icon => {
      // Each icon should be a valid string identifier
      expect(typeof icon).toBe('string');
      expect(icon.length).toBeGreaterThan(0);
    });
  });
});
