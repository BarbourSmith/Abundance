/**
 * Manages tracking of recently opened projects and frequently used GitHub molecules
 * using localStorage
 */

const RECENT_PROJECTS_KEY = 'abundance_recent_projects';
const MOLECULE_USAGE_KEY = 'abundance_molecule_usage';
const MAX_RECENT_PROJECTS = 5;
const MAX_FREQUENT_MOLECULES = 5;

/**
 * Record that a project was opened
 * @param {string} owner - GitHub username/org
 * @param {string} repoName - Repository name
 */
export function recordProjectOpened(owner, repoName) {
  if (!owner || !repoName) return;
  
  try {
    const recentProjects = getRecentProjects();
    const projectKey = `${owner}/${repoName}`;
    
    // Remove if already exists (to move it to front)
    const filtered = recentProjects.filter(p => p.key !== projectKey);
    
    // Add to front
    filtered.unshift({
      key: projectKey,
      owner,
      repoName,
      timestamp: Date.now()
    });
    
    // Keep only MAX_RECENT_PROJECTS
    const trimmed = filtered.slice(0, MAX_RECENT_PROJECTS);
    
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Error recording project opened:', error);
  }
}

/**
 * Get the list of recently opened projects
 * @returns {Array} Array of recent project objects
 */
export function getRecentProjects() {
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!stored) return [];
    
    const projects = JSON.parse(stored);
    return Array.isArray(projects) ? projects : [];
  } catch (error) {
    console.error('Error getting recent projects:', error);
    return [];
  }
}

/**
 * Record that a GitHub molecule was used
 * @param {string} owner - GitHub username/org
 * @param {string} repoName - Repository name
 * @param {string} displayName - Optional display name for the molecule
 */
export function recordMoleculeUsed(owner, repoName, displayName = null) {
  if (!owner || !repoName) return;
  
  try {
    const moleculeUsage = getMoleculeUsage();
    const moleculeKey = `${owner}/${repoName}`;
    
    // Find existing or create new entry
    let molecule = moleculeUsage.find(m => m.key === moleculeKey);
    
    if (molecule) {
      molecule.count++;
      molecule.lastUsed = Date.now();
      if (displayName) {
        molecule.displayName = displayName;
      }
    } else {
      molecule = {
        key: moleculeKey,
        owner,
        repoName,
        displayName: displayName || repoName,
        count: 1,
        lastUsed: Date.now()
      };
      moleculeUsage.push(molecule);
    }
    
    localStorage.setItem(MOLECULE_USAGE_KEY, JSON.stringify(moleculeUsage));
  } catch (error) {
    console.error('Error recording molecule usage:', error);
  }
}

/**
 * Get the list of all tracked molecule usage
 * @returns {Array} Array of molecule usage objects
 */
export function getMoleculeUsage() {
  try {
    const stored = localStorage.getItem(MOLECULE_USAGE_KEY);
    if (!stored) return [];
    
    const molecules = JSON.parse(stored);
    return Array.isArray(molecules) ? molecules : [];
  } catch (error) {
    console.error('Error getting molecule usage:', error);
    return [];
  }
}

/**
 * Get the most frequently used GitHub molecules
 * @returns {Array} Array of top molecule usage objects, sorted by count
 */
export function getFrequentMolecules() {
  const molecules = getMoleculeUsage();
  
  // Sort by count (descending), then by lastUsed (descending)
  molecules.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastUsed - a.lastUsed;
  });
  
  return molecules.slice(0, MAX_FREQUENT_MOLECULES);
}

/**
 * Clear all tracking data (for testing/debugging)
 */
export function clearTrackingData() {
  try {
    localStorage.removeItem(RECENT_PROJECTS_KEY);
    localStorage.removeItem(MOLECULE_USAGE_KEY);
  } catch (error) {
    console.error('Error clearing tracking data:', error);
  }
}
