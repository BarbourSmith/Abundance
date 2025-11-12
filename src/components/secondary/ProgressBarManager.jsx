import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import RenderProgressBar from "./RenderProgressBar.jsx";

const ProgressBarContext = createContext();

/**
 * Context provider for managing multiple progress bars with dynamic vertical stacking
 */
export function ProgressBarProvider({ children }) {
  const [bars, setBars] = useState({});

  const registerBar = useCallback(
    (id, visible, progress, label, run = false) => {
      setBars((prev) => {
        // Only update if something actually changed
        const existing = prev[id];
        if (
          existing &&
          existing.visible === visible &&
          existing.progress === progress &&
          existing.label === label &&
          existing.run === run
        ) {
          return prev; // No change, return same object to prevent re-render
        }

        return {
          ...prev,
          [id]: { visible, progress, label, run },
        };
      });
    },
    []
  );

  const unregisterBar = useCallback((id) => {
    setBars((prev) => {
      if (!prev[id]) return prev; // Bar doesn't exist, no change needed
      const newBars = { ...prev };
      delete newBars[id];
      return newBars;
    });
  }, []);

  // Use a ref to maintain stable context value for functions
  const contextRef = useRef({ registerBar, unregisterBar });
  contextRef.current = { registerBar, unregisterBar };

  return (
    <ProgressBarContext.Provider value={contextRef.current}>
      {children}
      <ProgressBarDisplay bars={bars} />
    </ProgressBarContext.Provider>
  );
}

/**
 * Hook to register a progress bar
 */
export function useProgressBar(id, visible, progress, label, run = false) {
  const context = useContext(ProgressBarContext);

  useEffect(() => {
    if (!context) return;

    if (visible) {
      context.registerBar(id, visible, progress, label, run);
    } else {
      context.unregisterBar(id);
    }

    return () => {
      context.unregisterBar(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, visible, progress, label, run]);
}

/**
 * Component that displays all registered progress bars with vertical stacking
 */
function ProgressBarDisplay({ bars }) {
  const barSpacing = 30; // pixels between bars

  // Get visible bars and sort them by a consistent order
  const visibleBars = Object.entries(bars)
    .filter(([_, bar]) => bar.visible)
    .sort(([idA], [idB]) => {
      // Define a consistent order for bars
      const order = ["save", "duplicate", "rename", "render", "fork", "build", "gcode"];
      const indexA = order.findIndex((prefix) => idA.startsWith(prefix));
      const indexB = order.findIndex((prefix) => idB.startsWith(prefix));
      return indexA - indexB;
    });

  return (
    <>
      {visibleBars.map(([id, bar], index) => (
        <RenderProgressBar
          key={id}
          progress={bar.progress}
          label={bar.label}
          run={bar.run}
          offsetTop={-index * barSpacing}
        />
      ))}
    </>
  );
}

export function useProgressBarContext() {
  return useContext(ProgressBarContext);
}
