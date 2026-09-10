import React from "react";
import { useAuth } from "../../contexts/index.js";
import { useRotatingFeaturedImage } from "../../hooks/useRotatingFeaturedImage.js";

/**
 * Initial log component displays pop Up to either attempt Github login/browse projects
 */
const InitialLog = ({ setNoUserBrowsing }) => {
  const { authRedirectHandler } = useAuth();
  const { imageUrl, loading, project } = useRotatingFeaturedImage(5000);

  return (
    <div className="login-page">
      <div id="rotate-feature">
        <div>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#999",
              }}
            >
              Loading...
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={
                project
                  ? `${project.owner}/${project.repoName}`
                  : "featured project"
              }
              style={{
                marginLeft: "10%",
                marginBottom: "-10%",
                width: "90%",
                height: "80%",
                objectFit: "cover",
                overflow: "hidden",
              }}
              onError={(e) => {
                e.currentTarget.src =
                  import.meta.env.VITE_APP_PATH_FOR_PICS +
                  "/imgs/rotate_feature.png";
              }}
            />
          ) : (
            <img
              src={
                import.meta.env.VITE_APP_PATH_FOR_PICS +
                "/imgs/rotate_feature.png"
              }
              alt="rotate feature"
            />
          )}
          <p
            className="message"
            style={{
              fontSize: "13px",
              marginTop: "10px",
              textAlign: "right",
              paddingRight: "10px",
            }}
          >
            <a
              href={`https://abundance.maslowcnc.com/run/${project ? `${project.owner}/${project.repoName}` : ""}`}
              target="_blank"
              style={{ color: "gray", textDecoration: "none" }}
            >
              {project ? `${project.owner} / ${project.repoName}` : "unknown"}
            </a>
          </p>
        </div>
      </div>
      <div className="logindiv logoButtonBlock">
        <img
          className="logo"
          src={
            import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/abundance_logo.png"
          }
          alt="logo"
        />

        {/* <div id="welcome">
          <img
            src={
              import.meta.env.VITE_APP_PATH_FOR_PICS +
              "/imgs/abundance_lettering.png"
            }
            alt="logo"
            className="login-logo"
          />
        </div> */}
        <p style={{ padding: "0 18px", fontFamily: "Roboto, sans-serif" }}>
          A web-based CAD program for cooperative design
        </p>
        <div id="gitSide">
          <form className="login-form">
            <button
              type="button"
              id="loginButton"
              style={{
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              className="submit-btn"
              onClick={() => authRedirectHandler()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Login With GitHub
            </button>
            <p className="message" style={{ fontSize: "13px" }}>
              Don't have a Github account?{" "}
              <a
                href="https://github.com/join"
                target="_blank"
                rel="noopener noreferrer"
              >
                Create an account
              </a>
            </p>
          </form>
        </div>
        <div id="nonGitSide" className="curiousBrowse">
          <button
            type="button"
            onClick={() => {
              setNoUserBrowsing(true);
            }}
            className="submit-btn"
            id="browseNonGit"
            style={{ padding: "0 30px" }}
          >
            Explore our library
          </button>
          <p className="message" style={{ fontSize: "13px" }}>
            What is Abundance?{" "}
            <a
              href="https://abundance.com/user-guide"
              target="_blank"
              rel="noopener noreferrer"
            >
              Take a look at our user guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default InitialLog;
