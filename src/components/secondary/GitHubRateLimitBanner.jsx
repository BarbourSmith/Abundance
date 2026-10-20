import React, { useEffect, useReducer } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import {
  dismissGitHubRateLimit,
  useGitHubRateLimit,
} from "../../js/githubRateLimit.js";
import "../../styles/GitHubRateLimitBanner.css";

/**
 * Tells the user when GitHub's API rate limit has run out and projects can't
 * load until it resets. Signed-out visitors get a much lower limit, so they're
 * offered a GitHub sign-in that brings them back to this page.
 */
export default function GitHubRateLimitBanner() {
  const resetsAt = useGitHubRateLimit();
  const { authorizedUserOcto, authRedirectHandler } = useAuth();
  const location = useLocation();
  const [, rerender] = useReducer((n) => n + 1, 0);

  // Hide the banner once the limit resets
  useEffect(() => {
    if (!resetsAt) return;
    const timer = setTimeout(rerender, resetsAt - Date.now() + 1000);
    return () => clearTimeout(timer);
  }, [resetsAt]);

  if (!resetsAt) return null;

  const time = resetsAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const signedOut = !authorizedUserOcto;

  return (
    <div className="github-limit-banner" role="alert">
      <p>
        {signedOut
          ? `GitHub limits how much signed-out visitors can load, and this browser has reached that limit. Sign in with GitHub to keep opening projects, or try again after ${time}.`
          : `GitHub's request limit for your account has run out, so projects can't load right now. Try again after ${time}.`}
      </p>
      <div className="github-limit-banner-actions">
        {signedOut && (
          <button
            type="button"
            className="github-limit-banner-signin"
            onClick={() =>
              authRedirectHandler({
                returnTo: location.pathname + location.search,
              })
            }
          >
            Sign in with GitHub
          </button>
        )}
        <button
          type="button"
          className="github-limit-banner-dismiss"
          aria-label="Dismiss"
          onClick={dismissGitHubRateLimit}
        >
          ×
        </button>
      </div>
    </div>
  );
}
