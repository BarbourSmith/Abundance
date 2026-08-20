import React, { useMemo, useState } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { useNavigate } from "react-router-dom";

const buttonTextStyle = {
  fontSize: "12px",
  padding: "0 5px 0 5px",
  color: "#c4a3d5",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const normalizeRepo = (repo) => {
  if (!repo) return null;

  const owner =
    typeof repo.owner === "string" ? repo.owner : (repo.owner?.login ?? null);
  const repoName = repo.name ?? repo.repoName ?? repo.repo ?? null;

  if (!owner || !repoName) return null;
  return { owner, repoName };
};

function ChangeMode({
  buttons = [],
  containerClassName,
  setActiveAtom,
  targetRepo,
  setIsReturningFromMode,
}) {
  const [hoveredButton, setHoveredButton] = useState(null);
  const navigate = useNavigate();

  const previewOriginProject = useMemo(() => {
    const originProject = sessionStorage.getItem("previewOriginProject");
    if (!originProject) return null;

    try {
      return JSON.parse(originProject);
    } catch (error) {
      console.error("Error parsing origin project:", error);
      return null;
    }
  }, []);

  const resetActiveAtom = () => {
    if (setActiveAtom && GlobalVariables.topLevelMolecule) {
      setActiveAtom(GlobalVariables.topLevelMolecule);
    }
  };

  const findFirstValidRepo = (priorityRepo) => {
    const repoCandidates = [
      priorityRepo,
      targetRepo,
      GlobalVariables.currentRepo,
      GlobalVariables.currentAWSnode,
    ];

    for (const repoCandidate of repoCandidates) {
      const normalizedRepo = normalizeRepo(repoCandidate);
      if (normalizedRepo) return normalizedRepo;
    }

    return null;
  };

  const generateButtonKey = (button, index) =>
    button.key ??
    button.id ??
    button.label ??
    button.title ??
    `button-${index}`;

  // Defer route changes until the current render cycle has completed.
  const navigateDeferred = (path, options) => {
    setTimeout(() => {
      navigate(path, options);
    }, 0);
  };

  const restorePreviewOriginProject = () => {
    if (!previewOriginProject?.owner || !previewOriginProject?.repoName) {
      console.warn("Preview origin project missing required properties:", {
        owner: previewOriginProject?.owner,
        repoName: previewOriginProject?.repoName,
      });
      return false;
    }

    GlobalVariables.currentAWSnode = {
      owner: previewOriginProject.owner,
      repoName: previewOriginProject.repoName,
    };
    sessionStorage.removeItem("previewOriginProject");
    navigateDeferred(
      `/${previewOriginProject.owner}/${previewOriginProject.repoName}`,
    );
    return true;
  };

  const handleButtonClick = (button) => (event) => {
    event.preventDefault();

    const repo = findFirstValidRepo(button.targetRepo);

    if (typeof button.beforeNavigate === "function") {
      button.beforeNavigate({ repo, resetActiveAtom });
    }

    switch (button.action) {
      case "run":
        setIsReturningFromMode(true);
        //resetActiveAtom();
        if (repo) navigateDeferred(`/run/${repo.owner}/${repo.repoName}`);
        break;
      case "create":
        setIsReturningFromMode(true);
        resetActiveAtom();
        if (repo) navigateDeferred(`/${repo.owner}/${repo.repoName}`);
        break;
      case "create-from-pull":
        // Returning from pull request - don't try localStorage, just load fresh from GitHub
        resetActiveAtom();
        if (repo) navigateDeferred(`/${repo.owner}/${repo.repoName}`);
        break;
      case "preview":
        setIsReturningFromMode(true);
        if (repo) navigateDeferred(`/preview/${repo.owner}/${repo.repoName}`);

        break;
      case "browse":
        resetActiveAtom();
        navigateDeferred("/", { state: { fromRunMode: true } });
        break;
      case "preview-back":
        setIsReturningFromMode(true);
        resetActiveAtom();
        if (restorePreviewOriginProject()) {
          break;
        }

        if (repo) navigateDeferred(`/run/${repo.owner}/${repo.repoName}`);
        break;
      default:
        break;
    }
  };

  const renderedButtons = buttons.map((button, index) => {
    const key = generateButtonKey(button, index);
    const label =
      button.label ??
      (button.action === "preview-back"
        ? previewOriginProject
          ? "Back to Project"
          : "Back to Run Mode"
        : null);
    const title =
      button.title ??
      (button.action === "preview-back"
        ? previewOriginProject
          ? "Back to Original Project"
          : "Back to Run Mode"
        : undefined);
    const iconRotation = button.iconRotation;

    return (
      <label
        key={key}
        title={button.tooltipText ? undefined : title}
        className={button.wrapperClassName ?? "switch_run"}
      >
        <button
          id={button.id}
          onClick={handleButtonClick(button)}
          onMouseEnter={() => setHoveredButton(key)}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {button.showIcon === false ? null : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform:
                  iconRotation === null || iconRotation === undefined
                    ? undefined
                    : `rotate(${iconRotation}deg)`,
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
          )}
          {label ? (
            <p style={button.textStyle ?? buttonTextStyle}>{label}</p>
          ) : null}
          {button.tooltipText && hoveredButton === key ? (
            <span className="runmode-tooltip">{button.tooltipText}</span>
          ) : null}
        </button>
      </label>
    );
  });

  if (!renderedButtons.length) return null;

  if (containerClassName) {
    return <div className={containerClassName}>{renderedButtons}</div>;
  }

  return renderedButtons;
}

export default ChangeMode;
