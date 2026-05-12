import React, { createContext, useContext, useState, useEffect } from "react";

const DevSettingsContext = createContext();

export const useDevSettings = () => {
  const context = useContext(DevSettingsContext);
  if (!context) {
    throw new Error("useDevSettings must be used within DevSettingsProvider");
  }
  return context;
};

/**
 * Provider component for dev settings
 * Manages dev-only settings and persists them to localStorage
 */
export const DevSettingsProvider = ({ children }) => {
  const [devSettings, setDevSettings] = useState({
    allowGitHubMoleculeNavigation: false,
  });

  const [showDevModal, setShowDevModal] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("dev-settings");
    if (saved) {
      try {
        setDevSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved dev settings", e);
      }
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("dev-settings", JSON.stringify(devSettings));
  }, [devSettings]);

  const toggleSetting = (key) => {
    setDevSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const updateSetting = (key, value) => {
    setDevSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetSettings = () => {
    const defaultSettings = {
      showPerformanceMetrics: false,
      allowGitHubMoleculeNavigation: false,
    };
    setDevSettings(defaultSettings);
    localStorage.removeItem("dev-settings");
  };

  const value = {
    devSettings,
    setDevSettings,
    toggleSetting,
    updateSetting,
    resetSettings,
    showDevModal,
    setShowDevModal,
  };

  return (
    <DevSettingsContext.Provider value={value}>
      {children}
    </DevSettingsContext.Provider>
  );
};
