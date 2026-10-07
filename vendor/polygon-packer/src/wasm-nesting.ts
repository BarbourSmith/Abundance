import { joinFloat32Arrays, mergeFloat32Arrays, splitFloat32Arrays } from "./helpers";
import PlacementWrapper from "./placement-wrapper";
import { MemSeg, NestConfig, u16, u32, u8, usize } from "./types";

const MEM_SEG_TYPES = [Uint8Array, Uint16Array, Float32Array];
export default class WasmNesting {
    #wasm: any;

    #heap: unknown[];

    #heapNext: usize;

    #textDecoder: TextDecoder;

    #vecLen: usize;

    #memSegs: MemSeg[];

    #isInitialized: boolean = false;

    constructor() {
        this.#heap = new Array(128).fill(undefined);

        this.#heap.push(undefined, null, true, false);

        this.#heapNext = this.#heap.length;

        this.#textDecoder =
            typeof TextDecoder !== 'undefined'
                ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
                : ({
                    decode: () => {
                        throw Error('TextDecoder not available');
                    }
                } as unknown as TextDecoder);

        this.#memSegs = new Array<MemSeg>(3).fill(null);
        this.#vecLen = 0;
    }

    public async initBuffer(bytes: ArrayBuffer): Promise<any> {
        const imports = this.#getImports();

        const module = await WebAssembly.compile(bytes);
        const instance = await WebAssembly.instantiate(module, imports);

        this.#wasm = instance.exports;
        this.#memSegs.fill(null);

        this.#isInitialized = true;
    }

    public setBits(source: u32, value: u16, index: usize, bit_count: u8): u32 {
        const ret = this.#wasm.set_bits_u32(source, value, index, bit_count);
        return ret >>> 0;
    }

    public calculate(buffer: Float32Array): Float32Array {
        const ptr0 = this.#passMem(buffer, this.#wasm.__wbindgen_export_1);
        const ret = this.#wasm.calculate_chunk_wasm(ptr0, this.#vecLen);

        return this.#takeObject(ret) as Float32Array;
    }

    public init(configuration: NestConfig, polygons: Float32Array[]): void {
        const polygon_data = joinFloat32Arrays(polygons);
        const config = this.#serializeConfig(configuration);
        const ptr0 = this.#passMem(polygon_data, this.#wasm.__wbindgen_export_1);
        const len0 = this.#vecLen;
        this.#wasm.wasm_packer_init(config, ptr0, len0);
    }

    public nest(): PlacementWrapper {
        const ret = this.#wasm.wasm_nest();
        const result = this.#takeObject(ret) as Uint8Array;

        return new PlacementWrapper(result.buffer as ArrayBuffer);
    }

    public getPairs(chunkSize: u16): Float32Array[] {
        const ret = this.#wasm.wasm_packer_get_pairs(chunkSize >>> 0);
        const result = this.#takeObject(ret) as Float32Array;

        return splitFloat32Arrays(result)
    }

    public getPlacementData(generatedNfp: ArrayBuffer[]): Float32Array {
        const generated_nfp = mergeFloat32Arrays(generatedNfp);
        const ptr0 = this.#passMem(generated_nfp, this.#wasm.__wbindgen_export_1);
        const len0 = this.#vecLen;
        const ret = this.#wasm.wasm_packer_get_placement_data(ptr0, len0);
        return this.#takeObject(ret) as Float32Array;
    }

    public getPlacementResult(placements: ArrayBuffer[]): PlacementWrapper {
        const placements_f32 = mergeFloat32Arrays(placements);
        const ptr0 = this.#passMem(placements_f32, this.#wasm.__wbindgen_export_1);
        const len0 = this.#vecLen;
        const ret = this.#wasm.wasm_packer_get_placement_result(ptr0, len0);
        const result = this.#takeObject(ret) as Uint8Array;

        return new PlacementWrapper(result.buffer as ArrayBuffer);
    }

    public stop(): void {
        this.#wasm.wasm_packer_stop();
    }

    public get isInitialized(): boolean {
        return this.#isInitialized;
    }

    #addHeapObject(obj: unknown): usize {
        if (this.#heapNext === this.#heap.length) {
            this.#heap.push(this.#heap.length + 1);
        }
        const idx = this.#heapNext;
        this.#heapNext = this.#heap[idx] as usize;

        this.#heap[idx] = obj;
        return idx;
    }

    #handleError(f: (...args: any[]) => any, args: unknown[]): any {
        try {
            return f.apply(this, args);
        } catch (e) {
            this.#wasm.__wbindgen_export_0(this.#addHeapObject(e));
        }
    }

    #getMem(index: usize): MemSeg {
        if (index > 2) {
            throw new Error('Unsupported memory segment index');
        }

        if (this.#memSegs[index] === null || this.#memSegs[index].byteLength === 0) {
            const ArrayType = MEM_SEG_TYPES[index];

            this.#memSegs[index] = new ArrayType(this.#wasm.memory.buffer);
        }

        return this.#memSegs[index];
    }

    #passMem(arg: MemSeg, malloc: (size: usize, align: u32) => usize): usize {
        const bytes = arg.BYTES_PER_ELEMENT;
        const ptr = malloc(arg.length * bytes, bytes) >>> 0;

        const memory: MemSeg = this.#getMem(bytes >> 1);

        memory.set(arg, ptr / bytes);

        this.#vecLen = arg.length;

        return ptr;
    }

    #getString(ptr: u32, len: usize): string {
        ptr = ptr >>> 0;
        return this.#textDecoder.decode(this.#getMem(0).subarray(ptr, ptr + len));
    }

    #checkObject(idx: usize, type: string): boolean {
        return typeof this.#getObject(idx) === type;
    }

    #getObject<T = usize>(idx: usize): T {
        return this.#heap[idx] as T;
    }

    #dropObject(idx: usize): void {
        if (idx < 132) {
            return;
        }

        this.#heap[idx] = this.#heapNext;
        this.#heapNext = idx;
    }

    #takeObject(idx: usize): unknown {
        const ret = this.#getObject(idx);
        this.#dropObject(idx);

        return ret;
    }

    #isLikeNone(x: unknown): boolean {
        return x === undefined || x === null;
    }

    #addGlobalObject<T>(data: T): usize {
        const formattedData = typeof data === 'undefined' ? null : data as T;

        return this.#isLikeNone(formattedData) ? 0 : this.#addHeapObject(formattedData);
    }

    #getImports() {
        return {
            wbg: {
                __wbg_buffer_609cc3eee51ed158: (arg0: usize): usize => {
                    const ret = this.#getObject<Uint8Array>(arg0).buffer;

                    return this.#addHeapObject(ret);
                },
                __wbg_call_672a4d21634d4a24: (...args: unknown[]): usize =>
                    this.#handleError((arg0: usize, arg1: usize): usize => {
                        const ret = this.#getObject<Function>(arg0).call(this.#getObject(arg1));

                        return this.#addHeapObject(ret);
                    }, args),
                __wbg_call_7cccdd69e0791ae2: (...args: unknown[]): usize => {
                    return this.#handleError((arg0: usize, arg1: usize, arg2: usize): usize => {
                        const ret = this.#getObject<Function>(arg0).call(this.#getObject(arg1), this.#getObject(arg2));

                        return this.#addHeapObject(ret);
                    }, args);
                },
                __wbg_crypto_574e78ad8b13b65f: (arg0: usize): usize => {
                    const ret = this.#getObject<Window>(arg0).crypto;
                    return this.#addHeapObject(ret);
                },
                __wbg_getRandomValues_b8f5dbd5f3995a9e: (...args: unknown[]) =>
                    this.#handleError((arg0: usize, arg1: usize) => {
                        this.#getObject<Crypto>(arg0).getRandomValues(this.#getObject<ArrayBufferView>(arg1));
                    }, args),
                __wbg_length_3b4f022188ae8db6: (arg0: usize): usize => this.#getObject<Uint8Array>(arg0).length,
                __wbg_length_a446193dc22c12f8: (arg0: usize): usize => this.#getObject<Uint8Array>(arg0).length,
                __wbg_msCrypto_a61aeb35a24c1329: (arg0: usize): usize => {
                    const ret = (this.#getObject<Window>(arg0) as any).msCrypto;
                    return this.#addHeapObject(ret);
                },
                __wbg_new_a12002a7f91c75be: (arg0: usize): usize => {
                    const ret = new Uint8Array(this.#getObject<ArrayLike<u8>>(arg0));
                    return this.#addHeapObject(ret);
                },
                __wbg_newnoargs_105ed471475aaf50: (arg0: usize, arg1: usize): usize => {
                    const ret = new Function(this.#getString(arg0, arg1));
                    return this.#addHeapObject(ret);
                },
                __wbg_newwithbyteoffsetandlength_d97e637ebe145a9a: (arg0: usize, arg1: usize, arg2: usize) => {
                    const ret = new Uint8Array(this.#getObject<ArrayBuffer>(arg0), arg1 >>> 0, arg2 >>> 0);
                    return this.#addHeapObject(ret);
                },
                __wbg_newwithbyteoffsetandlength_e6b7e69acd4c7354: (arg0: usize, arg1: usize, arg2: usize) => {
                    const ret = new Float32Array(this.#getObject<ArrayBuffer>(arg0), arg1 >>> 0, arg2 >>> 0);
                    return this.#addHeapObject(ret);
                },
                __wbg_newwithlength_5a5efe313cfd59f1: (arg0: usize) =>
                    this.#addHeapObject(new Float32Array(arg0 >>> 0)),
                __wbg_newwithlength_a381634e90c276d4: (arg0: usize) =>
                    this.#addHeapObject(new Uint8Array(arg0 >>> 0)),
                __wbg_node_905d3e251edff8a2: (arg0: usize) => {
                    const ret = this.#getObject<NodeJS.ProcessVersions>(arg0).node;
                    return this.#addHeapObject(ret);
                },
                __wbg_process_dc0fbacc7c1c06f7: (arg0: usize) => {
                    const ret = this.#getObject<typeof globalThis>(arg0).process;
                    return this.#addHeapObject(ret);
                },
                __wbg_randomFillSync_ac0988aba3254290: (...args: unknown[]) => this.#handleError((arg0: usize, arg1: usize): void => {
                    (this.#getObject<any>(arg0) as any).randomFillSync(this.#takeObject(arg1));
                }, args),
                __wbg_require_60cc747a6bc5215a: (...args: unknown[]) => {
                    return this.#handleError((): usize => {
                        const ret = module.require;
                        return this.#addHeapObject(ret);
                    }, args);
                },
                __wbg_set_10bad9bee0e9c58b: (arg0: usize, arg1: usize, arg2: usize) => {
                    this.#getObject<Uint8Array>(arg0).set(this.#getObject<ArrayLike<u8>>(arg1), arg2 >>> 0);
                },
                __wbg_set_65595bdd868b3009: (arg0: usize, arg1: usize, arg2: usize) => {
                    this.#getObject<Uint8Array>(arg0).set(this.#getObject<ArrayLike<u8>>(arg1), arg2 >>> 0);
                },
                __wbg_static_accessor_GLOBAL_88a902d13a557d07: (): usize => this.#addGlobalObject(global),
                __wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0: (): usize => this.#addGlobalObject(globalThis),
                __wbg_static_accessor_SELF_37c5d418e4bf5819: (): usize => this.#addGlobalObject(self),
                __wbg_static_accessor_WINDOW_5de37043a91a9c40: (): usize => this.#addGlobalObject(window),
                __wbg_subarray_aa9065fa9dc5df96: (arg0: usize, arg1: usize, arg2: usize): usize => {
                    const ret = this.#getObject<Uint8Array>(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
                    return this.#addHeapObject(ret);
                },
                __wbg_versions_c01dfd4722a88165: (arg0: usize) => {
                    const ret = this.#getObject<{ versions: u32 }>(arg0).versions;
                    return this.#addHeapObject(ret);
                },
                __wbindgen_is_function: (arg0: usize) => this.#checkObject(arg0, 'function'),
                __wbindgen_is_object: (arg0: usize): boolean =>
                    this.#checkObject(arg0, 'object') && this.#getObject(arg0) !== null,
                __wbindgen_is_string: (arg0: usize): boolean => this.#checkObject(arg0, 'string'),
                __wbindgen_is_undefined: (arg0: usize): boolean => this.#checkObject(arg0, 'undefined'),
                __wbindgen_memory: () => this.#addHeapObject(this.#wasm.memory),
                __wbindgen_object_clone_ref: (arg0: usize) => {
                    const ret = this.#getObject(arg0);
                    return this.#addHeapObject(ret);
                },
                __wbindgen_object_drop_ref: (arg0: usize): void => {
                    this.#takeObject(arg0);
                },
                __wbindgen_string_new: (arg0: usize, arg1: usize): usize => {
                    const ret = this.#getString(arg0, arg1);
                    return this.#addHeapObject(ret);
                },
                __wbindgen_throw: (arg0: usize, arg1: usize): never => {
                    throw new Error(this.#getString(arg0, arg1));
                }
            }
        };
    }

    #serializeConfig(config: NestConfig): u32 {
        let result: u32 = 0;

        // Кодуємо значення в число
        result = this.setBits(result, config.curveTolerance * 10, 0, 4);
        result = this.setBits(result, config.spacing, 4, 5);
        result = this.setBits(result, config.rotations, 9, 5);
        result = this.setBits(result, config.populationSize, 14, 7);
        result = this.setBits(result, config.mutationRate, 21, 7);
        result = this.setBits(result, Number(config.useHoles), 28, 1);

        return result;
    }
}
