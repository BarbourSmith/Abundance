use crate::nesting::pair_flow::pair_data;
use crate::nesting::place_flow::place_paths;

/// Thread type enum matching TypeScript THREAD_TYPE
#[derive(Debug, PartialEq)]
pub enum ThreadType {
    /// Pair calculation thread type
    Pair = 0,
    /// Placement calculation thread type
    Placement = 1,
}

impl ThreadType {
    /// Parse thread type from u32 value
    pub fn from_u32(value: u32) -> Option<ThreadType> {
        match value {
            0 => Some(ThreadType::Pair),
            1 => Some(ThreadType::Placement),
            _ => None,
        }
    }
}

/// Main calculation function that routes to either pair_data or place_paths
/// based on the thread type in the buffer.
///
/// Port of TypeScript calculate function from worker-flow/index.ts
///
/// # Arguments
/// * `buffer` - Input buffer where first 4 bytes (u32 big-endian) indicate thread type
///
/// # Returns
/// Result buffer from either pair_data or place_paths
pub fn calculate(buffer: &[f32]) -> Vec<f32> {
    if buffer.len() < 4 {
        return Vec::new();
    }

    // Read thread type from first 4 bytes (big-endian u32, matching DataView.getUint32)
    let data_type = buffer[0].to_bits();

    let thread_type = match ThreadType::from_u32(data_type) {
        Some(t) => t,
        None => return Vec::new(),
    };

    match thread_type {
        ThreadType::Pair => unsafe { pair_data(&buffer) },
        ThreadType::Placement => place_paths(&buffer),
    }
}

/// Calculate on multiple chunks provided in a single buffer.
/// Buffer structure (all 32-bit words):
/// [ threadType: u32, chunkCount: u32, size1: u32, size2: u32, ..., chunk1_words..., chunk2_words..., ... ]
/// Each `sizeN` is the number of f32 words in that chunk.
/// Returns a flat f32 array: [chunkCount: u32, resSize1: u32, res1..., resSize2: u32, res2..., ...]
pub fn calculate_chunk(buffers: Vec<Vec<f32>>) -> Vec<Vec<f32>> {
    // For each input buffer (chunk) call `calculate` and return a Vec of results
    let mut results: Vec<Vec<f32>> = Vec::with_capacity(buffers.len());

    for chunk in buffers {
        let res = calculate(&chunk);
        results.push(res);
    }

    results
}
