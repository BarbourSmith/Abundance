/**
 * Single-threaded polygon packer for synchronous nesting operations.
 * Use this for simpler use cases or when Web Workers are not available.
 */
export { default as SingleThreadPacker } from './single-thread-packer';

/**
 * Multi-threaded polygon packer that uses Web Workers for parallel processing.
 * This is the recommended packer for production use with large polygon sets.
 */
export { default as PolygonPacker } from './polygon-packer';
