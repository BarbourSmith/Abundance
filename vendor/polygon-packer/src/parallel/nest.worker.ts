import type { CalculateConfig } from '../types';

// Import the geometry-utils module directly
// Assuming the module exports a function called "calculate"
import { calculate } from 'geometry-utils';

const config: CalculateConfig = { isInit: false, pointPool: null };
let isWasmInitialized = false;

const trigger = (event: MessageEvent<ArrayBuffer>) => {
    if (isWasmInitialized) {
        //@ts-ignore
        const buffer = calculate(config, event.data);

        //@ts-ignore
        self.postMessage(buffer, [buffer]);
    } else {
        const handler = () => {
            self.removeEventListener('wasmReady', handler);
            isWasmInitialized = true;
            trigger(event);
        };
        self.addEventListener('wasmReady', handler);
    }
};

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    trigger(event);
};

// Make sure TypeScript knows this is a module
export {};
