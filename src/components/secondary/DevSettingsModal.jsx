import React from "react";
import { useDevSettings } from "../../contexts/DevSettingsContext.jsx";
import "../../styles/DevSettingsModal.css";

/**
 * Modal component for managing dev settings
 * Shows only when the secret key sequence is triggered
 */
const DevSettingsModal = () => {
  const {
    devSettings,
    toggleSetting,
    resetSettings,
    showDevModal,
    setShowDevModal,
  } = useDevSettings();

  if (!showDevModal) return null;

  const settings = [
    {
      key: "allowGitHubMoleculeNavigation",
      label: "Allow GitHub Molecule Navigation",
      description: "Enable double-click navigation into GitHub molecules",
    },
  ];

  return (
    <div className="dev-settings-overlay">
      <div className="dev-settings-modal">
        <div className="dev-settings-header">
          <h2>Developer Settings</h2>
          <button
            className="dev-settings-close-btn"
            onClick={() => setShowDevModal(false)}
          >
            ✕
          </button>
        </div>

        <div className="dev-settings-content">
          {settings.map((setting) => (
            <div key={setting.key} className="dev-setting-item">
              <div className="dev-setting-checkbox">
                <input
                  type="checkbox"
                  id={setting.key}
                  checked={devSettings[setting.key]}
                  onChange={() => toggleSetting(setting.key)}
                />
                <label htmlFor={setting.key}>{setting.label}</label>
              </div>
              <p className="dev-setting-description">{setting.description}</p>
            </div>
          ))}
        </div>

        <div className="dev-settings-footer">
          <button className="dev-settings-reset-btn" onClick={resetSettings}>
            Reset to Defaults
          </button>
          <button
            className="dev-settings-close-submit-btn"
            onClick={() => setShowDevModal(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevSettingsModal;
