import React, { createContext, useContext, useState, useEffect } from 'react';
import { Octokit } from "https://esm.sh/octokit@2.0.19";
import GlobalVariables from "../js/globalvariables.js";

const AppStateContext = createContext();

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};

export const AppStateProvider = ({ children }) => {
  // Authentication state
  const [isloggedIn, setIsLoggedIn] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizedUserOcto, setAuthorizedUserOcto] = useState(null);

  // UI state
  const [activeAtom, setActiveAtom] = useState(null);
  const [exportPopUp, setExportPopUp] = useState(false);
  const [redirectType, setRedirectType] = useState(null);
  const [shortCutsOn, setShortCuts] = useState(
    localStorage.getItem("shortcuts") === "true"
  );

  // Store shortcuts preference in localStorage
  useEffect(() => {
    localStorage.setItem("shortcuts", shortCutsOn);
  }, [shortCutsOn]);

  // Load project function
  const loadProject = function (project, authorizedUser) {
    GlobalVariables.recentMoleculeRepresentation = [];
    GlobalVariables.undoOperationHistory = [];
    GlobalVariables.loadedRepo = project;
    GlobalVariables.currentRepoName = project.repoName;
    GlobalVariables.currentRepo = project;
    GlobalVariables.totalAtomCount = 0;
    GlobalVariables.numberOfAtomsToLoad = 0;
    GlobalVariables.startTime = new Date().getTime();

    if (authorizedUser) {
      var octokit = authorizedUser;
    } else {
      var octokit = new Octokit();
    }
    return octokit
      .request("GET /repos/{owner}/{repo}/contents/project.abundance", {
        owner: project.owner,
        repo: project.repoName,
      })
      .then(async (response) => {
        let rawFileContent;

        // Handle large files (>1MB) using download_url
        if (!response.data.content || response.data.content.length === 0) {
          const fileResponse = await fetch(response.data.download_url);
          rawFileContent = await fileResponse.text();
        } else {
          // Handle small files using base64 content with UTF-8 encoding
          rawFileContent = GlobalVariables.fromBinaryStr(
            atob(response.data.content)
          );
        }

        let rawFile = JSON.parse(rawFileContent);

        if (rawFile.filetypeVersion == 1) {
          GlobalVariables.topLevelMolecule.deserialize(rawFile);
        } else {
          // Handle old format - for now, try to deserialize directly
          // TODO: Implement convertFromOldFormat if needed
          console.warn("Old file format detected, attempting direct deserialization");
          GlobalVariables.topLevelMolecule.deserialize(rawFile);
        }
        setActiveAtom(GlobalVariables.currentMolecule);
        GlobalVariables.currentMolecule.selected = true;
      })
      .catch((e) => {
        alert("Can't load/find project " + e);
        throw new Error("Can't load/find project " + e);
      });
  };

  const value = {
    // Authentication state
    isloggedIn,
    setIsLoggedIn,
    isAuthorized,
    setIsAuthorized,
    authorizedUserOcto,
    setAuthorizedUserOcto,
    
    // UI state
    activeAtom,
    setActiveAtom,
    exportPopUp,
    setExportPopUp,
    redirectType,
    setRedirectType,
    shortCutsOn,
    setShortCuts,
    
    // Functions
    loadProject,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};