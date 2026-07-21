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
  const [gcodeParts, setGcodeParts] = useState(null);
  const [nonReplicadGeometry, setNonReplicadGeometry] = useState(null);

  // Render progress state
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderBarVisible, setRenderBarVisible] = useState(true);
  const [renderStage, setRenderStage] = useState(""); // "Waiting for user Input", "Building", or "Rendering"

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

  // Top-level molecule context state
  const [showTopLevelWireframe, setShowTopLevelWireframe] = useState(false);
  const [topLevelWireMesh, setTopLevelWireMesh] = useState(null);

  // Tag visibility state - Set of tag names that are currently visible
  const [activeTags, setActiveTags] = useState(new Set());

  // Track if we're currently viewing the output mesh directly
  const [isViewingOutputMesh, setIsViewingOutputMesh] = useState(false);

  // Currently computing atom label (e.g. "myMolecule/rotate")
  const [computingLabel, setComputingLabel] = useState(null);

  // Part selection mode — non-null when a partselect Input atom is active
  const [selectionModeAtom, setSelectionModeAtom] = useState(null);
  // Increments each time the selection changes, forcing ReplicadMesh to re-read selectedLeafIndexes
  const [selectionVersion, setSelectionVersion] = useState(0);

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
    nonReplicadGeometry,
    setNonReplicadGeometry,

    // Render progress
    renderProgress,
    setRenderProgress,
    renderBarVisible,
    setRenderBarVisible,
    renderStage,
    setRenderStage,

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

    // Top-level molecule context
    showTopLevelWireframe,
    setShowTopLevelWireframe,
    topLevelWireMesh,
    setTopLevelWireMesh,

    // Tag visibility
    activeTags,
    setActiveTags,

    // Output mesh viewing state
    isViewingOutputMesh,
    setIsViewingOutputMesh,

    // Currently computing atom label
    computingLabel,
    setComputingLabel,

    // Part selection mode
    selectionModeAtom,
    setSelectionModeAtom,
    selectionVersion,
    setSelectionVersion,

    // GCode group
    gcodeParts,
    setGcodeParts,
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
