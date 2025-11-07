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
  const STOCK_MARGIN = 10;
  const CUT_THROUGH = cutThrough || 0.25; // Default cut-through thickness if not provided
  console.log(CUT_THROUGH);

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
      //const bounds = eng.widget.getBoundingBox();
      //const x = bounds.max.x - bounds.min.x;
      //const y = bounds.max.y - bounds.min.y;
      //const z = bounds.max.z - bounds.min.z;
      return eng.setStock({ x: 5, y: 5, z: 0 }); // camStockOffset is true so set offset by 5mm in each direction for safety margin
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
      // Determine if project uses metric units
      const projectUnits = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
      const isMetric = projectUnits === "MM";

      return eng.setTools([
        {
          id: 1000,
          number: 1,
          type: "endmill",
          name: "endmill",
          metric: isMetric,
          shaft_diam: toolSize,
          shaft_len: 1,
          flute_diam: toolSize,
          flute_len: 2,
          taper_tip: 0,
          order: 5,
        },
      ]);
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.25); // 25% - Tools set
      const bounds = eng.widget.getBoundingBox();
      const z = bounds.max.z - bounds.min.z;
      const zBottom = z; // ensure cut through stock bottom

      /*Hack for kiri 4.3.0*/
      //const validPasses = passes;
      //const down = validPasses == 1 ? 1000 : zBottom / (validPasses - 1);

      /*End Hack for kiri 4.3.0, add cut through in down value and set camzThru to 0 to avoid extra pass, set camZBottom to real value (not 1000)*/
      const down = (zBottom + CUT_THROUGH) / passes;
      const camZBottom = -zBottom - CUT_THROUGH;
      const camZThru = passes > 1 ? 0 : CUT_THROUGH;

      console.log("Down per pass:", down);
      console.log("CAM Z Bottom:", camZBottom);
      console.log("CAM Z Thru:", camZThru);

      return eng.setProcess({
        camEaseAngle: 10,
        camEaseDown: true,
        camZAnchor: "bottom",
        camDepthFirst: false,
        camZThru: camZThru,
        camZClearance: 3,
        camZTop: 0, //top of stock
        camStockOffset: true,
        camZBottom: camZBottom, //-zBottom, // temp hack to get around setTopZ bug
        camToolInit: true,
        camOutlineSpeed: speed,
        camRetractFeed: 300,
        camSpindleSpeed: speed,
        camFastFeed: 6000,
        camFastFeedZ: speed, // Match Z feed to speed to maintain feedrate during ramp down
        ops: [
          {
            type: "rough",
            tool: 1000,
            spindle: 1000,
            down: down,
            step: 10,
            rate: speed,
            plunge: speed,
            leave: 0,
            leavez: 0,
            all: false,
            voids: true,
            flats: true,
            inside: true,
            omitthru: true,
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
            down: down, // https://forum.grid.space/t/cam-kirimoto-api-help/2511/22
            rate: speed,
            plunge: speed, // Match plunge rate to XY feedrate for consistent speed during ramp down
            dogbones: false,
            omitvoid: false,
            omitthru: false,
            outside: false,
            inside: true,
            wide: false,
            top: false,
            ov_topz: 0,
            ov_botz: 0,
            ov_conv: true,
          },
          {
            type: "outline",
            tool: 1000,
            spindle: 1000,
            step: 0.4,
            steps: 1,
            down: down, // https://forum.grid.space/t/cam-kirimoto-api-help/2511/22
            rate: speed,
            plunge: speed, // Match plunge rate to XY feedrate for consistent speed during ramp down
            dogbones: false,
            omitvoid: false,
            omitthru: true,
            outside: false,
            inside: false,
            wide: false,
            top: false,
            ov_topz: 0,
            ov_botz: 0,
            ov_conv: true,
          },
          /*{
            type: "rough",
            tool: 1000,
            spindle: 1000,
            down: 1000,
            step: 1,
            rate: 1000,
            plunge: 250,
            leave: 0,
            leavez: 0,
            all: false,
            voids: true,
            flats: true,
            inside: true,
            omitthru: false,
            ov_topz: 0,
            ov_botz: 0,
            ov_conv: false,
          },*/
        ],
      });
    })
    .then((eng) => {
      // Determine G-code units command based on project units
      const projectUnits = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
      const unitsCommand =
        projectUnits === "MM"
          ? "G21 ; set units to MM (required)"
          : "G20 ; set units to inches (required)";

      return eng.setDevice({
        mode: "CAM",
        internal: 0,
        bedHeight: 2.5,
        bedWidth: 678.18,
        bedDepth: 1524,
        maxHeight: 150,
        originCenter: false,
        spindleMax: 24000,
        gcodePre: [
          unitsCommand,
          "G90 ; absolute position mode (required)",
          "G0 F3000 ; set default rapid move feedrate",
          "G1 F1000 ; set default cutting feedrate",
        ],
        gcodePost: ["M05 ; spindle off", "M30 ; program end"],
        gcodeDwell: ["G4 P{time} ; dwell for {time}ms"],
        gcodeSpindle: ["M3 S{speed} ; spindle on at {spindle} rpm"],
        gcodeChange: [
          "M05 ; spindle off",
          "M6 T{tool} ; change tool to '{tool_name}'",
          "G37; get tool offset with ETS",
        ],
        gcodeFExt: "nc",
        gcodeSpace: true,
        gcodeStrip: false,
        deviceName: "Tormach.24R",
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
