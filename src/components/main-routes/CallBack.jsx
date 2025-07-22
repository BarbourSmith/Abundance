import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import GlobalVariables from "../../js/globalvariables.js";

const Callback = ({
  isAuthorized,
  setIsAuthorized,
  setIsLoggedIn,
  setAuthorizedUserOcto,
  setRedirectType,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("code")) {
      setIsAuthorized(true);
    }
    const serverEndpoint = window.origin.includes("abundance") || window.origin.includes("localhost")
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
          }
        );

        const result = await response.json();
        const access_token = result.message;

        const authorizedUser = new Octokit({
          auth: access_token,
        });
        const { data } = await authorizedUser.request("/user");
        GlobalVariables.currentUser = data.login;
        if (GlobalVariables.currentUser) {
          setIsLoggedIn(true);
          setAuthorizedUserOcto(authorizedUser);

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
        console.log("state", state);
        if (state.forking && state.currentRepo && authorizedUser) {
          navigate(`/run/${state.currentRepo}`);
          setRedirectType("fork");
        } else if (state.liking && state.currentRepo && authorizedUser) {
          navigate(`/run/${state.currentRepo}`);
          setRedirectType("like");
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
