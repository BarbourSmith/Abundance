import BasePacker from './base-packer';
import PlacementWrapper from './placement-wrapper';

/**
 * Single-threaded polygon packer for synchronous nesting operations.
 * 
 * This packer performs all calculations in the main thread, making it simpler
 * but potentially slower for large polygon sets. Use this when:
 * - Working with small polygon sets
 * - Web Workers are not available
 * - Synchronous operation is required
 * 
 * @example
 * ```typescript
 * const packer = new SingleThreadPacker();
 * packer.start(config, polygons, binPolygon);
 * const result = packer.nest();
 * console.log('Best placement:', result);
 * ```
 */
export default class PolygonPacker extends BasePacker {
    /**
     * Executes the nesting algorithm synchronously and returns the best placement found.
     * 
     * This method blocks until the nesting algorithm completes. Call `start()` first
     * to initialize the algorithm with polygons and configuration.
     * 
     * @returns The best placement wrapper containing polygon positions and fitness score
     */
    public nest(): PlacementWrapper {
        return this.wasmNesting.nest();
    }
}
