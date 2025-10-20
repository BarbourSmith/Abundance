import { useState, useEffect } from "react";

function DuplicateProjectDialog({ isOpen, onClose, onConfirm, defaultName }) {
  const [projectName, setProjectName] = useState(defaultName);
  const [error, setError] = useState("");

  const validateProjectName = (name) => {
    if (!name || name.trim() === "") {
      return "Project name cannot be empty";
    }

    // Check for spaces
    if (name.includes(" ")) {
      return "Project name cannot contain spaces (use hyphens instead)";
    }

    // Check for invalid characters (GitHub allows alphanumeric and hyphens)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return "Project name can only contain letters, numbers, dots, underscores, and hyphens";
    }

    // Check if starts/ends with hyphen
    if (name.startsWith("-") || name.endsWith("-")) {
      return "Project name cannot start or end with a hyphen";
    }

    // Check length
    if (name.length > 100) {
      return "Project name must be 100 characters or less";
    }

    return null;
  };

  const handleConfirm = () => {
    const validationError = validateProjectName(projectName);
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm(projectName);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  // Add document-level keyboard event listener with priority
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Enter" || e.key === "Escape") {
        handleKeyPress(e);
      }
    };

    // Add listener with capture phase to get priority
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, projectName, error]);

  if (!isOpen) return null;

  return (
    <dialog
      open={isOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "20px",
        minWidth: "400px",
      }}
      className="share-dialog"
    >
      <h3 style={{ margin: "0 0 15px 0" }}>Duplicate Project</h3>

      <label style={{ marginBottom: "5px", fontWeight: "500" }}>
        New project name:
      </label>

      <input
        type="text"
        value={projectName}
        onChange={(e) => {
          setProjectName(e.target.value);
          setError("");
        }}
        onKeyDown={handleKeyPress}
        placeholder={defaultName}
        autoFocus
        style={{
          padding: "8px",
          marginBottom: "10px",
          fontSize: "14px",
          border: error ? "1px solid #e74c3c" : "1px solid #ccc",
          borderRadius: "4px",
        }}
      />

      {error && (
        <div
          style={{
            color: "#e74c3c",
            fontSize: "13px",
            marginBottom: "10px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          marginTop: "10px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            backgroundColor: "var( --abundance-color-brightPurple)",
            color: "white",
            border: "none",
            borderRadius: "4px",
          }}
        >
          Duplicate
        </button>
      </div>

      <a
        className="closeButton"
        onClick={onClose}
        style={{ cursor: "pointer" }}
      >
        {"\u00D7"}
      </a>
    </dialog>
  );
}

export default DuplicateProjectDialog;
