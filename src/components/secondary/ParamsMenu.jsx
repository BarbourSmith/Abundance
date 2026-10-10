import React from "react";
import { useEffect, useState, useMemo } from "react";
import { SimpleControlPanel } from "./SimpleControlPanel";
import { useControls } from "../../hooks/useControls";
import { useAppState } from "../../contexts/index.js";
import { useAuth } from "../../contexts/AuthContext";
import { unitAbbreviation } from "../../js/units.js";

export default function ParamsMenu({
  position,
  id,
  contentCollapsed,
  setContentCollapsed,
  panelRef,
  closeMenu,
  initialCollapsed = false,
  collapsedOffset = [0, 0],
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
  const { authorizedUserOcto, userScopes } = useAuth();

  const [inputChanged, setInputChanged] = useState("");

  let inputParams = {};
  let predictedParams = {};

  if (activeAtom) {
    inputParams = activeAtom.createInputParams(
      setInputChanged,
      authorizedUserOcto,
      userScopes,
    );
    //inputParams = unusedDefault;
    predictedParams = activeAtom.createPredictedParams();
  }

  const inputParamsConfig = useMemo(() => {
    return { ...inputParams, ...predictedParams };
  }, [inputParams, predictedParams]);

  const [
    values,
    setControlValue,
    { controls, registerControl, removeControl },
  ] = useControls(inputParamsConfig, [activeAtom, inputChanged]);

  const screenHeight = window.innerHeight;

  // Flag GitHub molecules made in other units than the project
  let unitsBadge;
  if (
    activeAtom?.atomType === "GitHubMolecule" &&
    activeAtom.hasUnitMismatch()
  ) {
    const source = activeAtom.unitsKey;
    const host = activeAtom.getHostUnits();
    unitsBadge = {
      label: unitAbbreviation(source),
      title: activeAtom.scaleToProjectUnits
        ? `This molecule takes inputs in ${source}. Its output is scaled to ${host}.`
        : `This molecule takes inputs in ${source}. Its output is not scaled to ${host}.`,
    };
  }

  return (
    <div>
      <SimpleControlPanel
        controls={controls}
        id={id}
        position={position || { top: screenHeight / 2 - 10, left: 10 }}
        title={activeAtom?.name || "Controls"}
        minWidth={280}
        initialCollapsed={initialCollapsed}
        maxHeight={screenHeight / 2}
        contentCollapsed={contentCollapsed}
        setContentCollapsed={setContentCollapsed}
        ref={panelRef}
        closeMenu={closeMenu}
        collapsedOffset={collapsedOffset}
        collapsedIcon={AtomIcon}
        activeAtom={activeAtom}
        badge={unitsBadge}
      />
      {/* <button onClick={handleAddControl} style={{ marginTop: 16 }}>
        Add Custom Control
      </button>
      <div style={{ marginTop: 40 }}>
        <strong>Current Values:</strong>
        <pre>{JSON.stringify(values, null, 2)}</pre>
      </div>*/}
    </div>
  );
}
