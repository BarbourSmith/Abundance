/// Fill rule for determining which areas of a polygon are filled.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PolyFillType {
    /// Even-odd fill rule
    EvenOdd = 0,
    /// Non-zero winding fill rule
    NonZero = 1,
    /// Positive winding fill rule
    Positive = 2,
    /// Negative winding fill rule
    Negative = 3,
}

/// Type of polygon in clipping operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PolyType {
    /// Subject polygon (the one being clipped)
    Subject = 0,
    /// Clip polygon (the one doing the clipping)
    Clip = 1,
}

/// Type of boolean operation to perform on polygons.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum ClipType {
    /// Intersection of subject and clip polygons
    Intersection = 0,
    /// Union of subject and clip polygons
    Union = 1,
    /// Difference of subject minus clip polygons
    Difference = 2,
    /// Exclusive OR of subject and clip polygons
    Xor = 3,
}

/// Direction of edge traversal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Direction {
    /// Left direction
    Left = 0,
    /// Right direction
    Right = 1,
}

/// Side of an edge in polygon operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum EdgeSide {
    /// Current edge side
    Current = 0,
    /// Bottom edge side
    Bottom = 1,
    /// Top edge side
    Top = 2,
    /// Delta edge side
    Delta = 3,
}

/// Boolean condition for comparisons.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BoolCondition {
    /// Not equal condition
    Unequal = 0,
    /// Equal condition
    Equal = 1,
    /// Greater than condition
    Greater = 2,
    /// Greater than or equal condition
    GreaterOrEqual = 3,
    /// Less than condition
    Less = 4,
    /// Less than or equal condition
    LessOrEqual = 5,
}
