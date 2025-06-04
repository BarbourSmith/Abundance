import React, { useState, useEffect, useMemo } from "react";
import GlobalVariables from "../../js/globalvariables.js";
import { saveAs } from "file-saver";

const KiriMotoIntegration = ({ activeAtom }) => {
  const [kiriEngine, setKiriEngine] = useState(null);
  const [stlUrl, setStlUrl] = useState(null);

  useEffect(() => {
    // Dynamically load the Kiri:Moto script
    const script = document.createElement("script");
    script.src = "https://grid.space/code/engine.js"; // this comes from the grid.space Kiri:Moto API -- https://docs.grid.space/projects/kiri-moto/apis
    script.async = true;
    script.onload = () => {
      console.log("Kiri:Moto script loading");
      if (window.kiri) {
        console.log("Kiri:Moto API loaded");
        const engine = window.kiri.newEngine();
        setKiriEngine(engine);
      }
    };

    script.onerror = () => {
      console.error("Failed to load Kiri:Moto script");
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup script when component unmounts
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    const handleBlobUpdate = (event) => {
      const { uniqueID, blob } = event.detail;
      console.log("Blob updated for Kirimoto processing");

      // Convert blob to a temporary file URL
      const url = URL.createObjectURL(blob);
      setStlUrl(url);
      
      // Get geometry ID for stock calculation
      if (activeAtom && activeAtom.findIOValue) {
        try {
          const geometryID = activeAtom.findIOValue("geometry");
          // Store geometry ID for use in stock calculation
          window.currentGeometryID = geometryID;
        } catch (error) {
          console.log("Could not get geometry ID:", error);
        }
      }
    };

    window.addEventListener("kirimotoBlobUpdated", handleBlobUpdate);

    return () => {
      window.removeEventListener("kirimotoBlobUpdated", handleBlobUpdate);
    };
  }, [activeAtom]);

  const runKirimoto = () => {
    console.log("kiriEngine");
    console.log(kiriEngine);
    if (!kiriEngine) {
      console.error("Kiri:Moto engine is not initialized yet.");
      return;
    }

    if (!stlUrl) {
      console.error("STL URL is not available.");
      return;
    }

    kiriEngine
      .setListener((message) => {
        console.log("Kiri:Moto Message:", message);
      })
      .load(stlUrl)
      .then((eng) => {
        console.log("Kiri:Moto STL loaded successfully");
        return eng.setMode("CAM");
      })
      .then((eng) => {
        console.log("Calculating dynamic stock dimensions...");
        
        // Calculate dynamic stock size using our worker function
        if (window.currentGeometryID) {
          return GlobalVariables.cad.getStockDimensions(window.currentGeometryID)
            .then((stockDimensions) => {
              console.log("Using calculated stock dimensions:", stockDimensions);
              return eng.setStock(stockDimensions);
            })
            .catch((error) => {
              console.error("Error calculating stock dimensions:", error);
              // Fallback to default dimensions
              console.log("Using default stock dimensions");
              return eng.setStock({
                x: 30,
                y: 30,
                z: 15,
                center: {
                  x: 0,
                  y: 0,
                  z: 7.5,
                },
              });
            });
        } else {
          // Fallback to default dimensions if no geometry ID available
          console.log("No geometry ID available, using default stock dimensions");
          return eng.setStock({
            x: 30,
            y: 30,
            z: 15,
            center: {
              x: 0,
              y: 0,
              z: 7.5,
            },
          });
        }
      })
      .then((eng) =>
        eng.setTools([
          {
            id: 1000,
            number: 1,
            type: "endmill",
            name: "end 1/4",
            metric: false,
            shaft_diam: 0.25,
            shaft_len: 1,
            flute_diam: 0.25,
            flute_len: 2,
            taper_tip: 0,
          },
          {
            id: 1001,
            number: 2,
            type: "endmill",
            name: "end 1/8",
            metric: false,
            shaft_diam: 0.125,
            shaft_len: 1,
            flute_diam: 0.125,
            flute_len: 1.5,
            taper_tip: 0,
          },
          {
            id: 1002,
            number: 3,
            type: "endmill",
            name: "end 1/16",
            metric: false,
            shaft_diam: 0.0625,
            shaft_len: 1,
            flute_diam: 0.0625,
            flute_len: 1.5,
            taper_tip: 0,
          },
          {
            id: 1003,
            number: 4,
            type: "tapermill",
            name: "vee 1/8",
            metric: true,
            shaft_diam: 0.125,
            shaft_len: 1,
            flute_diam: 0.125,
            flute_len: 1.5,
            taper_angle: 5.3,
            taper_tip: 0,
          },
          {
            id: 1004,
            number: 5,
            type: "ballmill",
            name: "ball 1/8",
            metric: false,
            shaft_diam: 0.125,
            shaft_len: 1,
            flute_diam: 0.125,
            flute_len: 1.5,
            taper_tip: 0,
          },
        ])
      )
      .then((eng) =>
        eng.setProcess({
          processName: "default",
          camLevelTool: 1000,
          camLevelSpindle: 1000,
          camLevelOver: 0.5,
          camLevelSpeed: 1000,
          camLevelDown: 0,
          camLevelStock: true,
          camRoughTool: 1000,
          camRoughSpindle: 1000,
          camRoughDown: 2,
          camRoughOver: 0.4,
          camRoughSpeed: 1000,
          camRoughPlunge: 250,
          camRoughStock: 0,
          camRoughStockZ: 0,
          camRoughAll: true,
          camRoughVoid: false,
          camRoughFlat: true,
          camRoughTop: true,
          camRoughIn: true,
          camRoughOn: true,
          camRoughOmitVoid: false,
          camOutlineTool: 1000,
          camOutlineSpindle: 1000,
          camOutlineTop: true,
          camOutlineDown: 4,
          camOutlineOver: 0.4,
          camOutlineOverCount: 1,
          camOutlineSpeed: 800,
          camOutlinePlunge: 250,
          camOutlineWide: false,
          camOutlineDogbone: true,
          camOutlineOmitThru: false,
          camOutlineOmitVoid: false,
          camOutlineOut: true,
          camOutlineIn: false,
          camOutlineOn: true,
          camContourTool: 1000,
          camContourSpindle: 1000,
          camContourOver: 0.5,
          camContourSpeed: 1000,
          camContourAngle: 85,
          camContourLeave: 0,
          camContourReduce: 2,
          camContourBottom: false,
          camContourCurves: false,
          camContourIn: false,
          camContourXOn: true,
          camContourYOn: true,
          camLatheTool: 1000,
          camLatheSpindle: 1000,
          camLatheOver: 0.1,
          camLatheAngle: 1,
          camLatheSpeed: 500,
          camLatheLinear: true,
          camTolerance: 0,
          camTraceTool: 1000,
          camTraceSpindle: 1000,
          camTraceType: "follow",
          camTraceOver: 0.5,
          camTraceDown: 0,
          camTraceThru: 0,
          camTraceSpeed: 250,
          camTracePlunge: 200,
          camTraceOffOver: 0,
          camTraceDogbone: false,
          camTraceMerge: true,
          camTraceLines: false,
          camTraceZTop: 0,
          camTraceZBottom: 0,
          camPocketSpindle: 1000,
          camPocketTool: 1000,
          camPocketOver: 0.25,
          camPocketDown: 1,
          camPocketSpeed: 250,
          camPocketPlunge: 200,
          camPocketExpand: 0,
          camPocketSmooth: 0,
          camPocketRefine: 20,
          camPocketFollow: 5,
          camPocketContour: false,
          camPocketEngrave: false,
          camPocketOutline: false,
          camPocketZTop: 0,
          camPocketZBottom: 0,
          camDrillTool: 1000,
          camDrillSpindle: 1000,
          camDrillDownSpeed: 250,
          camDrillDown: 5,
          camDrillDwell: 250,
          camDrillLift: 2,
          camDrillMark: false,
          camDrillingOn: false,
          camRegisterSpeed: 1000,
          camRegisterThru: 5,
          camFlipAxis: "X",
          camFlipOther: "",
          camLaserEnable: ["M321"],
          camLaserDisable: ["M322"],
          camLaserOn: ["M3"],
          camLaserOff: ["M5"],
          camLaserSpeed: 100,
          camLaserPower: 1,
          camLaserAdaptive: false,
          camLaserAdaptMod: false,
          camLaserFlatten: false,
          camLaserFlatZ: 0,
          camLaserPowerMin: 0,
          camLaserPowerMax: 1,
          camLaserZMin: 0,
          camLaserZMax: 0,
          camTabsWidth: 5,
          camTabsHeight: 5,
          camTabsDepth: 5,
          camTabsMidline: false,
          camDepthFirst: false,
          camEaseDown: false,
          camEaseAngle: 10,
          camOriginTop: true,
          camZAnchor: "middle",
          camZOffset: 0,
          camZTop: 0,
          camZBottom: 0,
          camZClearance: 1,
          camZThru: 0,
          camFastFeed: 6000,
          camFastFeedZ: 300,
          camFlatness: 0.001,
          camContourBridge: 0,
          camStockX: 20,
          camStockY: 5,
          camStockZ: 5,
          camStockOffset: true,
          camStockClipTo: false,
          camStockIndexed: false,
          camStockIndexGrid: true,
          camIndexAxis: 0,
          camIndexAbs: true,
          camConventional: false,
          camOriginCenter: false,
          camOriginOffX: 0,
          camOriginOffY: 0,
          camOriginOffZ: 0,
          outputInvertX: false,
          outputInvertY: false,
          camExpertFast: false,
          camTrueShadow: false,
          camForceZMax: false,
          camFirstZMax: false,
          camToolInit: true,
          camFullEngage: 0.8,
          ops: [
            {
              type: "outline",
              tool: 1000,
              spindle: 1000,
              step: 0.4,
              steps: 1,
              down: 4,
              rate: 800,
              plunge: 250,
              dogbones: true,
              omitvoid: false,
              omitthru: false,
              outside: true,
              inside: false,
              wide: false,
              top: true,
              ov_topz: 0,
              ov_botz: 0,
              ov_conv: false,
            },
            {
              type: "|",
            },
          ],
          op2: [],
          camDrillThru: 5,
          camDrillPrecision: 1,
          "~camConventional": false,
        })
      )
      .then((eng) =>
        eng.setDevice({
          mode: "CAM",
          internal: 0,
          bedHeight: 2.5,
          bedWidth: 400,
          bedDepth: 400,
          maxHeight: 150,
          originCenter: false,
          spindleMax: 0,
          gcodePre: [
            "G21 ; set units to MM (required)",
            "G90 ; absolute position mode (required)",
          ],
          gcodePost: ["M30 ; program end"],
          gcodeDwell: ["G4 P{time} ; dwell for {time}ms"],
          gcodeSpindle: [],
          gcodeChange: ["M6 T{tool} ; change tool to '{tool_name}'"],
          gcodeFExt: "nc",
          gcodeSpace: true,
          gcodeStrip: true,
          new: false,
          deviceName: "Any.Generic.Grbl",
          imageURL: "",
          useLaser: false,
        })
      )
      .then((eng) => eng.slice())
      .then((eng) => eng.prepare())
      .then((eng) => eng.export())
      .then((gcode) => {
        console.log("GCode generated:", gcode);
        const blob = new Blob([gcode], { type: "text/plain" });
        const fileName = "output.gcode";
        saveAs(blob, fileName); // Use FileSaver.js to save the GCode file
      })
      .catch((error) => {
        console.error("Kiri:Moto Error:", error);
      })
      .finally(() => {
        // Clean up the temporary URL after the file is saved
        setTimeout(() => URL.revokeObjectURL(stlUrl), 1000);
      });
  };

  return (
    <div style={{ display: "none" }}>
      <h1>Kiri:Moto Integration</h1>
      <button id="kirimoto-button" onClick={() => runKirimoto(kiriEngine)}>
        Run Kiri:Moto
      </button>
    </div>
  );
};

export default KiriMotoIntegration;
