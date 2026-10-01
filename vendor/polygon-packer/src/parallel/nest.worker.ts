import type { CalculateConfig } from '../types';

import { calculate } from 'geometry-utils';
//@ts-ignore - the generated type declarations don't include the loader's `ready` export
import { ready } from 'wasm-nesting';

const config: CalculateConfig = { isInit: false, pointPool: null };

// Wait on the loader's promise rather than its 'wasmReady' event: the event fires
// once, so a worker whose first message arrived after the module had loaded
// waited for it forever and the nesting run stalled.
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
    await ready;

    //@ts-ignore
    const buffer = calculate(config, event.data);

    //@ts-ignore
    self.postMessage(buffer, [buffer]);
};

// Make sure TypeScript knows this is a module
export {};
