import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const AppStateContext = createContext();

/**
 * Context provider for general application state.
 * Centralizes active atom, shortcuts, and UI state.
 */
export function AppStateProvider({ children }) {
  const [activeAtom, setActiveAtom] = useState(null);
  const [shortCutsOn, setShortCuts] = useState(
    localStorage.getItem("shortcuts") === "true",
  );
  const [exportPopUp, setExportPopUp] = useState(false);
  const [redirectType, setRedirectType] = useState(null);
  const [errorNotification, setErrorNotificationRaw] = useState(null);
  const [notificationType, setNotificationType] = useState("error");

  const notificationTimeout = useRef(null);

  /**
   * Show a notification for duration milliseconds (default five seconds).
   * A new message replaces the timer; null dismisses it immediately.
   */
  const setNotification = useCallback(
    (message, type = "error", duration = 5000) => {
      clearTimeout(notificationTimeout.current);
      notificationTimeout.current = null;
      setErrorNotificationRaw(message);
      setNotificationType(message ? type : "error");
      if (message) {
        notificationTimeout.current = setTimeout(() => {
          notificationTimeout.current = null;
          setErrorNotificationRaw(null);
          setNotificationType("error");
        }, duration);
      }
    },
    [],
  );

  const setErrorNotification = useCallback(
    (message, type, duration) =>
      setNotification(message, type || "error", duration),
    [setNotification],
  );

  useEffect(() => () => clearTimeout(notificationTimeout.current), []);

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
    notificationType,
    setNotification,
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
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
