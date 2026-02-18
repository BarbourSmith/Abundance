// Eye icon for button controls
const EyeIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <ellipse
      cx="10"
      cy="10"
      rx="8"
      ry="5"
      stroke="#8ea9ff"
      strokeWidth="2"
      fill="none"
    />
    <circle cx="10" cy="10" r="2.5" fill="#8ea9ff" />
  </svg>
);
import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  use,
} from "react";
import { useControls } from "../../hooks/useControls";
import ReactMarkdown from "react-markdown";
import TrashCanIcon from "../icons/TrashCanIcon";
import { max } from "mathjs";

// SVG icons (Settings, X, CaretDown)
const SettingsIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <circle
      cx="10"
      cy="10"
      r="8"
      stroke="var(--control-text-muted)"
      strokeWidth="2"
    />
    <path
      d="M10 7v3l2 2"
      stroke="var(--control-text-muted)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const XIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <line x1="6" y1="6" x2="14" y2="14" stroke="#8ea9ff" strokeWidth="2" />
    <line x1="14" y1="6" x2="6" y2="14" stroke="#8ea9ff" strokeWidth="2" />
  </svg>
);

const CaretDownIcon = ({ size = 12, collapsed }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    style={{
      transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
      transition: "transform 0.2s",
    }}
  >
    <polyline
      points="7 9 10 12 13 9"
      fill="none"
      stroke="#c4a3d5"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// CSS variable-driven styles
const panelVars = {
  "--panel-background": "var(--abundance-color-background)",
  "--panel-foreground": "#e0e5ef",
  "--panel-border": "#272a31",
  "--panel-separator": "#31343b",
  "--control-background-hover": "#292e3b",
  "--control-text": "#e0e5ef",
  "--control-text-muted": "#c4a3d5",
  "--control-accent": "#c4a3d5",
};

const getPanelStyle = (minWidth) => ({
  position: "absolute",
  background: "var(--panel-background)",
  border: "1px solid var(--panel-border)",
  boxShadow: "0 4px 16px rgba(20,24,31,0.16)",
  borderRadius: 8,
  minWidth,
  padding: 0,
  zIndex: 10,
  fontFamily: "JetBrains Mono, monospace",
  color: "var(--panel-foreground)",
  userSelect: "none",
  transition: "box-shadow 0.2s",
});

const panelTitleStyle = {
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: "0.5px",
  color: "var(--abundance-color-mainPurple)",
  width: "100%",
  overflowX: "hidden",
};

const collapsedStyle = {
  ...getPanelStyle(380),
  width: 38,
  height: 38,
  minWidth: 0,
  minHeight: 0,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  cursor: "pointer",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "7px 12px 7px 38px",
  borderBottom: "1px solid var(--panel-separator)",
  background: "var(--panel-background)",
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  height: 24,
};

const getControlListStyle = (maxHeight) => ({
  padding: "12px",
  background: "var(--panel-background)",
  maxHeight: `${maxHeight - 50}px`,
  overflowY: "auto",
});

const labelStyle = {
  display: "flex",
  alignItems: "center",
  fontSize: 14,
  fontWeight: 500,
  marginBottom: 8,
  gap: 10,
};

const inputStyle = {
  padding: "4px 8px",
  fontSize: 14,
  borderRadius: 4,
  border: "1px solid #333741",
  background: "#242834",
  color: "#e0e5ef",
  outline: "none",
  transition: "border 0.2s, box-shadow 0.2s",
  flex: "1 1 0",
  width: "100%",
};

const inputDisabledStyle = {
  color: "var(--control-text-muted)",
  background: "#232832",
  cursor: "not-allowed",
  opacity: 0.7,
};

const inputFocusedStyle = {
  border: "2px solid var(--abundance-color-brightPurple)",
  boxShadow: "0 0 0 2px var(--abundance-color-transparentHighlight)",
};

const checkboxStyle = {
  width: 30,
  height: 18,
  accentColor: "white",
  marginLeft: 80,
  marginRight: 0,
  backgroundColor:
    "var(--abundance-color-lightPurple)" /* Background for checked state */,
  borderColor: "#cfa1cfff" /* Border for checked state */,
};

const selectStyle = {
  ...inputStyle,
  minWidth: 70,
};

const colorStyle = {
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "1px solid var(--abundance-color-brightPurple)",
  padding: 0,
  background: "#181c23",
  marginLeft: 6,
  marginRight: 6,
  cursor: "pointer",
};

const footerStyle = {
  padding: "7px 12px",
  borderTop: "1px solid var(--panel-separator)",
  background: "var(--panel-background)",
  fontSize: 12,
  color: "var(--control-text-muted)",
  borderBottomLeftRadius: 8,
  borderBottomRightRadius: 8,
  opacity: 0.7,
};

const arrowButtonStyle = {
  position: "absolute",
  top: 8,
  left: 8,
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  background: "var(--panel-background)",
  cursor: "pointer",
  border: "none",
  padding: 0,
  transition: "background 0.2s",
};

const closeButtonStyle = {
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  background: "transparent",
  cursor: "pointer",
  border: "none",
  padding: 0,
  transition: "background 0.2s",
};

/**
 * @param {{
 *   controls: Record<string, any>,
 *   id?: string,
 *   position?: React.CSSProperties,
 *   panelId?: string
 * }} props
 */
export const SimpleControlPanel = forwardRef(function SimpleControlPanel(
  {
    controls,
    id = "simple-control-panel",
    position = { top: 40, left: 40 },
    panelId,
    title = "CONTROLS",
    initialCollapsed = false,
    minWidth = 280,
    maxHeight = 340, // <-- new prop
    collapsedIcon = SettingsIcon, // new prop, defaults to SettingsIcon
    collapsedOffset = [0, 0], // new prop: [x, y] offset for expanded panel
    contentCollapsed,
    setContentCollapsed,
    closeMenu,
  },
  ref,
) {
  // Collapsed panel state
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [activeEye, setActiveEye] = useState({});
  // Sync collapsed state with contentCollapsed if initialCollapsed is true
  useEffect(() => {
    if (initialCollapsed) {
      setCollapsed(contentCollapsed);
    }
  }, [contentCollapsed, initialCollapsed]);

  useImperativeHandle(ref, () => ({
    triggerPanelKeyDown: (event) => {
      handlePanelKeyDown(event);
    },
  }));
  const [controlValues, setControlValue, { controls: registeredControls }] =
    useControls(controls, [controls]);

  // Focus management
  const controlKeys = Object.keys(controls);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [focusedListItem, setFocusedListItem] = useState({});
  const [focusedAxis, setFocusedAxis] = useState({});
  const inputRefs = React.useRef([]);

  // Local state for deferred input updates
  const [localValues, setLocalValues] = React.useState({});

  // Debounce timer for input changes
  const debounceTimeout = React.useRef();

  // Debounced onChange helper
  const handleDebouncedChange = (value, key, onChange) => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      onChange(value, key);
    }, 300); // 300ms delay
  };

  // Handle immediate local updates for display
  const handleLocalChange = (key, value) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
  };

  // Commit changes to actual control values
  const commitChange = (key, value, config) => {
    // For number types, validate that the value is not NaN
    if (
      config.type === "number" ||
      config.type === "range" ||
      config.type === "rangeSlider"
    ) {
      if (isNaN(value) || value === null || value === undefined) {
        // Invalid number - revert to previous valid value
        setLocalValues((prev) => {
          const next = { ...prev };
          delete next[key]; // Remove from local state to show committed value
          return next;
        });
        return; // Don't commit invalid values
      }
    }

    // For point types, validate all array elements
    if (config.type === "point") {
      if (Array.isArray(value)) {
        const hasInvalidValue = value.some((v) => {
          // Handle intermediate typing states
          if (typeof v === "string" && (v === "" || v === "-")) {
            return false; // Allow intermediate states during typing
          }
          const numValue = Number(v);
          return isNaN(numValue);
        });
        if (hasInvalidValue) {
          // Invalid point - revert to previous valid value
          setLocalValues((prev) => {
            const next = { ...prev };
            delete next[key]; // Remove from local state to show committed value
            return next;
          });
          return; // Don't commit invalid values
        }
      }
    }

    setControlValue(key, value);
    setLocalValues((prev) => {
      const next = { ...prev };
      delete next[key]; // Remove from local state once committed
      return next;
    });

    // Call the onChange callback if it exists
    if (typeof config.onChange === "function") {
      config.onChange(value, key);
    }
  };

  // Only reset focus if the keys of controls change
  const prevControlKeys = React.useRef(Object.keys(controls));
  React.useEffect(() => {
    const newKeys = Object.keys(controls);
    if (
      newKeys.length !== prevControlKeys.current.length ||
      newKeys.some((k, i) => k !== prevControlKeys.current[i])
    ) {
      setFocusedIndex(-1);
      prevControlKeys.current = newKeys;
    }
    setLocalValues({});
  }, [controls]);

  // Only focus input on keyboard event, not on mount/controls change
  const [shouldFocus, setShouldFocus] = React.useState(false);

  // Focus the current control when focusedIndex changes and shouldFocus is true
  React.useEffect(() => {
    if (shouldFocus && inputRefs.current[focusedIndex]) {
      const key = controlKeys[focusedIndex];
      const config = controls[key];
      if (
        config &&
        config.type === "point" &&
        Array.isArray(inputRefs.current[focusedIndex])
      ) {
        if (typeof focusedAxis[key] === "number") {
          inputRefs.current[focusedIndex][focusedAxis[key]]?.focus();
        }
      } else if (inputRefs.current[focusedIndex]?.focus) {
        inputRefs.current[focusedIndex].focus();
      }
      setShouldFocus(false);
    }
  }, [focusedIndex, controlKeys.length, shouldFocus, focusedAxis]);

  // Listen for keyboard events on the panel to trigger focus
  const handlePanelKeyDown = (e) => {
    // Just pass through to handleKeyDown - it will set shouldFocus as needed
    handleKeyDown(e);
  };

  // Keyboard navigation (skip disabled inputs)
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      let next = focusedIndex + 1;
      while (
        next < controlKeys.length &&
        (controls[controlKeys[next]]?.disabled || !inputRefs.current[next])
      ) {
        next++;
      }
      if (next < controlKeys.length) {
        setFocusedIndex(next);
        setShouldFocus(true);
      }
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      let prev = focusedIndex - 1;
      while (
        prev >= 0 &&
        (controls[controlKeys[prev]]?.disabled || !inputRefs.current[prev])
      ) {
        prev--;
      }
      if (prev >= 0) {
        setFocusedIndex(prev);
        setShouldFocus(true); // Ensure focus is applied
      }
      e.preventDefault();
    }
  };

  return (
    <div
      id={id}
      style={{
        ...panelVars,
        ...(collapsed
          ? { ...collapsedStyle, ...position }
          : {
              ...getPanelStyle(minWidth),
              ...position,
              maxHeight: maxHeight ? `${maxHeight}px` : undefined,
              maxWidth: minWidth ? `${minWidth}px` : undefined,
              overflowY: maxHeight ? "clip" : undefined,
              top:
                (typeof position.top === "number"
                  ? position.top
                  : parseInt(position.top || 0, 10)) + collapsedOffset[1],
              left:
                (typeof position.left === "number"
                  ? position.left
                  : parseInt(position.left || 0, 10)) + collapsedOffset[0],
            }),
      }}
      tabIndex={-1}
    >
      {/* Collapsed panel */}
      {collapsed && (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => (setCollapsed(false), setContentCollapsed())}
          title={`Open ${title}`}
        >
          {React.createElement(collapsedIcon, { size: 18 })}
        </div>
      )}
      {/* Expanded panel */}
      {!collapsed && (
        <>
          {/* Collapse/expand arrow */}
          <button
            style={arrowButtonStyle}
            onClick={() => {
              setCollapsed((c) => !c);
            }}
            title="Collapse Panel"
          >
            <SettingsIcon size={15} />
          </button>
          {/* Panel header */}
          <div style={headerStyle}>
            <div style={panelTitleStyle}>{title}</div>
            <div style={{ display: "flex", gap: 5 }}>
              <button
                style={arrowButtonStyle}
                onClick={() => {
                  if (contentCollapsed) {
                    setContentCollapsed();
                    if (initialCollapsed) setCollapsed(false);
                  } else if (initialCollapsed) {
                    // Allow collapsing to icon only for panels that start collapsed
                    setCollapsed(true);
                  } else {
                    closeMenu();
                  }
                }}
                title={
                  contentCollapsed
                    ? "Open controls"
                    : initialCollapsed
                      ? "Collapse panel"
                      : "Active"
                }
              >
                <CaretDownIcon size={14} collapsed={contentCollapsed} />
              </button>
            </div>
          </div>
          {/* Controls */}
          {!contentCollapsed && (
            <div style={getControlListStyle(maxHeight)}>
              {controlKeys.map((key, idx) => {
                const config = controls[key];
                const label = config.label;
                const inputFullWidth = !label;
                const handleChange = (value) => {
                  // For types that should be deferred, only update local state
                  if (
                    config.type === "string" ||
                    config.type === "number" ||
                    config.type === "range" ||
                    config.type === "point"
                  ) {
                    handleLocalChange(key, value);
                  } else {
                    // For other types (boolean, select, color, etc.), commit immediately
                    setControlValue(key, value);
                    if (typeof config.onChange === "function") {
                      config.onChange(value, key);
                    }
                  }
                };

                // Get the current value - use local value if editing, otherwise committed value
                const currentValue = localValues.hasOwnProperty(key)
                  ? localValues[key]
                  : (controlValues[key] ?? config.value);
                const isFocused = focusedIndex === idx && !config.disabled;
                const isDisabled = config.disabled;
                const commonProps = {
                  ref: (el) => (inputRefs.current[idx] = el),
                  tabIndex: isDisabled ? -1 : 0,
                  onFocus: isDisabled
                    ? undefined
                    : (e) => {
                        setFocusedIndex(idx);
                        if (typeof e.target.select === "function") {
                          e.target.select(); // Only call for inputs/textareas
                        }
                      },
                  onBlur: () => {
                    commitChange(key, currentValue, config);
                  },
                  style: isDisabled
                    ? { ...inputStyle, ...inputDisabledStyle }
                    : isFocused
                      ? { ...inputStyle, ...inputFocusedStyle }
                      : inputStyle,
                  disabled: isDisabled,
                };
                switch (config.type) {
                  case "spacer":
                    return (
                      <div
                        key={key}
                        style={{
                          width: "100%",
                          minHeight: 1,
                          margin: "12px 0",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "stretch",
                        }}
                      >
                        <hr
                          style={{
                            border: 0,
                            borderTop: "1px solid var(--panel-separator)",
                            margin: 0,
                            width: "100%",
                          }}
                        />
                        <div style={{ height: config.height || 12 }} />
                      </div>
                    );
                  case "point":
                    return (
                      <div key={key} style={labelStyle}>
                        <span
                          style={{
                            width: 90,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                          }}
                        >
                          {label}:
                        </span>
                        {["X", "Y", "Z"].map((axis, axisIdx) => {
                          const currentArrayValue = localValues.hasOwnProperty(
                            key,
                          )
                            ? localValues[key]
                            : Array.isArray(controlValues[key])
                              ? controlValues[key]
                              : [0, 0, 0];

                          return (
                            <input
                              key={axis}
                              type="number"
                              value={currentArrayValue[axisIdx] ?? 0}
                              onChange={(e) => {
                                if (!isDisabled) {
                                  const val = Number(e.target.value);
                                  // Allow intermediate typing states
                                  if (
                                    e.target.value === "" ||
                                    e.target.value === "-"
                                  ) {
                                    const arr = [...currentArrayValue];
                                    arr[axisIdx] = e.target.value;
                                    handleLocalChange(key, arr);
                                  } else {
                                    const arr = [...currentArrayValue];
                                    arr[axisIdx] = val;
                                    handleLocalChange(key, arr);
                                  }
                                }
                              }}
                              onBlur={() => {
                                // Commit changes when leaving the input
                                const arr = [...currentArrayValue];
                                // Ensure all values are valid numbers
                                for (let i = 0; i < arr.length; i++) {
                                  const numValue = Number(arr[i]);
                                  // Only set to number if it's valid, otherwise use fallback
                                  if (!isNaN(numValue)) {
                                    arr[i] = numValue;
                                  } else {
                                    // Get the committed value from controlValues as fallback
                                    const committedValue = Array.isArray(
                                      controlValues[key],
                                    )
                                      ? controlValues[key][i]
                                      : 0;
                                    arr[i] = committedValue;
                                  }
                                }
                                commitChange(key, arr, config);

                                setFocusedAxis((fa) => ({
                                  ...fa,
                                  [key]: undefined,
                                }));
                              }}
                              onFocus={() => {
                                setFocusedAxis((fa) => ({
                                  ...fa,
                                  [key]: axisIdx, // Set to the axis you clicked
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !isDisabled) {
                                  const val = Number(e.target.value);
                                  const arr = [...currentArrayValue];
                                  arr[axisIdx] = val;
                                  commitChange(key, arr, config);
                                  e.preventDefault();
                                }
                              }}
                              {...commonProps}
                              style={
                                isDisabled
                                  ? {
                                      ...inputStyle,
                                      ...inputDisabledStyle,
                                      width: 50,
                                      marginRight: 4,
                                    }
                                  : focusedAxis[key] === axisIdx && isFocused
                                    ? {
                                        ...inputStyle,
                                        ...inputFocusedStyle,
                                        width: 50,
                                        marginRight: 4,
                                      }
                                    : {
                                        ...inputStyle,
                                        width: 50,
                                        marginRight: 4,
                                      }
                              }
                              ref={(el) => {
                                if (!inputRefs.current[idx])
                                  inputRefs.current[idx] = [];
                                inputRefs.current[idx][axisIdx] = el;
                              }}
                              tabIndex={isDisabled ? -1 : 0}
                              disabled={isDisabled}
                              aria-label={axis}
                            />
                          );
                        })}
                      </div>
                    );
                  case "number":
                    return (
                      <div key={key} style={{ ...labelStyle }}>
                        <span
                          style={{
                            width: inputFullWidth ? 0 : 90,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                          }}
                        >
                          {label}
                          {label ? ":" : ""}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            width: "100%",
                          }}
                        >
                          <input
                            type="number"
                            value={currentValue ?? 0}
                            onChange={(e) => {
                              const numValue = Number(e.target.value);
                              // Allow empty string for intermediate state while typing
                              if (
                                e.target.value === "" ||
                                e.target.value === "-"
                              ) {
                                handleLocalChange(key, e.target.value);
                              } else {
                                handleLocalChange(key, numValue);
                              }
                            }}
                            onBlur={(e) => {
                              const numValue = Number(e.target.value);
                              commitChange(key, numValue, config);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const numValue = Number(e.target.value);
                                commitChange(key, numValue, config);
                                e.preventDefault();
                              }
                            }}
                            {...commonProps}
                            style={{
                              ...inputStyle,
                              width: 70,
                              marginRight: 4,
                              ...(isDisabled ? inputDisabledStyle : {}),
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            <button
                              type="button"
                              style={{
                                width: 18,
                                height: 18,
                                padding: 0,
                                border: "none",
                                background: "#232832",
                                color: "#c4a3d5",
                                borderRadius: 2,
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isDisabled ? 0.5 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              disabled={isDisabled}
                              tabIndex={isDisabled ? -1 : 0}
                              aria-label="Increment"
                              onClick={() => {
                                if (isDisabled) return;
                                let step = config.step ?? 1;
                                let val = Number(currentValue ?? 0);
                                if (isNaN(val)) val = 0;
                                const newVal = val + step;
                                handleLocalChange(key, newVal);
                                commitChange(key, newVal, config);
                              }}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              style={{
                                width: 18,
                                height: 18,
                                padding: 0,
                                border: "none",
                                background: "#232832",
                                color: "#c4a3d5",
                                borderRadius: 2,
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isDisabled ? 0.5 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              disabled={isDisabled}
                              tabIndex={isDisabled ? -1 : 0}
                              aria-label="Decrement"
                              onClick={() => {
                                if (isDisabled) return;
                                let step = config.step ?? 1;
                                let val = Number(currentValue ?? 0);
                                if (isNaN(val)) val = 0;
                                const newVal = val - step;
                                handleLocalChange(key, newVal);
                                commitChange(key, newVal, config);
                              }}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  case "list":
                    return (
                      <div
                        key={key}
                        style={{
                          ...labelStyle,
                          flexDirection: "column",
                          alignItems: "flex-start",
                        }}
                        tabIndex={0}
                        ref={(el) => (inputRefs.current[idx] = el)}
                        onFocus={() => setFocusedIndex(idx)}
                        onBlur={() =>
                          setFocusedListItem({
                            ...focusedListItem,
                            [key]: -1,
                          })
                        }
                        onKeyDown={(e) => {
                          // If a list item is focused, handle Arrow keys for items
                          const itemCount = config.value.length;
                          const itemIdx = focusedListItem[key];

                          if (itemIdx !== undefined && itemIdx !== -1) {
                            if (e.key === "ArrowDown") {
                              if (itemIdx < itemCount - 1) {
                                setFocusedListItem({
                                  ...focusedListItem,
                                  [key]: itemIdx + 1,
                                });
                                e.preventDefault();
                              } else {
                                // At last item, move to next input
                                setFocusedListItem({
                                  ...focusedListItem,
                                  [key]: -1,
                                });
                                if (idx < controlKeys.length - 1) {
                                  setFocusedIndex(idx + 1);
                                  inputRefs.current[idx + 1]?.focus();
                                }
                                e.preventDefault();
                              }
                            } else if (e.key === "ArrowUp") {
                              if (itemIdx > 0) {
                                setFocusedListItem({
                                  ...focusedListItem,
                                  [key]: itemIdx - 1,
                                });
                                e.preventDefault();
                              } else {
                                // At first item, move to previous input
                                setFocusedListItem({
                                  ...focusedListItem,
                                  [key]: -1,
                                });
                                if (idx > 0) {
                                  setFocusedIndex(idx - 1);
                                  inputRefs.current[idx - 1]?.focus();
                                }
                                e.preventDefault();
                              }
                            } else if (e.key === "Escape") {
                              setFocusedListItem({
                                ...focusedListItem,
                                [key]: -1,
                              });
                              inputRefs.current[idx]?.focus();
                              e.preventDefault();
                            } else if (e.key === "Enter") {
                              if (config.onItemClick && itemIdx !== -1) {
                                const item = config.value[itemIdx];
                                config.onItemClick(item, itemIdx, e);
                              }
                            }
                          } else {
                            // If no item is focused, ArrowDown moves to first item
                            if (e.key === "ArrowDown" && itemCount > 0) {
                              setFocusedListItem({
                                ...focusedListItem,
                                [key]: 0,
                              });
                              e.preventDefault();
                            } else if (e.key === "ArrowUp") {
                              // ArrowUp from input moves to previous input
                              if (idx > 0) {
                                setFocusedIndex(idx - 1);
                                inputRefs.current[idx - 1]?.focus();
                              }
                              e.preventDefault();
                            }
                          }
                        }}
                      >
                        <span
                          style={{
                            width: inputFullWidth ? 0 : 90,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                          }}
                        >
                          {label}
                          {label ? ":" : ""}
                        </span>
                        <ul
                          style={{
                            width: "100%",
                            padding: 0,
                            margin: 0,
                            listStyle: "none",
                          }}
                        >
                          {Array.isArray(config.value)
                            ? config.value.map((item, itemIdx) => (
                                <li
                                  key={itemIdx}
                                  tabIndex={-1}
                                  style={{
                                    background:
                                      focusedListItem[key] === itemIdx
                                        ? "#292e3b"
                                        : undefined,
                                    outline:
                                      focusedListItem[key] === itemIdx
                                        ? "2px solid var(--abundance-color-brightPurple)"
                                        : undefined,
                                    padding: "6px 10px",
                                    cursor: config.onItemClick
                                      ? "pointer"
                                      : "default",
                                  }}
                                  onClick={(e) => {
                                    if (config.onItemClick)
                                      config.onItemClick(item, itemIdx, e);
                                    setFocusedListItem({
                                      ...focusedListItem,
                                      [key]: -1,
                                    });
                                  }}
                                  onFocus={() =>
                                    setFocusedListItem({
                                      ...focusedListItem,
                                      [key]: itemIdx,
                                    })
                                  }
                                  onMouseOver={() => {
                                    if (config.onItemMouseOver)
                                      config.onItemMouseOver(item, itemIdx);
                                    setFocusedListItem({
                                      ...focusedListItem,
                                      [key]: itemIdx,
                                    });
                                  }}
                                  onMouseOut={() => {
                                    if (config.onItemMouseOut)
                                      config.onItemMouseOut(item, itemIdx);
                                    setFocusedListItem({
                                      ...focusedListItem,
                                      [key]: -1,
                                    });
                                  }}
                                  onKeyDown={(e) => {
                                    if (config.onItemKeyDown)
                                      config.onItemKeyDown(item, itemIdx, e);
                                  }}
                                  onBlur={() =>
                                    setFocusedListItem({
                                      ...focusedListItem,
                                      [key]: -1,
                                    })
                                  }
                                >
                                  {config.itemRenderer
                                    ? config.itemRenderer(item, itemIdx, {
                                        /* handlers */
                                      })
                                    : String(item)}
                                </li>
                              ))
                            : null}
                        </ul>
                      </div>
                    );

                  case "range":
                    return (
                      <div key={key} style={labelStyle}>
                        <span
                          style={{
                            width: 90,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                          }}
                        >
                          {label}:
                        </span>
                        <input
                          type="number"
                          value={currentValue ?? 0}
                          min={config.min}
                          max={config.max}
                          step={config.step}
                          onChange={(e) => {
                            const numValue = Number(e.target.value);
                            // Allow empty string for intermediate state while typing
                            if (
                              e.target.value === "" ||
                              e.target.value === "-"
                            ) {
                              handleLocalChange(key, e.target.value);
                            } else {
                              handleLocalChange(key, numValue);
                            }
                          }}
                          onBlur={(e) => {
                            let value = currentValue;
                            if (typeof value === "string") {
                              // If user left an empty string or dash, revert to last committed value
                              value = controlValues[key] ?? config.value ?? 0;
                            }
                            commitChange(key, value, config);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              let value = currentValue;
                              if (typeof value === "string") {
                                value = controlValues[key] ?? config.value ?? 0;
                              }
                              commitChange(key, value, config);
                              e.preventDefault();
                            }
                          }}
                          {...commonProps}
                        />
                      </div>
                    );
                  case "rangeSlider":
                    return (
                      <div key={key} style={labelStyle}>
                        <span
                          style={{
                            width: inputFullWidth ? 0 : "100px",
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                            overflow: "clip",
                          }}
                          title={label}
                        >
                          {label}:
                        </span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            width: "90%",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              flex: 1,
                              gap: 4,
                              width: "90%",
                            }}
                          >
                            <input
                              type="range"
                              value={currentValue ?? config.min ?? 0}
                              min={config.min ?? 0}
                              max={config.max ?? 100}
                              step={config.step ?? 1}
                              onChange={(e) => {
                                const numValue = Number(e.target.value);
                                handleChange(numValue);
                              }}
                              onMouseUp={(e) => {
                                const numValue = Number(e.target.value);
                                commitChange(key, numValue, config);
                              }}
                              onTouchEnd={(e) => {
                                const numValue = Number(e.target.value);
                                commitChange(key, numValue, config);
                              }}
                              disabled={isDisabled}
                              {...commonProps}
                              style={{
                                width: "95%",
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                //accentColor: "var(--control-accent)",
                              }}
                            />
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 11,
                                color: "var(--control-text-muted)",
                              }}
                            >
                              <span>{config.min ?? 0}</span>
                              <span style={{ fontWeight: 600 }}>
                                {currentValue ?? config.min ?? 0}
                              </span>
                              <span>{config.max ?? 100}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  case "boolean":
                    return (
                      <div key={key} style={labelStyle}>
                        <span
                          style={{
                            width: 90,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                          }}
                        >
                          {label}:
                        </span>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            cursor: isDisabled ? "not-allowed" : "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!controlValues[key]}
                            onChange={(e) => handleChange(e.target.checked)}
                            disabled={isDisabled}
                            style={{
                              position: "absolute",
                              opacity: 0,
                              width: 1,
                              height: 1,
                              pointerEvents: "none",
                            }}
                            ref={(el) => (inputRefs.current[idx] = el)}
                            tabIndex={isDisabled ? -1 : 0}
                          />
                          <span
                            style={{
                              width: checkboxStyle.width,
                              height: checkboxStyle.height,
                              marginLeft: checkboxStyle.marginLeft,
                              marginRight: checkboxStyle.marginRight,
                              borderRadius: 5,
                              border: `1px solid ${
                                !!controlValues[key]
                                  ? checkboxStyle.borderColor
                                  : "#888"
                              }`,
                              background: !!controlValues[key]
                                ? checkboxStyle.backgroundColor
                                : "#e4d3e7ff",
                              display: "inline-block",
                              position: "relative",
                              transition: "border 0.2s, background 0.2s",
                              boxSizing: "border-box",
                              opacity: isDisabled ? 0.7 : 1,
                            }}
                          >
                            {!!controlValues[key] && (
                              <svg
                                width={checkboxStyle.width}
                                height={checkboxStyle.height}
                                viewBox="0 0 18 18"
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                }}
                              >
                                <polyline
                                  points="4,9 8,13 14,5"
                                  fill="none"
                                  stroke={checkboxStyle.accentColor}
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                        </label>
                      </div>
                    );
                  case "string":
                    return (
                      <div
                        key={key}
                        style={{
                          ...labelStyle,
                        }}
                      >
                        <span
                          style={{
                            width: inputFullWidth ? 0 : 100,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                            overflow: "clip",
                          }}
                          title={label}
                        >
                          {label}
                          {label ? ":" : ""}
                        </span>
                        {config.multiline ? (
                          <textarea
                            value={currentValue ?? ""}
                            onChange={(e) => handleChange(e.target.value)}
                            onBlur={(e) =>
                              commitChange(key, e.target.value, config)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                commitChange(key, e.target.value, config);
                                e.preventDefault();
                              }
                            }}
                            rows={config.rows || 3}
                            style={{
                              ...inputStyle,
                              minHeight: 60,
                              resize: "vertical",
                              ...(isDisabled ? inputDisabledStyle : {}),
                              ...(isFocused ? inputFocusedStyle : {}),
                            }}
                            ref={(el) => (inputRefs.current[idx] = el)}
                            tabIndex={isDisabled ? -1 : 0}
                            disabled={isDisabled}
                          />
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              width: "100%",
                            }}
                          >
                            <input
                              type="text"
                              value={currentValue ?? ""}
                              placeholder={config.placeholder}
                              onChange={(e) => handleChange(e.target.value)}
                              onBlur={(e) =>
                                commitChange(key, e.target.value, config)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  commitChange(key, e.target.value, config);
                                  e.preventDefault();
                                }
                              }}
                              {...commonProps}
                              style={{
                                ...inputStyle,
                                width:
                                  typeof config.onRemove === "function"
                                    ? 50
                                    : 70,
                                marginRight: 4,
                                ...(isDisabled ? inputDisabledStyle : {}),
                              }}
                            />
                            {!isNaN(Number(currentValue)) &&
                              currentValue !== "" && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 2,
                                  }}
                                >
                                  <button
                                    type="button"
                                    style={{
                                      width: 18,
                                      height: 9,
                                      padding: 0,
                                      border: "none",
                                      background: "#232832",
                                      color: "#c4a3d5",
                                      borderRadius: 2,
                                      cursor: isDisabled
                                        ? "not-allowed"
                                        : "pointer",
                                      opacity: isDisabled ? 0.5 : 1,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                    disabled={isDisabled}
                                    tabIndex={isDisabled ? -1 : 0}
                                    aria-label="Increment"
                                    onClick={() => {
                                      if (isDisabled) return;
                                      let val = Number(currentValue ?? 0);
                                      if (isNaN(val)) val = 0;
                                      const newVal = val + 1;
                                      handleChange(String(newVal));
                                      commitChange(key, String(newVal), config);
                                    }}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    style={{
                                      width: 18,
                                      height: 18,
                                      padding: 0,
                                      border: "none",
                                      background: "#232832",
                                      color: "#c4a3d5",
                                      borderRadius: 2,
                                      cursor: isDisabled
                                        ? "not-allowed"
                                        : "pointer",
                                      opacity: isDisabled ? 0.5 : 1,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                    disabled={isDisabled}
                                    tabIndex={isDisabled ? -1 : 0}
                                    aria-label="Decrement"
                                    onClick={() => {
                                      if (isDisabled) return;
                                      let val = Number(currentValue ?? 0);
                                      if (isNaN(val)) val = 0;
                                      const newVal = val - 1;
                                      handleChange(String(newVal));
                                      commitChange(key, String(newVal), config);
                                    }}
                                  >
                                    ▼
                                  </button>
                                </div>
                              )}
                            {/* Trash can button appended to the right (optional) */}
                            {typeof config.onRemove === "function" && (
                              <button
                                type="button"
                                style={{
                                  width: 24,
                                  height: 24,
                                  marginLeft: 6,
                                  padding: 0,
                                  border: "none",
                                  background: "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  //cursor: isDisabled
                                  //</div>  ? "not-allowed"
                                  //  : "pointer",
                                  //opacity: isDisabled ? 0.5 : 1,
                                }}
                                disabled={false}
                                tabIndex={isDisabled ? -1 : 0}
                                aria-label="Remove"
                                onClick={() => {
                                  config.onRemove(key);
                                }}
                              >
                                <TrashCanIcon size={16} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  case "color":
                    return (
                      <div key={key} style={labelStyle}>
                        <span
                          style={{
                            width: 90,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                          }}
                        >
                          {label}:
                        </span>
                        <input
                          type="color"
                          value={controlValues[key] ?? "#000000"}
                          onChange={(e) => handleChange(e.target.value)}
                          style={
                            isDisabled
                              ? { ...colorStyle, ...inputDisabledStyle }
                              : isFocused
                                ? { ...colorStyle, ...inputFocusedStyle }
                                : colorStyle
                          }
                          ref={(el) => (inputRefs.current[idx] = el)}
                          tabIndex={isDisabled ? -1 : 0}
                          onFocus={
                            isDisabled ? undefined : () => setFocusedIndex(idx)
                          }
                          onBlur={() => {}}
                          disabled={isDisabled}
                        />
                      </div>
                    );
                  case "select":
                    return (
                      <div key={key} style={labelStyle}>
                        <span
                          style={{
                            width: inputFullWidth ? 0 : 70,
                            color: isDisabled
                              ? inputDisabledStyle.color
                              : undefined,
                            overflow: "clip",
                          }}
                        >
                          {label}:
                        </span>
                        <select
                          value={
                            controlValues[key] ??
                            (Array.isArray(config.options)
                              ? config.options[0]
                              : Object.keys(config.options)[0])
                          }
                          onChange={(e) => {
                            // Fallback to previous value if value is empty/null/undefined
                            let value = e.target.value;
                            if (!value) {
                              value =
                                controlValues[key] ??
                                (Array.isArray(config.options)
                                  ? config.options[0]
                                  : Object.keys(config.options)[0]) ??
                                "";
                            }
                            handleChange(value);
                          }}
                          onKeyDown={(e) => {}}
                          onBlur={() => {}}
                          {...commonProps}
                        >
                          {Array.isArray(config.options)
                            ? config.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))
                            : Object.entries(config.options).map(
                                ([val, label]) => (
                                  <option key={val} value={val}>
                                    {label}
                                  </option>
                                ),
                              )}
                        </select>
                      </div>
                    );
                  case "button":
                    return (
                      <div key={key} style={labelStyle}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            width: "100%",
                          }}
                        >
                          <button
                            style={{
                              ...(isDisabled
                                ? {
                                    ...inputStyle,
                                    ...inputDisabledStyle,
                                    cursor: "not-allowed",
                                    fontWeight: 600,
                                    background: "#3e7aff",
                                    color: "#fff",
                                    border: "none",
                                    padding: "6px 16px",
                                  }
                                : isFocused
                                  ? {
                                      ...inputStyle,
                                      ...inputFocusedStyle,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                      background: "#3e7aff",
                                      color: "#fff",
                                      padding: "6px 16px",
                                    }
                                  : {
                                      ...inputStyle,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                      background: "#3e7aff",
                                      color: "#fff",
                                      border: "none",
                                      padding: "6px 16px",
                                    }),
                              ...(config.lowOpacity ? { opacity: 0.5 } : {}),
                            }}
                            title={
                              label ||
                              (typeof config.label === "string"
                                ? config.label
                                : undefined) ||
                              "Button"
                            }
                            onClick={() => {
                              if (typeof config.onClick === "function") {
                                config.onClick(key);
                              }
                            }}
                            ref={(el) => (inputRefs.current[idx] = el)}
                            tabIndex={isDisabled ? -1 : 0}
                            onFocus={
                              isDisabled
                                ? undefined
                                : () => setFocusedIndex(idx)
                            }
                            onBlur={() => {}}
                            disabled={isDisabled}
                          >
                            {config.icon ? config.icon : label || "Button"}
                          </button>
                          {/* Eye icon appended to the right (optional) */}
                          {config.eyeIcon && (
                            <button
                              type="button"
                              style={{
                                width: 24,
                                height: 24,
                                marginLeft: 6,
                                padding: 0,
                                border: `2px solid ${
                                  activeEye[key] ? "#1850bef1" : "transparent"
                                }`,

                                background: activeEye[key]
                                  ? "#e0e5ef"
                                  : "transparent", // Example: highlight when active
                                borderRadius: "20%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isDisabled ? 0.5 : 1,
                              }}
                              disabled={isDisabled}
                              tabIndex={isDisabled ? -1 : 0}
                              aria-label="Preview"
                              onClick={() => {
                                setActiveEye((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }));
                                if (typeof config.eyeIcon === "function") {
                                  config.eyeIcon(key);
                                }
                              }}
                              title={`Preview ${label}`}
                            >
                              <EyeIcon size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  case "buttongroup":
                    return (
                      <div key={key} style={labelStyle}>
                        {config.buttons.map((btn, i) => (
                          <button
                            key={btn.key || i}
                            style={{
                              cursor: isDisabled ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              background: "#3e7aff",
                              color: "#c4c4c4ff",
                              border: "none",
                              padding: "6px 16px",
                              borderRadius: 4,
                              ...inputStyle,
                              ...(isDisabled ? inputDisabledStyle : {}),
                              ...(btn.ghostStyle
                                ? { background: "#d3d3d3ff" }
                                : {}),
                              ...(btn.lowOpacity ? { opacity: 0.5 } : {}),
                            }}
                            title={
                              btn.label ||
                              (typeof btn.label === "string"
                                ? btn.label
                                : undefined) ||
                              "Button"
                            }
                            onClick={() => {
                              if (
                                !isDisabled &&
                                typeof btn.onClick === "function"
                              ) {
                                btn.onClick(btn.key || i);
                              }
                            }}
                            disabled={isDisabled}
                            tabIndex={isDisabled ? -1 : 0}
                          >
                            {btn.icon ? btn.icon : btn.label || "Button"}
                          </button>
                        ))}
                      </div>
                    );
                  case "markdown":
                    return (
                      <div
                        key={key}
                        style={{
                          ...labelStyle,
                          flexDirection: "column",
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            width: "90%",
                            padding: "8px 12px",
                            fontSize: 14,
                            borderRadius: 4,
                            border: "1px solid #333741",
                            background: "#242834",
                            color: "#e0e5ef",
                            maxHeight: config.maxHeight || "300px",
                            overflowY: "auto",
                            lineHeight: "1.6",
                          }}
                        >
                          <ReactMarkdown
                            components={{
                              h1: ({ ...props }) => (
                                <h1
                                  style={{
                                    fontSize: "1.5em",
                                    fontWeight: 600,
                                    marginTop: "16px",
                                    marginBottom: "8px",
                                    color: "#c4a3d5",
                                  }}
                                  {...props}
                                />
                              ),
                              h2: ({ ...props }) => (
                                <h2
                                  style={{
                                    fontSize: "1.3em",
                                    fontWeight: 600,
                                    marginTop: "14px",
                                    marginBottom: "8px",
                                    color: "#dec9e0",
                                  }}
                                  {...props}
                                />
                              ),
                              h3: ({ ...props }) => (
                                <h3
                                  style={{
                                    fontSize: "1.15em",
                                    fontWeight: 600,
                                    marginTop: "12px",
                                    marginBottom: "6px",
                                    color: "#dec9e0",
                                  }}
                                  {...props}
                                />
                              ),
                              p: ({ ...props }) => (
                                <p
                                  style={{ marginTop: 0, marginBottom: "12px" }}
                                  {...props}
                                />
                              ),
                              ul: ({ ...props }) => (
                                <ul
                                  style={{
                                    paddingLeft: "1.5em",
                                    marginTop: 0,
                                    marginBottom: "12px",
                                  }}
                                  {...props}
                                />
                              ),
                              ol: ({ ...props }) => (
                                <ol
                                  style={{
                                    paddingLeft: "1.5em",
                                    marginTop: 0,
                                    marginBottom: "12px",
                                  }}
                                  {...props}
                                />
                              ),
                              li: ({ ...props }) => (
                                <li
                                  style={{ marginTop: "0.25em" }}
                                  {...props}
                                />
                              ),
                              code: ({ inline, ...props }) =>
                                inline ? (
                                  <code
                                    style={{
                                      padding: "0.2em 0.4em",
                                      fontSize: "85%",
                                      backgroundColor:
                                        "rgba(196, 163, 213, 0.2)",
                                      borderRadius: "3px",
                                      color: "#c4a3d5",
                                    }}
                                    {...props}
                                  />
                                ) : (
                                  <code
                                    style={{
                                      display: "block",
                                      padding: "12px",
                                      fontSize: "85%",
                                      backgroundColor: "#3f4243",
                                      borderRadius: "4px",
                                      marginBottom: "12px",
                                      color: "#e0e5ef",
                                      overflowX: "auto",
                                    }}
                                    {...props}
                                  />
                                ),
                              strong: ({ ...props }) => (
                                <strong
                                  style={{ fontWeight: 600, color: "#c4a3d5" }}
                                  {...props}
                                />
                              ),
                              em: ({ ...props }) => (
                                <em
                                  style={{
                                    fontStyle: "italic",
                                    color: "#dec9e0",
                                  }}
                                  {...props}
                                />
                              ),
                              a: ({ ...props }) => (
                                <a
                                  style={{
                                    color: "#be3fe5",
                                    textDecoration: "none",
                                  }}
                                  {...props}
                                />
                              ),
                            }}
                          >
                            {currentValue || ""}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  default:
                    return null;
                }
              })}
              {/* Debug values 
              <div
                style={{
                  marginTop: 18,
                  background: "#202428",
                  padding: "10px 8px",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "#b8bfd1",
                  wordBreak: "break-all",
                  opacity: 0.8,
                }}
              >
                <strong style={{ color: "#6c8cff", fontWeight: 600 }}>
                  Values:
                </strong>
                <pre
                  style={{
                    fontFamily: "Fira Mono, Menlo, monospace",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(filteredControlValues, null, 2)}
                </pre>
              </div>*/}
            </div>
          )}
        </>
      )}
    </div>
  );
});
