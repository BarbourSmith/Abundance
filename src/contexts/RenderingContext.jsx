import React, { createContext, useContext, useState } from "react";

const RenderingContext = createContext();

/**
 * Context provider for 3D rendering state management.
 * Centralizes mesh state, render progress, and render settings.
 */
export function RenderingProvider({ children }) {
  // Mesh state
  const [mesh, setMesh] = useState({});
  const [wireMesh, setWireMesh] = useState(null);
  const [outdatedMesh, setOutdatedMesh] = useState(false);
  const [plane, setPlane] = useState(null);
  const [geometryType, setGeometryType] = useState(null);

  // Render progress state
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderBarVisible, setRenderBarVisible] = useState(true);

  // Build progress state
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildBarVisible, setBuildBarVisible] = useState(false);

  // Render settings state
  const [gridParam, setGrid] = useState(true);
  const [axesParam, setAxes] = useState(true);
  const [wireParam, setWire] = useState(true);
  const [solidParam, setSolid] = useState(false);

  // Background model state
  const [backgroundUsdzFile, setBackgroundUsdzFile] = useState(null);
  const [backgroundUsdzSha, setBackgroundUsdzSha] = useState(null);
  const [showBackgroundModel, setShowBackgroundModel] = useState(false);
  const [userUploadedFile, setUserUploadedFile] = useState(false);

  // Top-level molecule wireframe state
  const [showTopLevelWireframe, setShowTopLevelWireframe] = useState(false);
  const [topLevelWireMesh, setTopLevelWireMesh] = useState(null);

  const value = {
    // Mesh state
    mesh,
    setMesh,
    wireMesh,
    setWireMesh,
    outdatedMesh,
    setOutdatedMesh,
    plane,
    setPlane,
    geometryType,
    setGeometryType,

    // Render progress
    renderProgress,
    setRenderProgress,
    renderBarVisible,
    setRenderBarVisible,

    // Build progress
    buildProgress,
    setBuildProgress,
    buildBarVisible,
    setBuildBarVisible,

    // Render settings
    gridParam,
    setGrid,
    axesParam,
    setAxes,
    wireParam,
    setWire,
    solidParam,
    setSolid,

    // Background model
    backgroundUsdzFile,
    setBackgroundUsdzFile,
    backgroundUsdzSha,
    setBackgroundUsdzSha,
    showBackgroundModel,
    setShowBackgroundModel,
    userUploadedFile,
    setUserUploadedFile,

    // Top-level molecule wireframe
    showTopLevelWireframe,
    setShowTopLevelWireframe,
    topLevelWireMesh,
    setTopLevelWireMesh,
  };

  return (
    <RenderingContext.Provider value={value}>
      {children}
    </RenderingContext.Provider>
  );
}

/**
 * Hook to use the RenderingContext
 */
export function useRendering() {
  const context = useContext(RenderingContext);
  if (!context) {
    throw new Error("useRendering must be used within a RenderingProvider");
  }
  return context;
}
