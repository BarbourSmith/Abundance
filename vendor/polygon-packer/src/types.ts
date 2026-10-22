/** 32-bit floating point number */
export type f32 = number;

/** 32-bit unsigned integer */
export type u32 = number;

/** 32-bit signed integer */
export type i32 = number;

/** 16-bit unsigned integer */
export type u16 = number;

/** Platform-dependent unsigned size type */
export type usize = number;

/** Platform-dependent signed size type */
export type isize = number;

/** 8-bit unsigned integer */
export type u8 = number;

/**
 * Configuration options for the nesting algorithm.
 */
export type NestConfig = {
    /** Tolerance for curve approximation in units */
    curveTolerance: f32;
    /** Spacing between nested polygons in units */
    spacing: u8;
    /** Number of rotation angles to try (e.g., 4 = 0°, 90°, 180°, 270°) */
    rotations: u8;
    /** Size of the genetic algorithm population */
    populationSize: u8;
    /** Probability of mutation in genetic algorithm (0-1) */
    mutationRate: f32;
    /** Whether to use holes in polygons during nesting */
    useHoles: boolean;
};

/**
 * Represents a polygon with nested children (holes).
 */
export type SourceItem = {
    /** Index of the source polygon */
    source: u16;
    /** Array of child polygons (holes) */
    children: SourceItem[];
}

/**
 * Interface for placement results containing positioned polygons and metadata.
 */
export interface IPlacementWrapper {
    /** Percentage of polygons successfully placed (0-100) */
    readonly placePercentage: f32;
    /** Number of polygons that were successfully placed */
    readonly numPlacedParts: u16;
    /** Total number of polygons attempted to place */
    readonly numParts: u16;
    /** X coordinate of bounding box origin */
    readonly boundsX: f32;
    /** Y coordinate of bounding box origin */
    readonly boundsY: f32;
    /** Width of the bounding box containing all placed polygons */
    readonly boundsWidth: f32;
    /** Height of the bounding box containing all placed polygons */
    readonly boundsHeight: f32;
    /** Number of rotation angles evaluated */
    readonly angleSplit: u8;
    /** Whether a valid placement result was found */
    readonly hasResult: boolean;
    /** Tree structure of placed polygons with their holes */
    readonly sources: SourceItem[];
    /** Raw placement data as Float32Array (positions and transforms) */
    readonly placementsData: Float32Array;
}

/**
 * Callback function invoked when a new placement is found.
 * @param placementWrapper - The new placement result
 */
export type DisplayCallback = (placementWrapper: IPlacementWrapper) => void;

/**
 * Flattened representation of polygon tree structure.
 */
export type FlattenedData = {
    /** Array of source polygon indices */
    sources: number[];
    /** Array of hole polygon indices */
    holes: number[];
};

export type MemSeg = Uint8Array | Float32Array | Uint16Array;