// Polyfill for Node.js globals when importing in ES module context
import { createRequire } from 'module';

// Only polyfill if running in Node.js and these globals are not defined
if (typeof globalThis !== 'undefined' && typeof process !== 'undefined' && typeof process.versions?.node === 'string') {
  if (typeof globalThis.__dirname === 'undefined') {
    // Simple __dirname polyfill - use process.cwd() in test environment
    globalThis.__dirname = process.cwd();
  }
  if (typeof globalThis.require === 'undefined') {
    // Create require function for the current module
    globalThis.require = createRequire(import.meta.url);
  }
}

// Import and re-export the original module (avoid the alias to prevent circular imports)
const Module = await import('../node_modules/replicad-opencascadejs/src/replicad_single.js');
export default Module.default;
