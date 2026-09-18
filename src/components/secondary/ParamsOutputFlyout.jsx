import React, { useMemo } from "react";

export function formatParamsOutput(value) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  const valueType = typeof value;

  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "bigint"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  if (valueType === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  return String(value);
}

const flyoutStyle = {
  position: "fixed",
  width: 360,
  minWidth: 280,
  maxWidth: 420,
  background: "var(--abundance-color-background)",
  border: "1px solid #272a31",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(20,24,31,0.22)",
  overflow: "hidden",
  zIndex: 30,
  color: "#e0e5ef",
  fontFamily: "JetBrains Mono, monospace",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 12px",
  borderBottom: "1px solid #31343b",
  background: "var(--abundance-color-background)",
};

const titleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--abundance-color-mainPurple)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const bodyStyle = {
  padding: 12,
  maxHeight: 360,
  overflow: "auto",
  background: "var(--abundance-color-background)",
};

const outputTextStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--control-text)",
};

export default function ParamsOutputFlyout({
  value,
  status,
  atomName,
  style,
  onClose,
}) {
  const outputText = useMemo(() => formatParamsOutput(value), [value]);
  const hasOutput = value !== null && value !== undefined;

  const statusText =
    status && status !== "ready"
      ? `Output unavailable while atom is ${status.replaceAll("_", " ")}.`
      : null;

  return (
    <div style={{ ...flyoutStyle, ...style }} role="dialog" aria-label="Atom output preview">
      <div style={headerStyle}>
        <div style={titleStyle}>{atomName ? `${atomName} Output` : "Output"}</div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--control-text-muted)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
          aria-label="Close output preview"
          title="Close output preview"
        >
          ×
        </button>
      </div>
      <div style={bodyStyle}>
        {statusText ? (
          <p style={outputTextStyle}>{statusText}</p>
        ) : hasOutput ? (
          <pre style={outputTextStyle}>{outputText}</pre>
        ) : (
          <p style={outputTextStyle}>No output available.</p>
        )}
      </div>
    </div>
  );
}