import React, { useState, useEffect, useMemo } from "react";
import globalvariables from "../../js/globalvariables";

import { useControls, useCreateStore, LevaPanel, button } from "leva";

/**Creates new collapsible sidebar with Leva - edited from Replicad's ParamsEditor.jsx */
export default (function ParamsEditor({
  activeAtom,
  run,
  setGrid,
  setAxes,
  setWire,
  setSolid,
  compiledBom,
}) {
  let inputParams = {};
  let exportParams = {};

  const store1 = useCreateStore();
  const store2 = useCreateStore();
  const store3 = useCreateStore();
  const store4 = useCreateStore();

  let isMobile = globalvariables.isMobile();

  /*Work around Leva collapse issue */
  /**https://github.com/pmndrs/leva/issues/456#issuecomment-1537510948 */
  const [collapsed, setCollapsed] = useState(true);
  /** State to keep track of increased inputs in atoms (a.e. equation) */
  const [inputChanged, setInputChanged] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCollapsed(false);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  if (activeAtom !== null) {
    /** Creates Leva inputs inside each atom */
    inputParams = activeAtom.createLevaInputs(setInputChanged, inputChanged);
    if (run) {
      exportParams = activeAtom.createLevaExport();
    }
    if (activeAtom.atomType == "Molecule") {
      compiledBom = activeAtom.createLevaBom();
    }
  }
  const bomParamsConfig = useMemo(() => {
    return { ...compiledBom };
  }, [compiledBom]);
  const exportParamsConfig = useMemo(() => {
    return { ...exportParams };
  }, [exportParams]);
  const inputParamsConfig = useMemo(() => {
    return { ...inputParams };
  }, [inputParams]);

  if (activeAtom.atomType == "Equation") {
    /* Make an input for the equation itself */
    inputParamsConfig[activeAtom.uniqueID + "currentequation"] = {
      value: activeAtom.currentEquation,
      label: "Current Equation",
      disabled: false,
      onChange: (value) => {
        if (activeAtom.currentEquation !== value) {
          activeAtom.setEquation(value);
          setInputChanged(activeAtom.currentEquation);
          set({
            [activeAtom.uniqueID + "result"]: activeAtom.evaluateEquation(),
          });
        }
      },
      order: -3,
    };
    inputParamsConfig[activeAtom.uniqueID + "result"] = {
      label: "Result",
      value: 3,
      disabled: true,
    };
  }
  if (activeAtom.atomType == "Import") {
    inputParamsConfig["Load File"] = button(() => {
      activeAtom.loadFile(
        activeAtom.importOptions[activeAtom.importIndex],
        (fileName) => {
          set({
            [activeAtom.uniqueID + "Loaded File"]: fileName,
          });
        }
      );
    });
    inputParamsConfig[activeAtom.uniqueID + "Loaded File"] = {
      value: activeAtom.fileName ? activeAtom.fileName : "", //href to the file
      label: "Loaded File",
      disabled: true,
    };
  }

  /** Creates Leva panel with parameters from active atom inputs */

  useControls(() => exportParamsConfig, { store: store4 }, [activeAtom]);
  useControls(() => bomParamsConfig, { store: store3 }, [
    activeAtom,
    compiledBom,
  ]);

  const [, set] = useControls(() => inputParamsConfig, { store: store1 }, [
    activeAtom,
    inputChanged,
  ]);

  /** Creates Leva panel with grid settings */
  useControls(
    "Grid",
    {
      grid: {
        value: true,
        label: "Grid",
        onChange: (value) => {
          setGrid(value);
        },
      },
      axes: {
        value: true,
        label: "Axes",
        onChange: (value) => {
          setAxes(value);
        },
      },
      wire: {
        value: true,
        label: "Output Wire",
        onChange: (value) => {
          setWire(value);
        },
      },
      wireframe: {
        value: false,
        label: "Wireframe",
        onChange: (value) => {
          setSolid(value);
        },
      },
    },
    { store: store2 }
  );

  // color theme for Leva
  const abundanceTheme = {
    colors: {
      elevation1: "#3F4243",
      elevation2: "var(--bg-color)",
      elevation3: "#C4A3D5", // bg color of the root panel (main title bar)

      highlight1: "#f9e9fd",
      highlight2: "#ededed",
      highlight3: "#ededed",

      accent1: "#C4A3D5",
      accent2: "#88748F", //apply button
      accent3: "#88748F",

      vivid1: "red",
    },
    fontSizes: {
      root: "13px",
    },
  };

  useEffect(
    () => () => {
      store1.dispose();
    },
    [activeAtom]
  );

  return (
    <>
      {" "}
      <div className={run ? "paramEditorDivRun" : "paramEditorDiv"}>
        <LevaPanel
          store={store1}
          neverHide
          fill
          collapsed={{
            collapsed,
            onChange: (value) => {
              setCollapsed(value);
            },
          }}
          hideCopyButton
          titleBar={{
            title: activeAtom.name || globalvariables.currentRepo.repoName,
            drag: false,
          }}
          theme={abundanceTheme}
        />
      </div>
      <div className={run ? "gridEditorDivRun" : "gridEditorDiv"}>
        <LevaPanel
          store={store2}
          fill
          hidden={isMobile ? true : false}
          collapsed={true}
          hideCopyButton
          titleBar={{
            title: "Render Settings",
            drag: false,
          }}
          theme={abundanceTheme}
        />
      </div>
      {activeAtom.atomType == "Molecule" ? (
        <div className={run ? "bomEditorDivRun" : "bomEditorDiv"}>
          <LevaPanel
            store={store3}
            fill
            hidden={isMobile ? true : false}
            collapsed={true}
            hideCopyButton
            titleBar={{
              title: "Bill of Materials",
              drag: false,
            }}
            theme={abundanceTheme}
          />
        </div>
      ) : null}
      {run ? (
        <div className={"exportEditorDivRun"}>
          <LevaPanel
            store={store4}
            fill
            hidden={false}
            collapsed={true}
            hideCopyButton
            titleBar={{
              title: "Export Parts",
              drag: false,
            }}
            theme={abundanceTheme}
          />
        </div>
      ) : null}
    </>
  );
});
