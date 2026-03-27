import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Octokit } from "octokit";
import GlobalVariables from "../../js/globalvariables.js";

import { useAuth } from "../../contexts/AuthContext";

const Callback = ({ setRedirectType }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthorized,
    setIsAuthorized,
    authorizedUserOcto,
    setAuthorizedUserOcto,
    storeToken,
    setUserScopes,
  } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("code")) {
      setIsAuthorized(true);
    }
    const serverEndpoint =
      window.origin.includes("abundance") || window.origin.includes("localhost")
        ? import.meta.env.VITE_AUTHO_SERVER_ENDPOINT
        : import.meta.env.VITE_AUTHO_SERVER_ENDPOINT_MOB;
    const serverUrl = import.meta.env.VITE_AUTHO_SERVER_URL;

    const callSecureApi = async () => {
      try {
        const code = params.get("code");

        const response = await fetch(
          `${serverUrl}/api/${serverEndpoint}?code=${encodeURIComponent(code)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        const result = await response.json();
        const access_token = result.message;

        // Store the token for future use
        storeToken(access_token);

        const authorizedUser = new Octokit({
          auth: access_token,
        });
        const userResponse = await authorizedUser.request("/user");
        const { data, headers } = userResponse;
        // Check and log OAuth scopes
        const scopes = headers["x-oauth-scopes"]
          ? headers["x-oauth-scopes"].split(",").map((s) => s.trim())
          : [];

        GlobalVariables.currentUser = data.login;
        if (GlobalVariables.currentUser) {
          setAuthorizedUserOcto(authorizedUser);
          console.log("OAuth scopes for token:", scopes);
          setUserScopes(scopes);
          return authorizedUser;
        }
      } catch (error) {
        setIsAuthorized(false);
      }
    };

    // Call the function to fetch the access token
    callSecureApi().then((authorizedUser) => {
      try {
        const stateParam = params.get("state");
        const state = stateParam ? JSON.parse(stateParam) : {};

        setRedirectType(state.authType);
        if (state.authType === "fork" || state.authType === "like") {
          navigate(`/run/${state.currentRepo.owner}/${state.currentRepo.repo}`);
        } else if (state.returnTo && authorizedUser) {
          let owner, repoName;
          if (state.authType === "reauth" && state.currentRepo) {
            owner = state.currentRepo.owner;
            repoName = state.currentRepo.repo;
          } else if (state.authType === "reauth" && !state.currentRepo) {
            // Handle re-authentication without a current repo
            navigate("/");
            return;
          } else {
            // Match /run/owner/repoName or /owner/repoName
            const match = state.returnTo.match(
              /(?:\/run)?\/(\w[\w-]*)\/(\w[\w-]*)/,
            );
            if (match) {
              owner = match[1];
              repoName = match[2];
            }
          }
          fetch(
            `https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/fetchSingleRepo?owner=${owner}&repoName=${repoName}`,
          )
            .then((res) => res.json())
            .then((data) => {
              if (data && data.item) {
                GlobalVariables.currentAWSnode = data.item;
                navigate(state.returnTo);
              }
            })
            .catch((e) => {
              console.error("Error fetching AWS project data:", e);
              // If fetch fails, fallback to run mode
              navigate(`/run/${owner}/${repoName}`);
            });
        } else {
          navigate("/");
        }
      } catch (error) {
        console.error("Error parsing state parameter:", error);
        navigate("/");
      }
    });
  }, [location, setIsAuthorized]);

  return (
    <div
      className="login-popup"
      id="projects-popup"
      style={{
        padding: "0",
        border: "10px solid #3e3d3d",
      }}
    >
      <div className="login-page">
        <div className="form animate fadeInUp one">
          <div id="gitSide" className="logindiv">
            <img
              className="logo"
              src={
                import.meta.env.VITE_APP_PATH_FOR_PICS +
                "/imgs/abundance_logo.png"
              }
              alt="logo"
            />
            <div id="welcome">
              <img
                src={
                  import.meta.env.VITE_APP_PATH_FOR_PICS +
                  "/imgs/abundance_lettering.png"
                }
                alt="logo"
                className="login-logo"
              />
            </div>
            {isAuthorized ? (
              <p style={{ padding: "0 20px" }}>
                Welcome. Redirecting you to your projects...
              </p>
            ) : (
              <p style={{ padding: "0 20px" }}>Logging you in ...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Callback;
