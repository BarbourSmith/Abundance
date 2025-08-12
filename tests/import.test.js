import { describe, it, expect, vi, beforeEach } from 'vitest';
import Import from '../src/molecules/import.js';

// Mock dependencies
vi.mock('../src/prototypes/atom.js', () => {
  return {
    default: class MockAtom {
      constructor(values) {
        this.inputs = [];
        this.output = null;
        this.uniqueID = 'test-id';
        this.x = 0;
        this.y = 0;
        this.processing = false;
        this.setValues = vi.fn();
        this.findIOValue = vi.fn();
        this.addIO = vi.fn();
        this.basicThreadValueProcessing = vi.fn();
        this.sendToRender = vi.fn();
        this.alertingErrorHandler = vi.fn();
      }
      updateValue() {}
      draw() {}
    }
  };
});

vi.mock('../src/js/globalvariables.js', () => ({
  default: {
    generateUniqueID: () => 'test-id',
    c: {
      beginPath: vi.fn(),
      fillStyle: '',
      font: '',
      fillText: vi.fn(),
      fill: vi.fn(),
      closePath: vi.fn()
    },
    widthToPixels: vi.fn(() => 100),
    heightToPixels: vi.fn(() => 100),
    cad: {
      importingSTL: vi.fn().mockResolvedValue({}),
      importingSVG: vi.fn().mockResolvedValue({}),
      importingSTEP: vi.fn().mockResolvedValue({})
    }
  }
}));

// Mock Octokit
const mockOctokit = {
  rest: {
    repos: {
      getContent: vi.fn()
    }
  }
};

vi.mock('https://esm.sh/octokit@2.0.19', () => ({
  Octokit: vi.fn(() => mockOctokit)
}));

describe('Import Atom', () => {
  let importAtom;

  beforeEach(() => {
    vi.clearAllMocks();
    importAtom = new Import({});
    importAtom.repoOwner = 'testOwner';
    importAtom.repoName = 'testRepo';
  });

  describe('updateValue with missing file', () => {
    it('should reset atom state when file is not found in repository', async () => {
      // Setup: atom has a filename but file doesn't exist in repo
      importAtom.fileName = 'test-file.svg';
      importAtom.type = 'SVG';
      importAtom.sha = 'test-sha';

      // Mock GitHub API to return 404 error
      const notFoundError = new Error('Not Found');
      notFoundError.status = 404;
      mockOctokit.rest.repos.getContent.mockRejectedValue(notFoundError);

      // Call updateValue
      importAtom.updateValue();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify that atom state is reset
      expect(importAtom.fileName).toBe(null);
      expect(importAtom.type).toBe(null);
      expect(importAtom.sha).toBe(null);
    });

    it('should not reset atom state for other types of errors', async () => {
      // Setup: atom has a filename
      importAtom.fileName = 'test-file.svg';
      importAtom.type = 'SVG';
      importAtom.sha = 'test-sha';

      // Mock GitHub API to return different error (e.g., network error)
      const networkError = new Error('Network Error');
      networkError.status = 500;
      mockOctokit.rest.repos.getContent.mockRejectedValue(networkError);

      // Call updateValue
      importAtom.updateValue();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify that atom state is NOT reset for non-404 errors
      expect(importAtom.fileName).toBe('test-file.svg');
      expect(importAtom.type).toBe('SVG');
      expect(importAtom.sha).toBe('test-sha');
    });

    it('should work normally when file exists', async () => {
      // Setup: atom has a filename and file exists
      importAtom.fileName = 'test-file.svg';
      importAtom.type = 'SVG';

      // Mock successful file retrieval
      const mockFileContent = {
        data: {
          sha: 'file-sha',
          content: btoa('<svg>test</svg>') // base64 encoded SVG
        }
      };
      mockOctokit.rest.repos.getContent.mockResolvedValue(mockFileContent);

      // Call updateValue
      importAtom.updateValue();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify that atom state is maintained and file is processed
      expect(importAtom.fileName).toBe('test-file.svg');
      expect(importAtom.type).toBe('SVG');
      expect(importAtom.sha).toBe('file-sha');
    });
  });

  describe('beginPropagation', () => {
    it('should not call updateValue when fileName is null', () => {
      importAtom.fileName = null;
      const updateValueSpy = vi.spyOn(importAtom, 'updateValue');
      
      importAtom.beginPropagation();
      
      expect(updateValueSpy).not.toHaveBeenCalled();
    });

    it('should call updateValue when fileName is not null', () => {
      importAtom.fileName = 'test-file.svg';
      const updateValueSpy = vi.spyOn(importAtom, 'updateValue');
      
      importAtom.beginPropagation();
      
      expect(updateValueSpy).toHaveBeenCalled();
    });
  });
});