import GlobalVariables from "../../js/globalvariables.js";
import { useAppState } from "../../contexts/index.js";

const GoUpLevelButton = () => {
  const { setActiveAtom } = useAppState();
  return (
    <>
      <button
        id="go-up-button"
        className="nav-bar go-up-button menu-nav-button"
        onClick={() => {
          GlobalVariables.currentMolecule.goToParentMolecule();
          setActiveAtom(GlobalVariables.currentMolecule);
        }}
      >
        <img
          className="nav-img thumnail-logo"
          src={import.meta.env.VITE_APP_PATH_FOR_PICS + "/imgs/Go Up.svg"}
          key=""
          title=""
        />
      </button>
    </>
  );
};

export default GoUpLevelButton;
