import puppeteer from "puppeteer";
import projects_to_test from "./projects_to_test.js";

const projectUser = "moatmaslow";
const CACHE_WAIT_TIME_MS = 3000; // Wait time for cache operations to complete

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
      
      request.onsuccess = function(event) {
        const db = event.target.result;
        let totalSize = 0;
        
        // Get all object stores
        const storeNames = Array.from(db.objectStoreNames);
        
        if (storeNames.length === 0) {
          db.close();
          resolve(0);
          return;
        }
        
        try {
          const transaction = db.transaction(storeNames, 'readonly');
          let processedStores = 0;
          
          transaction.onerror = function() {
            db.close();
            reject(new Error('Transaction error: ' + transaction.error));
          };
          
          storeNames.forEach(storeName => {
            const objectStore = transaction.objectStore(storeName);
            const getAllRequest = objectStore.getAll();
            
            getAllRequest.onsuccess = function() {
              const records = getAllRequest.result;
              
              // Calculate size of all records in this store
              records.forEach(record => {
                const recordString = JSON.stringify(record);
                // Use Blob size for more accurate byte count
                const blob = new Blob([recordString]);
                totalSize += blob.size;
              });
              
              processedStores++;
              
              if (processedStores === storeNames.length) {
                db.close();
                resolve(totalSize);
              }
            };
            
            getAllRequest.onerror = function() {
              db.close();
              reject(new Error('ObjectStore error: ' + getAllRequest.error));
            };
          });
        } catch (err) {
          db.close();
          reject(err);
        }
      };
      
      request.onerror = function() {
        reject(new Error('Database open error: ' + request.error));
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
    await page.goto('http://localhost:4444', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('AbundanceProjectCaches');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.log('IndexedDB deletion blocked');
          resolve(); // Continue anyway
        };
      });
    });
    console.log('✓ IndexedDB cache cleared');
  } catch (error) {
    console.log('⚠ Could not clear IndexedDB cache:', error.message);
  } finally {
    await page.close();
  }
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
    cacheSize: null,
    cacheSizeFormatted: null,
    error: null
  };

  try {
    // Set viewport
    await page.setViewport({ width: 1080, height: 1024 });

    const navigationUrl = `http://localhost:4444/run/${projectUser}/${projectName}`;
    console.log(`\nTesting metrics for: ${projectName}`);
    console.log(`URL: ${navigationUrl}`);

    // Start timing
    const startTime = Date.now();

    // Navigate to the project
    await page.goto(navigationUrl, { 
      timeout: 120000,
      waitUntil: 'domcontentloaded' 
    });

    // Wait for the project to fully render
    const selector = "#molecule-fully-render-puppeteer";
    await page.waitForFunction(
      (selector) => !!document.querySelector(selector),
      { timeout: 120000 },
      selector
    );

    // Wait a bit more to ensure all caching is complete
    await new Promise((resolve) => setTimeout(resolve, CACHE_WAIT_TIME_MS));

    // Calculate cold load time
    const endTime = Date.now();
    metrics.coldLoadTimeMs = endTime - startTime;

    // Measure IndexedDB cache size
    const cacheSize = await getIndexedDBSize(page, 'AbundanceProjectCaches');
    metrics.cacheSize = cacheSize;
    metrics.cacheSizeFormatted = formatBytes(cacheSize);

    console.log(`✓ Cold load time: ${metrics.coldLoadTimeMs}ms`);
    console.log(`✓ Cache size: ${metrics.cacheSizeFormatted} (${metrics.cacheSize} bytes)`);

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
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

    // Clear IndexedDB cache before starting tests for cold load measurement
    await clearIndexedDBCache(browser);

    // Run metrics test for each project
    for (const projectName of projects_to_test) {
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
    
    allMetrics.forEach(m => {
      if (m.error) {
        console.log(`\n${m.projectName}: FAILED`);
        console.log(`  Error: ${m.error}`);
      } else {
        console.log(`\n${m.projectName}:`);
        console.log(`  Cold Load Time: ${m.coldLoadTimeMs}ms`);
        console.log(`  Cache Size: ${m.cacheSizeFormatted} (${m.cacheSize} bytes)`);
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
  console.log(hasErrors ? "METRICS TEST COMPLETED WITH ERRORS" : "METRICS TEST COMPLETED SUCCESSFULLY");
  console.log("=".repeat(60));

  // Exit with error code if there were failures
  if (hasErrors) {
    process.exit(1);
  }
})();
