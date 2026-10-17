import WasmNesting from "./wasm-nesting";

const wasmNesting = new WasmNesting();

self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
    if (wasmNesting.isInitialized) {
        const buffer = wasmNesting.calculate(new Float32Array(data)).buffer as ArrayBuffer;
        //@ts-ignore
        self.postMessage(buffer, [buffer]);
    } else {
        wasmNesting.initBuffer(data).then(() => self.postMessage(''));
    }
};
