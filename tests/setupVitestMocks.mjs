// Vitest setup file to mock replicad-shrink-wrap and replicad-decorate
import { vi } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Only patch dependencies when not in test environment (avoid Vitest import issues)
if (process.env.NODE_ENV !== 'test') {
  await import('./patchDependencies.mjs');
}

// Fix url resolution. This intercepts import of wasm file but only to correct the path
// for the testing environment. The real wasm file is still what get's loaded.
vi.mock('replicad-opencascadejs/src/replicad_single.wasm?url', () => {
  const wasmPath = resolve(process.cwd(), 'node_modules/replicad-opencascadejs/src/replicad_single.wasm');
  return {
    default: fileURLToPath(`file://${wasmPath}`),
  };
});
