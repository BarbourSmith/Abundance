declare namespace wasm_bindgen {
	/* tslint:disable */
	/* eslint-disable */
	/**
	 * Sets bits in a u32 value at a specified position.
	 *
	 * # Arguments
	 * * `source` - The original u32 value
	 * * `value` - The value to set (as u16)
	 * * `index` - The bit position to start setting
	 * * `bit_count` - Number of bits to set
	 *
	 * # Returns
	 * The modified u32 value with bits set
	 */
	export function set_bits_u32(source: number, value: number, index: number, bit_count: number): number;
	/**
	 * Calculates No-Fit Polygons (NFPs) for a chunk of polygon pairs.
	 *
	 * This function takes a flat buffer containing polygon pairs and computes
	 * their NFPs using geometric algorithms. The input buffer contains size-prefixed
	 * polygon data, and the output is a flat buffer of computed NFPs.
	 *
	 * # Arguments
	 * * `buffer` - Flat f32 array containing size-prefixed polygon pairs
	 *
	 * # Returns
	 * A Float32Array containing the computed NFPs with size prefixes
	 */
	export function calculate_chunk_wasm(buffer: Float32Array): Float32Array;
	/**
	 * Initializes the WasmPacker with configuration and polygon data.
	 *
	 * # Arguments
	 * * `configuration` - Configuration bit flags as u32
	 * * `polygon_data` - Flat f32 array containing size-prefixed polygons
	 */
	export function wasm_packer_init(configuration: number, polygon_data: Float32Array): void;
	/**
	 * Retrieves polygon pairs for NFP calculation, grouped into chunks.
	 *
	 * # Arguments
	 * * `chunk_size` - Maximum number of pairs per chunk
	 *
	 * # Returns
	 * A Float32Array containing chunked polygon pairs with size prefixes
	 */
	export function wasm_packer_get_pairs(chunk_size: number): Float32Array;
	/**
	 * Computes placement data using generated NFPs.
	 *
	 * # Arguments
	 * * `generated_nfp_flat` - Flat f32 array of generated NFPs with size prefixes
	 *
	 * # Returns
	 * A Float32Array containing placement data
	 */
	export function wasm_packer_get_placement_data(generated_nfp_flat: Float32Array): Float32Array;
	/**
	 * Computes final placement results from placement data.
	 *
	 * # Arguments
	 * * `placements_flat` - Flat f32 array of placement data with size prefixes
	 *
	 * # Returns
	 * A Uint8Array containing the serialized placement results
	 */
	export function wasm_packer_get_placement_result(placements_flat: Float32Array): Uint8Array;
	/**
	 * Stops the WasmPacker and cleans up resources.
	 */
	export function wasm_packer_stop(): void;
	/**
	 * Run a full nesting flow entirely in Rust without using workers.
	 *
	 * This function performs the complete polygon nesting algorithm:
	 * 1. Initialize packer with configuration and polygon data
	 * 2. Generate NFPs for all polygon pairs
	 * 3. Compute optimal placements using genetic algorithms
	 * 4. Return serialized placement results
	 *
	 * # Returns
	 * A Uint8Array containing the serialized nesting results
	 */
	export function wasm_nest(): Uint8Array;
	
}

declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly set_bits_u32: (a: number, b: number, c: number, d: number) => number;
  readonly calculate_chunk_wasm: (a: number, b: number) => number;
  readonly wasm_packer_init: (a: number, b: number, c: number) => void;
  readonly wasm_packer_get_pairs: (a: number) => number;
  readonly wasm_packer_get_placement_data: (a: number, b: number) => number;
  readonly wasm_packer_get_placement_result: (a: number, b: number) => number;
  readonly wasm_packer_stop: () => void;
  readonly wasm_nest: () => number;
  readonly __wbindgen_export_0: (a: number) => void;
  readonly __wbindgen_export_1: (a: number, b: number) => number;
}

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
