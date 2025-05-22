import React, { useState, useEffect, useMemo } from "react";
import globalvariables from "../../js/globalvariables";

import { useControls, useCreateStore, LevaPanel, button } from "leva";
import { re } from "mathjs";
import fonts from "../../js/fonts";
//import { c } from "vite/dist/node/types.d-FdqQ54oU";

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
  
  // Effect to focus on the first input field when a new atom is selected
  useEffect(() => {
    if (activeAtom) {
      console.log("Auto-focus: Atom changed, attempting to focus first input field");
      
      // First ensure the panel is not collapsed
      // Setting collapsed state might take time to reflect in the DOM
      setCollapsed(false);
      
      // Use a longer timeout to ensure the DOM has been updated with the new fields
      const focusTimeoutId = setTimeout(() => {
        // Double-check that panel is not collapsed before proceeding
        const panel = document.querySelector('.paramEditorDiv .leva__panel, .paramEditorDivRun .leva__panel');
        const isPanelCollapsed = panel && panel.classList.contains('leva__collapsed');
        
        if (isPanelCollapsed) {
          console.log("Auto-focus: Panel is still collapsed, forcing expand");
          setCollapsed(false);
          
          // Try again after ensuring panel is expanded
          setTimeout(tryFocusing, 300);
        } else {
          // Panel is expanded, proceed with focus attempt
          tryFocusing();
        }
      }, 200);
      
      // Function to try focusing on the first input
      function tryFocusing() {
        console.log("Auto-focus: Looking for input fields to focus");
        
        // Check the DOM structure to determine the actual class names used by Leva
        const levaPanel = document.querySelector('.paramEditorDiv .leva__panel, .paramEditorDivRun .leva__panel');
        if (levaPanel) {
          console.log("Auto-focus: Found Leva panel");
          
          // Look for any input field directly within the panel first
          const directInputs = levaPanel.querySelectorAll('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
          if (directInputs && directInputs.length > 0) {
            console.log(`Auto-focus: Found ${directInputs.length} direct input fields in Leva panel`);
            const firstInput = directInputs[0];
            
            // Focus and select with a small delay to ensure the element is ready
            setTimeout(() => {
              firstInput.focus();
              firstInput.click();
              
              if (firstInput.type === "text" || firstInput.type === "number") {
                firstInput.select();
                console.log("Auto-focus: Text selected in direct input field");
              }
            }, 50);
            return; // Exit early since we found and focused an input
          }
        }
        
        // If we didn't find inputs directly, try with more specific selectors
        const selectors = [
          // Target more specific editable inputs based on their container classes
          '.paramEditorDiv .leva__panel .leva__row:not(.leva__disabled) input:not([disabled]), .paramEditorDivRun .leva__panel .leva__row:not(.leva__disabled) input:not([disabled])',
          '.paramEditorDiv .leva__panel .leva__row:not(.leva__disabled) textarea:not([disabled]), .paramEditorDivRun .leva__panel .leva__row:not(.leva__disabled) textarea:not([disabled])',
          '.paramEditorDiv .leva__panel .leva__row:not(.leva__disabled) select:not([disabled]), .paramEditorDivRun .leva__panel .leva__row:not(.leva__disabled) select:not([disabled])',
          // Fallback to less specific selectors
          '.paramEditorDiv input:not([disabled]), .paramEditorDivRun input:not([disabled])',
          '.paramEditorDiv textarea:not([disabled]), .paramEditorDivRun textarea:not([disabled])',
          '.paramEditorDiv select:not([disabled]), .paramEditorDivRun select:not([disabled])'
        ];
        
        // Try each selector until we find an element
        let firstInput = null;
        for (const selector of selectors) {
          // Try both querySelector and querySelectorAll approaches
          firstInput = document.querySelector(selector);
          if (firstInput) {
            console.log(`Auto-focus: Found input field with selector: ${selector}`);
            break;
          }
          
          // If querySelector fails, try getting the first element from querySelectorAll
          const inputs = document.querySelectorAll(selector);
          if (inputs && inputs.length > 0) {
            console.log(`Auto-focus: Found ${inputs.length} input fields with selector: ${selector}`);
            firstInput = inputs[0];
            break;
          }
        }
        
        if (firstInput) {
          // Focus and select with a small delay to ensure the element is ready
          console.log("Auto-focus: Attempting to focus input field");
          setTimeout(() => {
            // Use both focus methods for more reliable focusing
            firstInput.focus();
            firstInput.click();
            
            if (firstInput.type === "text" || firstInput.type === "number") {
              firstInput.select(); // Select text for easier editing
              console.log("Auto-focus: Text selected in input field");
            }
          }, 50);
        } else {
          console.log("Auto-focus: No suitable input field found to focus");
        }
      }
      
      return () => clearTimeout(focusTimeoutId);
    }
  }, [activeAtom]);

  if (activeAtom !== null) {
    /** Creates Leva inputs inside each atom */
    inputParams = activeAtom.createLevaInputs(setInputChanged, inputChanged);
    if (run) {
      exportParams = activeAtom.createLevaExport();
    }
  }
  if (activeAtom.atomType == "Molecule") {
    /** Creates Leva inputs inside each atom */
    compiledBom = activeAtom.createLevaBom();
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
        }
        set({
          [activeAtom.uniqueID + "result"]: activeAtom.evaluateEquation(),
        });
      },
      order: -3,
    };
    inputParamsConfig[activeAtom.uniqueID + "result"] = {
      label: "Result",
      value: 3,
      disabled: true,
    };
  }

  /** Creates Leva panel with parameters from active atom inputs */

  useControls(() => exportParamsConfig, { store: store4 }, [activeAtom]);
  useControls(() => bomParamsConfig, { store: store3 }, [activeAtom]);

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
          collapsed={{
            collapsed,
            onChange: (value) => {
              setCollapsed(value);
            },
          }}
          hideCopyButton
          fill
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
          hidden={false}
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
            hidden={false}
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
