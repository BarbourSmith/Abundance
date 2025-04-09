import GlobalVariables from "../../js/globalvariables.js";
import { saveAs } from "file-saver";

function ShareDialog({
  shareDialog,
  setShareDialog,
  dialogContent,
  activeAtom,
}) {
  /* Makes a POST request to the API to update the ranking of the current molecule */
  const addRanking = () => {
    const apiUpdateUrl =
      "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";
    fetch(apiUpdateUrl, {
      method: "POST",
      body: JSON.stringify({
        owner: GlobalVariables.currentRepo.owner,
        repoName: GlobalVariables.currentRepo.repoName,
        attributeUpdates: { ranking: 1 },
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    })
      .then((response) => {
        console.log(response);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  };
  const handleExport = (exportType) => {
    const exportID = GlobalVariables.generateUniqueID();
    GlobalVariables.cad
      .visExport(
        exportID,
        GlobalVariables.topLevelMolecule.uniqueID,
        exportType
      )
      .then((result) => {
        let resolution = 72;
        GlobalVariables.cad
          .downExport(
            exportID,
            exportType,
            resolution,
            GlobalVariables.topLevelMolecule.unitsKey
          )
          .then((result) => {
            saveAs(
              result,
              GlobalVariables.currentMolecule.name +
                "." +
                exportType.toLowerCase()
            );

            addRanking();
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
              {window.location.origin}/run/
              {GlobalVariables.currentRepo.owner}/
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

        <a className="closeButton2" onClick={() => setShareDialog(false)}>
          {"\u00D7"}
        </a>
      </dialog>
    </>
  );
}

export default ShareDialog;
