import { Engine } from "./engine.js";
import GlobalVariables from "./src/js/globalvariables.js";

const generateGcode = (
  stlUrl,
  centerPos,
  toolSize,
  passes,
  speed,
  cutThrough,
  progressCallback,
  tool,
  flats,
) => {
  return new Promise((resolve, reject) => {
    const kiriEngine = new Engine({ workURL: "/worker.js" });
    const CUT_THROUGH = cutThrough;
    const stock_offset = {
      x: 3,
      y: 3,
      z: 1,
    };
    const plunge = speed;

    if (!passes || passes <= 0) {
      reject(new Error("'passes' must be greater than 0."));
      return;
    }
    if (!stlUrl) {
      reject(new Error("STL URL is not available."));
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
          0.18 * (1 - Math.exp(-elapsed / 10000)),
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
      .then((eng) => {
        eng.widget.boundingBoxNeedsUpdate = true; // Ensure bounding box is updated
        if (progressCallback) progressCallback(0.1); // 10% - STL loaded

        eng.setMode("CAM");

        eng.moveTo(-centerPos[0], centerPos[1], 0);
        // Determine if project uses metric units
        const projectUnits = GlobalVariables.topLevelMolecule?.unitsKey || "MM";
        const isMetric = projectUnits === "MM";

        eng.setTools([
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

        if (progressCallback) progressCallback(0.25); // 25% - Tools set

        const bounds = eng.widget.getBoundingBox();
        const totalDepth = bounds.dim.z + CUT_THROUGH;
        const depthPerPass = totalDepth / passes;
        const stepOver = 0.8;
        // camZAnchor is only for UI
        eng.setOrigin(bounds.mid.x, bounds.mid.y, bounds.max.z);

        // camStockOffset is only reliable in UI
        eng.setStock({
          x: bounds.dim.x + stock_offset.x,
          y: bounds.dim.y + stock_offset.y,
          z: bounds.dim.z + stock_offset.z,
        });

        // Build operations array with interior-first cutting order
        const ops = [
          {
            all: false,
            disabled: false,
            down: totalDepth,
            flats: false,
            inside: true,
            leave: 0,
            leavez: 0,
            omitthru: true,
            ov_botz: 0,
            ov_conv: false,
            ov_topz: 0,
            plunge: plunge,
            rate: speed,
            spindle: 13000,
            step: stepOver,
            tool: 1000,
            type: "rough",
            voids: false,
          },
          {
            disabled: false,
            down: 0,
            flats: flats,
            leave: 0,
            leavez: 0,
            mode: "clear",
            ov_botz: 0,
            ov_conv: false,
            ov_topz: bounds.max.z,
            plunge: plunge,
            rate: speed,
            shadow: true,
            spindle: 13000,
            step: stepOver,
            tool: 1000,
            type: "area",
          },
        ];

        // For each pass, add interior cut first, then exterior cut
        for (let i = 1; i <= passes; i++) {
          const currentDepth = depthPerPass * i;

          // First: Cut interior shapes (inside cuts)
          ops.push({
            disabled: false,
            dogbones: true,
            down: currentDepth,
            inside: true,
            omitthru: false,
            omitvoid: false,
            outside: false,
            ov_botz: 0,
            ov_conv: false,
            ov_topz: 0,
            plunge: plunge,
            rate: speed,
            spindle: 13000,
            step: depthPerPass,
            steps: 1,
            tool: 1000,
            top: true,
            type: "outline",
            wide: false,
          });

          // Second: Cut exterior shapes (outside cuts)
          ops.push({
            disabled: false,
            dogbones: false,
            down: currentDepth,
            inside: false,
            omitthru: false,
            omitvoid: false,
            outside: true,
            ov_botz: -CUT_THROUGH,
            ov_conv: true,
            ov_topz: 0,
            plunge: plunge,
            rate: speed,
            spindle: 13000,
            step: depthPerPass,
            steps: 1,
            tool: 1000,
            top: false,
            type: "outline",
            wide: false,
          });
        }

        eng.setProcess({
          camDepthFirst: true,
          camEaseAngle: 40,
          camEaseDown: true,
          camOriginTop: true,
          camOriginCenter: true,
          camStockOffset: false,
          camToolInit: true,
          //zBottom: -bounds.max.z - CUT_THROUGH,
          ops: ops,
        });

        const unitsCommand =
          projectUnits === "MM"
            ? "G21 ; set units to MM (required)"
            : "G20 ; set units to inches (required)";
        //
        return eng.setDevice({
          mode: "CAM",
          internal: 0,
          bedHeight: 2.5,
          bedWidth: 678.18,
          bedDepth: 1524,
          maxHeight: 150,
          spindleMax: 24000,
          gcodePre: [unitsCommand, "G90 ; absolute position mode (required)"],
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
        resolve(gcode);
      })
      .catch((error) => {
        // Ensure timer is cleaned up on error
        stopSlicingProgress();
        console.error("Kiri:Moto Error:", error);
        reject(error);
      })
      .finally(() => {
        // Clean up the temporary URL after generation
        setTimeout(() => URL.revokeObjectURL(stlUrl), 1000);
      });
  });
};

Object.assign(window, {
  generateGcode,
});
