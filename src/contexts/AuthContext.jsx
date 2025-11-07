import React, { createContext, useContext, useState } from "react";
import GlobalVariables from "../js/globalvariables.js";

const AuthContext = createContext();

/**
 * Context provider for authentication and GitHub integration.
 * Centralizes user authentication state and GitHub Octokit instance.
 */
export function AuthProvider({ children }) {
  const [isloggedIn, setIsLoggedIn] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizedUserOcto, setAuthorizedUserOcto] = useState(null);

  /**
   * Unified handler for login and re-authentication.
   * @param {Object} options
   *   - authType: "fork" | "like" | "reauth" | "save" |undefined
   *   - currentProjectRep: string (optional, for re-auth)
   *   - returnTo: string (optional, for re-auth)
   */
  const authRedirectHandler = ({
    authType,
    currentProjectRep,
    returnTo,
  } = {}) => {
    // Helper to build the GitHub OAuth URL
    function buildOAuthUrl({ client_id, scope, csrfToken, stateObj }) {
      const state = encodeURIComponent(JSON.stringify(stateObj));
      return `https://github.com/login/oauth/authorize?client_id=${client_id}&response_type=code&scope=${scope}&redirect_uri=${window.origin}/callback&state=${state}`;
    }
    // Save project if provided (for re-auth)
    if (currentProjectRep) {
      localStorage.setItem("pendingProjectSave", currentProjectRep);
    }

    const params = new URLSearchParams(window.location.search);
    let scope = "public_repo";
    if (params.has("private")) scope = "repo";

    const client_id =
      window.origin.includes("localhost") || window.origin.includes("abundance")
        ? import.meta.env.VITE_GH_OAUTH_CLIENT_ID
        : import.meta.env.VITE_GH_OAUTH_CLIENT_ID_MOB;

    // Create a CSRF token and store it locally
    const csrfToken = window.crypto
      .getRandomValues(new Uint8Array(16))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
    localStorage.setItem("latestCSRFToken", csrfToken);

    // Repo for state param: use string for login, object for reauth
    let repoState = null;
    if (GlobalVariables.currentRepo) {
      repoState = {
        owner: GlobalVariables.currentRepo.owner.login,
        repo: GlobalVariables.currentRepo.name,
      };
    }
    // Build state param
    const stateObj = {
      authType: authType,
      csrfToken: csrfToken,
      currentRepo: repoState,
    };
    if (returnTo) stateObj.returnTo = returnTo;

    const link = buildOAuthUrl({ client_id, scope, csrfToken, stateObj });
    window.location.assign(link);
  };

  const value = {
    isloggedIn,
    setIsLoggedIn,
    isAuthorized,
    setIsAuthorized,
    authorizedUserOcto,
    setAuthorizedUserOcto,
    authRedirectHandler,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use the AuthContext
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
