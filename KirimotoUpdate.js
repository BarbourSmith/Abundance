import { Engine } from "./engine.js";
import GlobalVariables from "./src/js/globalvariables.js";

const display_message = (message) => {
  console.log(message);
};

const kiriEngine = new Engine({ workURL: "./worker.js" });
console.log(kiriEngine);

const generateGcode = (
  stlUrl,
  centerPos,
  toolSize,
  passes,
  speed,
  extra,
  gcodeCallback,
  progressCallback
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
      if (progressCallback) progressCallback(0.1); // 10% - STL loaded
      return eng.setMode("CAM");
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.15); // 15% - Mode set to CAM
      const bounds = eng.widget.getBoundingBox();
      const x = bounds.max.x - bounds.min.x;
      const y = bounds.max.y - bounds.min.y;
      const z = bounds.max.z - bounds.min.z;
      return eng.setStock({
        x: x + 10,
        y: y + 10,
        z: z + 10,
        center: {
          x: x / 2,
          y: y / 2,
          z: 12.5,
        },
      });
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.2); // 20% - Stock set
      return eng.moveTo(centerPos[0], centerPos[1], 0); //Move the model to line up with where the parts were before
    })
    .then((eng) =>
      eng.setTools([
        {
          id: 1000,
          number: 1,
          type: "endmill",
          name: "end 1/4",
          metric: GlobalVariables.topLevelMolecule.unitsKey === "MM",
          shaft_diam: toolSize,
          shaft_len: 1,
          flute_diam: toolSize,
          flute_len: 2,
          taper_tip: 0,
          order: 5,
        },
      ])
    )
    .then((eng) => {
      if (progressCallback) progressCallback(0.25); // 25% - Tools set
      const bounds = eng.widget.getBoundingBox();
      const x = bounds.max.x - bounds.min.x;
      const y = bounds.max.y - bounds.min.y;
      const z = bounds.max.z - bounds.min.z;
      return eng.setProcess({
        camEaseAngle: 10,
        camEaseDown: true,
        camZAnchor: "bottom",
        camDepthFirst: false,
        camZThru: 1.524,
        camZBottom: -25, // temp hack to get around setTopZ bug
        camToolInit: true,
        ops: [
          {
            type: "outline",
            tool: 1000,
            spindle: 13000,
            step: 0.4,
            steps: 1,
            down: z / passes,
            rate: 635,
            plunge: 51,
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
            spindle: 13000,
            step: 0.4,
            steps: 1,
            down: z / passes,
            rate: 635,
            plunge: 51,
            dogbones: false,
            omitvoid: false,
            omitthru: true,
            outside: true, // Cut outside edges after interior
            inside: false,
            wide: false,
            top: false,
            ov_topz: 0,
            ov_botz: 0,
            ov_conv: true,
          },
        ],
      });
    })
    .then((eng) =>
      eng.setDevice({
        mode: "CAM",
        internal: 0,
        bedHeight: 2.5,
        bedWidth: 678.18,
        bedDepth: 1524,
        maxHeight: 150,
        originCenter: false,
        spindleMax: 24000,
        gcodePre: [
          "G20 ; set units to inches (required)",
          "G90 ; absolute position mode (required)",
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
      })
    )
    .then((eng) => {
      if (progressCallback) progressCallback(0.5); // 50% - Process set
      startSlicingProgress();
      return eng.slice();
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.9); // 80% - Slicing done
      return eng.prepare();
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.95); // 95% - Preparing for export
      return eng.export();
    })
    .then((gcode) => {
      console.log("G-code generated successfully.");
      console.log(gcode);
      gcodeCallback(gcode); // Only call the callback, don't download
      if (progressCallback) progressCallback(1.0); // 100% - Export complete
    })
    .catch((error) => {
      stopSlicingProgress(); // Ensure timer is cleaned up on error
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
