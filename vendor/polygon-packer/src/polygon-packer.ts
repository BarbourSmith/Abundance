import Parallel from './parallel';
import { DisplayCallback, f32, NestConfig, u32, usize } from './types';
import BasePacker from './base-packer';

/**
 * Multi-threaded polygon packer that uses Web Workers for parallel NFP calculation and placement.
 * 
 * This packer distributes the computational workload across multiple worker threads,
 * making it suitable for large-scale nesting operations. It provides real-time progress
 * updates and asynchronous result callbacks.
 * 
 * @example
 * ```typescript
 * const packer = new PolygonPacker();
 * 
 * packer.start(
 *   config,
 *   polygons,
 *   binPolygon,
 *   (progress) => console.log(`Progress: ${progress}%`),
 *   (placement) => console.log('New placement:', placement)
 * );
 * ```
 */
export default class PolygonPacker extends BasePacker {
    #isWorking: boolean = false;

    #progress: f32 = 0;

    #workerTimer: u32 = 0;

    #paralele: Parallel = new Parallel();

    #workersReady = false;

    #chunkSize: usize = 512;

    /**
     * Starts the multi-threaded nesting process.
     * 
     * This method initializes the nesting algorithm and launches worker threads
     * to perform NFP calculations and placements in parallel. Progress and results
     * are reported through callback functions.
     * 
     * @param configuration - Nesting configuration parameters (spacing, rotations, etc.)
     * @param polygons - Array of polygons to nest, represented as Float32Arrays
     * @param binPolygon - The container polygon (bin) to nest shapes into
     * @param progressCallback - Optional callback invoked periodically with progress percentage (0-100)
     * @param displayCallback - Optional callback invoked when a new placement is found
     * 
     * @example
     * ```typescript
     * packer.start(
     *   { spacing: 0, rotations: 4 },
     *   [polygon1, polygon2],
     *   binPolygon,
     *   (progress) => updateProgressBar(progress),
     *   (result) => renderPlacement(result)
     * );
     * ```
     */
    public start(
        configuration: NestConfig,
        polygons: Float32Array[],
        binPolygon: Float32Array,
        progressCallback?: (progress: f32) => void,
        displayCallback?: DisplayCallback
    ): void {
        super.start(configuration, polygons, binPolygon);

        this.#isWorking = true;

        this.#launchWorkers(displayCallback);

        this.#workerTimer = setInterval(() => progressCallback(this.#progress), 100) as unknown as u32;
    }

    /**
     * Stops the nesting process and terminates all worker threads.
     * 
     * @param isClean - If true, cleans up internal state and resets the nesting algorithm.
     *                  If false, only stops workers but preserves state for potential resume.
     */
    public stop(isClean: boolean): void {
        if (!this.#isWorking) {
            return;
        }

        this.#isWorking = false;

        if (this.#workerTimer) {
            clearInterval(this.#workerTimer);
            this.#workerTimer = 0;
        }

        this.#paralele.terminate();
        this.#setupWorkers();

        if (isClean) {
            super.stop(isClean);
        }
    }

    protected async initWasm() {
        await super.initWasm();
        await this.#setupWorkers();
    }

    #setupWorkers(): Promise<void> {
        this.#workersReady = false;
        return new Promise(resolve => {
            this.#paralele.start(
                new Array(this.#paralele.threadCount).fill(0).map(() => this.cloneWasmBuffer()),
                () => {
                    this.#workersReady = true;
                    resolve();
                },
                this.#onError
            );
        });
    }

    #onSpawn = (_: usize, progress: f32): void => {
        this.#progress = progress;
    };

    #launchWorkers(displayCallback: DisplayCallback) {
        const serializedPairs = this.wasmNesting.getPairs(this.#chunkSize);
        const pairs = serializedPairs.map(pair => pair.buffer as ArrayBuffer);
        //console.log(pairs.map(p => p.byteLength));
        this.#paralele.start(
            pairs,
            (generatedNfp: ArrayBuffer[]) => this.#onPair(generatedNfp, displayCallback),
            this.#onError,
            this.#onSpawn
        );
    }

    #onError(error: ErrorEvent) {
        console.log(error);
    }

    #onPair(generatedNfp: ArrayBuffer[], displayCallback: DisplayCallback): void {
        const placementData = this.wasmNesting.getPlacementData(generatedNfp);

        this.#paralele.start(
            [placementData.buffer as ArrayBuffer],
            (placements: ArrayBuffer[]) => this.#onPlacement(placements, displayCallback),
            this.#onError
        );
    }

    #onPlacement(placements: ArrayBuffer[], displayCallback: DisplayCallback): void {
        if (placements.length === 0) {
            return;
        }

        if (this.#isWorking) {
            const placementWrapper = this.wasmNesting.getPlacementResult(placements);

            displayCallback(placementWrapper);
            this.#launchWorkers(displayCallback);
        }
    }
}
