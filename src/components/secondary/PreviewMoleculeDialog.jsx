import { useNavigate } from "react-router-dom";
import GlobalVariables from "../../js/globalvariables.js";

/**
 * Dialog to preview a GitHub molecule project (for non-owners)
 * @param {boolean} isOpen - Whether the dialog is open
 * @param {function} onClose - Function to close the dialog
 * @param {string} owner - The owner of the GitHub molecule
 * @param {string} repoName - The repository name of the GitHub molecule
 * @param {string} moleculeName - The name of the molecule being previewed
 */
function PreviewMoleculeDialog({
  isOpen,
  onClose,
  owner,
  repoName,
  moleculeName,
}) {
  const navigate = useNavigate();

  const handlePreview = () => {
    // Store the current project info so we can return to it from preview
    if (
      GlobalVariables.currentAWSnode?.owner &&
      GlobalVariables.currentAWSnode?.repoName
    ) {
      sessionStorage.setItem(
        "previewOriginProject",
        JSON.stringify({
          owner: GlobalVariables.currentAWSnode.owner,
          repoName: GlobalVariables.currentAWSnode.repoName,
        }),
      );
    }
    GlobalVariables.currentAWSnode = { owner, repoName };
    onClose();
    navigate(`/preview/${owner}/${repoName}`);
  };

  const handleClose = () => {
    onClose();
  };

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
      <h3 style={{ margin: "0 0 15px 0" }}>Preview Project?</h3>

      <p style={{ margin: "0 0 20px 0" }}>
        View the project <strong>{moleculeName || repoName}</strong> in preview
        mode.
      </p>

      <p style={{ margin: "0 0 20px 0", fontSize: "14px" }}>
        This will take you to a read-only preview of{" "}
        <strong>
          {owner}/{repoName}
        </strong>
        . You won't be able to edit it, but you can explore its structure. Would
        you like to continue?
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          marginTop: "10px",
        }}
      >
        <button
          onClick={handleClose}
          autoFocus
          style={{
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handlePreview}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
          }}
        >
          Preview Project
        </button>
      </div>

      <a
        className="closeButton"
        onClick={handleClose}
        style={{ cursor: "pointer" }}
      >
        {"\u00D7"}
      </a>
    </dialog>
  );
}

export default PreviewMoleculeDialog;
