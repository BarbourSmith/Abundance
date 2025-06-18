import GlobalVariables from "../../js/globalvariables.js";
import { saveAs } from "file-saver";


let kiriEngine = null;

export const initKiriMoto = () => {
  // Dynamically load the Kiri:Moto script
  const script = document.createElement("script");
  script.src = "https://grid.space/code/engine.js"; // this comes from the grid.space Kiri:Moto API -- https://docs.grid.space/projects/kiri-moto/apis
  script.async = true;
  script.onload = () => {
    if (window.kiri) {
      kiriEngine = window.kiri.newEngine();
    }
  };

  script.onerror = () => {
    console.error("Failed to load Kiri:Moto script");
  };
  document.body.appendChild(script);
};

//This function generates G-code and calls the callback but doesn't download
export const generateKirimoto = (stlUrl, centerPos, toolSize, passes, speed, extra, gcodeCallback) => {
    
    kiriEngine = window.kiri.newEngine(); //Create a new Kiri:Moto engine instance to start with a clean slate

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
        return eng.move(centerPos[0],centerPos[1],0);//Move the model to line up with where the parts were before
    })
    .then((eng) => {
    //   console.log("Kiri:Moto STL loaded successfully");
      return eng.setMode("CAM");
    })
    .then((eng) =>{
      const bounds = eng.widget.getBoundingBox();
      const x = bounds.max.x - bounds.min.x;
      const y = bounds.max.y - bounds.min.y;
      const z = bounds.max.z - bounds.min.z;
      eng.setStock({
        x: x + 10,
        y: y + 10,
        z: z,
        center: {
          x: x/2, //I'm not sure this is right. We might need to actually find the middle of the bounds
          y: y/2,
          z: z/2,
        },
      });
      return eng;
    })
    .then((eng) =>
      eng.setTools([
        {
          id: 1000,
          number: 1,
          type: "endmill",
          name: "end 1/4",
          metric: false,
          shaft_diam: toolSize,
          shaft_len: 1,
          flute_diam: 0.25,
          flute_len: 2,
          taper_tip: 0,
        },
      ])
    )
    .then((eng) => {
      const bounds = eng.widget.getBoundingBox();
      const z = bounds.max.z - bounds.min.z;
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
        camRoughDown: z / passes,
        camRoughOver: 0.4,
        camRoughSpeed: speed,
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
        camOutlineDown: z / passes,
        camOutlineOver: 0.4,
        camOutlineOverCount: 1,
        camOutlineSpeed: speed,
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
        camContourSpeed: speed,
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
        camTraceSpeed: speed,
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
        camPocketSpeed: speed,
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
        camDepthFirst: true,
        camEaseDown: false,
        camEaseAngle: 10,
        camOriginTop: true,
        camZAnchor: "middle",
        camZOffset: 0,
        camZTop: 0,
        camZBottom: -1 * extra,
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
            step: (z+extra) / passes,
            steps: 1,
            down: (z+extra) / passes,
            rate: speed,
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
      return eng;
    })
    .then((eng) =>
      eng.setDevice({
        mode: "CAM",
        internal: 0,
        bedHeight: 2.5,
        bedWidth: 10000,
        bedDepth: 10000,
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
      gcodeCallback(gcode); // Only call the callback, don't download
    })
    .catch((error) => {
      console.error("Kiri:Moto Error:", error);
    })
    .finally(() => {
      // Clean up the temporary URL after generation
      setTimeout(() => URL.revokeObjectURL(stlUrl), 1000);
    });
};

//Function to download G-code from a G-code string
export const downloadGcode = (gcode, filename = "output.gcode") => {
  if (!gcode) {
    console.error("No G-code available to download.");
    return;
  }
  
  const blob = new Blob([gcode], { type: "text/plain" });
  saveAs(blob, filename);
};