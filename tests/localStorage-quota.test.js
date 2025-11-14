/**
 * Tests for localStorage Quota Management
 * 
 * Validates that the application properly handles localStorage quota exceeded errors
 * when saving project states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeSaveToLocalStorage, getLocalStorageStats, cleanupOldProjects } from '../src/js/localStorageManager.js';

describe('localStorage Quota Management', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should successfully save to localStorage when there is space', () => {
    const key = 'unsavedProject_user_test-project';
    const data = JSON.stringify({ test: 'data', filetypeVersion: 1 });
    
    const result = safeSaveToLocalStorage(key, data);
    
    expect(result).toBe(true);
    const saved = localStorage.getItem(key);
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved);
    expect(parsed.test).toBe('data');
    expect(parsed.timestamp).toBeGreaterThan(0);
  });

  it('should add timestamp to saved data', () => {
    const key = 'unsavedProject_user_test-project';
    const data = JSON.stringify({ test: 'data', filetypeVersion: 1 });
    
    const beforeTime = Date.now();
    safeSaveToLocalStorage(key, data);
    const afterTime = Date.now();
    
    const saved = JSON.parse(localStorage.getItem(key));
    expect(saved.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(saved.timestamp).toBeLessThanOrEqual(afterTime);
  });

  it('should clean up old projects when requested', () => {
    // Save multiple old projects
    const projects = [
      { key: 'unsavedProject_user_project1', data: { test: 1, timestamp: 1000 } },
      { key: 'unsavedProject_user_project2', data: { test: 2, timestamp: 2000 } },
      { key: 'unsavedProject_user_project3', data: { test: 3, timestamp: 3000 } },
    ];
    
    projects.forEach(p => {
      localStorage.setItem(p.key, JSON.stringify(p.data));
    });
    
    // Clean up 2 old projects
    const removedCount = cleanupOldProjects('currentProject', 2);
    
    expect(removedCount).toBe(2);
    // The oldest two should be removed
    expect(localStorage.getItem('unsavedProject_user_project1')).toBeNull();
    expect(localStorage.getItem('unsavedProject_user_project2')).toBeNull();
    // The newest should remain
    expect(localStorage.getItem('unsavedProject_user_project3')).toBeTruthy();
  });

  it('should not clean up the current project', () => {
    const currentKey = 'unsavedProject_user_current';
    const oldKey = 'unsavedProject_user_old';
    
    localStorage.setItem(currentKey, JSON.stringify({ test: 'current', timestamp: 2000 }));
    localStorage.setItem(oldKey, JSON.stringify({ test: 'old', timestamp: 1000 }));
    
    // Try to clean up, passing current project key
    const removedCount = cleanupOldProjects(currentKey, 1);
    
    expect(removedCount).toBe(1);
    expect(localStorage.getItem(currentKey)).toBeTruthy();
    expect(localStorage.getItem(oldKey)).toBeNull();
  });

  it('should handle corrupted localStorage data gracefully', () => {
    const key = 'unsavedProject_user_corrupted';
    localStorage.setItem(key, 'not valid JSON');
    
    // This should not throw
    const result = cleanupOldProjects('other', 1);
    
    // Should clean up the corrupted entry
    expect(result).toBe(1);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('should provide localStorage statistics', () => {
    localStorage.setItem('unsavedProject_user_project1', JSON.stringify({ test: 1 }));
    localStorage.setItem('unsavedProject_user_project2', JSON.stringify({ test: 2 }));
    localStorage.setItem('other_key', 'value');
    
    const stats = getLocalStorageStats();
    
    expect(stats.projectCount).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.projects).toHaveLength(2);
    expect(stats.projects[0]).toHaveProperty('key');
    expect(stats.projects[0]).toHaveProperty('sizeMB');
  });

  it('should handle quota exceeded by cleaning up old projects', () => {
    // Setup: Add some old projects
    localStorage.setItem('unsavedProject_user_old1', JSON.stringify({ test: 1, timestamp: 1000 }));
    localStorage.setItem('unsavedProject_user_old2', JSON.stringify({ test: 2, timestamp: 2000 }));
    
    // Mock quota exceeded error on first attempt
    const originalSetItem = Storage.prototype.setItem;
    let attemptCount = 0;
    Storage.prototype.setItem = function(key, value) {
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt fails with quota exceeded
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        error.code = 22;
        throw error;
      } else {
        // Second attempt succeeds (after cleanup)
        originalSetItem.call(this, key, value);
      }
    };
    
    try {
      const key = 'unsavedProject_user_new';
      const data = JSON.stringify({ test: 'new', filetypeVersion: 1 });
      
      const result = safeSaveToLocalStorage(key, data);
      
      expect(result).toBe(true);
      expect(attemptCount).toBe(2); // Should have retried
      // Old projects should be cleaned up
      expect(localStorage.getItem('unsavedProject_user_old1')).toBeNull();
    } finally {
      // Restore original setItem
      Storage.prototype.setItem = originalSetItem;
    }
  });

  it('should return false when quota cannot be freed', () => {
    // Mock quota exceeded error that persists
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      error.code = 22;
      throw error;
    };
    
    try {
      const key = 'unsavedProject_user_test';
      const data = JSON.stringify({ test: 'data' });
      
      const result = safeSaveToLocalStorage(key, data);
      
      expect(result).toBe(false);
    } finally {
      // Restore original setItem
      Storage.prototype.setItem = originalSetItem;
    }
  });

  it('should preserve data structure without timestamp if parsing fails', () => {
    const key = 'test_key';
    const data = 'not JSON'; // Invalid JSON that can't be parsed
    
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.fn(originalSetItem);
    Storage.prototype.setItem = setItemSpy;
    
    try {
      safeSaveToLocalStorage(key, data);
      
      // Should have attempted to save the original data when parsing failed
      expect(setItemSpy).toHaveBeenCalled();
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
