import React, { createContext, useContext, useState, useEffect } from "react";
import { Octokit } from "octokit";
import GlobalVariables from "../js/globalvariables.js";

const AuthContext = createContext();

// Token storage keys
const TOKEN_STORAGE_KEY = "gh_access_token";
const TOKEN_TIMESTAMP_KEY = "gh_token_timestamp";
const TOKEN_EXPIRY_DAYS = 60; // GitHub tokens typically expire after 60 days

/**
 * Context provider for authentication and GitHub integration.
 * Centralizes user authentication state and GitHub Octokit instance.
 */
export function AuthProvider({ children }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizedUserOcto, setAuthorizedUserOcto] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [userScopes, setUserScopes] = useState([]);

  /**
   * Store access token in localStorage
   */
  const storeToken = (token) => {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error("Failed to store token:", error);
    }
  };

  /**
   * Retrieve access token from localStorage
   */
  const getStoredToken = () => {
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const timestamp = localStorage.getItem(TOKEN_TIMESTAMP_KEY);

      if (!token || !timestamp) {
        return null;
      }

      // Check if token is expired (older than TOKEN_EXPIRY_DAYS)
      const tokenAge = Date.now() - parseInt(timestamp, 10);
      const maxAge = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds

      if (tokenAge > maxAge) {
        console.log("Token expired, clearing storage");
        clearStoredToken();
        return null;
      }

      return token;
    } catch (error) {
      console.error("Failed to retrieve token:", error);
      return null;
    }
  };

  /**
   * Clear stored token from localStorage
   */
  const clearStoredToken = () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Failed to clear token:", error);
    }
  };

  /**
   * Validate the access token by making a test API call
   */
  const validateToken = async (token) => {
    try {
      const octokit = new Octokit({ auth: token });
      // Get user info and response headers
      const response = await octokit.request("GET /user");
      const scopes = response.headers["x-oauth-scopes"]
        ? response.headers["x-oauth-scopes"].split(",").map((s) => s.trim())
        : [];
      return { valid: true, user: response.data, scopes };
    } catch (error) {
      console.error("Token validation failed:", error);
      return { valid: false, user: null, scopes: [] };
    }
  };

  /**
   * Attempt to restore session from stored token
   */
  const restoreSession = async () => {
    setIsRestoringSession(true);
    const token = getStoredToken();

    if (!token) {
      setIsRestoringSession(false);
      return false;
    }
    const { valid, user, scopes } = await validateToken(token);

    if (valid && user) {
      const octokit = new Octokit({ auth: token });
      GlobalVariables.currentUser = user.login;
      setIsAuthorized(true);
      setAuthorizedUserOcto(octokit);
      setIsRestoringSession(false);
      return true;
    } else {
      // Token is invalid, clear it
      clearStoredToken();
      setIsRestoringSession(false);
      return false;
    }
  };

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
    privateRepo = false,
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
    if (params.has("private") || privateRepo) scope = "repo";

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

  // Attempt to restore session on mount
  useEffect(() => {
    restoreSession();
  }, []);

  const value = {
    isAuthorized,
    setIsAuthorized,
    authorizedUserOcto,
    setAuthorizedUserOcto,
    authRedirectHandler,
    isRestoringSession,
    storeToken,
    clearStoredToken,
    restoreSession,
    userScopes,
    setUserScopes,
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
