import puppeteer from "puppeteer";
import projects_to_test from "./projects_to_test.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectUser = "moatmaslow";
const currentDate = new Date().toISOString().split("T")[0];

// Launch the browser and open a new blank page
//for each project in projects to test launch puppeteer

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    await loadPuppeteerAndExec(browser, currentDate);
  } catch (error) {
    console.error(`Error processing projects:`, error);
  } finally {
    if (browser) {
      console.log(`Closing browser `);
      await browser.close();
    }
  }
  console.log("All projects processed:!");
})();

async function loadPuppeteerAndExec(browser, date) {
  const page = await browser.newPage();

  for (const projectName of projects_to_test) {
    console.log(`Testing project: ${projectName}`);

    // Navigate the page to a localhost URL.
    await page.goto(
      "http://localhost:4444" + "/run/" + projectUser + "/" + projectName
    );
    console.log("navigated to: " + projectName);
    // Set screen size.
    await page.setViewport({ width: 1080, height: 1024 });
    const selector = "#molecule-fully-render-puppeteer";

    // Wait for the element to be present in the DOM
    await page.waitForFunction(
      (selector) => !!document.querySelector(selector),
      { timeout: 120000 }, // Increase timeout to 2 minutes
      selector
    );
    try {
      await page.screenshot({
        path: `Puppet/images/${projectName}-Test.png`,
      });
      console.log(`Screenshot saved: Puppet/images/${projectName}-Test.png`);
    } catch (elementError) {
      console.log(elementError);
      await page.screenshot({
        path: `Puppet/images/${projectName}-Test.png`,
      });
      console.log(`Screenshot saved: Puppet/images/${projectName}-Test.png`);
    }

    // Try deployed version - skip if not available
    try {
      await page.goto(
        "https://abundance.maslowcnc.com" +
          "/run/" +
          projectUser +
          "/" +
          projectName
      );
      // Wait for the element to be present in the DOM
      await page.waitForFunction(
        (selector) => !!document.querySelector(selector),
        { timeout: 120000 }, // Increase timeout to 2 minutes
        selector
      );

      // Wait a bit for the page to load
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await page.screenshot({
        path: `Puppet/images/${projectName}-Deployed.png`,
      });
      console.log(
        `Screenshot saved: Puppet/images/${projectName}-Deployed.png`
      );
    } catch (deployedError) {
      console.log(
        `Deployed version not available for ${projectName}: ${deployedError.message}`
      );
    }
  }

  // Navigate to main.html
  try {
    await page.goto(`file:${path.join(__dirname, "main.html")}`);

    // Wait a bit for the page to load
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await page.screenshot({
      path: `Puppet/images/main.png`,
    });
    console.log("Screenshot saved: Puppet/images/main.png");
  } catch (mainError) {
    console.error("Error taking main.html screenshot:", mainError.message);
  }
}
