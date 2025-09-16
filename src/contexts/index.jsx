import React from 'react';
import { AppStateProvider } from './AppStateContext.jsx';
import { RenderStateProvider } from './RenderStateContext.jsx';

export const CombinedProvider = ({ children }) => {
  return (
    <AppStateProvider>
      <RenderStateProvider>
        {children}
      </RenderStateProvider>
    </AppStateProvider>
  );
};

// Re-export hooks for convenience
export { useAppState } from './AppStateContext.jsx';
export { useRenderState } from './RenderStateContext.jsx';