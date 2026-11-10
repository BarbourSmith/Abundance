//! # Clipper Module
//!
//! Polygon clipping and offsetting operations based on the Clipper library.
//! This module provides robust geometric operations for polygon manipulation,
//! including clipping, offsetting, and boolean operations on polygons.
//!
//! The implementation is based on Angus Johnson's Clipper library and provides
//! high-performance polygon operations essential for NFP calculations.

pub mod clipper;
pub mod clipper_offset;
pub mod constants;
pub mod enums;
pub mod intersect_node;
pub mod join;
pub mod local_minima;
pub mod out_rec;
pub mod scanbeam;
pub mod t_edge;
pub mod utils;

#[cfg(test)]
pub mod tests;

// Re-export commonly used items for convenience
pub use constants::*;
pub use enums::*;
