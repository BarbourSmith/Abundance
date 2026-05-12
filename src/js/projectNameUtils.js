/**
 * Utility functions for converting project names between display format and GitHub format.
 *
 * GitHub repositories cannot contain spaces, so we replace them with underscores.
 * For display purposes, we convert underscores back to spaces.
 */

/**
 * Convert a project name from display format to GitHub format.
 * Replaces all spaces with underscores.
 *
 * @param {string} displayName - The project name as entered by the user (may contain spaces)
 * @returns {string} The project name formatted for GitHub (spaces replaced with underscores)
 * @example
 * convertToGithubName("My Project") // returns "My_Project"
 * convertToGithubName("My_Project") // returns "My_Project"
 */
export function convertToGithubName(displayName) {
  if (!displayName || typeof displayName !== "string") {
    return displayName;
  }
  return displayName.replace(/\s+/g, "_");
}

/**
 * Convert a project name from GitHub format to display format.
 * Replaces all underscores with spaces.
 *
 * @param {string} githubName - The project name from GitHub (may contain underscores)
 * @returns {string} The project name formatted for display (underscores replaced with spaces)
 * @example
 * convertToDisplayName("My_Project") // returns "My Project"
 * convertToDisplayName("My Project") // returns "My Project"
 */
export function convertToDisplayName(githubName) {
  if (!githubName || typeof githubName !== "string") {
    return githubName;
  }
  return githubName.replace(/_/g, " ");
}

/**
 * Convert Gregorian ordinal date to JavaScript Date object.
 * Python's datetime.toordinal() counts days since January 1, year 1.
 * @param {number|string} ordinalDate - Ordinal date (e.g., 739692 for April 27, 2026)
 * @returns {Date} JavaScript Date object
 */
export function convertOrdinalDateToDate(ordinalDate) {
  if (!ordinalDate) return null;

  // Convert to number if it's a string
  const ordinal =
    typeof ordinalDate === "string" ? parseInt(ordinalDate, 10) : ordinalDate;

  if (isNaN(ordinal)) return null;

  // Create a date from the ordinal by counting days from year 1
  // JavaScript's Date epoch is January 1, 1970 (ordinal day 719163)
  const JAVASCRIPT_EPOCH_ORDINAL = 719163;
  const daysSinceEpoch = ordinal - JAVASCRIPT_EPOCH_ORDINAL;

  // Create date from milliseconds
  return new Date(daysSinceEpoch * 24 * 60 * 60 * 1000);
}

/**
 * Convert ordinal date to locale string.
 * @param {number|string} ordinalDate - Ordinal date number
 * @returns {string} Formatted date string
 */
export function formatOrdinalDate(ordinalDate) {
  if (!ordinalDate) return "N/A";
  const date = convertOrdinalDateToDate(ordinalDate);
  return date ? date.toLocaleString() : "N/A";
}
