import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // bridge/ holds Node-only tests for the local agent bridge; they run
    // with vitest.bridge.config.mjs instead of in the browser.
    exclude: [...configDefaults.exclude, "bridge/**"],
    globals: true,
    browser: {
      enabled: true,
      //headless: true,
      provider: "playwright",
      // https://vitest.dev/guide/browser/playwright
      instances: [{ browser: "chromium" }],
    },
  },
});
