import React, { createContext, useContext, useState, useEffect } from 'react';
import { wrap } from "comlink";
import cadWorker from "../worker/worker.js?worker";
import GlobalVariables from "../js/globalvariables.js";

const RenderStateContext = createContext();

export const useRenderState = () => {
  const context = useContext(RenderStateContext);
  if (!context) {
    throw new Error('useRenderState must be used within a RenderStateProvider');
  }
  return context;
};

const cad = wrap(new cadWorker());

export const RenderStateProvider = ({ children }) => {
  // Rendering state
  const [size, setSize] = useState(5);
  const [mesh, setMesh] = useState({});
  const [wireMesh, setWireMesh] = useState(null);
  const [outdatedMesh, setOutdatedMesh] = useState(false);
  
  // Progress state
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderBarVisible, setRenderBarVisible] = useState(true);

  // Initialize mesh when size changes
  useEffect(() => {
    cad.createMesh(size).then((m) => {
      setMesh(m);
      setWireMesh(m);
    });
  }, [size]);

  // Progress tracking effect
  useEffect(() => {
    setRenderProgress(0);
    setRenderBarVisible(true);
    let interval = setInterval(() => {
      const molecule = GlobalVariables.topLevelMolecule;
      if (molecule) {
        const [ready, total] = molecule.getCompletionTuple();
        const progress = Math.floor((ready / total) * 100);
        setRenderProgress(progress);
        if (molecule.getState().status === "ready") {
          clearInterval(interval);
        }
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(interval);
  }, [GlobalVariables.topLevelMolecule]);

  // Hide progress bar after completion
  useEffect(() => {
    if (renderProgress >= 100) {
      const timeout = setTimeout(() => {
        setRenderBarVisible(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [renderProgress]);

  /* Creates an element to check with Puppeteer if the molecule is fully loaded*/
  const createPuppeteerDiv = () => {
    // Check if the div already exists
    const existingDiv = document.getElementById(
      "molecule-fully-render-puppeteer"
    );
    if (!existingDiv) {
      // If it doesn't exist, create it
      const invisibleDiv = document.createElement("div");
      invisibleDiv.id = "molecule-fully-render-puppeteer";
      invisibleDiv.style.display = "none";
      document.body.appendChild(invisibleDiv);
    }
  };

  // Setup display function
  useEffect(() => {
    GlobalVariables.writeToDisplay = (id, resetView = false) => {
      setOutdatedMesh(true);
      if (resetView) {
        cad
          .resetView()
          .then((m) => {
            setMesh(m);
            setWireMesh(m);
            setOutdatedMesh(false);
            setRenderProgress(100);
          })
          .catch((e) => {
            console.error("reset view not working" + e);
          });
      } else {
        console.log("Generating mesh for id:", id);
        cad
          .generateDisplayMesh(id)
          .then((m) => {
            setMesh(m);
            setOutdatedMesh(false);
          })
          .catch((e) => {
            console.error("Can't display Mesh " + e);
            // Note: activeAtom is not available here - would need to be passed from context
          });
        /*Set wireMesh*/
        //Exception: Don't display the mesh if the thing we are displaying is already the output
        if (GlobalVariables.currentMolecule.uniqueID != id) {
          cad
            .generateDisplayMesh(GlobalVariables.currentMolecule.uniqueID)
            .then((w) => {
              setWireMesh(w);
              // Only create Puppeteer div when displaying the top-level molecule's output
              if (id === GlobalVariables.topLevelMolecule?.uniqueID) {
                createPuppeteerDiv();
              }
            })
            .catch((e) => {
              console.error("Can't compute Wireframe/No output " + e);
              // Create div even on error for top-level molecule to prevent hanging
              if (id === GlobalVariables.topLevelMolecule?.uniqueID) {
                createPuppeteerDiv();
              }
            });
        } else {
          /* reset mesh view if in output mode*/
          cad
            .resetView()
            .then((m) => {
              setWireMesh(m);
              // Create Puppeteer div when in output mode (displaying top-level molecule)
              createPuppeteerDiv();
            })
            .catch((e) => {
              console.error("reset view not working" + e);
              // Create div even on error to prevent hanging
              createPuppeteerDiv();
            });
        }
      }
    };

    GlobalVariables.cad = cad;
  }, []); // Remove activeAtom dependency for now

  const value = {
    // Rendering state
    size,
    setSize,
    mesh,
    setMesh,
    wireMesh,
    setWireMesh,
    outdatedMesh,
    setOutdatedMesh,
    
    // Progress state
    renderProgress,
    setRenderProgress,
    renderBarVisible,
    setRenderBarVisible,
    
    // CAD instance
    cad,
  };

  return (
    <RenderStateContext.Provider value={value}>
      {children}
    </RenderStateContext.Provider>
  );
};