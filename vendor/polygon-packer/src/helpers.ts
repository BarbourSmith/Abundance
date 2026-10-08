import { FlattenedData, SourceItem, u32, usize } from "./types";

/**
 * Internal recursive function to deserialize source items from binary data.
 * @param view - DataView of the binary data
 * @param offset - Current byte offset in the view
 * @param count - Number of items to deserialize
 * @returns Deserialized children and next offset position
 * @internal
 */
function deserializeSourceItemsInternal(
    view: DataView,
    offset: usize,
    count: u32
): { children: SourceItem[]; nextOffset: usize } {
    const children: SourceItem[] = [];
    let currentOffset = offset;

    for (let i = 0; i < count; ++i) {
        // Read source (u16)
        const source = view.getUint16(currentOffset, true);
        currentOffset += Uint16Array.BYTES_PER_ELEMENT;

        // Read children count (u16)
        const childrenCount = view.getUint16(currentOffset, true);
        currentOffset += Uint16Array.BYTES_PER_ELEMENT;

        // Recursively deserialize children
        const childrenResult = deserializeSourceItemsInternal(view, currentOffset, childrenCount);

        children.push({
            source,
            children: childrenResult.children
        });

        currentOffset = childrenResult.nextOffset;
    }

    return { children, nextOffset: currentOffset };
}

/**
 * Deserializes source items from binary data.
 * 
 * Converts packed binary representation of polygon tree structure
 * into a JavaScript object hierarchy.
 * 
 * @param data - Binary data containing serialized source items
 * @returns Array of deserialized source items with nested children
 */
export function deserializeSourceItems(data: Uint8Array): SourceItem[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Read items count
    const count = view.getUint16(0, true);

    // Deserialize items
    const result = deserializeSourceItemsInternal(view, Uint16Array.BYTES_PER_ELEMENT, count);

    return result.children;
}

/**
 * Flattens a tree structure of polygons into separate arrays of sources and holes.
 * 
 * Traverses the polygon tree recursively, alternating between treating nodes
 * as sources and holes based on nesting depth.
 * 
 * @param nodes - Array of source items to flatten
 * @param hole - Whether current level represents holes
 * @param result - Accumulator object for flattened data
 * @returns Flattened data with separate source and hole arrays
 */
export function flattenTree(
    nodes: SourceItem[],
    hole: boolean,
    result: FlattenedData = { sources: [], holes: [] }
): FlattenedData {
    const nodeCount = nodes.length;
    let node: SourceItem;
    let children: SourceItem[];

    for (let i = 0; i < nodeCount; ++i) {
        node = nodes[i];

        if (hole) {
            result.holes.push(node.source);
        }

        children = node.children;

        result.sources.push(node.source);

        if (children && children.length > 0) {
            flattenTree(children, !hole, result);
        }
    }

    return result;
}

/**
 * Calculates byte offset for an element in a Float32Array.
 * @param array - The Float32Array
 * @param index - Element index
 * @returns Byte offset of the element
 * @internal
 */
function getByteOffset(array: Float32Array, index: usize): u32 {
    return (array.byteOffset >>> 0) + index * Float32Array.BYTES_PER_ELEMENT;
}

export function readUint32FromF32(array: Float32Array, index: usize): u32 {
    const byteOffset = getByteOffset(array, index);
    const view = new DataView(array.buffer);

    return view.getUint32(byteOffset, true);
}

/**
 * Joins multiple Float32Arrays into a single array with size prefixes.
 * 
 * Each array is prefixed with its size encoded as a u32 in little-endian format.
 * This allows the arrays to be split later using {@link splitFloat32Arrays}.
 * 
 * @param arrays - Array of Float32Arrays to join
 * @returns Single Float32Array containing all arrays with size prefixes
 * @see {@link splitFloat32Arrays}
 */
export function joinFloat32Arrays(arrays: Float32Array[]): Float32Array {
    // Build a flat buffer where each array is prefixed by its size encoded as u32 bits (little-endian)
    const totalFloats = arrays.reduce((sum, a) => sum + a.length, 0);
    /**
     * Reads a 32-bit unsigned integer from a Float32Array at the specified index.
     * 
     * Interprets the bit pattern of a float as an unsigned integer.
     * Useful for reading metadata encoded in float arrays.
     * 
     * @param array - Float32Array containing the data
     * @param index - Index of the element to read
     * @returns The value interpreted as a 32-bit unsigned integer
     */
    const totalElements = totalFloats + arrays.length; // sizes + floats
    const buffer = new ArrayBuffer(totalElements * Float32Array.BYTES_PER_ELEMENT);

    arrays.reduce((acc, a) => {
        // write size as u32 bits (little-endian)
        acc.dv.setUint32(acc.byteOffset * Uint32Array.BYTES_PER_ELEMENT, a.length >>> 0, true);
        acc.byteOffset += 1;

        // write float words
        acc.f32view.set(a, acc.byteOffset);
        acc.byteOffset += a.length;

        return acc;
    }, { dv: new DataView(buffer), f32view: new Float32Array(buffer), byteOffset: 0 });

    return new Float32Array(buffer);
}

/**
 * Merges multiple ArrayBuffers into a single Float32Array.
 * 
 * Efficiently concatenates ArrayBuffers by pre-allocating the exact size needed
 * and using typed array set operations for fast copying.
 * 
 * @param arrays - Array of ArrayBuffers to merge
 * @returns Float32Array containing all merged data
 */
export function mergeFloat32Arrays(arrays: ArrayBuffer[]): Float32Array {
    const total = arrays.reduce((sum, arr) => sum + arr.byteLength / Float32Array.BYTES_PER_ELEMENT, 0);

    return arrays.reduce((acc, arr) => {
        const view = new Float32Array(arr);
        acc.result.set(view, acc.offset);
        acc.offset += view.length;

        return acc;
    }, { result: new Float32Array(total), offset: 0 }).result;
}

export function splitFloat32Arrays(flat: Float32Array): Float32Array[] {
    /**
     * Splits a joined Float32Array back into individual arrays.
     * 
     * Reads size prefixes and extracts the original arrays that were
     * joined using {@link joinFloat32Arrays}.
     * 
     * @param flat - Joined Float32Array with size prefixes
     * @returns Array of separate Float32Arrays
     * @see {@link joinFloat32Arrays}
     */
    const result: Float32Array[] = [];
    const view = new DataView(flat.buffer, flat.byteOffset, flat.byteLength);
    let byteOffset: usize = 0;

    while (byteOffset < flat.byteLength) {
        // read size encoded as u32 little-endian
        const size = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        const floatByteOffset = flat.byteOffset + byteOffset;

        const arr = new Float32Array(flat.buffer, floatByteOffset, size);
        // copy to standalone array
        result.push(arr.slice());

        byteOffset += size * Float32Array.BYTES_PER_ELEMENT;
    }

    return result;
}