import { useState, useEffect, useCallback, useRef } from "react";

// Placeholder list of featured projects
const FEATURED_PROJECTS = [
  { owner: "alzatin", repoName: "shoe_closet_rack" },
  { owner: "BarbourSmith", repoName: "Parametric_Plant_Stand" },
  { owner: "BarbourSmith", repoName: "Tree_House" },
  { owner: "BarbourSmith", repoName: "Sauna_Boat_2.0" },
  { owner: "BarbourSmith", repoName: "Motor_Mounting_Bracket" },
  { owner: "BarbourSmith", repoName: "3D_Printed_T-Nut" },
  {
    owner: "wouldchuckit",
    repoName: "Maslow4_Router_core_replacement_cylinder",
  },
  { owner: "IDAbbott", repoName: "Modified_Tri_Clamp-copy" },
  {
    owner: "wouldchuckit",
    repoName: "Table_With_Tapered_Legs_and_Rounded_Corners",
  },
  { owner: "alzatin", repoName: "bar_stool_jenna" },
  {
    owner: "wouldchuckit",
    repoName: "CurvedSupportBookshelfMultipleVerticals",
  },
  { owner: "wouldchuckit", repoName: "Maslow4_Crosshairs_for_centering" },
  { owner: "BarbourSmith", repoName: "Van-Build" },
];

const GITHUB_RAW_URL = "https://raw.githubusercontent.com";

// Global cache for project images (persists across component remounts)
const imageCache = new Map();

/**
 * Custom hook to fetch and rotate featured project images with caching
 * Picks a random project from the list, fetches its PNG from GitHub (or uses cache)
 * @param {number} rotationInterval - Time in ms to rotate to next image (0 to disable)
 * @returns {object} { imageUrl, loading, error, project }
 */
export const useRotatingFeaturedImage = (rotationInterval = 5000) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const usedProjectsRef = useRef(new Set()); // Track used projects to avoid repeats

  const pickAndFetchProject = useCallback(() => {
    setLoading(true);
    setError(null);

    // Get available projects (not recently used)
    const availableProjects = FEATURED_PROJECTS.filter(
      (p) => !usedProjectsRef.current.has(`${p.owner}/${p.repoName}`),
    );

    // If all used, reset
    if (availableProjects.length === 0) {
      usedProjectsRef.current.clear();
    }

    // Pick random from available
    const projectList =
      availableProjects.length > 0 ? availableProjects : FEATURED_PROJECTS;
    const randomProject =
      projectList[Math.floor(Math.random() * projectList.length)];

    // Add to used set
    const projectKey = `${randomProject.owner}/${randomProject.repoName}`;
    usedProjectsRef.current.add(projectKey);

    setProject(randomProject);

    // Check cache first
    if (imageCache.has(projectKey)) {
      setImageUrl(imageCache.get(projectKey));
      setLoading(false);
      return;
    }

    // Construct GitHub raw URL for project.png
    const imageUrl = `${GITHUB_RAW_URL}/${randomProject.owner}/${randomProject.repoName}/main/project.png`;

    // Store in cache
    imageCache.set(projectKey, imageUrl);
    setImageUrl(imageUrl);
    setLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    pickAndFetchProject();
  }, [pickAndFetchProject]);

  // Rotation interval
  useEffect(() => {
    if (rotationInterval <= 0) return;

    const timer = setInterval(() => {
      pickAndFetchProject();
    }, rotationInterval);

    return () => clearInterval(timer);
  }, [rotationInterval, pickAndFetchProject]);

  return {
    imageUrl,
    loading,
    error,
    project,
  };
};
