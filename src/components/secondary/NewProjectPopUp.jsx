import { useState, useRef } from "react";
import { licenses } from "../../js/licenseOptions.js";
import GlobalVariables from "../../js/globalvariables.js";
import { useNavigate } from "react-router-dom";
import CreatableSelect from "react-select/creatable";
import topics from "../../js/maslowTopics.js";
import { useProject } from "../../contexts/index.js";
import { convertToGithubName } from "../../js/projectNameUtils.js";

// Helper function to validate project name
const validateProjectName = (name) => {
  const errors = [];

  if (!name || name.trim() === "") {
    errors.push("Project name cannot be empty");
    return errors;
  }

  // Convert spaces to underscores for GitHub compatibility
  const githubName = convertToGithubName(name);

  // Check for invalid characters (GitHub allows alphanumeric, dots, underscores, and hyphens)
  if (!/^[a-zA-Z0-9._-]+$/.test(githubName)) {
    errors.push(
      "Project name can only contain letters, numbers, dots, underscores, and hyphens",
    );
  }

  // Check if starts/ends with hyphen
  if (githubName.startsWith("-") || githubName.endsWith("-")) {
    errors.push("Project name cannot start or end with a hyphen");
  }

  // Check length
  if (githubName.length > 100) {
    errors.push("Project name must be 100 characters or less");
  }

  return errors;
};

// Helper function to validate and sanitize topics
const validateTopics = (topics) => {
  const errors = [];
  const sanitized = [];

  topics.forEach((topic) => {
    const topicValue = topic.value || topic;

    // Convert to lowercase (GitHub requirement)
    const lowerTopic = topicValue.toLowerCase();

    // Check for spaces
    if (lowerTopic.includes(" ")) {
      errors.push(`Tag "${topicValue}" contains spaces (they will be removed)`);
    }

    // Remove spaces and special characters, keep only letters, numbers, and hyphens
    const cleaned = lowerTopic.replace(/[^a-z0-9-]/g, "");

    // Check if starts with hyphen
    if (cleaned.startsWith("-")) {
      errors.push(`Tag "${topicValue}" cannot start with a hyphen`);
      return;
    }

    // Check length
    if (cleaned.length > 50) {
      errors.push(`Tag "${topicValue}" is too long (max 50 characters)`);
      return;
    }

    // Check if anything remains after cleaning
    if (cleaned.length === 0) {
      errors.push(`Tag "${topicValue}" contains only invalid characters`);
      return;
    }

    if (cleaned !== topicValue) {
      errors.push(`Tag "${topicValue}" should be changed to "${cleaned}"`);
    }

    sanitized.push(cleaned);
  });

  return { errors, sanitized };
};

//Replaces the loaded projects if the user clicks on new project button
const NewProjectPopUp = ({ setExportPopUp, authorizedUserOcto, exporting }) => {
  const keys_ar = [];
  Object.keys(licenses).forEach((key) => {
    keys_ar.push(key);
  });

  const navigate = useNavigate();
  const projectRef = useRef();
  const projectTopicRef = useRef();
  const projectDescriptionRef = useRef();
  const projectLicenseRef = useRef();
  const projectUnitsRef = useRef();
  const [pending, setPending] = useState(false); // useFormStatus(); in the future
  const [validationErrors, setValidationErrors] = useState([]);

  //Progress bar for creating a new project
  const [newProjectBar, setNewProjectBar] = useState(0);
  const { createProject } = useProject();

  /* Validate project name field */
  const validateNameField = () => {
    const projectName = projectRef.current.value.replace(/\//g, "");
    const nameErrors = validateProjectName(projectName);
    if (nameErrors.length > 0) {
      setValidationErrors(nameErrors);
    } else {
      setValidationErrors([]);
    }
  };

  /* Validate topic field */
  const validateTopicField = () => {
    const projectTopicArray = projectTopicRef.current.getValue();
    const projectTopic = [];
    projectTopicArray.forEach((topic) => {
      projectTopic.push(topic[`value`]);
    });
    const topicValidation = validateTopics(projectTopic);
    if (topicValidation.errors.length > 0) {
      setValidationErrors(topicValidation.errors);
    } else {
      setValidationErrors([]);
    }
  };

  /* Handle key press in form fields */
  const handleKeyDown = (e, fieldType) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form submission on Enter

      // Validate the specific field
      if (fieldType === "name") {
        validateNameField();
      } else if (fieldType === "topic") {
        validateTopicField();
      }
    }
  };

  /* Handles form submission for create new/ export project form */
  const handleSubmit = async (e) => {
    e.preventDefault();

    const projectName = projectRef.current.value.replace(/\//g, "");
    const projectTopicArray = projectTopicRef.current.getValue();
    const projectDescription = projectDescriptionRef.current.value;
    const projectLicense = projectLicenseRef.current.value;
    const projectUnits = projectUnitsRef.current.value;

    // Validate project name
    const nameErrors = validateProjectName(projectName);

    // Validate and sanitize topics
    const projectTopic = [];
    projectTopicArray.forEach((topic) => {
      projectTopic.push(topic[`value`]);
    });
    const topicValidation = validateTopics(projectTopic);

    // Collect all validation errors
    const allErrors = [...nameErrors, ...topicValidation.errors];

    if (allErrors.length > 0) {
      setValidationErrors(allErrors);
      return; // Do not proceed with submission
    }

    // Clear any previous validation errors
    setValidationErrors([]);
    setPending(true);

    // Convert project name for GitHub (spaces to underscores)
    const githubProjectName = convertToGithubName(projectName);

    if (GlobalVariables.currentMolecule) {
      var molecule = GlobalVariables.currentMolecule;
    }
    // Calls the create new project function and creates a new github repo with user input
    createProject(
      authorizedUserOcto,
      [
        githubProjectName,
        topicValidation.sanitized.length > 0
          ? topicValidation.sanitized
          : projectTopic,
        projectDescription,
        projectLicense,
        projectUnits,
      ],
      molecule,
      exporting,
      setNewProjectBar,
    )
      .then((project) => {
        setExportPopUp(false);
        setPending(false);
        navigate(
          `/${GlobalVariables.currentAWSnode.owner}/${GlobalVariables.currentAWSnode.repoName}`,
        );
      })
      .catch((error) => {
        console.error("Error creating project:", error);
        setPending(false);
        window.alert(
          error?.message ||
            "An error occurred while creating the project. Please try again.",
        );
      });
  };

  return (
    <>
      <div className="login-page export-div">
        <div
          className="form animate fadeInUp one"
          style={{ scrollbarGutter: "stable", overflow: "visible" }}
        >
          <button
            onClick={() => {
              setExportPopUp(false);
            }}
            className="closeButton"
          >
            X
          </button>
          <form
            className="new-project-form"
            style={{ scrollbarGutter: "stable", overflow: "visible" }}
            onSubmit={(e) => {
              handleSubmit(e);
            }}
          >
            <h2>
              {exporting
                ? "Export this molecule to Github"
                : "Create a New Project"}
            </h2>
            {validationErrors.length > 0 && (
              <div className="validation-errors">
                <strong>Validation Issues:</strong>
                <ul>
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            <label htmlFor="project-name">Project Name</label>
            <input
              id="project-name"
              name="Project Name"
              placeholder="Project Name"
              ref={projectRef}
              required
              onKeyDown={(e) => handleKeyDown(e, "name")}
            />
            <label htmlFor="license-options">License</label>
            <select id="license-options" ref={projectLicenseRef}>
              {keys_ar.map((opt) => {
                return (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                );
              })}
            </select>
            <label htmlFor="measure-units">Units</label>
            <select id="measure-units" ref={projectUnitsRef}>
              <option key={"millop"} value={"MM"}>
                MM
              </option>
              <option key={"inchesop"} value={"Inches"}>
                Inches
              </option>
              <option key={"unitlessop"} value={"Unitless"}>
                Unitless
              </option>
            </select>
            <label htmlFor="project-description">Project Description</label>
            <input
              placeholder="Project Description"
              ref={projectDescriptionRef}
            />
            <label htmlFor="project-topics">Project Tags</label>
            <CreatableSelect
              defaultValue={[]}
              isMulti
              name="Project Topics"
              options={topics}
              className="basic-multi-select"
              classNamePrefix="select"
              ref={projectTopicRef}
              onKeyDown={(e) => handleKeyDown(e, "topic")}
            />

            <div style={{ borderTop: "1px solid #ccc", padding: "10px 0" }} />

            <button className="submit-button" disabled={pending} type="submit">
              {pending ? newProjectBar + "%" : "Submit/Export to Github"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default NewProjectPopUp;
