import puppeteer from "puppeteer";
import projects_to_test from "./projects_to_test.js";

const projectUser = "moatmaslow";

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
async function clearIndexedDBCache(browser) {
  const page = await browser.newPage();
  try {
    await page.goto("http://localhost:4444", {
      timeout: 30000,
      waitUntil: "load",
    });
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("AbundanceProjectCaches");
        request.onsuccess = () => {
          console.log("got a success response from db deletion");
          resolve();
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.log("IndexedDB deletion blocked");
          reject("Indexdb deletion was blocked");
        };
      });
    });
    console.log("✓ IndexedDB cache cleared");
  } catch (error) {
    console.log("⚠ Could not clear IndexedDB cache:", error.message);
  }
}
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
        rawJson: jsonString,
      };
    } catch (error) {
      console.error("Error getting project file size:", error);
      return { size: 0, rawJson: "", error: error.message };
    }
  });
}
/**
 * Run metrics test for a single project
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} projectName - Project name to test
 * @returns {Promise<Object>} Metrics object
 */
async function runMetricsTest(browser, projectName) {
  const page = await browser.newPage();
  const metrics = {
    projectName,
    timestamp: new Date().toISOString(),
    coldLoadTimeMs: null,
    warmLoadTimeMs: null,
    cacheSize: null,
    cacheSizeFormatted: null,
    cacheEntryCount: null,
    projectFileSize: null,
    projectFileSizeFormatted: null,
    error: null,
  };

  try {
    // Set viewport
    await page.setViewport({ width: 1080, height: 1024 });

    const navigationUrl = `http://localhost:4444/run/${projectUser}/${projectName}`;
    console.log(`\nTesting metrics for: ${projectName}`);
    console.log(`URL: ${navigationUrl}`);
    const projectReadySelector = "#molecule-fully-render-puppeteer";
    const canvasSelector = "#flow-canvas";

    // Navigate to the project
    await page.goto(navigationUrl, {
      timeout: 120000,
      waitUntil: "load",
    });

    await page.waitForSelector(canvasSelector, { timeout: 120000 });
    // Wait for the project to fully render
    const startTime = Date.now();
    await page.waitForSelector(projectReadySelector, { timeout: 120000 });

    // Calculate cold load time
    const endTime = Date.now();
    metrics.coldLoadTimeMs = endTime - startTime;

    // Measure IndexedDB cache size
    const cacheMetrics = await getIndexedDBSize(page, "AbundanceProjectCaches");
    metrics.cacheSize = cacheMetrics.totalSize;
    metrics.cacheSizeFormatted = formatBytes(cacheMetrics.totalSize);
    metrics.cacheEntryCount = cacheMetrics.entryCount;
    console.log("sizes by cache key: ");
    console.log(cacheMetrics.keyedSizes);

    // Warm load
    await page.reload({ waitUntil: "load", timeout: 120000 });
    await page.waitForSelector(canvasSelector, { timeout: 120000 });
    const warmStartTime = Date.now();
    await page.waitForSelector(projectReadySelector, { timeout: 120000 });
    const warmEndTime = Date.now();
    metrics.warmLoadTimeMs = warmEndTime - warmStartTime;

    // Project save size
    const projectFileMetrics = await getProjectFileSize(page);
    if (projectFileMetrics.error) {
      throw new Error(
        `Error getting project file size: ${projectFileMetrics.error}`
      );
    }
    metrics.projectFileSize = projectFileMetrics.size;
    metrics.projectFileSizeFormatted = formatBytes(projectFileMetrics.size);
    console.log("Raw save file contents: ");
    console.log(projectFileMetrics.rawJson);
  } catch (error) {
    metrics.error = error.message;
    console.error(`✗ Error testing ${projectName}: ${error.message}`);
  } finally {
    await page.close();
  }

  return metrics;
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

/**
 * Main execution
 */
(async () => {
  let browser;
  let allMetrics = [];
  let hasErrors = false;

  try {
    console.log("=".repeat(60));
    console.log("ABUNDANCE PERFORMANCE METRICS TEST");
    console.log("=".repeat(60));

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Run metrics test for each project
    for (const projectName of projects_to_test) {
      // Clear IndexedDB cache before starting tests for cold load measurement
      await clearIndexedDBCache(browser);

      const metrics = await runMetricsTest(browser, projectName);
      allMetrics.push(metrics);

      if (metrics.error) {
        hasErrors = true;
      }
    }

    // Output results summary
    console.log("\n" + "=".repeat(60));
    console.log("METRICS SUMMARY");
    console.log("=".repeat(60));

    allMetrics.forEach((m) => {
      if (m.error) {
        console.log(`\n${m.projectName}: FAILED`);
        console.log(`  Error: ${m.error}`);
      } else {
        console.log(`\n${m.projectName}:`);
        console.log(`  Cold Load Time: ${m.coldLoadTimeMs}ms`);
        console.log(
          `  Cache Size: ${m.cacheSizeFormatted} (${m.cacheSize} bytes)`
        );
      }
    });

    // Output JSON for machine consumption
    console.log("\n" + "=".repeat(60));
    console.log("JSON OUTPUT");
    console.log("=".repeat(60));
    console.log(JSON.stringify(allMetrics, null, 2));
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    hasErrors = true;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    hasErrors
      ? "METRICS TEST COMPLETED WITH ERRORS"
      : "METRICS TEST COMPLETED SUCCESSFULLY"
  );
  console.log("=".repeat(60));

  // Exit with error code if there were failures
  if (hasErrors) {
    process.exit(1);
  }
})();
