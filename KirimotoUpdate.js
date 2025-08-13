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
    .then((eng) => {
      if (progressCallback) progressCallback(0.1); // 10% - STL loaded
      return eng.moveTo(centerPos[0], centerPos[1], 0); //Move the model to line up with where the parts were before
    })
    .then((eng) => {
      if (progressCallback) progressCallback(0.15); // 15% - Model moved
      return eng.setMode("CAM");
    })
    .then((eng) => {
      const bounds = eng.widget.getBoundingBox();

      if (progressCallback) progressCallback(0.2); // 20% - Mode set
      const x = bounds.max.x - bounds.min.x;
      const y = bounds.max.y - bounds.min.y;
      const z = bounds.max.z - bounds.min.z;
      eng.setStock({
        x: x + 10,
        y: y + 10,
        z: z,
        center: {
          x: x / 2,
          y: y / 2,
          z: z,
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
          metric: GlobalVariables.topLevelMolecule.unitsKey === "MM",
          shaft_diam: toolSize,
          shaft_len: 1,
          flute_diam: toolSize,
          flute_len: 2,
          taper_tip: 0,
        },
      ])
    )
    .then((eng) => {
      if (progressCallback) progressCallback(0.3); // 30% - Tools set
      const bounds = eng.widget.getBoundingBox();
      const z = bounds.max.z - bounds.min.z;
      
      eng.setProcess({
        processName: "default",
        // Disable ALL automatic operation generation
        camRoughOn: false,         // No roughing operations
        camContourXOn: false,      // No X contour operations
        camContourYOn: false,      // No Y contour operations
        camDrillingOn: false,      // No drilling operations
        camDepthFirst: false,      // No depth-first processing
        
        // Basic tool settings
        camOutlineTool: 1000,
        camOutlineSpindle: 1000,
        camOutlineSpeed: speed,
        camOutlinePlunge: 250,
        camOutlineOver: 0.4,
        
        // CRITICAL: Disable global outline multiplier
        camOutlineOverCount: 1,    // Only process operations in ops array, don't multiply
        camOutlineDown: 1,         // Minimal global setting, real control is in ops array
        camOutlineTop: true,
        camOutlineDogbone: true,
        camOutlineOmitThru: false,
        camOutlineOmitVoid: false,
        camOutlineOut: true,
        camOutlineIn: false,
        camOutlineWide: false,
        camOutlineOn: true,        // Enable outline processing
        
        // Minimal required settings
        camOriginTop: true,
        camZAnchor: "middle",
        camZOffset: 0,
        camZTop: 0,
        camZBottom: -1 * extra,
        camZClearance: 1,
        camZThru: 0,
        camFastFeed: 6000,
        camFastFeedZ: 300,
        camOriginCenter: false,
        camOriginOffX: 0,
        camOriginOffY: 0,
        camOriginOffZ: 0,
        camToolInit: true,
        
        // Operation definitions - Create one operation per pass for explicit control
        ops: (() => {
          const operations = [];
          const totalDepth = z + extra;
          const depthPerPass = totalDepth / passes;
          
          // Create one operation for each pass
          for (let i = 1; i <= passes; i++) {
            const currentDepth = depthPerPass * i;
            
            operations.push({
              type: "outline",
              tool: 1000,
              spindle: 1000,
              step: depthPerPass,           // Depth for this specific pass
              steps: 1,                     // Single step per operation
              down: currentDepth,           // Depth for this pass
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
            });
          }
          
          // Add separator
          operations.push({
            type: "|",
          });
          
          return operations;
        })(),
        op2: [],
      });
      
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
    .then((eng) => {
      if (progressCallback) progressCallback(0.5); // 50% - Process set
      startSlicingProgress();
      return eng;
    })
    .then((eng) => eng.slice())
    .then((eng) => {
      if (progressCallback) progressCallback(0.8); // 80% - Slicing done
      stopSlicingProgress(); // Stop the slicing progress timer
      
      return eng;
    })
    .then((eng) => eng.prepare())
    .then((eng) => {
      if (progressCallback) progressCallback(0.9); // 90% - Preparation done
      return eng;
    })
    .then((eng) => eng.export())
    .then((gcode) => {
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
