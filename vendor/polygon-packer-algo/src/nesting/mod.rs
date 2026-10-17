//! # Nesting Module
//!
//! Core algorithms for polygon nesting and placement optimization.
//! This module contains the main logic for computing No-Fit Polygons (NFPs),
//! genetic algorithm optimization, and placement strategies.

pub mod calculate;
pub mod constants;
pub mod nest_content;
pub mod nfp_store;
pub mod nfp_wrapper;
pub mod pair_content;
pub mod pair_flow;
pub mod place_content;
pub mod place_flow;
pub mod polygon_node;
