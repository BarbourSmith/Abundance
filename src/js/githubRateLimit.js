import { useSyncExternalStore } from "react";

/**
 * Notices when GitHub's API rate limit runs out, so the page can say why
 * projects stopped loading. Signed-out visitors share GitHub's anonymous limit
 * of 60 requests an hour per IP address, which opening a few projects can use
 * up; after that every request fails until the limit resets.
 *
 * The app talks to GitHub through many Octokit instances and plain fetches, so
 * this watches the page's fetch responses instead of each client. It only
 * reads responses; requests behave exactly as before.
 */

let limitedUntil = null; // Date the limit resets, once it has run out
let dismissedUntil = null; // The reset the user has already been told about
const listeners = new Set();

function setLimitedUntil(date) {
  limitedUntil = date;
  listeners.forEach((listener) => listener());
}

function checkResponse(response) {
  if (!response.url.startsWith("https://api.github.com/")) return;
  if (response.status !== 403 && response.status !== 429) return;
  if (response.headers.get("x-ratelimit-remaining") !== "0") return;
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  // Without a reset time, GitHub's limits last at most an hour
  setLimitedUntil(
    new Date(reset ? reset * 1000 : Date.now() + 60 * 60 * 1000),
  );
}

/** Starts watching. Safe to call more than once. */
export function watchGitHubRateLimit() {
  if (window.fetch.__watchesGitHubRateLimit) return;
  const originalFetch = window.fetch;
  const watchedFetch = async (...args) => {
    const response = await originalFetch.apply(window, args);
    try {
      checkResponse(response);
    } catch {
      // Watching must never break a request.
    }
    return response;
  };
  watchedFetch.__watchesGitHubRateLimit = true;
  window.fetch = watchedFetch;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** When the GitHub rate limit resets, or null while it isn't exhausted. */
export function getGitHubRateLimitReset() {
  if (limitedUntil && limitedUntil <= new Date()) limitedUntil = null;
  if (limitedUntil && dismissedUntil && limitedUntil <= dismissedUntil) {
    return null;
  }
  return limitedUntil;
}

/** React hook for getGitHubRateLimitReset. */
export function useGitHubRateLimit() {
  return useSyncExternalStore(subscribe, getGitHubRateLimitReset);
}

/** Hides the warning until the current limit resets. */
export function dismissGitHubRateLimit() {
  dismissedUntil = limitedUntil;
  listeners.forEach((listener) => listener());
}
