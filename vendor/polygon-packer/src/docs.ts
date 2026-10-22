/**
 * Documentation entry point for polygon-packer package.
 * This file is only used for generating documentation and should not be imported in production code.
 * @module polygon-packer
 * @packageDocumentation
 */

// Public API
export { default as PolygonPacker } from './polygon-packer';
export { default as SingleThreadPacker } from './single-thread-packer';

// Internal classes (documented but not part of public API)
export { default as BasePacker } from './base-packer';
export { default as Parallel } from './parallel';
export { default as PlacementWrapper } from './placement-wrapper';

// Types and interfaces
export * from './types';

// Helper functions
export * from './helpers';
