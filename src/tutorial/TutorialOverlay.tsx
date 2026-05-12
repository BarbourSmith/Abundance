import React from "react";
import { useTutorial } from "./TutorialManager";
import { createPortal } from "react-dom";
import { Global } from "@emotion/react";
import GlobalVariables from "../js/globalvariables";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
export const TutorialOverlay: React.FC = () => {
  const { currentStep, isActive, next, back, complete } = useTutorial();

  const abundanceSVG = (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" stroke="#d368cdff" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="#d368cdff" />
      <circle cx="12" cy="12" r="2" fill="#fff" />
    </svg>
  );

  if (!isActive || !currentStep) return null;
  // Calculate highlight rectangle and overlay positions
  const [lastClick, setLastClick] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  // Support offset from step (e.g. {top, left, width, height})
  let highlightRect = null;

  const offset = currentStep.offset || {};
  if (currentStep.target === "userClick" && GlobalVariables.lastClick) {
    // Create a 100x100px rect centered on the click
    const size = 100;
    highlightRect = {
      top: GlobalVariables.lastClick.y - size / 2 + (offset.top || 0),
      left: GlobalVariables.lastClick.x - size / 2 + (offset.left || 0),
      width: offset.width || size,
      height: offset.height || size,
      borderRadius: 8,
    };
  } else if (currentStep.target === "customHighlight1") {
    //custom output atom highlight
    const size = 100;
    highlightRect = {
      top: window.innerHeight / 7,
      left: window.innerWidth - 100,
      width: offset.width || size,
      height: offset.height || size,
      borderRadius: 8,
    };
  } else if (currentStep.target === "customHighlight2") {
    //custom input atom
    const size = 300;
    highlightRect = {
      top: 10,
      left: 0,
      width: window.innerHeight / 2,
      height: offset.height || size,
      borderRadius: 8,
    };
  } else if (currentStep.target === "customHighlight3") {
    //custom run mode canvas
    highlightRect = {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      borderRadius: 8,
    };
  } else if (currentStep.target === "orbitControls") {
    //custom input atom
    const size = 400;
    highlightRect = {
      top: window.innerHeight - size / 2 - 50,
      left: window.innerWidth - size / 2 - 50,
      width: window.innerHeight / 2,
      height: offset.height || size,
      borderRadius: 8,
    };
  } else if (currentStep.target === "gitpanel") {
    //custom input atom
    const size = 400;
    highlightRect = {
      top: window.innerHeight / 2 - 10,
      left: 10,
      width: offset.width || size,
      height: offset.height || size,
      borderRadius: 8,
    };
  } else if (currentStep.target === "other-params-panels") {
    //custom other parameters panels highlight
    const size = 100;
    highlightRect = {
      top: window.innerHeight / 2 - 10,
      left: 10,
      width: offset.width || size,
      height: offset.height || size,
      borderRadius: 8,
    };
  } else if (currentStep.target) {
    const el = document.querySelector(currentStep.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      highlightRect = {
        top: rect.top + (offset.top || 0),
        left: rect.left + (offset.left || 0),
        width: rect.width + (offset.width || 0),
        height: rect.height + (offset.height || 0),
        borderRadius: 8,
      };
    }
  }

  // Ensure overlay-root exists (should always be true if you added it to index.html)
  const portalRoot = document.getElementById("overlay-root");
  if (!portalRoot) return null;

  // Fallback: only if no highlightRect and overlay !== 'full'
  const showFallback = !highlightRect && currentStep.overlay !== "full";

  const overlayContent = (
    <div>
      {showFallback ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            zIndex: 10000,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              boxShadow:
                "0 0 0 10px var(--abundance-color-mainPurple) inset, 0 2px 16px rgba(0,0,0,0.15)",
              padding: "2rem 2.5rem",
              textAlign: "center",
              zIndex: 10002,
              minWidth: 320,
              maxWidth: 420,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 12 }}>
              Oops! Something went wrong.
            </div>
            <div style={{ marginBottom: 20 }}>
              The tutorial step could not be displayed.
              <br />
              You can go back to the previous step or exit the tutorial.
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              {/* Back arrow */}
              <button
                onClick={back}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 24,
                }}
                aria-label="Previous step"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 18 18"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ transform: "rotate(90deg)" }}
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
              </button>
              {/* Exit (X) button */}
              <button
                onClick={complete}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 28,
                  color: "#d368cdff",
                  fontWeight: 700,
                  marginLeft: 8,
                }}
                aria-label="Exit tutorial"
                title="Exit tutorial"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Four overlay divs to create a window effect */}
          {highlightRect && (
            <>
              {/* Top overlay */}
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: highlightRect.top,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 10000,
                  pointerEvents:
                    currentStep.action === "none" ? "auto" : "none",
                }}
                onClick={currentStep.action === "click" ? next : undefined}
              />
              {/* Left overlay */}
              <div
                style={{
                  position: "fixed",
                  top: highlightRect.top,
                  left: 0,
                  width: highlightRect.left,
                  height: highlightRect.height,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 10000,
                  pointerEvents:
                    currentStep.action === "none" ? "auto" : "none",
                }}
                onClick={currentStep.action === "click" ? next : undefined}
              />
              {/* Right overlay */}
              <div
                style={{
                  position: "fixed",
                  top: highlightRect.top,
                  left: highlightRect.left + highlightRect.width,
                  width: `calc(100vw - ${
                    highlightRect.left + highlightRect.width
                  }px)`,
                  height: highlightRect.height,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 10000,
                  pointerEvents:
                    currentStep.action === "none" ? "auto" : "none",
                }}
                onClick={currentStep.action === "click" ? next : undefined}
              />
              {/* Bottom overlay */}
              <div
                style={{
                  position: "fixed",
                  top: highlightRect.top + highlightRect.height,
                  left: 0,
                  width: "100vw",
                  height: `calc(100vh - ${
                    highlightRect.top + highlightRect.height
                  }px)`,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 10000,
                  pointerEvents:
                    currentStep.action === "none" ? "auto" : "none",
                }}
                onClick={currentStep.action === "click" ? next : undefined}
              />
              {/* Highlight border */}
              <div
                style={{
                  position: "fixed",
                  top: highlightRect.top,
                  left: highlightRect.left,
                  width: highlightRect.width,
                  height: highlightRect.height,
                  border: `2px solid #d368cdff`,
                  borderRadius: highlightRect.borderRadius,
                  boxSizing: "border-box",
                  pointerEvents: "none",
                  zIndex: 10001,
                  boxShadow:
                    "0 0 0 4px rgba(232, 156, 240, 0.5), 0 0 0 8px rgba(0, 0, 0, 0.15)",
                  background: "transparent",
                }}
              />
            </>
          )}
          {/* ...existing message block code... */}
        </>
      )}
      {/* Message */}
      <div
        style={{
          boxShadow:
            "0 0 0 10px var(--abundance-color-mainPurple) inset" /* Creates a 10px red inner border */,
          position: "fixed",
          background: "#fff",
          height: currentStep.messagePosition?.height ?? "auto",
          borderRadius: 12,
          padding: "2rem 1.5rem",

          zIndex: 10002,
          maxWidth: 420,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // Position relative to highlight rect if overlay is highlight
          ...(currentStep.overlay === "highlight" && highlightRect
            ? {
                top:
                  highlightRect.top +
                  highlightRect.height +
                  16 +
                  (currentStep.messagePosition?.top ?? 0),
                left:
                  highlightRect.left +
                  highlightRect.width / 2 +
                  (currentStep.messagePosition?.left ?? 0),
                transform: "translateX(-50%)",
              }
            : {}),
          // Center for full overlay
          ...(currentStep.overlay === "full"
            ? {
                top: `calc(50% + ${currentStep.messagePosition?.top ?? 0}px)`,
                left: `calc(50% + ${currentStep.messagePosition?.left ?? 0}px)`,
                transform: "translate(-50%, -50%)",
              }
            : {}),
        }}
      >
        {/* Tooltip arrow */}
        {currentStep.messageArrow && (
          <div
            style={{
              position: "absolute",
              ...(currentStep.messageArrow === "top" && {
                top: -16,
                left: "50%",
                transform: "translateX(-50%)",
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: "16px solid var(--abundance-color-mainPurple)",
              }),
              ...(currentStep.messageArrow === "bottom" && {
                bottom: -16,
                left: "50%",
                transform: "translateX(-50%)",
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop: "16px solid var(--abundance-color-mainPurple)",
              }),
              ...(currentStep.messageArrow === "left" && {
                left: -16,
                top: "50%",
                transform: "translateY(-50%)",
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderRight: "16px solid var(--abundance-color-mainPurple)",
              }),
              ...(currentStep.messageArrow === "right" && {
                right: -16,
                top: "50%",
                transform: "translateY(-50%)",
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderLeft: "16px solid var(--abundance-color-mainPurple)",
              }),
              width: 0,
              height: 0,
              zIndex: 10003,
            }}
          />
        )}
        {/* Left arrow button for back */}
        <button
          onClick={back}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            marginRight: 12,
            padding: 0,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Previous step"
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
        </button>
        <div style={{ flex: 1, marginRight: currentStep.svgDiagram ? 24 : 0 }}>
          <div style={{ marginBottom: 16 }}>
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
              {currentStep.message}
            </ReactMarkdown>
          </div>

          <button
            onClick={complete}
            className="exit-tutorial-button"
            style={{ background: "#eee" }}
          >
            Exit Tutorial
          </button>
        </div>
        {currentStep.svgDiagram && (
          <div style={{ flex: "0 0 auto", marginLeft: 8 }}>
            <img
              src={`/diagrams/${currentStep.svgDiagram}`}
              alt="Tutorial diagram"
              style={{ width: 50, height: 50, marginBottom: 16 }}
            />
          </div>
        )}

        <button
          onClick={next}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            marginLeft: 5,
            padding: 0,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Next step"
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
        </button>
      </div>
    </div>
  );
  return createPortal(overlayContent, portalRoot);
};
