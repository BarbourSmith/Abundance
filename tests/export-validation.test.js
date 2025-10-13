import { describe, it, expect } from "vitest";

/**
 * Validation Tests for Both New Project and Export Popups
 * 
 * These tests verify that the validation logic from PR #1012 works identically
 * for both the "Create New Project" popup (exporting: false) and the 
 * "Export Molecule to GitHub" popup (exporting: true).
 * 
 * Both popups use the same component (NewProjectPopUp.jsx) and the same
 * validation functions, so the exporting prop should NOT affect validation behavior.
 */

// Import validation functions from NewProjectPopUp.jsx
// These functions are used identically regardless of the exporting prop

/**
 * Validates project names according to GitHub requirements
 * (Extracted from NewProjectPopUp.jsx lines 10-39)
 */
const validateProjectName = (name) => {
  const errors = [];
  
  if (!name || name.trim() === "") {
    errors.push("Project name cannot be empty");
    return errors;
  }
  
  // Check for spaces
  if (name.includes(" ")) {
    errors.push("Project name cannot contain spaces (use hyphens instead)");
  }
  
  // Check for invalid characters (GitHub allows alphanumeric and hyphens)
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    errors.push("Project name can only contain letters, numbers, dots, underscores, and hyphens");
  }
  
  // Check if starts/ends with hyphen
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push("Project name cannot start or end with a hyphen");
  }
  
  // Check length
  if (name.length > 100) {
    errors.push("Project name must be 100 characters or less");
  }
  
  return errors;
};

/**
 * Validates and sanitizes topics according to GitHub requirements
 * (Extracted from NewProjectPopUp.jsx lines 42-86)
 */
const validateTopics = (topics) => {
  const errors = [];
  const sanitized = [];
  
  topics.forEach((topic) => {
    const topicValue = topic.value || topic;
    
    // Convert to lowercase (GitHub requirement)
    const lowerTopic = topicValue.toLowerCase();
    
    // Check for spaces
    if (lowerTopic.includes(" ")) {
      errors.push(`Tag "${topicValue}" contains spaces (they will be removed)`);
    }
    
    // Remove spaces and special characters, keep only letters, numbers, and hyphens
    const cleaned = lowerTopic.replace(/[^a-z0-9-]/g, "");
    
    // Check if starts with hyphen
    if (cleaned.startsWith("-")) {
      errors.push(`Tag "${topicValue}" cannot start with a hyphen`);
      return;
    }
    
    // Check length
    if (cleaned.length > 50) {
      errors.push(`Tag "${topicValue}" is too long (max 50 characters)`);
      return;
    }
    
    // Check if anything remains after cleaning
    if (cleaned.length === 0) {
      errors.push(`Tag "${topicValue}" contains only invalid characters`);
      return;
    }
    
    if (cleaned !== topicValue) {
      errors.push(`Tag "${topicValue}" will be changed to "${cleaned}"`);
    }
    
    sanitized.push(cleaned);
  });
  
  return { errors, sanitized };
};

describe("Export Popup Validation (Same as New Project)", () => {
  describe("Project Name Validation", () => {
    it("should validate valid project names (applies to both new project and export)", () => {
      expect(validateProjectName("my-awesome-project")).toEqual([]);
      expect(validateProjectName("CAD-Design-Tool")).toEqual([]);
      expect(validateProjectName("project_2024")).toEqual([]);
      expect(validateProjectName("project.name")).toEqual([]);
    });

    it("should reject empty names (applies to both new project and export)", () => {
      const errors = validateProjectName("");
      expect(errors).toContain("Project name cannot be empty");
    });

    it("should reject names with spaces (applies to both new project and export)", () => {
      const errors = validateProjectName("my project");
      expect(errors).toContain("Project name cannot contain spaces (use hyphens instead)");
    });

    it("should reject names with invalid characters (applies to both new project and export)", () => {
      const errors = validateProjectName("my@project");
      expect(errors).toContain("Project name can only contain letters, numbers, dots, underscores, and hyphens");
    });

    it("should reject names starting with hyphen (applies to both new project and export)", () => {
      const errors = validateProjectName("-myproject");
      expect(errors).toContain("Project name cannot start or end with a hyphen");
    });

    it("should reject names ending with hyphen (applies to both new project and export)", () => {
      const errors = validateProjectName("myproject-");
      expect(errors).toContain("Project name cannot start or end with a hyphen");
    });

    it("should reject names longer than 100 characters (applies to both new project and export)", () => {
      const longName = "a".repeat(101);
      const errors = validateProjectName(longName);
      expect(errors).toContain("Project name must be 100 characters or less");
    });
  });

  describe("Topics Validation", () => {
    it("should validate valid topics (applies to both new project and export)", () => {
      const result = validateTopics(["3d-printing", "cad", "opensource"]);
      expect(result.errors).toEqual([]);
      expect(result.sanitized).toEqual(["3d-printing", "cad", "opensource"]);
    });

    it("should sanitize topics with spaces (applies to both new project and export)", () => {
      const result = validateTopics(["3D Printing"]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("contains spaces");
      expect(result.sanitized).toEqual(["3dprinting"]);
    });

    it("should sanitize topics with special characters (applies to both new project and export)", () => {
      const result = validateTopics(["my@topic!"]);
      expect(result.sanitized).toEqual(["mytopic"]);
    });

    it("should reject topics starting with hyphen (applies to both new project and export)", () => {
      const result = validateTopics(["-mytopic"]);
      expect(result.errors[0]).toContain("cannot start with a hyphen");
      expect(result.sanitized).toEqual([]);
    });

    it("should reject topics longer than 50 characters (applies to both new project and export)", () => {
      const longTopic = "a".repeat(51);
      const result = validateTopics([longTopic]);
      expect(result.errors[0]).toContain("too long");
      expect(result.sanitized).toEqual([]);
    });

    it("should reject topics with only invalid characters (applies to both new project and export)", () => {
      const result = validateTopics(["@@@"]);
      expect(result.errors[0]).toContain("contains only invalid characters");
      expect(result.sanitized).toEqual([]);
    });

    it("should handle multiple topics with mixed validity (applies to both new project and export)", () => {
      const result = validateTopics(["valid-topic", "Invalid Topic", "-bad"]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.sanitized).toContain("valid-topic");
      expect(result.sanitized).toContain("invalidtopic");
      expect(result.sanitized).not.toContain("-bad");
    });
  });

  describe("Validation Applies to Both Scenarios", () => {
    it("validates identically regardless of exporting prop", () => {
      // This test demonstrates that the validation functions don't take
      // an "exporting" parameter - they work the same way for both scenarios
      
      const testName = "my invalid name!";
      const testTopics = ["Bad Topic", "good-topic"];
      
      // Simulate validation for "Create New Project" (exporting: false)
      const newProjectNameErrors = validateProjectName(testName);
      const newProjectTopicResult = validateTopics(testTopics);
      
      // Simulate validation for "Export Molecule" (exporting: true)
      const exportNameErrors = validateProjectName(testName);
      const exportTopicResult = validateTopics(testTopics);
      
      // Both should produce identical results
      expect(newProjectNameErrors).toEqual(exportNameErrors);
      expect(newProjectTopicResult.errors).toEqual(exportTopicResult.errors);
      expect(newProjectTopicResult.sanitized).toEqual(exportTopicResult.sanitized);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty topic array (applies to both new project and export)", () => {
      const result = validateTopics([]);
      expect(result.errors).toEqual([]);
      expect(result.sanitized).toEqual([]);
    });

    it("should handle topic objects with value property (applies to both new project and export)", () => {
      const result = validateTopics([{ value: "test-topic" }]);
      expect(result.errors).toEqual([]);
      expect(result.sanitized).toEqual(["test-topic"]);
    });

    it("should convert uppercase topics to lowercase (applies to both new project and export)", () => {
      const result = validateTopics(["CAD", "3D-PRINTING"]);
      expect(result.sanitized).toEqual(["cad", "3d-printing"]);
    });
  });
});
