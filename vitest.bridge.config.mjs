import { defineConfig } from "vitest/config";

// Plain Node tests for the local agent bridge (bridge/). The bridge has no
// browser or WASM dependencies, so it runs without the headless browser.
export default defineConfig({
  test: {
    environment: "node",
    include: ["bridge/test/**/*.test.js"],
    testTimeout: 15000,
  },
});
