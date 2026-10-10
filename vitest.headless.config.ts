import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the app's dependencies up front. Vite's automatic scan crawls
  // every test file and fails on a few stale imports, and without this it
  // discovers these mid-run and reloads the test page, killing the run on a
  // cold cache (as in CI).
  optimizeDeps: {
    include: [
      "@emotion/react",
      "@mui/material/Switch",
      "octokit",
      "file-saver",
      "mathjs",
      "three",
      "three/addons/lines/Line2.js",
      "three/addons/lines/LineMaterial.js",
      "three/examples/jsm/lines/LineGeometry.js",
      "comlink",
      "replicad-threejs-helper",
      "replicad",
      "replicad-opencascadejs",
      "uuid",
      "pako",
      "replicad-shrink-wrap",
    ],
  },
  test: {
    // bridge/ holds Node-only tests for the local agent bridge; they run
    // with vitest.bridge.config.mjs instead of in the browser.
    exclude: [...configDefaults.exclude, "bridge/**"],
    globals: true,
    browser: {
      enabled: true,
      headless: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
  },
});
