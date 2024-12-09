import GlobalVariables from "../../js/globalvariables.js";
import { saveAs } from "file-saver";

function ShareDialog({
  shareDialog,
  setShareDialog,
  dialogContent,
  activeAtom,
}) {
  const handleExport = (exportType) => {
    GlobalVariables.cad
      .visExport(activeAtom.uniqueID, activeAtom.uniqueID, exportType)
      .then((result) => {
        GlobalVariables.cad
          .downExport(activeAtom.uniqueID, exportType)
          .then((result) => {
            saveAs(
              result,
              GlobalVariables.currentMolecule.name +
                "." +
                exportType.toLowerCase()
            );
          })
          .catch("Error downloading export file");
      })
      .catch("Error creating export geometry");
  };

  return (
    <>
      <dialog
        open={shareDialog}
        style={{ display: "flex" }}
        className="share-dialog"
      >
        {dialogContent == "share" ? (
          <div style={{ display: "flex", margin: "10px" }}>
            <p>Share this project:</p>
            <a
              style={{ margin: "16px" }}
              href={
                window.location.origin +
                "/run/" +
                GlobalVariables.currentRepo.owner +
                "/" +
                GlobalVariables.currentRepo.repoName
              }
              target="_blank"
            >
              {window.location.origin}/run/{GlobalVariables.currentRepo.owner}/
              {GlobalVariables.currentRepo.repoName}
            </a>
          </div>
        ) : dialogContent == "export" ? (
          <div style={{ display: "flex", margin: "10px" }}>
            <p>Export as:</p>
            <button autoFocus onClick={() => handleExport("STL")}>
              {" "}
              STL
            </button>
            <button autoFocus onClick={() => handleExport("STEP")}>
              {" "}
              STEP
            </button>
            <button autoFocus onClick={() => handleExport("SVG")}>
              {" "}
              SVG
            </button>
          </div>
        ) : null}

        <a className="closeButton" onClick={() => setShareDialog(false)}></a>
      </dialog>
    </>
  );
}

export default ShareDialog;
