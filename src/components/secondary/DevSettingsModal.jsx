import React, { useState, useCallback } from "react";
import { useDevSettings } from "../../contexts/DevSettingsContext.jsx";
import GlobalVariables from "../../js/globalvariables.js";
import "../../styles/DevSettingsModal.css";
import { AgentBridgeSettings } from "./AgentBridge.jsx";
import { useRendering } from "../../contexts/index.js";
import { exportDisplayMeshesAsGLB } from "../../js/exportGLB.js";

/** Developer settings content, shown in the Settings pop-up's Developer tab and in the standalone modal. */
export const DevSettingsPanel = () => {
  const { devSettings, toggleSetting, resetSettings } = useDevSettings();

  const [stateReport, setStateReport] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy to Clipboard");

  const refreshStateReport = useCallback(() => {
    setStateReport(GlobalVariables.getSystemStateReport());
  }, []);

  const copyStateReport = useCallback(() => {
    const report = GlobalVariables.getSystemStateReport();
    setStateReport(report);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(report).then(() => {
        setCopyLabel("Copied!");
        setTimeout(() => setCopyLabel("Copy to Clipboard"), 2000);
      });
    } else {
      // Fallback for environments without clipboard API
      const el = document.createElement("textarea");
      el.value = report;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy to Clipboard"), 2000);
    }
  }, []);

  const { mesh } = useRendering();
  const [glbStatus, setGlbStatus] = useState("");

  const exportGLB = useCallback(async () => {
    const node = GlobalVariables.currentAWSnode;
    const fileName = node ? `${node.owner}_${node.repoName}` : "model";
    try {
      const { bytes, savedTo } = await exportDisplayMeshesAsGLB(
        mesh,
        fileName,
      );
      const size = `${(bytes / 1024).toFixed(0)} KB`;
      setGlbStatus(
        savedTo
          ? `Saved to ${savedTo} (${size})`
          : `Downloaded ${fileName}.glb (${size})`,
      );
    } catch (err) {
      setGlbStatus(`Export failed: ${err.message}`);
    }
  }, [mesh]);

  const settings = [
    {
      key: "allowGitHubMoleculeNavigation",
      label: "Allow GitHub Molecule Navigation",
      description: "Enable double-click navigation into GitHub molecules",
    },
  ];

  return (
    <>
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

          <AgentBridgeSettings />

          <div className="dev-setting-item">
            <div className="dev-state-report-header">
              <span className="dev-state-report-title">Landing Page Model</span>
              <div className="dev-state-report-actions">
                <button className="dev-state-report-btn" onClick={exportGLB}>
                  Export GLB
                </button>
              </div>
            </div>
            <p className="dev-setting-description">
              Exports what the 3D view is showing as a GLB file, for the
              featured models on the landing page. On the local dev server it's
              saved to public/featured/; otherwise it's downloaded.
            </p>
            {glbStatus && (
              <p className="dev-setting-description">{glbStatus}</p>
            )}
          </div>

          <div className="dev-setting-item dev-state-report-section">
            <div className="dev-state-report-header">
              <span className="dev-state-report-title">System State Report</span>
              <div className="dev-state-report-actions">
                <button
                  className="dev-state-report-btn"
                  onClick={refreshStateReport}
                >
                  Refresh
                </button>
                <button
                  className="dev-state-report-btn dev-state-report-copy-btn"
                  onClick={copyStateReport}
                >
                  {copyLabel}
                </button>
              </div>
            </div>
            <p className="dev-setting-description">
              Captures a snapshot of the current project state (atoms, loading
              status, recent errors). Use &ldquo;Copy to Clipboard&rdquo; to share
              with an AI assistant or developer for diagnosis.
            </p>
            {stateReport && (
              <pre className="dev-state-report-pre">{stateReport}</pre>
            )}
          </div>
        </div>

        <div className="dev-settings-footer">
          <button className="dev-settings-reset-btn" onClick={resetSettings}>
            Reset to Defaults
          </button>
        </div>
    </>
  );
};

/** Standalone modal for pages without the Settings pop-up; opened with Ctrl/Cmd+Shift+D. */
const DevSettingsModal = () => {
  const { showDevModal, setShowDevModal } = useDevSettings();

  if (!showDevModal) return null;

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
        <DevSettingsPanel />
        <div className="dev-settings-footer">
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
