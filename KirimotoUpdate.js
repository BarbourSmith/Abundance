import { Engine } from "./engine.js";
import GlobalVariables from "./src/js/globalvariables.js";

const display_message = (message) => {
  console.log(message);
};

const kiriEngine = new Engine({ workURL: "/worker.js" });

const generateGcode = (
  stlUrl,
  centerPos,
  toolSize,
  passes,
  speed,
  cutThrough,
  gcodeCallback,
  progressCallback,
  partProgressCallback,
  tool
) => {
  if (!stlUrl) {
    console.error("STL URL is not available.");
    return;
  }

  // Track slicing progress with a timer
  let slicingTimer = null;
  let slicingStartTime = null;
  let slicingProgressStart = 0.6;
  let slicingProgressEnd = 0.8;

  const startSlicingProgress = () => {
    slicingStartTime = Date.now();
    let currentProgress = slicingProgressStart;

    slicingTimer = setInterval(() => {
      const elapsed = Date.now() - slicingStartTime;
      // Gradually increase progress over time, with diminishing returns
      // This creates a more realistic progress feel during slicing
      const timeBasedProgress = Math.min(
        0.18,
        0.18 * (1 - Math.exp(-elapsed / 10000))
      ); // Exponential approach to 0.18 (80%-60%)
      currentProgress = slicingProgressStart + timeBasedProgress;

      if (progressCallback && currentProgress < slicingProgressEnd) {
        progressCallback(currentProgress);
      }
    }, 500); // Update every 500ms during slicing
  };

  const stopSlicingProgress = () => {
    if (slicingTimer) {
      clearInterval(slicingTimer);
      slicingTimer = null;
    }
  };

  console.log(kiriEngine);

  kiriEngine
    .setListener((message) => {
      // Check if message contains slicing progress information
      if (message && typeof message === "object") {
        if (message.progress !== undefined && slicingStartTime) {
          // If Kiri:Moto provides progress during slicing, use it
          const slicingProgress =
            slicingProgressStart +
            (slicingProgressEnd - slicingProgressStart) * message.progress;
          if (progressCallback) progressCallback(slicingProgress);
        }
      }
    })
    .load(stlUrl)
    // should to call widget.setTopZ here ideally
    .then((eng) => {
      eng.widget.boundingBoxNeedsUpdate = true; // Ensure bounding box is updated
      if (progressCallback) progressCallback(0.1); // 10% - STL loaded
      return eng.setMode("CAM");
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.15); // 15% - Mode set to CAM
      return eng.setStock({
        x: 80,
        y: 80,
        z: 10,
        center: {
          x: 0,
          y: 0,
          z: 5,
        },
      });
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.2); // 20% - Stock set
      if (GlobalVariables.topLevelMolecule?.unitsKey === "Inches") {
        eng.widget.scale(25.4, 25.4, 25.4); // Scale from mm to inches (1 inch = 25.4 mm)
        eng.moveTo(centerPos[0] * 25.4, centerPos[1] * 25.4, 0); // move part so top is at Z=0
        return eng;
      }
      eng.moveTo(centerPos[0], centerPos[1], 0); // move part so top is at Z=0
      return eng;
    })
    .then((eng) => {
      return eng.setTools([
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
          shaft_diam: 3.175,
          shaft_len: 11,
          flute_diam: 3.175,
          flute_len: 17,
          taper_angle: 5.3,
          taper_tip: 0,
        },
        {
          id: 1004,
          number: 5,
          type: "ballmill",
          name: "ball 1/8",
          metric: false,
          shaft_diam: 3.175,
          shaft_len: 16,
          flute_diam: 3.175,
          flute_len: 22,
          taper_tip: 0,
        },
      ]);
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.25); // 25% - Tools set
      return eng.setProcess({
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
        camRoughOver: 0.9,
        camRoughSpeed: 2000,
        camRoughPlunge: 250,
        camRoughStock: 0,
        camRoughStockZ: 0,
        camRoughAll: true,
        camRoughVoid: false,
        camRoughFlat: true,
        camRoughTop: false,
        camRoughIn: true,
        camRoughOn: true,
        camRoughOmitVoid: false,
        camOutlineTool: 1000,
        camOutlineSpindle: 1000,
        camOutlineTop: false,
        camOutlineDown: 2,
        camOutlineOver: 0.4,
        camOutlineOverCount: 1,
        camOutlineSpeed: 2000,
        camOutlinePlunge: 250,
        camOutlineWide: false,
        camOutlineDogbone: false,
        camOutlineOmitThru: true,
        camOutlineOmitVoid: true,
        camOutlineOut: false,
        camOutlineIn: false,
        camOutlineOn: true,
        camContourTool: 1000,
        camContourSpindle: 1000,
        camContourOver: 0.75,
        camContourSpeed: 2000,
        camContourAngle: 85,
        camContourLeave: 0,
        camContourReduce: 2,
        camContourBottom: false,
        camContourCurves: false,
        camContourIn: true,
        camContourXOn: true,
        camContourYOn: true,
        camLatheTool: 1000,
        camLatheSpindle: 1000,
        camLatheOver: 0.1,
        camLatheAngle: 1,
        camLatheSpeed: 500,
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
        camTraceLines: false,
        camPocketSpindle: 1000,
        camPocketTool: 1000,
        camPocketOver: 0.9,
        camPocketDown: 3,
        camPocketSpeed: 2000,
        camPocketPlunge: 200,
        camPocketExpand: 0,
        camPocketSmooth: 0,
        camPocketRefine: 20,
        camPocketFollow: 5,
        camPocketContour: false,
        camPocketEngrave: false,
        camPocketOutline: false,
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
        camTabsWidth: 10,
        camTabsHeight: 5,
        camTabsDepth: 2,
        camTabsMidline: false,
        camDepthFirst: true,
        camEaseDown: false,
        camEaseAngle: 10,
        camOriginTop: true,
        camZAnchor: "bottom",
        camZOffset: 0,
        camZBottom: 0,
        camZClearance: 0.01,
        camZThru: 2,
        camFastFeed: 6000,
        camFastFeedZ: 300,
        camFlatness: 0.001,
        camContourBridge: 0,
        camStockX: 5,
        camStockY: 5,
        camStockZ: 0,
        camStockOffset: true,
        camStockClipTo: false,
        camStockIndexed: false,
        camStockIndexGrid: false,
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
        camToolInit: false,
        camFullEngage: 0.8,
        ops: [
          {
            type: "rough",
            tool: 1000,
            spindle: 1000,
            down: 2,
            step: 0.9,
            rate: 2000,
            plunge: 250,
            leave: 0,
            leavez: 0,
            all: true,
            voids: false,
            flats: true,
            inside: true,
            omitthru: false,
            ov_topz: 0,
            ov_botz: 0,
            ov_conv: false,
          },
          {
            type: "outline",
            tool: 1000,
            spindle: 1000,
            step: 0.4,
            steps: 1,
            down: 2,
            rate: 2000,
            plunge: 250,
            dogbones: false,
            omitvoid: true,
            omitthru: true,
            outside: false,
            inside: false,
            wide: false,
            top: false,
            ov_topz: 0,
            ov_botz: 0,
            ov_conv: false,
          },
          {
            type: "|",
          },
        ],
        op2: [],
        camLatheLinear: true,
        camTraceDogbone: false,
        camTraceMerge: true,
        camTraceZTop: 0,
        camTraceZBottom: 0,
        camPocketZTop: 0,
        camPocketZBottom: 0,
        camZTop: 0,
        camDrillThru: 5,
        camDrillPrecision: 1,
        camDrillFromStockTop: false,
        camArcEnabled: false,
        camArcTolerance: 0.15,
        camArcResolution: 5,
        camLevelStepZ: 0,
        camLevelInset: 0.5,
        camRoughOmitThru: false,
        camRegisterOffset: 10,
        camHelicalTool: 1000,
        camHelicalSpindle: 1000,
        camHelicalDownSpeed: 250,
        camHelicalSpeed: 1000,
        camHelicalDown: 5,
        camHelicalBottomFinish: true,
        camHelicalThru: 0,
        camHelicalOffset: "auto",
        camHelicalForceStartAngle: false,
        camHelicalStartAngle: 0,
        camHelicalOffsetOverride: 0,
        camHelicalEntry: false,
        camHelicalEntryOffset: 0,
        camHelicalReverse: false,
        camHelicalClockwise: true,
        camInnerFirst: false,
        camLatheOffStart: 0,
        camLatheOffEnd: 0,
      });
    })
    .then((eng) => {
      return eng.setDevice({
        mode: "CAM",
        internal: 0,
        bedHeight: 2.5,
        bedWidth: 1220,
        bedDepth: 2400,
        maxHeight: 80,
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
        deviceName: "V1Engineering.Lowrider3",
        imageURL: "",
        useLaser: false,
      });
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.5); // 50% - Process set
      console.log(kiriEngine);
      startSlicingProgress();
      return eng.slice();
    })
    .then((eng) => {
      stopSlicingProgress();
      if (progressCallback) progressCallback(0.9); // 80% - Slicing done
      return eng.prepare();
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.95); // 95% - Preparing for export
      return eng.export();
    })
    .then((gcode) => {
      console.log("G-code generated successfully.");

      if (progressCallback) progressCallback(1.0); // 100% - Export complete
      gcodeCallback(gcode); // Only call the callback, don't download
    })
    .catch((error) => {
      // Ensure timer is cleaned up on error
      stopSlicingProgress();
      console.error("Kiri:Moto Error:", error);
    })
    .finally(() => {
      // Clean up the temporary URL after generation
      setTimeout(() => URL.revokeObjectURL(stlUrl), 1000);
    });
};

Object.assign(window, {
  generateGcode,
});
