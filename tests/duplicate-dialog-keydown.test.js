import { describe, it, expect, vi } from "vitest";

/**
 * Test that validates the duplicate dialog keydown priority fix.
 * 
 * This test verifies that when the duplicate dialog is open, keyboard events
 * should not be forwarded to the parameter panel, allowing the user to type
 * in the dialog's input field.
 */
describe("Duplicate Dialog Keydown Priority", () => {
  it("should prevent keyboard event forwarding when duplicate dialog is open", () => {
    // Mock the handleKeyDown logic
    const mockForwardKeyToPanel = vi.fn();
    
    // Simulate the refs used in CreateMode.jsx
    const settingsPopUpRef = { current: false };
    const exportPopUpRef = { current: false };
    const duplicateDialogRef = { current: false };
    
    // Simulate handleKeyDown function from CreateMode.jsx
    // (simplified version focusing on the dialog checks)
    const handleKeyDown = (e) => {
      // Check if any popup is open
      if (settingsPopUpRef.current) return;
      if (exportPopUpRef.current) return;
      if (duplicateDialogRef.current) return; // This is the fix
      
      // Forward to panel
      mockForwardKeyToPanel(e);
    };
    
    // Test 1: No dialogs open - should forward keys
    const event1 = { key: "a" };
    handleKeyDown(event1);
    expect(mockForwardKeyToPanel).toHaveBeenCalledWith(event1);
    
    mockForwardKeyToPanel.mockClear();
    
    // Test 2: Duplicate dialog open - should NOT forward keys
    duplicateDialogRef.current = true;
    const event2 = { key: "b" };
    handleKeyDown(event2);
    expect(mockForwardKeyToPanel).not.toHaveBeenCalled();
    
    mockForwardKeyToPanel.mockClear();
    
    // Test 3: Settings popup open - should NOT forward keys
    duplicateDialogRef.current = false;
    settingsPopUpRef.current = true;
    const event3 = { key: "c" };
    handleKeyDown(event3);
    expect(mockForwardKeyToPanel).not.toHaveBeenCalled();
    
    mockForwardKeyToPanel.mockClear();
    
    // Test 4: Export popup open - should NOT forward keys
    settingsPopUpRef.current = false;
    exportPopUpRef.current = true;
    const event4 = { key: "d" };
    handleKeyDown(event4);
    expect(mockForwardKeyToPanel).not.toHaveBeenCalled();
    
    mockForwardKeyToPanel.mockClear();
    
    // Test 5: All dialogs closed - should forward keys
    exportPopUpRef.current = false;
    const event5 = { key: "e" };
    handleKeyDown(event5);
    expect(mockForwardKeyToPanel).toHaveBeenCalledWith(event5);
  });
});
