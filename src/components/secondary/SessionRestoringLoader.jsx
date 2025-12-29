import React from "react";

/**
 * Loading component shown while restoring user session from cached token
 */
export default function SessionRestoringLoader() {
  return (
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
          <p style={{ padding: "0 20px" }}>
            Restoring your session...
          </p>
        </div>
      </div>
    </div>
  );
}
