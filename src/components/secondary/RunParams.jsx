import { useEffect, useState, useMemo } from "react";
import { SimpleControlPanel } from "./SimpleControlPanel.jsx";
import { useControls } from "../../hooks/useControls";
import { useAppState } from "../../contexts/index.js";
import GlobalVariables from "../../js/globalvariables.js";

export default function RunParams({
  position,
  id,
  contentCollapsed,
  setContentCollapsed,
  panelRef,
  closeMenu,
  initialCollapsed = false,
  collapsedOffset = [0, 0],
  setReadMe,
  setBillOfMaterials,
}) {
  // Molecule icon: large circle with a smaller center circle
  const AtomIcon = ({ size = 20 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer molecule circle */}
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="var(--control-text-muted)"
        strokeWidth="2"
        fill="var(--panel-background)"
      />
      {/* Center dot */}
      <circle
        cx="10"
        cy="10"
        r="3.2"
        fill="#949294"
        stroke="#949294"
        strokeWidth="1"
      />
    </svg>
  );
  const { activeAtom } = useAppState();

  const [inputChanged, setInputChanged] = useState("");

  let inputParams = {};
  let exportParams = {};

  if (activeAtom) {
    // Add a text control for the top-level molecule description
    inputParams = {
      moleculeDescription: {
        type: "markdown",
        label: "Description",
        value: GlobalVariables.currentAWSnode.description || "",
        order: 0,
        disabled: true,
      },
      /* Exclude certain parameters from the run molecule's input params */
      ...Object.fromEntries(
        Object.entries(activeAtom.createInputParams(setInputChanged)).filter(
          ([key, param]) =>
            param.label !== "Molecule Name" &&
            param.label !== "Molecule Readme" &&
            param.label !== "Molecule BOM" &&
            param.label !== "Reload from Github",
        ),
      ),
    };
    exportParams = activeAtom.createExportMenuInputs(setInputChanged);

    inputParams["molecule name" + activeAtom.uniqueID + "units"] = {
      type: "label",
      value: GlobalVariables.topLevelMolecule?.unitsKey || "MM",
      label: "Project Units",
    };

    // Add a button at the end to see the project readme
    inputParams.seeProjectReadme = {
      type: "button",
      label: "See Project Readme",
      order: 9999,
      onClick: () => {
        setReadMe();
      },
    };

    inputParams.seeBillOfMaterials = {
      type: "button",
      label: "See Bill of Materials",
      order: 10000,
      onClick: () => {
        setBillOfMaterials();
      },
    };
  }

  const inputParamsConfig = useMemo(() => {
    return { ...exportParams, ...inputParams };
  }, [inputParams, exportParams]);

  const [
    values,
    setControlValue,
    { controls, registerControl, removeControl },
  ] = useControls(inputParamsConfig, [activeAtom, inputChanged]);

  const screenHeight = window.innerHeight;

  return (
    <div>
      <SimpleControlPanel
        controls={controls}
        id={id}
        position={position || { top: screenHeight / 2 - 10, left: 30 }}
        title={activeAtom?.name || "Controls"}
        minWidth={300}
        initialCollapsed={initialCollapsed}
        maxHeight={screenHeight / 1.5}
        contentCollapsed={contentCollapsed}
        setContentCollapsed={setContentCollapsed}
        ref={panelRef}
        closeMenu={closeMenu}
        collapsedOffset={collapsedOffset}
        collapsedIcon={AtomIcon}
      />
    </div>
  );
}
