import React, { createContext, useContext, useState, useEffect } from 'react';
import RenderProgressBar from "./RenderProgressBar.jsx";

const ProgressBarContext = createContext();

/**
 * Context provider for managing multiple progress bars with dynamic vertical stacking
 */
export function ProgressBarProvider({ children }) {
  const [bars, setBars] = useState({});

  const registerBar = (id, visible, progress, label, run = false) => {
    setBars(prev => ({
      ...prev,
      [id]: { visible, progress, label, run }
    }));
  };

  const unregisterBar = (id) => {
    setBars(prev => {
      const newBars = { ...prev };
      delete newBars[id];
      return newBars;
    });
  };

  return (
    <ProgressBarContext.Provider value={{ bars, registerBar, unregisterBar }}>
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
    if (context && visible) {
      context.registerBar(id, visible, progress, label, run);
    } else if (context && !visible) {
      context.unregisterBar(id);
    }
    
    return () => {
      if (context) {
        context.unregisterBar(id);
      }
    };
  }, [id, visible, progress, label, run, context]);
}

/**
 * Component that displays all registered progress bars with vertical stacking
 */
function ProgressBarDisplay({ bars }) {
  const barSpacing = 60; // pixels between bars
  
  // Get visible bars and sort them by a consistent order
  const visibleBars = Object.entries(bars)
    .filter(([_, bar]) => bar.visible)
    .sort(([idA], [idB]) => {
      // Define a consistent order for bars
      const order = ['save', 'duplicate', 'rename', 'render', 'build'];
      const indexA = order.findIndex(prefix => idA.startsWith(prefix));
      const indexB = order.findIndex(prefix => idB.startsWith(prefix));
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
          offsetTop={index * barSpacing}
        />
      ))}
    </>
  );
}

export function useProgressBarContext() {
  return useContext(ProgressBarContext);
}
