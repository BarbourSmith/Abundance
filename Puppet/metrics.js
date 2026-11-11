import puppeteer from "puppeteer";
import fs from "fs";
import projects_to_test from "./projects_to_test.js";

/**
 * Abundance Performance Metrics Test
 *
 * Loads each project in projects_to_test.js several times and records:
 *   - Cold load time: navigation to the project finishing its computation,
 *     in a fresh browser profile (empty geometry cache)
 *   - Warm load time: the same, reloading with the geometry cache filled
 *   - Geometry cache size and entry count, project file size
 *   - GCode generation and visualization time, for projects with GCode atoms
 *
 * Two or more builds can be measured in one run ("targets", each served on
 * its own port). Rounds alternate between targets so anything that slows the
 * machine down during the run affects them equally. Compare the results with
 * compareMetrics.js.
 *
 * To keep the timings about the code and not the network, each GitHub
 * response is fetched once and replayed from memory for every later load.
 * A load ends when nothing has computed for SETTLE_QUIET_MS; the time recorded
 * is when the last computation finished, not when the quiet period ended.
 *
 * Usage:
 *   node Puppet/metrics.js [--target name=url ...] [--runs N] [--out file.json]
 *
 * With no target, it measures http://localhost:4444 as "local".
 */

const projectUser = "moatmaslow";

// GCode generation timeout and polling configuration
const GCODE_GENERATION_TIMEOUT_MS = 60000; // 60 seconds max for GCode generation
const GCODE_POLLING_INTERVAL_MS = 100; // Check generation status every 100ms

/**
 * Get the size of IndexedDB database storage
 * @param {Object} page - Puppeteer page object
 * @param {string} dbName - Database name
 * @returns {Promise<number>} Size in bytes
 */
async function getIndexedDBSize(page, dbName) {
  return await page.evaluate(async (dbName) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);

      request.onsuccess = function (event) {
        const db = event.target.result;
        let totalSize = 0;

        // Get all object stores
        const storeNames = Array.from(db.objectStoreNames);

        if (storeNames.length === 0) {
          db.close();
          resolve({ totalSize: 0, entryCount: 0 });
          return;
        }

        try {
          const transaction = db.transaction(storeNames, "readonly");

          transaction.onerror = function () {
            db.close();
            reject(new Error("Transaction error: " + transaction.error));
          };

          const keyedSizes = {};

          storeNames.forEach((storeName) => {
            const objectStore = transaction.objectStore(storeName);
            const request = objectStore.openCursor();
            request.onsuccess = function () {
              const cursor = request.result;
              if (cursor) {
                const record = cursor.value;
                const recordString = JSON.stringify(record);
                const recordBlob = new Blob([recordString]);
                const keyBlob = new Blob([JSON.stringify(cursor.key)]);
                totalSize += recordBlob.size + keyBlob.size;
                keyedSizes[cursor.key] = recordBlob.size;
                cursor.continue();
              } else {
                db.close();
                resolve({
                  totalSize,
                  entryCount: Object.keys(keyedSizes).length,
                  keyedSizes,
                });
              }
            };

            request.onerror = function () {
              db.close();
              reject(new Error("ObjectStore error: " + request.error));
            };
          });
        } catch (err) {
          db.close();
          reject(err);
        }
      };

      request.onerror = function () {
        reject(new Error("Database open error: " + request.error));
      };
    });
  }, dbName);
}

/**
 * Clear IndexedDB cache for a fresh start
 * @param {Object} browser - Puppeteer browser instance
 */
/**
 * Gets size of the serialized top level molecule in the project
 * @param {} page
 * @returns
 */
async function getProjectFileSize(page) {
  return await page.evaluate(() => {
    try {
      // Access the global variable (adjust path if needed)
      if (!window.GlobalVarsForPuppeteer?.topLevelMolecule) {
        throw new Error("window.GlobalVarsForPuppeteer not found");
      }

      // Call serialize on the molecule
      const serialized =
        window.GlobalVarsForPuppeteer.topLevelMolecule.serialize();
      console.log("Serialized project:", serialized);
      // Convert to JSON string and measure size
      const jsonString = JSON.stringify(serialized, null, 2);
      const blob = new Blob([jsonString]);

      return {
        size: blob.size,
        rawJson: serialized,
      };
    } catch (error) {
      console.error("Error getting project file size:", error);
      return { size: 0, rawJson: "", error: error.message };
    }
  });
}
/**
 * Get GCode generation and visualization metrics
 * 
 * This function measures performance metrics for GCode generation and visualization:
 * - Recursively detects all GCode atoms in the project (including those inside nested molecules and GitHub molecules)
 * - Triggers GCode generation if not already generated
 * - Measures the time taken to generate GCode
 * - Measures the time taken to visualize GCode (via visualizeGcodeIncremental)
 * - Counts GCode lines and commands
 * - Tracks the size of the generated GCode
 * 
 * The metrics help identify:
 * - Performance regressions in GCode generation
 * - Performance regressions in GCode visualization
 * - Changes in GCode output size/complexity
 * - Visualization performance for different GCode sizes
 * 
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} GCode metrics object containing:
 *   - hasGcodeAtom: boolean - whether the project has any GCode atoms
 *   - gcodeAtomCount: number - count of GCode atoms found (including nested ones)
 *   - atoms: array - metrics for each GCode atom including:
 *     - atomName: string - name of the atom
 *     - gcodeGenerated: boolean - whether GCode was generated
 *     - gcodeLength: number - length of GCode string in characters
 *     - gcodeLineCount: number - number of lines in GCode
 *     - gcodeCommandCount: number - number of G/M commands
 *     - generationTimeMs: number - time to generate GCode in milliseconds
 *     - visualizationTimeMs: number - time to visualize GCode in milliseconds
 *     - generationError: string - error message if generation failed
 *     - visualizationError: string - error message if visualization failed
 */
async function getGcodeMetrics(page) {
  // The callback runs in the browser, so Node-scope constants must be passed in as arguments
  return await page.evaluate(async (generationTimeoutMs, pollingIntervalMs) => {
    try {
      // Access the global variable to get the top-level molecule
      if (!window.GlobalVarsForPuppeteer?.topLevelMolecule) {
        return {
          hasGcodeAtom: false,
          error: "GlobalVarsForPuppeteer.topLevelMolecule not found",
        };
      }

      const molecule = window.GlobalVarsForPuppeteer.topLevelMolecule;

      // Recursively find all Gcode atoms in the project, including those inside nested molecules and GitHub molecules
      const findAllGcodeAtoms = (mol) => {
        let gcodeAtoms = [];
        
        if (!mol.nodesOnTheScreen || !Array.isArray(mol.nodesOnTheScreen)) {
          return gcodeAtoms;
        }
        
        mol.nodesOnTheScreen.forEach((atom) => {
          if (atom.atomType === "Gcode") {
            gcodeAtoms.push(atom);
          }
          // Recursively search inside Molecule and GitHubMolecule atoms
          if (atom.atomType === "Molecule" || atom.atomType === "GitHubMolecule") {
            const nestedGcodeAtoms = findAllGcodeAtoms(atom);
            gcodeAtoms = gcodeAtoms.concat(nestedGcodeAtoms);
          }
        });
        
        return gcodeAtoms;
      };

      // Find all Gcode atoms in the project (including nested ones)
      const gcodeAtoms = findAllGcodeAtoms(molecule);

      if (gcodeAtoms.length === 0) {
        return {
          hasGcodeAtom: false,
          gcodeAtomCount: 0,
        };
      }

      // Collect metrics from all GCode atoms
      const gcodeMetrics = [];

      for (const gcodeAtom of gcodeAtoms) {
        const atomMetrics = {
          atomName: gcodeAtom.name || "Gcode",
          gcodeGenerated: gcodeAtom.gcodeGenerated || false,
          gcodeLength: gcodeAtom.gcodeString
            ? gcodeAtom.gcodeString.length
            : 0,
          isGenerating: gcodeAtom.isGenerating || false,
          progress: gcodeAtom.progress || 0,
        };

        // An atom with no input geometry (for example after a Cut Layout that
        // is waiting for Compute Layout) can never generate, so don't wait out
        // the timeout on it.
        const hasInput = gcodeAtom.findIOValue?.("geometry") != null;
        if (!gcodeAtom.gcodeGenerated && !hasInput) {
          atomMetrics.skipped = `no input geometry (status ${gcodeAtom.status})`;
        }

        // If the GCode hasn't been generated yet, try to generate it and measure
        if (!gcodeAtom.gcodeGenerated && hasInput) {
          try {
            // Trigger GCode generation and measure time
            const genStartTime = performance.now();

            // Create a promise that resolves when generation completes
            const generationPromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("GCode generation timeout")),
                generationTimeoutMs
              );

              // Check if generation completes by polling the gcodeGenerated flag
              const checkInterval = setInterval(() => {
                if (gcodeAtom.gcodeGenerated) {
                  clearInterval(checkInterval);
                  clearTimeout(timeout);
                  resolve();
                }
              }, pollingIntervalMs);
            });

            // Trigger generation - both methods might be async, so we await the promise instead
            if (typeof gcodeAtom._generateGcode === "function") {
              gcodeAtom._generateGcode(); // Fire and forget - promise handles completion
            } else if (typeof gcodeAtom.onUpstreamChange === "function") {
              gcodeAtom.onUpstreamChange(); // Fire and forget - promise handles completion
            }

            // Wait for generation to complete
            await generationPromise;

            const genEndTime = performance.now();
            atomMetrics.generationTimeMs = genEndTime - genStartTime;
            atomMetrics.gcodeLength = gcodeAtom.gcodeString
              ? gcodeAtom.gcodeString.length
              : 0;
          } catch (error) {
            atomMetrics.generationError = error.message;
          }
        }

        // Measure visualization time by triggering visualizeGcodeIncremental
        if (gcodeAtom.gcodeGenerated && gcodeAtom.gcodeString) {
          try {
            const vizStartTime = performance.now();
            
            // Call visualizeGcodeIncremental to measure visualization performance
            const gcodeWire = await window.GlobalVarsForPuppeteer.cad.visualizeGcodeIncremental(
              [gcodeAtom.gcodeString],
              { project: "metrics-test" }
            );
            
            const vizEndTime = performance.now();
            atomMetrics.visualizationTimeMs = vizEndTime - vizStartTime;
          } catch (error) {
            atomMetrics.visualizationError = error.message;
          }
        }

        // Count number of gcode lines
        if (gcodeAtom.gcodeString) {
          const lines = gcodeAtom.gcodeString.split("\n");
          atomMetrics.gcodeLineCount = lines.length;
          // Count G-code commands (lines starting with G or M)
          atomMetrics.gcodeCommandCount = lines.filter((line) =>
            /^\s*[GM]\d/.test(line)
          ).length;
        }

        gcodeMetrics.push(atomMetrics);
      }

      return {
        hasGcodeAtom: true,
        gcodeAtomCount: gcodeAtoms.length,
        atoms: gcodeMetrics,
      };
    } catch (error) {
      return {
        hasGcodeAtom: false,
        error: error.message,
      };
    }
  }, GCODE_GENERATION_TIMEOUT_MS, GCODE_POLLING_INTERVAL_MS);
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const SETTLE_QUIET_MS = 1500;
const SETTLE_POLL_MS = 20;
const SETTLE_TIMEOUT_MS = 180000;

/**
 * Runs in the page before any of its scripts. Polls the project and records
 * the last moment anything was loading or computing, the same test the agent
 * bridge's wait_for_settle uses. Times are performance.now(), so they count
 * from the start of navigation.
 */
function installSettleTracker(quietMs, pollMs) {
  const state = { lastBusyAt: performance.now(), settled: false };
  window.__abundancePerf = state;
  const isProcessing = (molecule) =>
    (molecule.nodesOnTheScreen || []).some(
      (atom) => atom.status === "processing" || isProcessing(atom),
    );
  const timer = setInterval(() => {
    const g = window.GlobalVarsForPuppeteer;
    const top = g?.topLevelMolecule;
    const now = performance.now();
    const busy =
      !top ||
      g.projectIsLoading ||
      (g.cad?._pendingCalls?.length ?? 0) > 0 ||
      isProcessing(top);
    if (busy) {
      state.lastBusyAt = now;
    } else if (now - state.lastBusyAt >= quietMs) {
      const [ready, total] = top.getCompletionTuple?.() ?? [0, 0];
      Object.assign(state, { settled: true, ready, total });
      clearInterval(timer);
    }
  }, pollMs);
}

/** Wait for the tracker to settle; returns the load time in ms. */
async function waitForSettledLoad(page) {
  await page.waitForFunction(() => window.__abundancePerf?.settled, {
    timeout: SETTLE_TIMEOUT_MS,
    polling: 100,
  });
  const state = await page.evaluate(() => window.__abundancePerf);
  if (state.total > 0 && state.ready < state.total) {
    throw new Error(
      `Project settled with only ${state.ready} of ${state.total} atoms ready`,
    );
  }
  return Math.round(state.lastBusyAt);
}

/**
 * Serve every remote GET (GitHub, fonts) from memory after its first fetch,
 * so later loads and every target see identical data with no network time.
 *
 * This uses the DevTools Fetch domain limited to https:// URLs rather than
 * Puppeteer's setRequestInterception, which pauses every request, including
 * the CAD worker's, and leaves the worker's calls hanging.
 */
async function replayRemoteRequests(page, cache) {
  const client = await page.createCDPSession();
  client.on("Fetch.requestPaused", async (event) => {
    const { requestId, request, responseStatusCode, responseHeaders } = event;
    const key = request.url;
    try {
      if (responseStatusCode === undefined) {
        // Request stage.
        const cached = request.method === "GET" && cache.get(key);
        if (cached) {
          await client.send("Fetch.fulfillRequest", { requestId, ...cached });
        } else {
          await client.send("Fetch.continueRequest", {
            requestId,
            interceptResponse: request.method === "GET",
          });
        }
        return;
      }
      // Response stage: remember successful responses for later loads.
      if (responseStatusCode === 200 && !cache.has(key)) {
        const { body, base64Encoded } = await client.send(
          "Fetch.getResponseBody",
          { requestId },
        );
        cache.set(key, {
          responseCode: 200,
          // The body comes back decoded, so its encoding and length change.
          responseHeaders: responseHeaders.filter(
            ({ name }) => !/^(content-encoding|content-length)$/i.test(name),
          ),
          body: base64Encoded ? body : Buffer.from(body).toString("base64"),
        });
      }
      await client.send("Fetch.continueResponse", { requestId });
    } catch {
      // The page navigated or closed while this request was paused.
    }
  });
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: "https://*", requestStage: "Request" }],
  });
}

/**
 * Load a project cold in a fresh browser profile, then reload it warm, and
 * collect one sample of every metric.
 */
async function measureProject(browser, baseUrl, projectName, replayCache) {
  const sample = { error: null };
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1080, height: 1024 });
    await page.evaluateOnNewDocument(
      installSettleTracker,
      SETTLE_QUIET_MS,
      SETTLE_POLL_MS,
    );
    await replayRemoteRequests(page, replayCache);

    const url = `${baseUrl}/run/${projectUser}/${projectName}`;
    await page.goto(url, { timeout: 120000, waitUntil: "load" });
    sample.coldLoadTimeMs = await waitForSettledLoad(page);

    const cacheMetrics = await getIndexedDBSize(page, "AbundanceProjectCaches");
    sample.cacheSize = cacheMetrics.totalSize;
    sample.cacheEntryCount = cacheMetrics.entryCount;

    await page.reload({ timeout: 120000, waitUntil: "load" });
    sample.warmLoadTimeMs = await waitForSettledLoad(page);

    const projectFileMetrics = await getProjectFileSize(page);
    if (projectFileMetrics.error) {
      throw new Error(
        `Error getting project file size: ${projectFileMetrics.error}`,
      );
    }
    sample.projectFileSize = projectFileMetrics.size;
    sample.projectFileRawJson = projectFileMetrics.rawJson;

    const gcode = await getGcodeMetrics(page);
    if (gcode.hasGcodeAtom) {
      const sum = (key) =>
        (gcode.atoms || []).reduce((total, atom) => total + (atom[key] || 0), 0);
      sample.gcode = {
        atomCount: gcode.gcodeAtomCount,
        generationTimeMs: sum("generationTimeMs"),
        visualizationTimeMs: sum("visualizationTimeMs"),
        lineCount: sum("gcodeLineCount"),
        commandCount: sum("gcodeCommandCount"),
        errors: (gcode.atoms || [])
          .flatMap((a) => [a.generationError, a.visualizationError])
          .filter(Boolean),
        skipped: (gcode.atoms || [])
          .filter((a) => a.skipped)
          .map((a) => `${a.atomName}: ${a.skipped}`),
      };
    }
  } catch (error) {
    sample.error = error.message;
  } finally {
    await context.close();
  }
  return sample;
}

function parseArgs(argv) {
  const options = { targets: [], runs: 5, warmupRuns: 1, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--target") {
      const [name, url] = value.split(/=(.*)/s);
      options.targets.push({ name, url: url.replace(/\/$/, "") });
      i++;
    } else if (arg === "--runs") {
      options.runs = Number(value);
      i++;
    } else if (arg === "--warmup-runs") {
      options.warmupRuns = Number(value);
      i++;
    } else if (arg === "--out") {
      options.out = value;
      i++;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (options.targets.length === 0) {
    options.targets.push({ name: "local", url: "http://localhost:4444" });
  }
  return options;
}

const formatSample = (s) =>
  s.error
    ? `FAILED: ${s.error}`
    : `cold ${s.coldLoadTimeMs}ms, warm ${s.warmLoadTimeMs}ms, ` +
      `cache ${formatBytes(s.cacheSize)} (${s.cacheEntryCount} entries)` +
      formatGcode(s.gcode);

// G-code problems only show up in metrics.json otherwise, which isn't uploaded
// if the job times out.
const formatGcode = (g) => {
  if (!g) return "";
  const notes = [];
  if (g.skipped.length) {
    notes.push(`${g.skipped.length} skipped (${g.skipped.join("; ")})`);
  }
  if (g.errors.length) notes.push(`errors: ${g.errors.join("; ")}`);
  return `, G-code ${g.atomCount} atoms` + (notes.length ? `, ${notes.join(", ")}` : "");
};

/**
 * Main execution
 */
(async () => {
  const options = parseArgs(process.argv.slice(2));
  const results = {
    meta: {
      startedAt: new Date().toISOString(),
      runs: options.runs,
      warmupRuns: options.warmupRuns,
      settleQuietMs: SETTLE_QUIET_MS,
      targets: options.targets,
    },
    projects: {},
  };
  for (const projectName of projects_to_test) {
    results.projects[projectName] = {};
    for (const target of options.targets) {
      results.projects[projectName][target.name] = { samples: [] };
    }
  }

  let browser;
  let hasErrors = false;
  const replayCache = new Map();
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const totalRounds = options.warmupRuns + options.runs;
    for (let round = 0; round < totalRounds; round++) {
      const warmup = round < options.warmupRuns;
      console.log(
        `\nRound ${round + 1} of ${totalRounds}${warmup ? " (warm-up, not recorded)" : ""}`,
      );
      for (const projectName of projects_to_test) {
        // Alternate which target goes first so neither always runs on a
        // machine that the other just warmed up or slowed down.
        const order =
          round % 2 ? [...options.targets].reverse() : options.targets;
        for (const target of order) {
          const sample = await measureProject(
            browser,
            target.url,
            projectName,
            replayCache,
          );
          console.log(`  ${projectName} [${target.name}] ${formatSample(sample)}`);
          if (warmup) continue;
          const entry = results.projects[projectName][target.name];
          // The project file is the same every run; keep one copy.
          if (sample.projectFileRawJson !== undefined) {
            entry.projectFileRawJson ??= sample.projectFileRawJson;
            delete sample.projectFileRawJson;
          }
          entry.samples.push(sample);
          if (sample.error) hasErrors = true;
        }
      }
    }
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    results.meta.fatalError = error.message;
    hasErrors = true;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  results.meta.finishedAt = new Date().toISOString();
  const json = JSON.stringify(results, null, 2);
  if (options.out) {
    fs.writeFileSync(options.out, json);
    console.log(`\nWrote ${options.out}`);
  } else {
    console.log(json);
  }

  console.log(
    hasErrors
      ? "\nMETRICS TEST COMPLETED WITH ERRORS"
      : "\nMETRICS TEST COMPLETED SUCCESSFULLY",
  );
  // Report failed samples but still exit 0 when every project has some
  // results: the comparison shows which runs failed.
  const anyEmpty = Object.values(results.projects).some((targets) =>
    Object.values(targets).some(
      (t) => t.samples.filter((s) => !s.error).length === 0,
    ),
  );
  if (results.meta.fatalError || anyEmpty) {
    process.exit(1);
  }
})();
