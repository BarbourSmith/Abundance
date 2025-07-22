import { defineConfig } from 'vitest/config';
import {nodePolyfills} from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    nodePolyfills({
      // Be more selective about polyfills to avoid conflicts
      include: ['path', 'fs', 'process', 'buffer'],
      exclude: ['url', 'punycode'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    })
  ],
  resolve: {
    alias: {
      // Redirect the problematic dependency to our polyfilled version
      'replicad-opencascadejs/src/replicad_single.js': resolve('./tests/replicad_polyfill.js'),
    },
  },
  test: {
    environment: 'node', // Use 'jsdom' if you need browser APIs
    globals: true,
    setupFiles: ['./tests/setupVitestMocks.mjs'], 
    include: ['tests/**/*.test.{js,mjs,ts}', 'tests/**/*.integration.{js,mjs,ts}'],
    coverage: { provider: "v8"}
  },
});
