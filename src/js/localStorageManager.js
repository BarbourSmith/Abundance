/**
 * LocalStorage Manager
 * 
 * Provides utilities for managing localStorage with automatic quota management.
 * When localStorage quota is exceeded, it automatically cleans up old project states
 * to make room for new saves.
 */

/**
 * Get all unsaved project keys from localStorage
 * @returns {Array<{key: string, timestamp: number}>} Array of project keys with their timestamps
 */
export function getUnsavedProjectKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('unsavedProject_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        // Try to extract timestamp if available, otherwise use 0
        const timestamp = data.timestamp || 0;
        keys.push({ key, timestamp });
      } catch (e) {
        // If we can't parse the data, include it with timestamp 0 for cleanup
        keys.push({ key, timestamp: 0 });
      }
    }
  }
  // Sort by timestamp (oldest first)
  keys.sort((a, b) => a.timestamp - b.timestamp);
  return keys;
}

/**
 * Clean up old unsaved project states from localStorage
 * Removes the oldest saved projects first, keeping at least the most recent one if possible
 * @param {string} currentProjectKey - The key of the current project to avoid cleaning up
 * @param {number} countToRemove - Number of entries to remove (default: 1)
 * @returns {number} Number of keys actually removed
 */
export function cleanupOldProjects(currentProjectKey, countToRemove = 1) {
  const projectKeys = getUnsavedProjectKeys();
  
  if (projectKeys.length === 0) {
    console.log('No unsaved projects to clean up');
    return 0;
  }
  
  let removedCount = 0;
  
  // Remove oldest projects first, but skip the current project
  for (let i = 0; i < projectKeys.length && removedCount < countToRemove; i++) {
    const { key } = projectKeys[i];
    if (key !== currentProjectKey) {
      try {
        localStorage.removeItem(key);
        console.log(`Cleaned up old project state: ${key}`);
        removedCount++;
      } catch (e) {
        console.error(`Failed to remove ${key}:`, e);
      }
    }
  }
  
  return removedCount;
}

/**
 * Safely save data to localStorage with automatic quota management
 * If quota is exceeded, automatically cleans up old project states and retries
 * 
 * @param {string} key - The localStorage key
 * @param {string} value - The value to store (should be JSON stringified)
 * @param {Object} options - Optional configuration
 * @param {number} options.maxRetries - Maximum number of cleanup retries (default: 3)
 * @returns {boolean} True if save was successful, false otherwise
 */
export function safeSaveToLocalStorage(key, value, options = {}) {
  const { maxRetries = 3 } = options;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add timestamp to the data for cleanup purposes
      let dataToSave = value;
      try {
        const parsed = JSON.parse(value);
        parsed.timestamp = Date.now();
        dataToSave = JSON.stringify(parsed);
      } catch (e) {
        // If we can't parse it, just save as-is
        console.warn('Could not add timestamp to localStorage data:', e);
      }
      
      localStorage.setItem(key, dataToSave);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
        console.warn(`localStorage quota exceeded (attempt ${attempt + 1}/${maxRetries})`);
        
        // Try to clean up old projects
        const cleanedCount = cleanupOldProjects(key, 2); // Remove 2 old projects per attempt
        
        if (cleanedCount === 0) {
          // No more projects to clean up
          console.error('Cannot free up localStorage space - no old projects to remove');
          
          // As a last resort, try to save without timestamp
          try {
            localStorage.setItem(key, value);
            console.log('Saved to localStorage without timestamp (last resort)');
            return true;
          } catch (e2) {
            console.error('Failed to save even without timestamp:', e2);
            return false;
          }
        }
        
        // Continue to next retry after cleanup
      } else {
        // Some other error
        console.error('Failed to save to localStorage:', e);
        return false;
      }
    }
  }
  
  console.error(`Failed to save to localStorage after ${maxRetries} attempts`);
  return false;
}

/**
 * Get the size of a localStorage item in bytes (approximate)
 * @param {string} key - The localStorage key
 * @returns {number} Size in bytes
 */
export function getItemSize(key) {
  const value = localStorage.getItem(key);
  if (!value) return 0;
  // Each character is approximately 2 bytes in UTF-16
  return (key.length + value.length) * 2;
}

/**
 * Get total localStorage usage statistics
 * @returns {Object} Statistics object with total size and per-project breakdown
 */
export function getLocalStorageStats() {
  let totalSize = 0;
  const projectSizes = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const size = getItemSize(key);
      totalSize += size;
      
      if (key.startsWith('unsavedProject_')) {
        projectSizes.push({ key, size });
      }
    }
  }
  
  // Sort by size (largest first)
  projectSizes.sort((a, b) => b.size - a.size);
  
  return {
    totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    projectCount: projectSizes.length,
    projects: projectSizes.map(p => ({
      key: p.key,
      sizeMB: (p.size / (1024 * 1024)).toFixed(2)
    }))
  };
}

export default {
  safeSaveToLocalStorage,
  getItemSize,
  getLocalStorageStats,
  cleanupOldProjects,
  getUnsavedProjectKeys
};
