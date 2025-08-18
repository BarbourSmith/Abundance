// Vitest setup file to mock replicad-shrink-wrap and replicad-decorate
import { vi } from 'vitest';
import { resolve } from 'path';

// In jsdom environment, fileURLToPath might not be available, so provide a fallback
let fileURLToPath;
try {
  const urlModule = await import('url');
  fileURLToPath = urlModule.fileURLToPath;
} catch (error) {
  // Fallback for environments where url module is not available
  fileURLToPath = (url) => {
    if (url.startsWith('file://')) {
      return url.slice(7); // Remove 'file://' prefix
    }
    return url;
  };
}

// Only patch dependencies when not in test environment (avoid Vitest import issues)
if (process.env.NODE_ENV !== 'test') {
  await import('./patchDependencies.mjs');
}

// Fix url resolution. This intercepts import of wasm file but only to correct the path
// for the testing environment. The real wasm file is still what get's loaded.
vi.mock('replicad-opencascadejs/src/replicad_single.wasm?url', () => {
  const wasmPath = resolve(process.cwd(), 'node_modules/replicad-opencascadejs/src/replicad_single.wasm');
  // Simple path handling for testing environment
  const fileUrl = wasmPath.startsWith('/') ? `file://${wasmPath}` : `file:///${wasmPath}`;
  return {
    default: fileURLToPath ? fileURLToPath(fileUrl) : wasmPath,
  };
});
