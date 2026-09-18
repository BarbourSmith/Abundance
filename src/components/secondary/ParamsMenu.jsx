import React from "react";
import { useEffect, useState, useMemo, useRef } from "react";
import { SimpleControlPanel } from "./SimpleControlPanel";
import { useControls } from "../../hooks/useControls";
import { useAppState } from "../../contexts/index.js";
import { useAuth } from "../../contexts/AuthContext";
import ParamsOutputFlyout from "./ParamsOutputFlyout";

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
  const previewButtonRef = useRef(null);
  const previewFlyoutRef = useRef(null);
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
  const [showOutputPreview, setShowOutputPreview] = useState(false);

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
  const atomState = activeAtom?.getState?.();
  const atomOutputValue = atomState?.value;
  const previewStatus = atomState?.status;

  useEffect(() => {
    if (!showOutputPreview) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (
        previewFlyoutRef.current &&
        previewFlyoutRef.current.contains(event.target)
      ) {
        return;
      }

      if (
        previewButtonRef.current &&
        previewButtonRef.current.contains(event.target)
      ) {
        return;
      }

      if (panelRef?.current && panelRef.current.contains(event.target)) {
        return;
      }

      setShowOutputPreview(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [panelRef, showOutputPreview]);

  const previewAnchorRect = panelRef?.current?.getBoundingClientRect?.();
  const previewStyle = previewAnchorRect
    ? {
        top: previewAnchorRect.top,
        left: Math.min(
          previewAnchorRect.right + 12,
          Math.max(16, window.innerWidth - 380),
        ),
        maxHeight: Math.max(240, window.innerHeight - previewAnchorRect.top - 16),
      }
    : {
        top: (position?.top || screenHeight / 2 - 10) + 8,
        left: (position?.left || 10) + 320,
        maxHeight: screenHeight / 2,
      };

  useEffect(() => {
    setShowOutputPreview(false);
  }, [activeAtom]);

  const previewHeaderActions = (
    <button
      ref={previewButtonRef}
      type="button"
      onClick={() => setShowOutputPreview((current) => !current)}
      style={{
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        background: showOutputPreview
          ? "var(--abundance-color-transparentHighlight)"
          : "transparent",
        cursor: "pointer",
        border: "none",
        padding: 0,
      }}
      title="Preview atom output"
      aria-label="Preview atom output"
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect
          x="3"
          y="4"
          width="14"
          height="12"
          rx="2"
          stroke="var(--control-text-muted)"
          strokeWidth="1.6"
        />
        <path
          d="M6 8h8M6 11h5"
          stroke="var(--control-text-muted)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  return (
    <div style={{ position: "relative" }}>
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
        headerActions={previewHeaderActions}
      />
      {showOutputPreview && (
        <div ref={previewFlyoutRef}>
          <ParamsOutputFlyout
            value={atomOutputValue}
            status={previewStatus}
            atomName={activeAtom?.name}
            style={previewStyle}
            onClose={() => setShowOutputPreview(false)}
          />
        </div>
      )}
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
