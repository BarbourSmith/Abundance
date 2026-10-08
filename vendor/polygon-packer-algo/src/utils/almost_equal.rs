use crate::constants::{TOL_F32, TOL_F64};

/// Trait for approximate equality comparison with tolerance.
///
/// This trait provides methods to check if two values are approximately equal
/// within a specified tolerance, useful for floating-point comparisons.
pub trait AlmostEqual<Rhs = Self> {
    /// Checks if two values are approximately equal within tolerance.
    ///
    /// # Arguments
    /// * `other` - The value to compare against
    /// * `tolerance` - Optional tolerance value (uses default if None)
    ///
    /// # Returns
    /// true if the values are within tolerance of each other
    fn almost_equal(self, other: Rhs, tolerance: Option<Rhs>) -> bool;
}

impl AlmostEqual for f64 {
    fn almost_equal(self, other: f64, tolerance: Option<f64>) -> bool {
        let tol = tolerance.unwrap_or(TOL_F64);
        (self - other).abs() < tol
    }
}

impl AlmostEqual for f32 {
    fn almost_equal(self, other: f32, tolerance: Option<f32>) -> bool {
        let tol = tolerance.unwrap_or(TOL_F32);
        (self - other).abs() < tol
    }
}

impl AlmostEqual for i32 {
    fn almost_equal(self, other: i32, _tolerance: Option<i32>) -> bool {
        self == other
    }
}
