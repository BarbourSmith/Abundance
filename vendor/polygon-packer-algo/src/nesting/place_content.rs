use crate::nesting::nest_content::NestContent;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::bit_ops::get_bits;
use std::collections::HashMap;

/// Rust port of PlaceContent class from TypeScript
/// Manages placement content including NFP cache and nodes
pub struct PlaceContent {
    nest_content: NestContent,
    nfp_cache: HashMap<u32, Vec<f32>>,
    area: f32,
    empty_node: PolygonNode,
    rotations: u32,
}

impl PlaceContent {
    /// Creates a new PlaceContent instance
    pub fn new() -> Self {
        Self {
            nest_content: NestContent::new(),
            nfp_cache: HashMap::new(),
            area: 0.0,
            empty_node: PolygonNode::new(-1, 0.0, Vec::new()),
            rotations: 0,
        }
    }

    /// Initialize from f32 buffer (view of original bytes as 32-bit words)
    /// Buffer format (matching TypeScript PlaceContent when viewed as 32-bit words):
    /// - [0]: UNKNOWN (skipped)
    /// - [1]: nest_config (u32 bit pattern)
    /// - [2]: area (f32)
    /// - [3]: map_buffer_size (u32 bit pattern, bytes)
    /// - [4..4+map_words]: NFP cache map as f32 words
    /// - [4+map_words..]: nodes data (f32 words)
    pub fn init(&mut self, buffer: &[f32]) -> &mut Self {
        // Need at least 5 words (20 bytes) to contain header + possibly empty map
        if buffer.len() < 5 {
            return self;
        }

        // Read nest_config from word index 1 (u32 stored in f32 bit pattern)
        let nest_config = buffer[1].to_bits();

        // Read area from word index 2
        self.area = buffer[2];

        // Read map_buffer_size in bytes from word index 3
        let map_buffer_size_bytes = buffer[3].to_bits() as usize;

        // Convert bytes to number of f32 words
        let map_words = map_buffer_size_bytes / 4;

        // Extract rotations from nest_config (bits 9-13, 5 bits)
        self.rotations = get_bits(nest_config, 9, 5) as u32;

        // Deserialize NFP cache map from the f32 word region starting at index 4
        if 4 + map_words <= buffer.len() {
            self.nfp_cache = Self::deserialize_buffer_to_map(buffer, 4, map_words);
        } else {
            self.nfp_cache.clear();
        }

        // Initialize nodes from remaining words
        let node_word_offset = 4 + map_words;
        if node_word_offset < buffer.len() {
            self.nest_content
                .init_from_f32(&buffer[node_word_offset..], nest_config);
        }

        self
    }

    /// Clean up resources
    /// Cleans the PlaceContent, clearing all cached data and resetting to empty state
    pub fn clean(&mut self) {
        self.nest_content.clean();
        self.nfp_cache.clear();
        self.area = 0.0;
    }

    /// Get bin NFP for a node at given index
    pub fn get_bin_nfp(&self, index: usize) -> Option<&[f32]> {
        if index >= self.nest_content.node_count() {
            return None;
        }

        let key = PolygonNode::generate_nfp_cache_key(
            self.rotations,
            true,
            &self.empty_node,
            self.nest_content.node_at(index),
        );

        self.nfp_cache.get(&key).map(|v| v.as_slice())
    }

    /// Check if all necessary NFPs exist for placed nodes and path
    pub fn get_nfp_error(&self, placed: &[PolygonNode], path: &PolygonNode) -> bool {
        for placed_node in placed {
            let key = PolygonNode::generate_nfp_cache_key(self.rotations, false, placed_node, path);

            if !self.nfp_cache.contains_key(&key) {
                return true;
            }
        }

        false
    }

    /// Get path key for a node at given index
    pub fn get_path_key(&self, index: usize) -> u32 {
        use crate::utils::bit_ops::join_u16;

        if index >= self.nest_content.node_count() {
            return 0;
        }

        let node = self.nest_content.node_at(index);
        let rotation_index = PolygonNode::to_rotation_index(node.rotation, self.rotations);

        // Match TypeScript: join_u16_to_u32(rotation_index, source)
        // rotation_index in lower bits, source in upper bits
        join_u16(rotation_index as u16, node.source as u16)
    }

    /// Deserialize buffer to NFP cache map
    /// Map format: [key (u32 BE), length (u32 BE), value (bytes), key, length, value, ...]
    /// Matches TypeScript PlaceContent.deserializeBufferToMap (DataView big-endian)
    /// Converts byte values to f32 during deserialization
    fn deserialize_buffer_to_map(
        buffer: &[f32],
        initial_offset: usize,
        buffer_size: usize,
    ) -> HashMap<u32, Vec<f32>> {
        let mut map = HashMap::new();
        let result_offset = initial_offset + buffer_size;
        let mut offset = initial_offset;

        // Each entry in the map is laid out as 32-bit words. When the buffer is
        // provided as a `&[f32]`, the first two words for each entry are the
        // `key` and `length` encoded as 32-bit values (their bit patterns are
        // reinterpreted from the underlying bytes). We extract those by
        // reading the f32 bit patterns via `to_bits()`.
        while offset + 2 <= result_offset {
            // Read key (u32 represented in the bit pattern of the f32 value)
            let key = buffer[offset].to_bits();
            offset += 1;

            // Read length in bytes (u32 represented in the bit pattern)
            let length_bytes = buffer[offset].to_bits() as usize;
            offset += 1;

            // Calculate how many f32 values the length refers to
            let f32_count = length_bytes / 4;

            if offset + f32_count <= result_offset {
                let mut f32_values = Vec::with_capacity(f32_count);
                for i in 0..f32_count {
                    f32_values.push(buffer[offset + i]);
                }

                map.insert(key, f32_values);
                offset += f32_count;
            } else {
                break;
            }
        }

        map
    }

    // Getters
    pub fn rotations(&self) -> u32 {
        self.rotations
    }

    pub fn nfp_cache(&self) -> &HashMap<u32, Vec<f32>> {
        &self.nfp_cache
    }

    pub fn area(&self) -> f32 {
        self.area
    }

    pub fn node_count(&self) -> usize {
        self.nest_content.node_count()
    }

    pub fn node_at(&self, index: usize) -> &PolygonNode {
        self.nest_content.node_at(index)
    }

    pub fn remove_node(&mut self, node: &PolygonNode) {
        // Find and remove node by comparing source and rotation
        for i in 0..self.nest_content.node_count() {
            let current_node = self.nest_content.node_at(i);
            if current_node.source == node.source && current_node.rotation == node.rotation {
                self.nest_content.remove_node(i);
                break;
            }
        }
    }

    pub fn remove_node_at(&mut self, index: usize) {
        self.nest_content.remove_node(index);
    }
}

impl Default for PlaceContent {
    fn default() -> Self {
        Self::new()
    }
}
