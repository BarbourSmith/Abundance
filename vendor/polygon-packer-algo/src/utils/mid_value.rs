/// Trait for calculating mid values in geometric contexts.
///
/// This trait provides methods to compute values that help determine
/// the position of a point relative to a line segment defined by left and right points.
pub trait MidValue<Rhs = Self> {
    /// Calculates a mid value used in geometric computations.
    ///
    /// # Arguments
    /// * `left` - Left boundary value
    /// * `right` - Right boundary value
    ///
    /// # Returns
    /// The computed mid value
    fn mid_value(self, left: Rhs, right: Rhs) -> Self;
}

impl MidValue for f64 {
    fn mid_value(self, left: f64, right: f64) -> f64 {
        (2.0 * self - left - right).abs() - (left - right).abs()
    }
}

impl MidValue for f32 {
    fn mid_value(self, left: f32, right: f32) -> f32 {
        (2.0 * self - left - right).abs() - (left - right).abs()
    }
}

impl MidValue for i32 {
    fn mid_value(self, left: i32, right: i32) -> i32 {
        (2 * self - left - right).abs() - (left - right).abs()
    }
}
