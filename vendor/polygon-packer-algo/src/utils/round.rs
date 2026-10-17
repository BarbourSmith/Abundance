/// Trait for standard rounding operations.
pub trait Round {
    /// Rounds the value to the nearest integer.
    ///
    /// # Returns
    /// The rounded value
    fn rounded(self) -> Self;
}

/// Trait for Clipper-specific rounding operations.
///
/// This trait provides rounding methods optimized for the Clipper library's
/// coordinate system and precision requirements.
pub trait ClipperRound {
    /// Rounds the value using Clipper-specific rounding rules.
    ///
    /// # Returns
    /// The clipper-rounded value
    fn clipper_rounded(self) -> Self;
}

impl Round for f64 {
    fn rounded(self) -> Self {
        self.round()
    }
}

impl Round for f32 {
    fn rounded(self) -> Self {
        self.round()
    }
}

impl Round for i32 {
    fn rounded(self) -> Self {
        self
    }
}

impl ClipperRound for f64 {
    fn clipper_rounded(self) -> Self {
        if self < 0.0 {
            (self - 0.5).ceil()
        } else {
            (self + 0.5).floor()
        }
    }
}

impl ClipperRound for f32 {
    fn clipper_rounded(self) -> Self {
        if self < 0.0 {
            (self - 0.5).ceil()
        } else {
            (self + 0.5).floor()
        }
    }
}

impl ClipperRound for i32 {
    fn clipper_rounded(self) -> Self {
        self
    }
}
