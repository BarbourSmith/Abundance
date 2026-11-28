import { useState, useEffect } from "react";
import { SimpleControlPanel } from "./SimpleControlPanel";
import GlobalVariables from "../../js/globalvariables.js";
import { useControls } from "../../hooks/useControls";
import { useRendering } from "../../contexts/index.js";
import { useAppState } from "../../contexts/index.js";

// Grid/Axis icon for RenderMenu
const GridAxisIcon = ({ size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="4"
      stroke="#c4a3d5"
      strokeWidth="2"
      fill="#181c23"
    />
    <line x1="3" y1="12" x2="21" y2="12" stroke="#a18fcf" strokeWidth="1.5" />
    <line x1="12" y1="3" x2="12" y2="21" stroke="#a18fcf" strokeWidth="1.5" />
    <circle
      cx="12"
      cy="12"
      r="2.5"
      fill="#c4a3d5"
      stroke="#a18fcf"
      strokeWidth="1"
    />
  </svg>
);

export default function RenderMenu({
  position,
  id,
  contentCollapsed,
  collapsedOffset,
  setContentCollapsed,
  closeMenu,
}) {
  const {
    gridParam,
    axesParam,
    wireParam,
    solidParam,
    setGrid,
    setAxes,
    setWire,
    setSolid,
    showTopLevelWireframe,
    setShowTopLevelWireframe,
    activeTags,
    setActiveTags,
  } = useRendering();
  const [inputChanged, setInputChanged] = useState("");
  const [availableTags, setAvailableTags] = useState([]);

  const { activeAtom } = useAppState();

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

  // Create tag toggle controls for menu
  const tagControls = {};

  if (activeAtom?.topLevel) {
    availableTags.forEach((tag) => {
      tagControls[`tag-${tag}`] = {
        type: "boolean",
        label: tag,
        value: activeTags.has(tag),
        onChange: (isActive) => {
          setActiveTags((prevActiveTags) => {
            const newActiveTags = new Set(prevActiveTags);
            if (isActive) {
              newActiveTags.add(tag);
            } else {
              newActiveTags.delete(tag);
            }
            return newActiveTags;
          });
        },
      };
    });
  }

  // Children keys for the tag group
  const tagChildrenKeys = availableTags.map((tag) => `tag-${tag}`);

  /** Creates Leva panel with grid settings */
  const renderSettings = {
    ...(activeAtom?.topLevel && {
      tagsGroup: {
        type: "group",
        label: "Tags",
        defaultCollapsed: true,
        children: tagChildrenKeys,
      },
    }),
    ...tagControls,
    grid: {
      value: gridParam,
      label: "Grid",
      type: "boolean",
      onChange: (value) => {
        setGrid(value);
      },
    },
    axes: {
      value: axesParam,
      label: "Axes",
      type: "boolean",
      onChange: (value) => {
        setAxes(value);
      },
    },
    wire: {
      value: wireParam,
      label: "Output Context",
      type: "boolean",
      onChange: (value) => {
        setWire(value);
      },
    },
    wireframe: {
      value: solidParam,
      label: "Wireframe",
      type: "boolean",
      onChange: (value) => {
        setSolid(value);
      },
    },
    topLevelContext: {
      value: showTopLevelWireframe,
      label: "Top Level Context",
      type: "boolean",
      onChange: (value) => {
        setShowTopLevelWireframe(value);
      },
    },
    screenshot: {
      type: "button",
      label: "📸 Set New Project Thumbnail",
      onClick: () => {
        if (GlobalVariables.captureHighResScreenshot) {
          GlobalVariables.captureHighResScreenshot(1000, 1000); // Capture a 4K screenshot
        }
      },
    },
  };

  const [
    values,
    setControlValue,
    { controls, registerControl, removeControl },
  ] = useControls(renderSettings, [
    inputChanged,
    showTopLevelWireframe,
    availableTags,
    activeAtom,
  ]);

  const screenHeight = window.innerHeight;

  return (
    <div>
      <SimpleControlPanel
        controls={controls}
        id={id}
        position={position || { top: screenHeight / 2 + 10, left: 10 }}
        collapsedOffset={collapsedOffset || [45, 0]}
        title={"Render Controls"}
        initialCollapsed={true}
        minWidth={280}
        contentCollapsed={contentCollapsed}
        setContentCollapsed={setContentCollapsed}
        closeMenu={closeMenu}
        collapsedIcon={GridAxisIcon}
        activeAtom={activeAtom}
      />
    </div>
  );
}
