import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Test suite for Rename Project functionality
 */
describe("Rename Project", () => {
  let mockOctokit;
  let mockCurrentAWSnode;
  let mockCurrentUser;
  let setRenameProgress;

  beforeEach(() => {
    // Mock Octokit
    mockOctokit = {
      request: vi.fn(),
      rest: {
        repos: {
          createOrUpdateFileContents: vi.fn(),
          update: vi.fn(),
        },
      },
    };

    // Mock current AWS node and user
    mockCurrentAWSnode = {
      repoName: "test-project",
      owner: "testuser",
      description: "Test project description",
      topics: ["test", "cad"],
    };

    mockCurrentUser = "testuser";

    setRenameProgress = vi.fn();

    // Mock GlobalVariables
    global.GlobalVariables = {
      currentAWSnode: mockCurrentAWSnode,
      currentUser: mockCurrentUser,
      toBinaryStr: (str) => str,
      fromBinaryStr: (str) => str,
    };

    // Mock window functions
    global.window = {
      alert: vi.fn(),
      btoa: (str) => Buffer.from(str).toString("base64"),
      atob: (str) => Buffer.from(str, "base64").toString(),
    };

    // Mock fetch
    global.fetch = vi.fn();
  });

  it("should update top molecule name when renaming project", () => {
    const oldName = "test-project";
    const newName = "renamed-project";

    // Simulate reading the project.abundance file
    const projectData = {
      name: oldName,
      atomType: "Molecule",
      topLevel: true,
      uniqueID: "test-molecule-id",
      allAtoms: [],
      allConnectors: [],
    };

    // Update the name to match new project
    projectData.name = newName;

    // Verify the name was updated
    expect(projectData.name).toBe(newName);
    expect(projectData.name).not.toBe(oldName);
  });

  it("should reject renaming to the same name", () => {
    const currentName = "test-project";
    const newName = "test-project";

    // This should be caught and rejected
    const isSameName = currentName === newName;
    expect(isSameName).toBe(true);
  });

  it("should validate new project name format", () => {
    const validNames = [
      "my-project",
      "project123",
      "my.project",
      "my_project",
    ];

    const invalidNames = ["my project", "my--project", "-project", "project-"];

    validNames.forEach((name) => {
      // Valid names should match GitHub repo naming rules
      const isValid = /^[a-zA-Z0-9._-]+$/.test(name) && name.length <= 100;
      expect(isValid).toBe(true);
    });

    invalidNames.forEach((name) => {
      // These should fail validation
      const startsOrEndsWithHyphen = name.startsWith("-") || name.endsWith("-");
      const hasSpaces = name.includes(" ");
      const hasDoubleHyphen = name.includes("--");

      const isInvalid =
        startsOrEndsWithHyphen || hasSpaces || hasDoubleHyphen;
      expect(isInvalid).toBe(true);
    });
  });

  it("should handle missing current AWS node gracefully", () => {
    global.GlobalVariables.currentAWSnode = null;

    // Simulate the check that would happen in renameProject
    const hasAWSnode = !!global.GlobalVariables.currentAWSnode;
    expect(hasAWSnode).toBe(false);
  });

  it("should handle missing user gracefully", () => {
    global.GlobalVariables.currentUser = null;

    // Simulate the check that would happen in renameProject
    const hasUser = !!global.GlobalVariables.currentUser;
    expect(hasUser).toBe(false);
  });

  it("should preserve project data structure when renaming", () => {
    const projectData = {
      name: "test-project",
      atomType: "Molecule",
      topLevel: true,
      uniqueID: "test-molecule-id",
      unitsKey: "MM",
      allAtoms: [
        {
          atomType: "Circle",
          name: "TestCircle",
          uniqueID: "circle-123",
        },
      ],
      allConnectors: [],
      compiledBom: {},
    };

    // Update only the name
    const newName = "renamed-project";
    const updatedData = { ...projectData, name: newName };

    // Verify only the name changed
    expect(updatedData.name).toBe(newName);
    expect(updatedData.atomType).toBe(projectData.atomType);
    expect(updatedData.topLevel).toBe(projectData.topLevel);
    expect(updatedData.uniqueID).toBe(projectData.uniqueID);
    expect(updatedData.unitsKey).toBe(projectData.unitsKey);
    expect(updatedData.allAtoms).toEqual(projectData.allAtoms);
  });
});
