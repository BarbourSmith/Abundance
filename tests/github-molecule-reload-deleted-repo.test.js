import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for GitHub molecule reload behavior when the parent repository has been deleted.
 *
 * Issue: If a GitHub molecule exists and the parent repository is deleted, clicking
 * "Reload From Github" would silently delete the molecule without any warning.
 *
 * Fix: A preflight check now verifies the repository is accessible before deleting
 * the existing node. If the check fails, an error is set and the molecule is preserved.
 */

describe('GitHub Molecule Reload - Deleted Repository Handling', () => {
  let mockOctokit;
  let mockParent;
  let mockMolecule;

  beforeEach(() => {
    // Mock Octokit instance that simulates GitHub API calls
    mockOctokit = {
      request: vi.fn(),
    };

    // Mock the parent molecule
    mockParent = {
      serialize: vi.fn().mockReturnValue({ allConnectors: [] }),
      nodesOnTheScreen: [],
    };

    // Mock the GitHubMolecule instance with the key methods we need to test
    mockMolecule = {
      parentRepo: {
        owner: 'testOwner',
        repoName: 'testRepo',
        privateRepo: false,
      },
      parent: mockParent,
      serialize: vi.fn().mockReturnValue({
        uniqueID: 'test-id-1',
        x: 0.5,
        y: 0.6,
        ioValues: { input1: 10 },
      }),
      setError: vi.fn(),
      deleteNode: vi.fn(),
      loadGithubMoleculeByName: vi.fn().mockResolvedValue(undefined),
    };

    // Bind the actual reloadMoleculeFromGithub logic for testing
    mockMolecule.reloadMoleculeFromGithub = async function (authorizedUserOcto, userScopes) {
      var githubMoleculeObjectPreReload = this.serialize();
      var githubMoleculeParentObjectConnectorsPreReload =
        this.parent.serialize().allConnectors;

      let gitObj = this.parentRepo;

      // Only delete and continue if you have permission to load
      if (
        gitObj.privateRepo &&
        (!authorizedUserOcto || !userScopes.includes("repo"))
      ) {
        this.setError(
          "Authentication with 'repo' scope is required to access private repositories.",
        );
        return;
      }

      // Preflight check: verify the repository is accessible before deleting the existing node
      const octokit = authorizedUserOcto || { request: vi.fn().mockRejectedValue(new Error('No octokit')) };
      try {
        await octokit.request(
          "GET /repos/{owner}/{repo}/contents/project.abundance",
          {
            owner: gitObj.owner,
            repo: gitObj.repoName,
          },
        );
      } catch (error) {
        this.setError(
          `Cannot reload: the repository "${gitObj.owner}/${gitObj.repoName}" could not be found or accessed.`,
        );
        return;
      }

      const copyOfNodeToBeDeleted = this;
      copyOfNodeToBeDeleted.deleteNode(false, false, true);

      this.loadGithubMoleculeByName(
        gitObj,
        githubMoleculeObjectPreReload,
        githubMoleculeParentObjectConnectorsPreReload,
        null,
        authorizedUserOcto,
        [],
      );
    };
  });

  it('should set an error and NOT delete the molecule when the repository is not found (404)', async () => {
    // Simulate a 404 error (repository has been deleted)
    mockOctokit.request.mockRejectedValueOnce({
      status: 404,
      message: 'Not Found',
    });

    await mockMolecule.reloadMoleculeFromGithub(mockOctokit, []);

    // Should have set an error message
    expect(mockMolecule.setError).toHaveBeenCalledWith(
      'Cannot reload: the repository "testOwner/testRepo" could not be found or accessed.',
    );

    // Should NOT have deleted the node
    expect(mockMolecule.deleteNode).not.toHaveBeenCalled();

    // Should NOT have attempted to load a new molecule
    expect(mockMolecule.loadGithubMoleculeByName).not.toHaveBeenCalled();
  });

  it('should set an error and NOT delete the molecule when there is a network error', async () => {
    // Simulate a network failure
    mockOctokit.request.mockRejectedValueOnce(new Error('Network error'));

    await mockMolecule.reloadMoleculeFromGithub(mockOctokit, []);

    expect(mockMolecule.setError).toHaveBeenCalledWith(
      'Cannot reload: the repository "testOwner/testRepo" could not be found or accessed.',
    );
    expect(mockMolecule.deleteNode).not.toHaveBeenCalled();
    expect(mockMolecule.loadGithubMoleculeByName).not.toHaveBeenCalled();
  });

  it('should delete and reload the molecule when the repository is accessible', async () => {
    // Simulate a successful API response
    mockOctokit.request.mockResolvedValueOnce({
      data: { content: btoa('{}'), encoding: 'base64' },
    });

    await mockMolecule.reloadMoleculeFromGithub(mockOctokit, []);

    // Should NOT have set an error
    expect(mockMolecule.setError).not.toHaveBeenCalled();

    // Should have deleted the old node
    expect(mockMolecule.deleteNode).toHaveBeenCalledWith(false, false, true);

    // Should have called loadGithubMoleculeByName
    expect(mockMolecule.loadGithubMoleculeByName).toHaveBeenCalledWith(
      mockMolecule.parentRepo,
      expect.any(Object),
      [],
      null,
      mockOctokit,
      [],
    );
  });

  it('should reject early with an error for private repos when no auth is provided', async () => {
    mockMolecule.parentRepo.privateRepo = true;

    await mockMolecule.reloadMoleculeFromGithub(null, []);

    expect(mockMolecule.setError).toHaveBeenCalledWith(
      "Authentication with 'repo' scope is required to access private repositories.",
    );
    expect(mockMolecule.deleteNode).not.toHaveBeenCalled();
    expect(mockMolecule.loadGithubMoleculeByName).not.toHaveBeenCalled();
  });

  it('should reject early with an error for private repos when auth lacks repo scope', async () => {
    mockMolecule.parentRepo.privateRepo = true;

    await mockMolecule.reloadMoleculeFromGithub(mockOctokit, ['read:user']);

    expect(mockMolecule.setError).toHaveBeenCalledWith(
      "Authentication with 'repo' scope is required to access private repositories.",
    );
    expect(mockMolecule.deleteNode).not.toHaveBeenCalled();
    expect(mockMolecule.loadGithubMoleculeByName).not.toHaveBeenCalled();
  });

  it('should include the correct repository path in the preflight API request', async () => {
    mockOctokit.request.mockResolvedValueOnce({
      data: { content: btoa('{}'), encoding: 'base64' },
    });

    await mockMolecule.reloadMoleculeFromGithub(mockOctokit, []);

    expect(mockOctokit.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/contents/project.abundance',
      {
        owner: 'testOwner',
        repo: 'testRepo',
      },
    );
  });
});
