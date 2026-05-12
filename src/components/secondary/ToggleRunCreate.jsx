import React, { useState } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { Link, useNavigate } from "react-router-dom";

function ToggleRunCreate({ run, isItOwned, isPreview, setActiveAtom }) {
  const [runModeon, setRunMode] = useState(run);
  const [showTooltip, setShowTooltip] = useState(false);
  const navigate = useNavigate();
  const handleChange = () => {
    // set ActiveAtom to toplevel when switching modes
    if (setActiveAtom) {
      setActiveAtom(GlobalVariables.topLevelMolecule);
    }
    setRunMode(!runModeon);
  };

  const handleCreateToRun = (e) => {
    // Save current project state to localStorage before switching to Run mode
    // This preserves unsaved changes when toggling between Create and Run modes
    // Note: owner and repoName come from GitHub's API and are validated by GitHub
    if (
      GlobalVariables.topLevelMolecule &&
      GlobalVariables.currentAWSnode?.owner &&
      GlobalVariables.currentAWSnode?.repoName
    ) {
      const projectState = GlobalVariables.topLevelMolecule.serialize();
      projectState.filetypeVersion = 1;
      const projectKey = `unsavedProject_${GlobalVariables.currentAWSnode.owner}_${GlobalVariables.currentAWSnode.repoName}`;
      localStorage.setItem(projectKey, JSON.stringify(projectState));
    }
    handleChange();
  };
  const handleBrowseProjects = (e) => {
    e.preventDefault();
    handleChange();
    // Save current project state to localStorage before navigating
    // Note: owner and repoName come from GitHub's API and are validated by GitHub
    if (
      GlobalVariables.topLevelMolecule &&
      GlobalVariables.currentAWSnode?.owner &&
      GlobalVariables.currentAWSnode?.repoName
    ) {
      const projectState = GlobalVariables.topLevelMolecule.serialize();
      projectState.filetypeVersion = 1;
      const projectKey = `unsavedProject_${GlobalVariables.currentAWSnode.owner}_${GlobalVariables.currentAWSnode.repoName}`;
      localStorage.setItem(projectKey, JSON.stringify(projectState));
    }
    navigate("/", { state: { fromRunMode: true } });
  };
  const handlePreviewCreateMode = (e) => {
    e.preventDefault();
    if (GlobalVariables.currentRepo) {
      navigate(
        `/preview/${GlobalVariables.currentRepo.owner.login}/${GlobalVariables.currentRepo.name}`,
      );
    }
  };
  const handleBackToRunMode = (e) => {
    e.preventDefault();
    // Reset activeAtom to topLevelMolecule before navigating so RunMode's first
    // render never sees a stale non-Molecule atom that lacks createExportMenuInputs.
    if (setActiveAtom && GlobalVariables.topLevelMolecule) {
      setActiveAtom(GlobalVariables.topLevelMolecule);
    }

    // If coming from preview of a project, return to the original project in create mode
    const originProject = sessionStorage.getItem("previewOriginProject");
    if (isPreview && originProject) {
      try {
        const { owner, repoName } = JSON.parse(originProject);
        GlobalVariables.currentAWSnode = { owner, repoName };
        sessionStorage.removeItem("previewOriginProject");
        navigate(`/${owner}/${repoName}`);
        return;
      } catch (e) {
        console.error("Error parsing origin project:", e);
      }
    }

    // Default: navigate to preview project's run mode or current repo's run mode
    if (GlobalVariables.currentRepo) {
      navigate(
        `/run/${GlobalVariables.currentRepo.owner.login}/${GlobalVariables.currentRepo.name}`,
      );
    }
  };
  if (GlobalVariables.currentRepo) {
    if (!runModeon) {
      if (isPreview) {
        const originProject = sessionStorage.getItem("previewOriginProject");
        const backButtonTitle = originProject
          ? "Back to Original Project"
          : "Back to Run Mode";
        return (
          <label title={backButtonTitle} className="back_to_runmode">
            <button id="back-to-run-mode-btn" onClick={handleBackToRunMode}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  transform: "rotate(-90deg)",
                  alignSelf: "center",
                  display: "block",
                }}
              >
                <polyline
                  points="5,7 9,13 13,7"
                  fill="none"
                  stroke="#c4a3d5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p
                style={{
                  fontSize: "12px",
                  padding: "0 5px 0 5px",
                  color: "#c4a3d5",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                }}
              >
                {originProject ? "Back to Project" : "Back to Run Mode"}
              </p>
            </button>
          </label>
        );
      }
      return (
        <>
          <Link
            key={
              GlobalVariables.currentRepo
                ? GlobalVariables.currentRepo.id
                : null
            }
            to={
              GlobalVariables.currentRepo
                ? `/run/${GlobalVariables.currentRepo.owner.login}/${GlobalVariables.currentRepo.name}`
                : "/run"
            }
            onClick={handleCreateToRun}
            style={{ position: "absolute" }}
          >
            <label className="switch runmode-tooltip-container">
              <button
                id="run-mode-btn"
                title="Switch to Run Mode"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: "rotate(-90deg)",
                    alignSelf: "center",
                    display: "block",
                  }}
                >
                  <polyline
                    points="5,7 9,13 13,7"
                    fill="none"
                    stroke="#c4a3d5"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {showTooltip && (
                  <span className="runmode-tooltip">RUN MODE</span>
                )}
              </button>
            </label>
          </Link>
        </>
      );
    } else {
      return (
        <>
          {isItOwned ? (
            <Link
              key={GlobalVariables.currentRepo.id}
              to={`/${GlobalVariables.currentRepo.owner.login}/${GlobalVariables.currentRepo.name}`}
              onClick={handleChange}
            >
              <label title="Create/Run Mode" className="switch_run">
                <button id="create-mode-btn">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: "rotate(90deg)",
                      alignSelf: "center",
                      display: "block",
                    }}
                  >
                    <polyline
                      points="5,7 9,13 13,7"
                      fill="none"
                      stroke="#c4a3d5"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p
                    style={{
                      fontSize: "12px",
                      padding: "0 5px 0 5px",
                      color: "#c4a3d5",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  >
                    Create Mode
                  </p>
                </button>
              </label>
            </Link>
          ) : (
            <div className="switch_run_stack">
              <label title="Preview Create Mode" className="switch_run">
                <button
                  id="preview-create-mode-btn"
                  onClick={handlePreviewCreateMode}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: "rotate(90deg)",
                      alignSelf: "center",
                      display: "block",
                    }}
                  >
                    <polyline
                      points="5,7 9,13 13,7"
                      fill="none"
                      stroke="#c4a3d5"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p
                    style={{
                      fontSize: "12px",
                      padding: "0 5px 0 5px",
                      color: "#c4a3d5",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  >
                    Preview Create Mode
                  </p>
                </button>
              </label>
              <label title="Browse Projects" className="switch_run">
                <button id="create-mode-btn" onClick={handleBrowseProjects}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: "rotate(90deg)",
                      alignSelf: "center",
                      display: "block",
                    }}
                  >
                    <polyline
                      points="5,7 9,13 13,7"
                      fill="none"
                      stroke="#c4a3d5"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p
                    style={{
                      fontSize: "12px",
                      padding: "0 5px 0 5px",
                      color: "#c4a3d5",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  >
                    Browse Projects
                  </p>
                </button>
              </label>
            </div>
          )}
        </>
      );
    }
  }
}

export default ToggleRunCreate;
