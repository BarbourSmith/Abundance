import { f32, u32, usize } from "./types";

/**
 * Manages parallel execution of polygon packing calculations using Web Workers.
 *
 * Coordinates multiple worker threads to process packing calculations concurrently,
 * distributing work across available CPU cores for improved performance.
 *
 * @example
 * ```typescript
 * const parallel = new Parallel();
 * parallel.start(
 *   [buffer1, buffer2, buffer3],
 *   (results) => console.log('Success:', results),
 *   (error) => console.error('Error:', error),
 *   (count, progress) => console.log(`Progress: ${progress * 100}%`)
 * );
 * ```
 */
export default class Parallel {
  #threadsUsage: boolean[];

  #threadCount: usize = 1;

  #threads: Worker[];

  #input: ArrayBuffer[] = null;

  #output: ArrayBuffer[] = null;

  #threadIndices: usize[];

  #isTerminated: boolean = true;

  #iterationCount: usize = 0;

  #startedThreads: usize = 0;

  #totalThreads: usize = 0;

  #onError: (error: ErrorEvent) => void = null;

  #onSuccess: (result: ArrayBuffer[]) => void = null;

  #onSpawn: (count: usize, progress: f32) => void = null;

  constructor() {
    this.#threadCount = (navigator.hardwareConcurrency || 4) - 1;
    this.#threadsUsage = new Array(this.#threadCount);
    this.#threads = new Array(this.#threadCount);
    this.#threadIndices = new Array(this.#threadCount);

    this.#threadsUsage.fill(false);
    this.#threads.fill(null);
    this.#threadIndices.fill(-1);
  }

  /**
   * Starts parallel processing of input data across worker threads.
   *
   * @param input - Array of ArrayBuffers to process in parallel
   * @param onSuccess - Callback invoked when all workers complete successfully
   * @param onError - Callback invoked if any worker encounters an error
   * @param onSpawn - Optional callback invoked each time a worker starts, with current count and progress (0-1)
   * @returns `true` if processing started successfully, `false` if input is empty
   */
  public start(
    input: ArrayBuffer[],
    onSuccess: (result: ArrayBuffer[]) => void,
    onError: (error: ErrorEvent) => void,
    onSpawn: (count: u32, progress: f32) => void = null,
  ): boolean {
    if (input.length === 0) {
      this.#handleError(new ErrorEvent("Empty data"));
      return false;
    }

    this.#onError = onError;
    this.#onSuccess = onSuccess;
    this.#onSpawn = onSpawn;
    this.#iterationCount = 0;
    this.#startedThreads = 0;
    this.#input = input;
    this.#totalThreads = input.length;
    this.#output = new Array(this.#totalThreads);

    this.#threadsUsage.fill(false);
    this.#threadIndices.fill(-1);

    if (this.#isTerminated) {
      for (let i = 0; i < this.#threadCount; ++i) {
        this.#threads[i] = new Worker(
          new URL("./nest.worker.ts", import.meta.url),
          { type: "module" },
        );
      }

      this.#isTerminated = false;
    }

    while (
      this.#startedThreads < this.#totalThreads &&
      this.#threadsUsage.indexOf(false) !== -1
    ) {
      this.#trigger();
    }

    return true;
  }

  /**
   * Terminates all worker threads and cleans up resources.
   *
   * Should be called when parallel processing is no longer needed
   * to free up system resources.
   */
  public terminate(): void {
    for (let i = 0; i < this.#threadCount; ++i) {
      if (this.#threads[i] !== null) {
        this.#threads[i].terminate();
        this.#threads[i] = null;
      }
      this.#threadsUsage[i] = false;
      this.#threadIndices[i] = -1;
    }

    this.#isTerminated = true;
  }

  /**
   * Gets the number of worker threads available for parallel processing.
   *
   * Defaults to `navigator.hardwareConcurrency - 1` to leave one core
   * free for the main thread.
   *
   * @returns Number of worker threads
   */
  public get threadCount(): usize {
    return this.#threadCount;
  }

  #trigger(): boolean {
    const index: usize = this.#threadsUsage.indexOf(false);

    if (index === -1) {
      return false;
    }

    this.#threadsUsage[index] = true;

    const thread = this.#threads[index];
    const threadIndex: usize = this.#startedThreads;

    ++this.#startedThreads;

    this.#threadIndices[index] = threadIndex;

    if (this.#onSpawn !== null) {
      this.#onSpawn(
        this.#startedThreads,
        this.#startedThreads / this.#totalThreads,
      );
    }

    const input = this.#input[threadIndex];

    thread.onmessage = this.#onMessage;
    thread.onerror = this.#handleError;
    thread.postMessage(input, [input]);

    return true;
  }

  #onMessage = (message: MessageEvent<ArrayBuffer>) => {
    const index = this.#clean(message.currentTarget as Worker);
    const threadIndex = this.#threadIndices[index];

    this.#output[threadIndex] = message.data;

    if (this.#iterationCount === this.#totalThreads) {
      this.#onSuccess(this.#output);
      return;
    }

    if (this.#startedThreads < this.#totalThreads) {
      this.#trigger();
    }
  };

  #handleError = (error: ErrorEvent) => {
    this.#clean(error.currentTarget as Worker);
    this.#onError(error);
  };

  #clean(target: Worker): usize {
    let i: usize = 0;

    for (i = 0; i < this.#threadCount; ++i) {
      if (this.#threads[i] === target) {
        break;
      }
    }

    this.#threadsUsage[i] = false;
    ++this.#iterationCount;

    return i;
  }
}
