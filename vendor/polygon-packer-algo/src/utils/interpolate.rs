/// Trait for linear interpolation between two ranges.
///
/// This trait provides methods to map a value from one range to another
/// using linear interpolation.
pub trait Interpolate<Rhs = Self> {
    /// Interpolates a value from range [a1, a2] to range [b1, b2].
    ///
    /// # Arguments
    /// * `value` - The value to interpolate
    /// * `a1` - Start of source range
    /// * `a2` - End of source range
    /// * `b1` - Start of target range
    /// * `b2` - End of target range
    ///
    /// # Returns
    /// The interpolated value in the target range
    fn interpolate(value: Rhs, a1: Rhs, a2: Rhs, b1: Rhs, b2: Rhs) -> Rhs;
}

impl Interpolate for f64 {
    fn interpolate(value: f64, a1: f64, a2: f64, b1: f64, b2: f64) -> f64 {
        ((b1 - b2) * (value - a2)) / (a1 - a2) + b2
    }
}

impl Interpolate for f32 {
    fn interpolate(value: f32, a1: f32, a2: f32, b1: f32, b2: f32) -> f32 {
        ((b1 - b2) * (value - a2)) / (a1 - a2) + b2
    }
}

impl Interpolate for i32 {
    fn interpolate(value: i32, a1: i32, a2: i32, b1: i32, b2: i32) -> i32 {
        ((b1 - b2) * (value - a2)) / (a1 - a2) + b2
    }
}
