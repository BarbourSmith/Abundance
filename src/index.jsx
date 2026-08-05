import React from "react";
import ReactDOM from "react-dom/client";

import { createPortal } from "react-dom";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";

// Crawler detection utilities
import {
  isCrawler,
  parseProjectPath,
  fetchProjectPreview,
} from "./utils/crawlerDetection.js";

// This is here to compensate for a bug in vite
import "replicad-opencascadejs/src/replicad_single.wasm?url";

/**
 * Handle crawler requests for social media previews
 * If this is a crawler requesting /run/owner/repoName,
 * serve preview.html instead of loading the SPA
 */
async function handleCrawlerRequest() {
  const userAgent = navigator.userAgent;
  const pathname = window.location.pathname;

  // Check if this is a crawler requesting a project preview
  if (isCrawler(userAgent)) {
    const { isProjectPath, owner, repoName } = parseProjectPath(pathname);

    if (isProjectPath) {
      console.log("Crawler detected, serving preview.html");
      try {
        const previewHtml = await fetchProjectPreview(owner, repoName);
        // Replace entire document with preview
        document.open();
        document.write(previewHtml);
        document.close();
        return true; // Don't render React
      } catch (error) {
        console.error("Error serving preview:", error);
        // Fall through and render React normally
      }
    }
  }

  return false; // Render React normally
}

// Check if we should serve a crawler preview
handleCrawlerRequest().then((wasCrawler) => {
  if (!wasCrawler) {
    // Not a crawler, render React normally
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <BrowserRouter basename={import.meta.env.VITE_BROWSER_ROUTER}>
        <App />
      </BrowserRouter>,
    );
  }
});

// Hot Module Replacement (HMR) - Remove this snippet to remove HMR.
// Learn more: https://vitejs.dev/guide/api-hmr.html
if (import.meta.hot) {
  import.meta.hot.accept();
}
