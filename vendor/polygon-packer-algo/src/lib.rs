//! # Polygon Packer Algorithm
//!
//! This crate provides a high-performance polygon nesting algorithm implemented in Rust,
//! designed for WebAssembly compilation. It efficiently packs 2D polygons into bins
//! using advanced geometric algorithms and genetic optimization.
//!
//! ## Features
//!
//! - **Geometric Operations**: Clipper-based polygon clipping and offsetting
//! - **NFP Calculation**: No-Fit Polygon computation for collision detection
//! - **Genetic Algorithm**: Optimization for placement efficiency
//! - **WebAssembly Support**: Direct compilation to WASM for web use
//! - **Parallel Processing**: Multi-threaded computation where possible
//!
//! ## Modules
//!
//! - `clipper`: Polygon clipping and offsetting operations
//! - `geometry`: Core geometric primitives and operations
//! - `nesting`: Main nesting algorithm implementation
//! - `genetic_algorithm`: Optimization using genetic algorithms
//! - `utils`: Utility functions for math and bit operations
//!
//! ## Usage
//!
//! The main entry points are the `#[wasm_bindgen]` functions that can be called
//! from JavaScript after compiling to WebAssembly.

use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Uint8Array};

pub mod clipper;
pub mod clipper_wrapper;
pub mod constants;
pub mod genetic_algorithm;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;
pub mod wasm_packer;

use crate::utils::bit_ops::*;
use crate::wasm_packer::WasmPacker;

#[wasm_bindgen]
/// Sets bits in a u32 value at a specified position.
///
/// # Arguments
/// * `source` - The original u32 value
/// * `value` - The value to set (as u16)
/// * `index` - The bit position to start setting
/// * `bit_count` - Number of bits to set
///
/// # Returns
/// The modified u32 value with bits set
pub fn set_bits_u32(source: u32, value: u16, index: u8, bit_count: u8) -> u32 {
    set_bits(source, value, index, bit_count)
}

fn split_f32_chunks(flat_data: &[f32]) -> Vec<Vec<f32>> {
    // Parse the flat f32 array where each NFP is prefixed by its size encoded as a f32:
    // [size1: f32, word1, word2, ..., size2: f32, ...]
    let mut nfp_vec: Vec<Vec<f32>> = Vec::new();
    let mut offset = 0usize;
    let len = flat_data.len();

    while offset < len {
        // Read size as f32 and cast to usize using its bit representation
        let size_f = flat_data[offset];
        let size = size_f.to_bits() as usize;
        offset += 1;

        if offset + size > len {
            // Defensive: stop if sizes do not match data length
            break;
        }

        let nfp = flat_data[offset..offset + size].to_vec();
        offset += size;
        nfp_vec.push(nfp);
    }

    nfp_vec
}

fn join_f32_chunks(data: &Vec<Vec<f32>>) -> Vec<f32> {
    // Flatten results into f32 vector with sizes encoded as u32 bits
    let mut flat: Vec<f32> = Vec::new();
    for item in data {
        flat.push(f32::from_bits(item.len() as u32));
        flat.extend_from_slice(&item);
    }

    flat
}

#[wasm_bindgen]
/// Calculates No-Fit Polygons (NFPs) for a chunk of polygon pairs.
///
/// This function takes a flat buffer containing polygon pairs and computes
/// their NFPs using geometric algorithms. The input buffer contains size-prefixed
/// polygon data, and the output is a flat buffer of computed NFPs.
///
/// # Arguments
/// * `buffer` - Flat f32 array containing size-prefixed polygon pairs
///
/// # Returns
/// A Float32Array containing the computed NFPs with size prefixes
pub fn calculate_chunk_wasm(buffer: &[f32]) -> Float32Array {
    // Reuse helper to split incoming flat buffer into chunks
    let chunks: Vec<Vec<f32>> = split_f32_chunks(buffer);

    let results = crate::nesting::calculate::calculate_chunk(chunks);

    // Flatten results into f32 vector with sizes encoded as u32 bits
    let flat: Vec<f32> = join_f32_chunks(&results);

    let out = Float32Array::new_with_length(flat.len() as u32);
    out.copy_from(&flat);
    out
}

// WasmPacker WASM wrappers

#[wasm_bindgen]
/// Initializes the WasmPacker with configuration and polygon data.
///
/// # Arguments
/// * `configuration` - Configuration bit flags as u32
/// * `polygon_data` - Flat f32 array containing size-prefixed polygons
pub fn wasm_packer_init(configuration: u32, polygon_data: &[f32]) {
    let poygons = split_f32_chunks(polygon_data);
    WasmPacker::with_instance(|packer| {
        packer.init(configuration, poygons);
    });
}

#[wasm_bindgen]
/// Retrieves polygon pairs for NFP calculation, grouped into chunks.
///
/// # Arguments
/// * `chunk_size` - Maximum number of pairs per chunk
///
/// # Returns
/// A Float32Array containing chunked polygon pairs with size prefixes
pub fn wasm_packer_get_pairs(chunk_size: u16) -> Float32Array {
    // Get pairs directly as Vec<Vec<f32>> from packer
    let pairs: Vec<Vec<f32>> = WasmPacker::with_instance(|packer| packer.get_pairs());

    if pairs.is_empty() {
        return Float32Array::new_with_length(0);
    }

    // Group pairs into chunks of chunk_size
    let mut chunk_flats: Vec<Vec<f32>> = Vec::new();
    let mut i = 0usize;
    while i < pairs.len() {
        let end = usize::min(i + chunk_size as usize, pairs.len());
        let slice = &pairs[i..end];
        // join each chunk (each chunk is Vec<Vec<f32>>) into flat with per-pair prefixes
        let chunk_vec: Vec<Vec<f32>> = slice.iter().cloned().collect();
        let chunk_flat = join_f32_chunks(&chunk_vec);
        chunk_flats.push(chunk_flat);
        i = end;
    }

    // Join all chunk flats into final flat buffer (each chunk prefixed with its size)
    let final_flat = join_f32_chunks(&chunk_flats);

    let out = Float32Array::new_with_length(final_flat.len() as u32);
    out.copy_from(&final_flat);
    out
}

#[wasm_bindgen]
/// Computes placement data using generated NFPs.
///
/// # Arguments
/// * `generated_nfp_flat` - Flat f32 array of generated NFPs with size prefixes
///
/// # Returns
/// A Float32Array containing placement data
pub fn wasm_packer_get_placement_data(generated_nfp_flat: &[f32]) -> Float32Array {
    // Parse the flat f32 array where each NFP is prefixed by its size encoded as a f32:
    // [size1: f32, word1, word2, ..., size2: f32, ...]
    let nfp_vec: Vec<Vec<f32>> = split_f32_chunks(&generated_nfp_flat);

    let result = WasmPacker::with_instance(|packer| packer.get_placement_data(nfp_vec));

    let mut up_level: Vec<Vec<f32>> = Vec::new();

    up_level.push(result);

    let flat_result = join_f32_chunks(&up_level);

    let out = Float32Array::new_with_length(flat_result.len() as u32);
    out.copy_from(&flat_result);
    out
}

#[wasm_bindgen]
/// Computes final placement results from placement data.
///
/// # Arguments
/// * `placements_flat` - Flat f32 array of placement data with size prefixes
///
/// # Returns
/// A Uint8Array containing the serialized placement results
pub fn wasm_packer_get_placement_result(placements_flat: &[f32]) -> Uint8Array {
    // Parse the flat f32 array into Vec<Vec<f32>> using explicit sizes array
    let placements_vec: Vec<Vec<f32>> = split_f32_chunks(&placements_flat);

    let result = WasmPacker::with_instance(|packer| packer.get_placement_result(placements_vec));

    let out = Uint8Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

#[wasm_bindgen]
/// Stops the WasmPacker and cleans up resources.
pub fn wasm_packer_stop() {
    WasmPacker::with_instance(|packer| {
        packer.stop();
    });
}

/// Run a full nesting flow entirely in Rust without using workers.
///
/// This function performs the complete polygon nesting algorithm:
/// 1. Initialize packer with configuration and polygon data
/// 2. Generate NFPs for all polygon pairs
/// 3. Compute optimal placements using genetic algorithms
/// 4. Return serialized placement results
///
/// # Returns
/// A Uint8Array containing the serialized nesting results
#[wasm_bindgen]
pub fn wasm_nest() -> Uint8Array {
    // Run the flow directly using the WasmPacker singleton to avoid extra
    // wasm_* wrapper indirection and keep all intermediate data as Rust Vecs.
    let result_bytes: Vec<u8> = WasmPacker::with_instance(|packer| {
        // Get pairs (Vec<Vec<f32>>)
        let pairs: Vec<Vec<f32>> = packer.get_pairs();

        if pairs.is_empty() {
            return Vec::new();
        }

        // Group pairs into chunks of `chunk_size` and run calculation for each
        // pair to produce generated NFPs. Collect results directly into a
        // Vec<Vec<f32>> to avoid flattening and re-splitting.
        let mut generated_nfps: Vec<Vec<f32>> = Vec::new();

        // Iterate over all pairs and calculate NFP for each directly.
        for pair_buf in pairs.iter() {
            let res = crate::nesting::calculate::calculate(pair_buf);
            if !res.is_empty() {
                generated_nfps.push(res);
            }
        }

        if generated_nfps.is_empty() {
            return Vec::new();
        }

        // Ask packer for placement data using the collected per-NFP Vecs
        let placement_data: Vec<f32> = packer.get_placement_data(generated_nfps);

        if placement_data.is_empty() {
            return Vec::new();
        }

        // Compute placements by calling `calculate` directly on placement_data
        let placements_res = crate::nesting::calculate::calculate(&placement_data);

        if placements_res.is_empty() {
            return Vec::new();
        }

        let mut placements_vec: Vec<Vec<f32>> = Vec::new();

        placements_vec.push(placements_res);

        let result = packer.get_placement_result(placements_vec);

        result
    });

    let out = Uint8Array::new_with_length(result_bytes.len() as u32);
    out.copy_from(&result_bytes);
    out
}
