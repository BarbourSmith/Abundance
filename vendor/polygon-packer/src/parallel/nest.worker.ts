import type { CalculateConfig } from '../types';

// Import the geometry-utils module directly
// Assuming the module exports a function called "calculate"
import { calculate } from 'geometry-utils';

const config: CalculateConfig = { isInit: false, pointPool: null };

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    //@ts-ignore
    const buffer = calculate(config, event.data);

    //@ts-ignore
    self.postMessage(buffer, [buffer]);
};

// Make sure TypeScript knows this is a module
export {};
