import React, { createContext, useContext, useState } from 'react';

const AppStateContext = createContext();

/**
 * Context provider for general application state.
 * Centralizes active atom, shortcuts, and UI state.
 */
export function AppStateProvider({ children }) {
  const [activeAtom, setActiveAtom] = useState(null);
  const [shortCutsOn, setShortCuts] = useState(
    localStorage.getItem("shortcuts") === "true"
  );
  const [exportPopUp, setExportPopUp] = useState(false);
  const [redirectType, setRedirectType] = useState(null);
  const [errorNotification, setErrorNotification] = useState(null);

  // GCode generation progress state
  const [gcodeProgress, setGcodeProgress] = useState(0);
  const [gcodeBarVisible, setGcodeBarVisible] = useState(false);
  const [gcodeLabel, setGcodeLabel] = useState('Generating GCode');

  const value = {
    activeAtom,
    setActiveAtom,
    shortCutsOn,
    setShortCuts,
    exportPopUp,
    setExportPopUp,
    redirectType,
    setRedirectType,
    errorNotification,
    setErrorNotification,
    // GCode progress
    gcodeProgress,
    setGcodeProgress,
    gcodeBarVisible,
    setGcodeBarVisible,
    gcodeLabel,
    setGcodeLabel,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

/**
 * Hook to use the AppStateContext
 */
export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}