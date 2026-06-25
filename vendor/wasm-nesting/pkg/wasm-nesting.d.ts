/* tslint:disable */
/* eslint-disable */
export function polygon_area(points: Float32Array): number;
export function almost_equal(a: number, b: number, tolerance: number): boolean;
export function set_bits_u32(source: number, value: number, index: number, bit_count: number): number;
export function get_bits_u32(source: number, index: number, num_bits: number): number;
export function get_u16_from_u32(source: number, index: number): number;
export function join_u16_to_u32(value1: number, value2: number): number;
export function cycle_index_wasm(index: number, size: number, offset: number): number;
export function to_rotation_index_wasm(angle: number, rotation_split: number): number;
export function mid_value_f64(value: number, left: number, right: number): number;
export function pair_data_f32(buff: Float32Array): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly polygon_area: (a: number, b: number) => number;
  readonly almost_equal: (a: number, b: number, c: number) => number;
  readonly set_bits_u32: (a: number, b: number, c: number, d: number) => number;
  readonly get_bits_u32: (a: number, b: number, c: number) => number;
  readonly get_u16_from_u32: (a: number, b: number) => number;
  readonly join_u16_to_u32: (a: number, b: number) => number;
  readonly cycle_index_wasm: (a: number, b: number, c: number) => number;
  readonly to_rotation_index_wasm: (a: number, b: number) => number;
  readonly mid_value_f64: (a: number, b: number, c: number) => number;
  readonly pair_data_f32: (a: number, b: number) => any;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
