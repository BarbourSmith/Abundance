import React, { useEffect, useState } from "react";

export function formatParamsOutput(value) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return String(value);
}

const INDENT = "  ";

const flyoutStyle = {
  position: "fixed",
  width: 360,
  minWidth: 280,
  maxWidth: 420,
  maxHeight: "calc(100vh - 120px)",
  background: "var(--abundance-color-background)",
  border: "1px solid #272a31",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(20,24,31,0.22)",
  overflow: "hidden",
  zIndex: 30,
  color: "#e0e5ef",
  fontFamily: "JetBrains Mono, monospace",
  display: "flex",
  flexDirection: "column",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid #31343b",
  background: "var(--abundance-color-background)",
};

const titleStyle = {
  flex: 1,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--abundance-color-mainPurple)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const actionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 15,
  flexShrink: 0,
  color: "#c4a3d5",
};

const bodyStyle = {
  padding: 12,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  background: "var(--abundance-color-background)",
};

const lineBaseStyle = {
  display: "block",
  width: "100%",
  border: "none",
  background: "transparent",
  color: "var(--control-text)",
  font: "inherit",
  textAlign: "left",
  padding: 0,
  margin: 0,
  lineHeight: 1.4,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const clickableLineStyle = {
  ...lineBaseStyle,
  cursor: "pointer",
};

const mutedStyle = {
  color: "var(--control-text-muted)",
};

function indent(level) {
  return INDENT.repeat(level);
}

function isPrimitive(value) {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatInlineArray(values) {
  return `[${values.map((item) => formatParamsOutput(item)).join(", ")}]`;
}

function isPrimitiveArray(values) {
  return Array.isArray(values) && values.every(isPrimitive);
}

function InlineLine({ level, text, clickable = false, onClick, title, ariaExpanded }) {
  const style = clickable ? clickableLineStyle : lineBaseStyle;
  return clickable ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={ariaExpanded}
      style={style}
    >
      {indent(level)}{text}
    </button>
  ) : (
    <div style={style}>{indent(level)}{text}</div>
  );
}

function Node({ label, value, level = 0, isRoot = false }) {
  const [expanded, setExpanded] = useState(false);

  if (isPrimitive(value)) {
    const text = label ? `${label}: ${formatParamsOutput(value)}` : formatParamsOutput(value);
    return <InlineLine level={level} text={text} />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      const text = label ? `${label}: []` : `[]`;
      return <InlineLine level={level} text={text} />;
    }

    if (isPrimitiveArray(value)) {
      const text = label ? `${label}: ${formatInlineArray(value)}` : formatInlineArray(value);
      return <InlineLine level={level} text={text} />;
    }

    if (!expanded) {
      const text = label ? `> ${label}: [${value.length}]` : `> [${value.length}]`;
      return (
        <InlineLine
          level={level}
          text={text}
          clickable
          onClick={() => setExpanded(true)}
          title={`Expand ${label || "list"}`}
          ariaExpanded={false}
        />
      );
    }

    return (
      <>
        <InlineLine
          level={level}
          text={label ? `v ${label}: [` : `v [`}
          clickable
          onClick={() => setExpanded(false)}
          title={`Collapse ${label || "list"}`}
          ariaExpanded={true}
        />
        {value.map((item, index) => (
          <Node key={index} label={String(index)} value={item} level={level + 1} />
        ))}
        <InlineLine level={level} text="]" />
      </>
    );
  }

  if (isObject(value)) {
    const entries = Object.entries(value);

    if (isRoot) {
      if (entries.length === 0) {
        return <InlineLine level={level} text="{}" />;
      }

      return (
        <>
          {entries.map(([key, childValue]) => (
            <Node key={key} label={key} value={childValue} level={level} />
          ))}
        </>
      );
    }

    if (entries.length === 0) {
      const text = label ? `${label}: {}` : `{}`;
      return <InlineLine level={level} text={text} />;
    }

    if (!expanded) {
      const text = label ? `> ${label}: {...}` : `> {...}`;
      return (
        <InlineLine
          level={level}
          text={text}
          clickable
          onClick={() => setExpanded(true)}
          title={`Expand ${label || "object"}`}
          ariaExpanded={false}
        />
      );
    }

    return (
      <>
        <InlineLine
          level={level}
          text={label ? `v ${label}: {` : `v {`}
          clickable
          onClick={() => setExpanded(false)}
          title={`Collapse ${label || "object"}`}
          ariaExpanded={true}
        />
        {entries.map(([key, childValue]) => (
          <Node key={key} label={key} value={childValue} level={level + 1} />
        ))}
        <InlineLine level={level} text="}" />
      </>
    );
  }

  return <InlineLine level={level} text={formatParamsOutput(value)} />;
}

function OutputBody({ value, status }) {
  if (status && status !== "ready") {
    return <div style={lineBaseStyle}>Output unavailable while atom is {status.replaceAll("_", " ")}.</div>;
  }

  if (value === null || value === undefined) {
    return <div style={lineBaseStyle}>No output available.</div>;
  }

  return <Node value={value} isRoot level={0} />;
}

function formatClipboardJson(value) {
  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => (typeof currentValue === "bigint" ? currentValue.toString() : currentValue),
      2,
    );
  } catch (_error) {
    return formatParamsOutput(value);
  }
}



export default function ParamsOutputFlyout({
  value,
  status,
  atomName,
  style,
  onClose,
}) {
  const [copyState, setCopyState] = useState("idle");

  useEffect(() => {
    if (copyState !== "copied") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const handleCopy = () => {
    navigator.clipboard.writeText(formatClipboardJson(value)).then(() => {
      setCopyState("copied");
    });
  };

  return (
    <div style={{ ...flyoutStyle, ...style }} role="dialog" aria-label="Atom output preview">
      <div style={headerStyle}>
        <div style={titleStyle}>{atomName ? `${atomName} Output` : "Output"}</div>
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              border: "none",
              background: "transparent",
              color: copyState === "copied" ? "var(--abundance-color-mainPurple)" : "var(--control-text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 0,
            }}
            aria-label={copyState === "copied" ? "Copied JSON to clipboard" : "Copy JSON to clipboard"}
            title={copyState === "copied" ? "Copied" : "Copy JSON to clipboard"}
          >
            {copyState === "copied" ? "✓" : "⧉"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--control-text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 0,
            }}
            aria-label="Close output preview"
            title="Close output preview"
          >
            ×
          </button>
        </div>
      </div>
      <div style={bodyStyle}>
        <OutputBody value={value} status={status} />
      </div>
    </div>
  );
}
