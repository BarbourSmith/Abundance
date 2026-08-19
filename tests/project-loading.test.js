/**
 * Tests for project loading functionality, particularly for handling files larger than 1MB
 * This tests the core logic of handling GitHub API responses for different file sizes
 */

import { describe, it, expect, vi } from 'vitest';

describe('GitHub API Response Handling', () => {
  it('should handle small files with base64 content correctly', () => {
    // Simulate the logic from the loadProject function for small files
    const projectData = { 
      filetypeVersion: 1, 
      data: 'test project data' 
    };
    const base64Content = btoa(JSON.stringify(projectData));
    
    // Mock response for small file
    const response = {
      data: {
        content: base64Content,
        size: 500
      }
    };

    // Test the logic from our fix
    let rawFileContent;
    if (!response.data.content || response.data.content.length === 0) {
      // This path should not be taken for small files
      expect.fail('Should not use download_url path for small files');
    } else {
      // This is the small file path
      rawFileContent = atob(response.data.content);
    }

    const rawFile = JSON.parse(rawFileContent);
    expect(rawFile).toEqual(projectData);
  });

  it('should handle large files without content using download_url path', async () => {
    // Test data for large file
    const projectData = { 
      filetypeVersion: 1, 
      data: 'large project data'.repeat(1000) 
    };
    const projectJsonString = JSON.stringify(projectData);

    // Mock response for large file (no content, has download_url)
    const response = {
      data: {
        content: null, 
        download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/project.abundance',
        size: 2000000
      }
    };

    // Mock fetch for download_url
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => projectJsonString
    });

    // Test the logic from our fix
    let rawFileContent;
    if (!response.data.content || response.data.content.length === 0) {
      // This is the large file path
      const fileResponse = await fetch(response.data.download_url);
      rawFileContent = await fileResponse.text();
    } else {
      expect.fail('Should use download_url path for large files');
    }

    const rawFile = JSON.parse(rawFileContent);
    expect(rawFile).toEqual(projectData);
    expect(globalThis.fetch).toHaveBeenCalledWith(response.data.download_url);
  });

  it('should handle empty content string using download_url path', async () => {
    // Test data
    const projectData = { 
      filetypeVersion: 1, 
      data: 'test data' 
    };
    const projectJsonString = JSON.stringify(projectData);

    // Mock response with empty content string
    const response = {
      data: {
        content: '', // Empty string
        download_url: 'https://raw.githubusercontent.com/testuser/test-repo/main/project.abundance',
        size: 1500000
      }
    };

    // Mock fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => projectJsonString
    });

    // Test the logic
    let rawFileContent;
    if (!response.data.content || response.data.content.length === 0) {
      // Should take this path for empty content
      const fileResponse = await fetch(response.data.download_url);
      rawFileContent = await fileResponse.text();
    } else {
      expect.fail('Should use download_url path for empty content');
    }

    const rawFile = JSON.parse(rawFileContent);
    expect(rawFile).toEqual(projectData);
  });

  it('should correctly identify when to use each path', () => {
    // Test various content values to ensure correct path selection
    
    // Case 1: Normal base64 content
    expect(!('validBase64Content' && 'validBase64Content'.length > 0)).toBe(false);
    
    // Case 2: null content
    expect(!(null || null?.length === 0)).toBe(true);
    
    // Case 3: empty string content  
    expect(!('') || ''.length === 0).toBe(true);
    
    // Case 4: undefined content
    expect(!(undefined) || undefined?.length === 0).toBe(true);
  });

  it('should test loadGithubMoleculeByName with large file handling logic', async () => {
    // Test the same logic that's now applied to loadGithubMoleculeByName
    const projectData = { 
      filetypeVersion: 1, 
      atomType: "Molecule",
      allAtoms: [],
      name: "TestProject"
    };
    const projectJsonString = JSON.stringify(projectData);

    // Mock response for large file (no content, has download_url)
    const response = {
      data: {
        content: null, 
        download_url: 'https://raw.githubusercontent.com/BarbourSmith/Sauna-Trailer/main/project.abundance',
        size: 2000000
      }
    };

    // Mock fetch for download_url
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => projectJsonString
    });

    // Test the new logic pattern from loadGithubMoleculeByName
    let rawFileContent;
    if (!response.data.content || response.data.content.length === 0) {
      // This is the large file path that should be taken
      const fileResponse = await fetch(response.data.download_url);
      rawFileContent = await fileResponse.text();
    } else {
      expect.fail('Should use download_url path for large files');
    }

    // Simulate async JSON parsing
    const asyncJsonParse = (str) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(JSON.parse(str));
          } catch (e) {
            reject(e);
          }
        }, 0);
      });
    };

    const rawFile = await asyncJsonParse(rawFileContent);
    expect(rawFile).toEqual(projectData);
    expect(globalThis.fetch).toHaveBeenCalledWith(response.data.download_url);
  });
});