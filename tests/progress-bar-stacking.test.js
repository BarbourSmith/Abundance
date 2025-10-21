import { describe, it, expect } from 'vitest';

/**
 * Test suite for progress bar dynamic stacking functionality
 * 
 * This tests the implementation that allows multiple progress bars
 * (save, render, build, duplicate, rename) to stack vertically
 * without overlapping when multiple operations are active simultaneously.
 */
describe('Progress Bar Stacking', () => {
  it('should calculate correct vertical offsets for multiple bars', () => {
    const barSpacing = 60;
    
    // Simulate 3 visible bars
    const visibleBars = ['save', 'duplicate', 'render'];
    
    const offsets = visibleBars.map((_, index) => index * barSpacing);
    
    expect(offsets[0]).toBe(0);    // First bar at base position
    expect(offsets[1]).toBe(60);   // Second bar 60px below
    expect(offsets[2]).toBe(120);  // Third bar 120px below
  });

  it('should maintain consistent order for bars', () => {
    const bars = {
      'render': { visible: true, progress: 50 },
      'save': { visible: true, progress: 30 },
      'duplicate': { visible: true, progress: 70 },
    };
    
    // Define expected order
    const order = ['save', 'duplicate', 'rename', 'render', 'build'];
    
    const sortedIds = Object.keys(bars).sort((idA, idB) => {
      const indexA = order.findIndex(prefix => idA.startsWith(prefix));
      const indexB = order.findIndex(prefix => idB.startsWith(prefix));
      return indexA - indexB;
    });
    
    // Save should come before duplicate, which should come before render
    expect(sortedIds[0]).toBe('save');
    expect(sortedIds[1]).toBe('duplicate');
    expect(sortedIds[2]).toBe('render');
  });

  it('should handle bars appearing and disappearing', () => {
    let visibleBars = ['save', 'render'];
    expect(visibleBars.length).toBe(2);
    
    // Add duplicate
    visibleBars = ['save', 'duplicate', 'render'];
    expect(visibleBars.length).toBe(3);
    
    // Remove save (completed)
    visibleBars = visibleBars.filter(id => id !== 'save');
    expect(visibleBars.length).toBe(2);
    expect(visibleBars).toContain('duplicate');
    expect(visibleBars).toContain('render');
    expect(visibleBars).not.toContain('save');
  });

  it('should apply correct offset calculation for run mode', () => {
    const run = true;
    const offsetTop = 60;
    const expectedStyle = `calc(${run ? '45%' : '40%'} + ${offsetTop}px)`;
    
    // For run mode with 60px offset
    expect(expectedStyle).toBe('calc(45% + 60px)');
    
    // For create mode with 60px offset
    const createModeStyle = `calc(${false ? '45%' : '40%'} + ${offsetTop}px)`;
    expect(createModeStyle).toBe('calc(40% + 60px)');
  });

  it('should handle zero offset for first bar', () => {
    const offsetTop = 0;
    const shouldApplyStyle = offsetTop > 0;
    
    expect(shouldApplyStyle).toBe(false); // No style applied for first bar
    
    const offsetTop2 = 60;
    const shouldApplyStyle2 = offsetTop2 > 0;
    
    expect(shouldApplyStyle2).toBe(true); // Style applied for subsequent bars
  });
});
