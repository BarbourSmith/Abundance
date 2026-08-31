import { useState, useEffect, useMemo } from "react";
import { SimpleControlPanel } from "./SimpleControlPanel";
import { useControls } from "../../hooks/useControls";
import { useRendering } from "../../contexts/RenderingContext.jsx";
import { useAppState } from "../../contexts/index.js";

import GlobalVariables from "../../js/globalvariables.js";

// Pull Request icon for PullModeMenu
const PullRequestIcon = ({ size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="6" cy="6" r="2" fill="#c4a3d5" />
    <circle cx="6" cy="18" r="2" fill="#c4a3d5" />
    <line x1="8" y1="6" x2="18" y2="6" stroke="#a18fcf" strokeWidth="2" />
    <line x1="8" y1="18" x2="18" stroke="#a18fcf" strokeWidth="2" />
    <line x1="6" y1="8" x2="6" y2="16" stroke="#a18fcf" strokeWidth="2" />
  </svg>
);

export default function PullModeMenu({
  position,
  id,
  contentCollapsed,
  collapsedOffset,
  setContentCollapsed,
  closeMenu,
  baseRepo,
  headRepo,
  prOwner,
  createPullRequest,
  mergePullRequest,
  closePullRequest,
  isMergeSuccessful,
  isCreatingPR,
}) {
  const { activeAtom } = useAppState();
  const [inputChanged, setInputChanged] = useState("");

  const [availableTags, setAvailableTags] = useState([]);

  const { activeTags, setActiveTags } = useRendering();

  // Ensure the menu is expanded when opened
  useEffect(() => {
    setContentCollapsed(false);
  }, []);

  // Sync available tags from molecule and keep activeTags in sync
  useEffect(() => {
    // Get available tags from cached molecule
    const currentAvailableTags =
      GlobalVariables.topLevelMolecule?.projectAvailableTags || [];
    setAvailableTags(currentAvailableTags);

    // Sync activeTags to match available tags (add new ones, remove old ones)
    if (currentAvailableTags.length > 0) {
      const availableTagsSet = new Set(currentAvailableTags);
      const updatedActiveTags = new Set(availableTagsSet);

      const tagsToAdd = currentAvailableTags.filter(
        (tag) => !activeTags.has(tag),
      );
      const tagsToRemove = Array.from(activeTags).filter(
        (tag) => !availableTagsSet.has(tag),
      );

      if (tagsToAdd.length > 0 || tagsToRemove.length > 0) {
        setActiveTags(updatedActiveTags);
      } else if (activeTags.size === 0) {
        // First load: initialize with all available tags
        setActiveTags(availableTagsSet);
      }
    }
  }, [GlobalVariables.topLevelMolecule?.projectAvailableTags]);

  const baseBranch = "main";
  const baseUser = baseRepo.split("/")[0];
  const headUser = headRepo.split("/")[0];
  const headBranch = "main";

  // Create tag toggle controls for menu
  const tagControls = {};

  if (activeAtom?.topLevel) {
    availableTags
      .filter(
        (tag) => tag === "Adding" || tag === "Removing" || tag === "Unchanged",
      )
      .forEach((tag) => {
        tagControls[`tag-${tag}`] = {
          type: "boolean",
          label: tag,
          value: activeTags.has(tag),
          onChange: (isActive) => {
            const newActiveTags = new Set(activeTags);
            if (isActive) {
              newActiveTags.add(tag);
            } else {
              newActiveTags.delete(tag);
            }
            setActiveTags(newActiveTags);
          },
        };
      });
  }
  const labelControls = {
    "label-Head": {
      label: "Head",
      type: "string",
      value: headRepo,
      disabled: true,
    },
    Arrow: {
      type: "string",
      value: "→",
    },
    "label-Base": {
      type: "string",
      label: "Base",
      value: baseRepo,
      disabled: true,
    },
    space: {
      type: "spacer",
    },
  };

  const spacer = {
    type: "spacer",
  };

  const prHeadButtons = {
    gitcompare: {
      type: "button",
      label: "View GitHub Comparison",
      onClick: () => {
        window.open(
          `https://github.com/${baseRepo}/compare/${baseBranch}...${headUser}:${headBranch}`,
        );
      },
    },
    prButton: {
      type: "button",
      label: "Open Pull Request",
      title:
        "Open a new pull request on GitHub to merge changes from the Adding repository into the Removing repository.",
      onClick: () => {
        console.log("Open Pull Request button clicked");
        createPullRequest();
      },
    },
  };
  const prBaseButtons = {
    prOpen: {
      type: "button",
      label: "Open on GitHub",
      onClick: () => {
        window.open(
          `https://github.com/${baseRepo}/compare/${baseBranch}...${headUser}:${headBranch}`,
        );
      },
    },
    mergeButton: {
      type: "button",
      label: "Merge Changes",
      disabled: isMergeSuccessful,
      onClick: () => {
        mergePullRequest();
      },
    },
    closeButton: {
      type: "button",
      label: "Close Pull Request",
      onClick: () => {
        closePullRequest();
      },
    },
  };

  const inputParamsConfig = useMemo(() => {
    // Show merge options only if prOwner is specified (indicating this is the base repo owner)
    const prButtons = prOwner ? { ...prBaseButtons } : { ...prHeadButtons };
    return { ...labelControls, ...tagControls, spacer, ...prButtons };
  }, [labelControls, tagControls, prOwner, isMergeSuccessful, inputChanged]);

  const [values, setControlValue, { controls }] = useControls(
    inputParamsConfig,
    [availableTags, activeAtom, inputChanged, activeTags],
  );

  const screenHeight = window.innerHeight;

  return (
    <div>
      <SimpleControlPanel
        controls={controls}
        id={id}
        position={position || { top: screenHeight / 2 - 10, left: 10 }}
        title={"Pull Request Comparison"}
        minWidth={280}
        initialCollapsed={false}
        maxHeight={screenHeight / 2}
        contentCollapsed={contentCollapsed}
        setContentCollapsed={setContentCollapsed}
        closeMenu={closeMenu}
        collapsedOffset={collapsedOffset || [45, 0]}
        collapsedIcon={PullRequestIcon}
        activeAtom={activeAtom}
      />
    </div>
  );
}
