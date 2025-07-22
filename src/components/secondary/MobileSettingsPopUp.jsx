import React, { useState, useRef, useEffect } from "react";
import Globalvariables from "../../js/globalvariables.js";
import CreatableSelect from "react-select/creatable";
import topics from "../../js/maslowTopics.js";
import { use } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Switch from "@mui/material/Switch";
import FormGroup from "@mui/material/FormGroup";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import { Typography } from "@mui/material";
import Divider from "@mui/material/Divider";

const MobileSettingsPopUp = ({
  setSettingsPopUp,
  shortCutsOn,
  setShortCuts,
}) => {
  let repoTopics = [];
  if (Globalvariables.currentRepo.topics.length > 0) {
    Globalvariables.currentRepo.topics.forEach((topic) => {
      repoTopics.push({ value: topic, label: topic });
    });
  }
  const projectTopicRef = useRef(repoTopics);
  const projectDescriptionRef = useRef(Globalvariables.currentRepo.description);
  const dateString = Globalvariables.currentRepo.dateCreated;
  const dateCreated = new Date(dateString);
  let isMobile = Globalvariables.isMobile();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSettingsPopUp(false);
    const projectTopicArray = projectTopicRef.current.getValue();
    const projectTopic = [];
    projectTopicArray.forEach((topic) => {
      projectTopic.push(topic[`value`]);
    });
    Globalvariables.currentRepo.description =
      projectDescriptionRef.current.value;
    setState({
      ...state,
      projectDescription: projectDescriptionRef.current.value,
    });
    Globalvariables.currentRepo.topics = projectTopic;
  };
  const [value, setValue] = React.useState(0);

  const [state, setState] = React.useState({
    shortcut: shortCutsOn,
    displaytheme: Globalvariables.displayTheme,
    fontSize: parseInt(
      Globalvariables.canvasFont.replace("px Work Sans Bold", ""),
      10
    ),
    atomSize: Globalvariables.atomSize * 1000,
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
    if (event.target.name === "fontSize") {
      Globalvariables.canvasFont = `${event.target.value}px Work Sans Bold`;
      localStorage.setItem(
        "canvasFont",
        `${event.target.value}px Work Sans Bold`
      );
    }
  };
  const handleSelectChange = (event) => {
    setState({
      ...state,
      [event.target.name]: event.target.value,
    });
    Globalvariables.topLevelMolecule.unitsKey = event.target.value;
  };
  const handleChange = (event, newValue) => {
    setValue(newValue);
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
      const element = document.querySelector("html");
      if (element && element.className === "light-theme") {
        element.className = "dark-theme";
        localStorage.setItem("displayTheme", "dark-theme");
      } else {
        element.className = "light-theme";
        localStorage.setItem("displayTheme", "light-theme");
      }
    }
  };

  return (
    <div className="mobile-settings-popup">
      <div className="form animate fadeInUp one " id="mobileSettingsPopUp">
        <a
          onClick={() => {
            setSettingsPopUp(false);
          }}
          className="closeButton2"
        >
          {"\u00D7"}
        </a>
        <div className="mobile-settings-header">
          <h2 style={{ margin: "15px 0 50px 0" }}> Project Preferences</h2>
        </div>

        <div className="mobile-settings-content">
          <form
            className="settings-form"
            onSubmit={(e) => {
              handleSubmit(e);
            }}
          >
            <Typography gutterBottom>Font Size</Typography>
            <Slider
              style={{ color: "#be3fe5" }}
              value={state.fontSize}
              onChange={handleValueChange}
              name="fontSize"
              min={8}
              max={30}
            />
            <Typography gutterBottom>Atom Size</Typography>
            <Slider
              value={state.atomSize}
              onChange={handleValueChange}
              name="atomSize"
              color="white"
              min={10}
              max={60}
              style={{ color: "#be3fe5" }}
            />
            <InputLabel
              id="measure-units-label"
              style={{ marginBottom: "15px" }}
            >
              Project Description
            </InputLabel>
            <input
              id="project-description"
              defaultValue={Globalvariables.currentRepo.description}
              ref={projectDescriptionRef}
              name="projectDescription"
            />
            {/* <TextField
                        fullWidth
                        label="Project Description and Tags"
                        id="project-description"
                        multiline
                        rows={4}
                        value={state.projectDescription}
                        ref={projectDescriptionRef}
                      />*/}
            <label htmlFor="Project Topics">Project Tags</label>
            <CreatableSelect
              defaultValue={repoTopics}
              isMulti
              name="Project Topics"
              options={topics}
              className="basic-multi-select"
              classNamePrefix="select"
              ref={projectTopicRef}
            />
            <FormControl fullWidth>
              <InputLabel id="measure-units-label">Project Units</InputLabel>
              <Select
                labelId="measure-units-label"
                id="measure-units"
                value={Globalvariables.topLevelMolecule.unitsKey}
                label="Project Units"
                onChange={handleSelectChange}
                color="white"
              >
                <MenuItem value={"MM"}>MM</MenuItem>
                <MenuItem value={"Inches"}>Inches</MenuItem>
                <MenuItem value={"Unitless"}>Unitless</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={state.shortcut}
                  onChange={handleCheckChange}
                  name="shortcut"
                  color="secondary"
                />
              }
              label="Shortcut Helper Show/Hide"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={state.displaytheme}
                  onChange={handleCheckChange}
                  name="displaytheme"
                  color="secondary"
                />
              }
              label="Display light/dark"
            />
          </form>
          <div
            className="mobile-settings-footer"
            style={{ margin: "50px 0 50px 0" }}
          >
            <button
              className="submit-button"
              onClick={(e) => {
                handleSubmit(e);
              }}
              type="submit"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileSettingsPopUp;
