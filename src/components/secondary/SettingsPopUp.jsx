import React, { useState, useRef, useEffect } from "react";
import Globalvariables from "../../js/globalvariables.js";
import { refreshUnitScaling } from "../../js/units.js";
import CreatableSelect from "react-select/creatable";
import topics from "../../js/maslowTopics.js";
import Switch from "@mui/material/Switch";
import { DevSettingsPanel } from "./DevSettingsModal.jsx";

export const DEVELOPER_TAB_INDEX = 4;

const SettingsPopUp = ({
  setSettingsPopUp,
  initialTab = 0,
  shortCutsOn,
  setShortCuts,
  gridParam,
  axesParam,
  wireParam,
  solidParam,
  setGrid,
  setAxes,
  setWire,
  setSolid,
  backgroundUsdzFile,
  saveProject,
  setSaveState,
  setSavePopUp,
  handleRenameProject,
}) => {
  let repoTopics = [];
  if (Globalvariables.currentAWSnode.topics.length > 0) {
    Globalvariables.currentAWSnode.topics.forEach((topic) => {
      repoTopics.push({ value: topic, label: topic });
    });
  }
  // Controlled state for CreatableSelect
  const [selectedTopics, setSelectedTopics] = useState(repoTopics);
  const projectDescriptionRef = useRef(
    Globalvariables.currentAWSnode.description,
  );
  const dateString = Globalvariables.currentAWSnode.dateCreated;
  const dateCreated = new Date(dateString);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSettingsPopUp(false);
    // Use controlled topics state
    const projectTopic = selectedTopics.map((topic) => topic.value);
    Globalvariables.currentAWSnode.description =
      projectDescriptionRef.current.value;
    setState({
      ...state,
      projectDescription: projectDescriptionRef.current.value,
    });
    Globalvariables.currentAWSnode.topics = projectTopic;

    // Trigger a save to persist the description and topics changes
    // Use forceSave=true to bypass the "no changes" check since description/topics
    // are not part of the molecule serialization
    saveProject(setSaveState, "Settings Save", true, () => setSavePopUp(true));
  };
  const [value, setValue] = React.useState(initialTab);
  useEffect(() => {
    setValue(initialTab);
  }, [initialTab]);

  // Custom Tabs implementation
  const tabLabels = [
    "INFO",
    "CANVAS SETTINGS",
    "PROJECT SETTINGS",
    "RENDER PREFERENCES",
    "ADVANCED",
  ];
  function CustomTabPanel({ children, value, index }) {
    return value === index ? (
      <div className="settings-panel-content">{children}</div>
    ) : null;
  }
  const handleChange = (newValue) => {
    setValue(newValue);
  };

  const [state, setState] = React.useState({
    shortcut: shortCutsOn,
    displaytheme: document.documentElement.classList.contains("dark-theme"),
    fontSize: parseInt(
      Globalvariables.canvasFont.replace("px Work Sans Bold", ""),
      10,
    ),
    atomSize: Globalvariables.atomSize * 1000,
    projectDescription: Globalvariables.currentAWSnode.description,
    autoSaveDisabled: localStorage.getItem("autoSaveDisabled") === "true",
  });

  const handleValueChange = (event) => {
    setState({
      ...state,
      [event.target.name]: event.target.value,
    });
    if (event.target.name === "atomSize") {
      Globalvariables.atomSize = event.target.value / 1000;
      localStorage.setItem("atomSize", event.target.value / 1000);
    }
    if (event.target.name === "projectDescription") {
      Globalvariables.currentAWSnode.description = event.target.value;
    }
    if (event.target.name === "fontSize") {
      Globalvariables.canvasFont = `${event.target.value}px Work Sans Bold`;
      localStorage.setItem(
        "canvasFont",
        `${event.target.value}px Work Sans Bold`,
      );
    }
  };

  const handleCheckChange = (event) => {
    setState({
      ...state,
      [event.target.name]: event.target.checked,
    });
    if (event.target.name === "shortcut") {
      setShortCuts(event.target.checked);
    }
    if (event.target.name === "displaytheme") {
      const dark = event.target.checked;
      document.documentElement.classList.toggle("dark-theme", dark);
      document.documentElement.classList.toggle("light-theme", !dark);
      localStorage.setItem("displayTheme", dark ? "dark-theme" : "light-theme");
    }
  };

  const handleSelectChange = (event) => {
    setState({
      ...state,
      [event.target.name]: event.target.value,
    });
    Globalvariables.topLevelMolecule.unitsKey = event.target.value;
    refreshUnitScaling(Globalvariables.topLevelMolecule);
  };

  return (
    <div className="settingsDiv">
      <div className="settings-panel" id="settingsPopUp">
        <a
          onClick={() => {
            setSettingsPopUp(false);
          }}
          className="closeButton"
        >
          {"\u00D7"}
        </a>
        <form
          onSubmit={(e) => {
            handleSubmit(e);
          }}
        >
          {/* Custom Tabs */}
          <div className="settings-panel-tabs">
            {tabLabels.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => handleChange(idx)}
                className={`settings-panel-tab${
                  value === idx ? " active" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Tab Panels */}
          <CustomTabPanel value={value} index={0}>
            <div id="project-info">
              <div id="project-info-name">
                <label className="info-label-highlight">Project Name</label>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <p style={{ margin: 0 }}>
                    {Globalvariables.currentAWSnode.repoName}
                  </p>
                  {handleRenameProject &&
                    Globalvariables.currentRepo?.owner?.login ===
                      Globalvariables.currentUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsPopUp(false);
                          handleRenameProject();
                        }}
                        style={{
                          padding: "4px 12px",
                          fontSize: "12px",
                          cursor: "pointer",
                          backgroundColor: "#4CAF50",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                        }}
                      >
                        Rename
                      </button>
                    )}
                </div>
              </div>
              <div id="project-info-date">
                <label className="info-label-highlight">Date Created</label>
                <p>{dateCreated.toDateString()}</p>
              </div>
            </div>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch
                  checked={state.shortcut}
                  onChange={handleCheckChange}
                  name="shortcut"
                  slotProps={{ input: { role: "switch" } }}
                />
                Shortcut Helper
                <span>{state.shortcut ? "On" : "Off"}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch
                  checked={state.displaytheme}
                  onChange={handleCheckChange}
                  name="displaytheme"
                  slotProps={{ input: { role: "switch" } }}
                />
                Display Theme
                <span>{state.displaytheme ? "Dark" : "Light"}</span>
              </label>
              <div style={{ borderTop: "1px solid #eee", margin: "10px 0" }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: "10px 0 4px 0",
                }}
              >
                <label className="settings-labels" style={{ minWidth: 80 }}>
                  Font Size
                </label>
                <input
                  type="range"
                  min={8}
                  max={30}
                  value={state.fontSize}
                  onChange={handleValueChange}
                  name="fontSize"
                  className="settings-sliders"
                  style={{ width: 140 }}
                />
                <span style={{ fontSize: 13, color: "#888", marginLeft: 6 }}>
                  {state.fontSize}px
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: "10px 0 4px 0",
                }}
              >
                <label className="settings-labels" style={{ minWidth: 80 }}>
                  Atom Size
                </label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={state.atomSize}
                  onChange={handleValueChange}
                  name="atomSize"
                  className="settings-sliders"
                  style={{ width: 140 }}
                />
                <span style={{ fontSize: 13, color: "#888", marginLeft: 6 }}>
                  {state.atomSize}
                </span>
              </div>
            </div>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={2}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{ fontWeight: 500, marginBottom: 2 }}
                  htmlFor="project-description"
                >
                  Project Description
                </label>
                <textarea
                  id="project-description"
                  defaultValue={Globalvariables.currentAWSnode.description}
                  ref={projectDescriptionRef}
                  name="projectDescription"
                  rows={3}
                  style={{
                    width: "100%",
                    marginBottom: 0,
                    padding: 6,
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    fontFamily: "inherit",
                    fontSize: 15,
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor="Project Topics"
                  style={{ fontWeight: 500, marginBottom: 2 }}
                >
                  Project Tags
                </label>
                <CreatableSelect
                  value={selectedTopics}
                  onChange={setSelectedTopics}
                  isMulti
                  name="Project Topics"
                  options={topics}
                  className="basic-multi-select"
                  classNamePrefix="select"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor="measure-units"
                  style={{ fontWeight: 500, marginBottom: 2 }}
                >
                  Project Units
                </label>
                <select
                  id="measure-units"
                  name="measure-units"
                  value={Globalvariables.topLevelMolecule.unitsKey}
                  onChange={handleSelectChange}
                  className="basic-multi-select custom-select"
                >
                  <option value="MM">MM</option>
                  <option value="Inches">Inches</option>
                  <option value="Unitless">Unitless</option>
                </select>
              </div>
            </div>
          </CustomTabPanel>
          <CustomTabPanel value={value} index={3}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={gridParam}
                  onChange={(event) => setGrid(event.target.checked)}
                  name="grid"
                  style={{ marginRight: 8 }}
                />
                Grid
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={axesParam}
                  onChange={(event) => setAxes(event.target.checked)}
                  name="axes"
                  style={{ marginRight: 8 }}
                />
                Axes
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={wireParam}
                  onChange={(event) => setWire(event.target.checked)}
                  name="wire"
                  style={{ marginRight: 8 }}
                />
                Output Wire
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={solidParam}
                  onChange={(event) => setSolid(event.target.checked)}
                  name="wireframe"
                  style={{ marginRight: 8 }}
                />
                Wireframe
              </label>
              <div style={{ borderTop: "1px solid #eee", margin: "10px 0" }} />
              <label
                className="settings-labels"
                style={{ margin: "10px 0 4px 0" }}
              >
                Background Model
              </label>
              <div style={{ marginBottom: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("backgroundUsdzInput").click();
                  }}
                  style={{
                    padding: "8px 16px",
                    marginRight: "10px",
                    backgroundColor: "#2196f3",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Upload 3D Background Model
                </button>
                {backgroundUsdzFile && (
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById("backgroundUsdzDeleteInput")
                        .click();
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Delete Background
                  </button>
                )}
              </div>
              <span
                style={{
                  color: "#666",
                  fontSize: "12px",
                  display: "block",
                  marginBottom: "10px",
                }}
              >
                Supported formats: GLB, GLTF. Max file size: 25MB
              </span>
            </div>
          </CustomTabPanel>
          {value !== DEVELOPER_TAB_INDEX && (
            <div className="settings-panel-button-row">
              <button className="settings-panel-button" type="submit">
                Save Changes
              </button>
            </div>
          )}
        </form>
        {/* Outside the form so its buttons and Enter key don't submit and close Settings */}
        {value === DEVELOPER_TAB_INDEX && (
          <div className="settings-panel-content">
            <div className="dev-setting-item">
              <div className="dev-setting-checkbox">
                <Switch
                  id="autoSaveEnabled"
                  checked={!state.autoSaveDisabled}
                  onChange={(event) => {
                    const disabled = !event.target.checked;
                    setState({ ...state, autoSaveDisabled: disabled });
                    localStorage.setItem("autoSaveDisabled", disabled);
                  }}
                  slotProps={{
                    input: {
                      role: "switch",
                      "aria-describedby": "autoSaveDisabled-description",
                    },
                  }}
                />
                <label htmlFor="autoSaveEnabled">Auto-Save</label>
                <span>{state.autoSaveDisabled ? "Off" : "On"}</span>
              </div>
              <p
                id="autoSaveDisabled-description"
                className="dev-setting-description"
              >
                Applies immediately to all projects in this browser. Save your
                changes manually while auto-save is disabled.
              </p>
            </div>
            <DevSettingsPanel />
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPopUp;
