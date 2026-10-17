import { deserializeSourceItems, flattenTree, readUint32FromF32 } from './helpers';
import { IPlacementWrapper, SourceItem, FlattenedData, usize, u8, u32, u16, f32 } from './types';

/**
 * Wrapper for accessing polygon placement results from packed binary data.
 * 
 * Provides a high-level interface to read placement information including
 * polygon positions, rotations, bounds, and hierarchy from the binary buffer
 * returned by the WASM packing algorithm.
 * 
 * @example
 * ```typescript
 * const wrapper = new PlacementWrapper(resultBuffer);
 * console.log(`Placed ${wrapper.numPlacedParts}/${wrapper.numParts} parts`);
 * 
 * for (let i = 0; i < wrapper.placementCount; i++) {
 *   wrapper.bindPlacement(i);
 *   for (let j = 0; j < wrapper.size; j++) {
 *     const sourceId = wrapper.bindData(j);
 *     console.log(`Part ${sourceId} at (${wrapper.x}, ${wrapper.y}) rotation ${wrapper.rotation}°`);
 *   }
 * }
 * ```
 */
export default class PlacementWrapper implements IPlacementWrapper {
    #buffer: ArrayBuffer;

    #view: DataView;

    #placement: u32;

    #memSeg: Float32Array;

    #offset: usize;

    #size: usize;

    #pointData: u32;

    #pointOffset: usize;

    #placementCount: u32;

    #angleSplit: u8;

    #sources: SourceItem[];

    constructor(buffer: ArrayBuffer) {
        this.#buffer = buffer;
        this.#view = new DataView(this.#buffer);
        this.#memSeg = this.placementsData;
        this.#angleSplit = this.angleSplit;
        this.#placementCount = this.#memSeg[1];
        this.#memSeg = this.#memSeg;
        this.#sources = this.sources;
        this.#placement = 0;
        this.#offset = 0;
        this.#size = 0;
        this.#pointData = 0;
        this.#pointOffset = 0;
    }

    /**
     * Binds to a specific placement in the results to access its data.
     * 
     * Must be called before accessing placement-specific properties like
     * {@link offset}, {@link size}, or {@link bindData}.
     * 
     * @param index - Zero-based placement index (0 to {@link placementCount} - 1)
     */
    public bindPlacement(index: usize): void {
        this.#placement = readUint32FromF32(this.#memSeg, 2 + index);
        this.#offset = this.#placement >>> 16;
        this.#size = this.#placement & ((1 << 16) - 1);
    }

    /**
     * Binds to a specific polygon within the current placement.
     * 
     * After calling, properties like {@link id}, {@link rotation}, {@link x}, {@link y},
     * and {@link flattnedChildren} reflect data for this specific polygon.
     * 
     * @param index - Zero-based polygon index within the current placement (0 to {@link size} - 1)
     * @returns The source ID of the bound polygon
     */
    public bindData(index: usize): u32 {
        this.#pointData = readUint32FromF32(this.#memSeg, this.#offset + index);
        this.#pointOffset = this.#offset + this.#size + (index << 1);

        return this.#sources[this.id].source;
    }

    /**
     * Gets the flattened children (holes) of the currently bound polygon.
     * 
     * Returns a flattened representation of nested polygon children,
     * useful for rendering holes within a parent polygon.
     * 
     * @returns Flattened children data, or `null` if the polygon has no children
     */
    public get flattnedChildren(): FlattenedData | null {
        const source = this.#sources[this.id];

        return source.children.length ? flattenTree(source.children, true) : null;
    }

    /**
     * Gets the total number of placements in the result.
     * @returns Number of placements
     */
    public get placementCount(): usize {
        return this.#placementCount;
    }

    /**
     * Gets the offset of the currently bound placement in the data array.
     * @returns Placement offset
     * @internal
     */
    public get offset(): usize {
        return this.#offset;
    }

    /**
     * Gets the number of polygons in the currently bound placement.
     * @returns Number of polygons in current placement
     */
    public get size(): usize {
        return this.#size;
    }

    /**
     * Gets the polygon ID of the currently bound polygon.
     * @returns Polygon ID
     */
    public get id(): u16 {
        return this.#pointData >>> 16;
    }

    /**
     * Gets the rotation angle in degrees of the currently bound polygon.
     * @returns Rotation angle (0-360 degrees)
     */
    public get rotation(): u16 {
        return Math.round(((this.#pointData & ((1 << 16) - 1)) * 360) / this.#angleSplit);
    }

    /**
     * Gets the X coordinate of the currently bound polygon.
     * @returns X position
     */
    public get x(): f32 {
        return this.#memSeg[this.#pointOffset];
    }

    /**
     * Gets the Y coordinate of the currently bound polygon.
     * @returns Y position
     */
    public get y(): f32 {
        return this.#memSeg[this.#pointOffset + 1];
    }

    /**
     * Gets the percentage of polygons successfully placed (0-1).
     * @returns Placement success rate
     */
    get placePercentage(): f32 {
        return this.#view.getFloat32(0, true);
    }

    /**
     * Gets the number of parts that were successfully placed.
     * @returns Number of placed parts
     */
    get numPlacedParts(): u16 {
        return this.#view.getUint16(4, true);
    }

    /**
     * Gets the total number of parts that were attempted to be placed.
     * @returns Total number of parts
     */
    get numParts(): u16 {
        return this.#view.getUint16(6, true);
    }

    /**
     * Gets the angle quantization value used for rotation calculations.
     * @returns Angle split value
     * @internal
     */
    get angleSplit(): u8 {
        return this.#view.getUint8(8);
    }

    /**
     * Checks if the packing algorithm produced a valid result.
     * @returns `true` if results are available, `false` otherwise
     */
    get hasResult(): boolean {
        return this.#view.getUint8(9) === 1;
    }

    /**
     * Gets the X coordinate of the bounding box for all placed polygons.
     * @returns Bounding box X position
     */
    get boundsX(): f32 {
        return this.#view.getFloat32(10, true);
    }

    /**
     * Gets the Y coordinate of the bounding box for all placed polygons.
     * @returns Bounding box Y position
     */
    get boundsY(): f32 {
        return this.#view.getFloat32(14, true);
    }

    /**
     * Gets the width of the bounding box for all placed polygons.
     * @returns Bounding box width
     */
    get boundsWidth(): f32 {
        return this.#view.getFloat32(18, true);
    }

    /**
     * Gets the height of the bounding box for all placed polygons.
     * @returns Bounding box height
     */
    get boundsHeight(): f32 {
        return this.#view.getFloat32(22, true);
    }

    /**
     * Gets the hierarchical source polygon tree.
     * 
     * Deserializes the polygon hierarchy from the binary buffer,
     * including parent-child relationships for holes.
     * 
     * @returns Array of source items with nested children
     */
    get sources(): SourceItem[] {
        // Buffer structure:
        // 0-4: placePercentage (f32)
        // 4-6: numPlacedParts (u16)
        // 6-8: numParts (u16)
        // 8-9: angleSplit (u8)
        // 9-10: hasResult (u8)
        // 10-14: boundsX (f32)
        // 14-18: boundsY (f32)
        // 18-22: boundsWidth (f32)
        // 22-26: boundsHeight (f32)
        // 26-30: sourcesSize (u32)
        // 30-34: placementsDataSize (u32)
        // 34+: serialized sources

        const sourcesSize = this.#view.getUint32(26, true);

        if (sourcesSize === 0) {
            return [];
        }

        // Sources segment starts at offset 34
        const sourcesData = new Uint8Array(this.#buffer, 34, sourcesSize);

        return deserializeSourceItems(sourcesData);
    }

    /**
     * Gets the raw placements data as a Float32Array.
     * 
     * Contains encoded placement information including positions,
     * rotations, and polygon IDs.
     * 
     * @returns Float32Array view of placements data
     * @internal
     */
    get placementsData(): Float32Array {
        // Buffer structure:
        // 26-30: sourcesSize (u32)
        // 30-34: placementsDataSize (u32)
        // 34+sourcesSize: placements data

        const sourcesSize = this.#view.getUint32(26, true);
        const placementsDataSize = this.#view.getUint32(30, true);

        if (placementsDataSize === 0) {
            return new Float32Array(0);
        }

        // Placements data starts after sources segment
        const placementsOffset = 34 + sourcesSize;

        // Create Float32Array view of the placements data
        return new Float32Array(this.#buffer, placementsOffset, placementsDataSize / Float32Array.BYTES_PER_ELEMENT);
    }
}