/// Unassigned/sentinel value for indices
pub const UNASSIGNED: usize = 0;

/// Scale factor for Clipper's integer coordinate system
pub const CLIPPER_SCALE: i32 = 100;

/// Threshold for cleaning small artifacts from polygons
pub const CLEAN_TRASHOLD: f32 = 0.0001 * (CLIPPER_SCALE as f32);

/// Minimum area threshold for polygon validity
pub const AREA_TRASHOLD: f32 = 0.1 * (CLIPPER_SCALE as f32) * (CLIPPER_SCALE as f32);
