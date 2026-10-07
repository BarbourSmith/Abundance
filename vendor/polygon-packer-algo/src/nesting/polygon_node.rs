/// A node representing a polygon in the nesting hierarchy.
///
/// This struct contains information about a polygon including its source index,
/// rotation angle, memory segment data, and child nodes for hierarchical nesting.
#[derive(Debug, Clone)]
pub struct PolygonNode {
    /// Source index identifying the original polygon
    pub source: i32,
    /// Rotation angle in radians
    pub rotation: f32,
    /// Size of the memory segment
    pub seg_size: usize,
    /// Memory segment containing polygon vertex data
    pub mem_seg: Box<[f32]>,
    /// Child nodes for hierarchical nesting
    pub children: Vec<PolygonNode>,
}

/// SourceItem represents a node and its children in a serializable form.
#[derive(Debug, Clone)]
pub struct SourceItem {
    /// Source index
    pub source: u16,
    /// Child source items
    pub children: Vec<SourceItem>,
}

impl PolygonNode {
    /// Create a new PolygonNode from source, rotation, and memory segment
    ///
    /// # Arguments
    /// * `source` - Source index of the polygon
    /// * `rotation` - Rotation angle in radians
    /// * `mem_seg` - Memory segment containing vertex data
    ///
    /// # Returns
    /// A new PolygonNode instance
    pub fn new(source: i32, rotation: f32, mem_seg: Vec<f32>) -> Self {
        let seg_size = mem_seg.len();
        PolygonNode {
            source,
            rotation,
            seg_size,
            mem_seg: mem_seg.into_boxed_slice(),
            children: Vec::new(),
        }
    }
    /// Deserialize PolygonNodes from f32 buffer
    ///
    /// Reads node count from the buffer at the given offset position and deserializes that many nodes
    /// starting from buffer[offset + 1]
    ///
    /// Arguments:
    /// - buffer: f32 buffer containing serialized node data
    /// - offset: Position where node count is stored
    ///
    /// Returns: Vector of deserialized PolygonNodes
    pub fn deserialize(buffer: &[f32], offset: usize) -> Vec<PolygonNode> {
        if buffer.len() <= offset {
            return Vec::new();
        }

        // Read node count (big-endian u32, matching TypeScript DataView)
        let root_count = buffer[offset].to_bits() as usize;

        if root_count == 0 {
            return Vec::new();
        }

        let (nodes, _) = Self::deserialize_inner(buffer, offset + 1, root_count);
        nodes
    }

    fn deserialize_inner(
        buffer: &[f32],
        mut idx: usize,
        count: usize,
    ) -> (Vec<PolygonNode>, usize) {
        let mut nodes = Vec::with_capacity(count);

        for _ in 0..count {
            let raw_source = buffer[idx].to_bits();
            let source = raw_source.wrapping_sub(1) as i32;
            idx += 1;

            // Rotation is also stored in big-endian by DataView.setFloat32()
            let rotation = f32::from_bits(buffer[idx].to_bits());
            idx += 1;

            let seg_size = (buffer[idx].to_bits() as usize) << 1;
            idx += 1;

            let mem_seg = buffer[idx..idx + seg_size].to_vec().into_boxed_slice();
            idx += seg_size;

            let child_count = buffer[idx].to_bits() as usize;
            idx += 1;

            let (children, new_idx) = Self::deserialize_inner(buffer, idx, child_count);
            idx = new_idx;

            nodes.push(PolygonNode {
                source,
                seg_size,
                rotation,
                mem_seg,
                children,
            });
        }

        (nodes, idx)
    }

    /// Serialize nodes to `Vec<f32>` format (for Float32Array)
    /// Only the root node count, all other values are native format
    pub fn serialize(nodes: &[PolygonNode], offset: usize) -> Vec<f32> {
        // Calculate total f32 count needed
        let total_count = Self::calculate_total_count(nodes, offset + 1);
        let mut buffer = vec![0.0f32; total_count];

        // Write node count as f32 - only for root level
        let node_count = nodes.len() as u32;
        buffer[offset] = f32::from_bits(node_count);

        // Serialize nodes starting after the count
        Self::serialize_internal(nodes, &mut buffer, offset + 1);
        buffer
    }

    fn serialize_internal(nodes: &[PolygonNode], buffer: &mut [f32], offset: usize) -> usize {
        nodes.iter().fold(offset, |mut result, node| {
            // Write source as f32 (reinterpreting u32 bits) - big-endian to match deserialize
            buffer[result] = f32::from_bits((node.source + 1) as u32);
            result += 1;

            // Write rotation - big-endian to match deserialize
            buffer[result] = f32::from_bits(node.rotation.to_bits());
            result += 1;

            // Write mem_seg length as f32 (number of points) - big-endian to match deserialize
            let mem_seg_length = (node.mem_seg.len() >> 1) as u32;
            buffer[result] = f32::from_bits(mem_seg_length);
            result += 1;

            // Write mem_seg data directly (coordinate data in native format)
            buffer[result..result + node.mem_seg.len()].copy_from_slice(&node.mem_seg);
            result += node.mem_seg.len();

            // Write children count as f32 - big-endian to match deserialize
            buffer[result] = f32::from_bits(node.children.len() as u32);
            result += 1;

            // Recursively serialize children
            Self::serialize_internal(&node.children, buffer, result)
        })
    }

    fn calculate_total_count(nodes: &[PolygonNode], initial_count: usize) -> usize {
        nodes.iter().fold(initial_count, |result, node| {
            // 4 f32 values for: source, rotation, mem_seg_length, children_count
            // + mem_seg.len() f32 values for the polygon data
            let node_count = 4 + node.mem_seg.len();
            let new_result = result + node_count;
            Self::calculate_total_count(&node.children, new_result)
        })
    }

    /// Generate NFP cache key from two polygon nodes
    pub fn generate_nfp_cache_key(
        rotation_split: u32,
        inside: bool,
        polygon1: &PolygonNode,
        polygon2: &PolygonNode,
    ) -> u32 {
        use crate::utils::bit_ops::set_bits;

        let rotation_index1 = Self::to_rotation_index(polygon1.rotation, rotation_split);
        let rotation_index2 = Self::to_rotation_index(polygon2.rotation, rotation_split);

        let data = [
            (polygon1.source + 1) as u16,
            (polygon2.source + 1) as u16,
            rotation_index1 as u16,
            rotation_index2 as u16,
            if inside { 1u16 } else { 0u16 },
        ];

        const NFP_KEY_INDICES: [u8; 6] = [0, 10, 19, 23, 27, 32];
        let mut result: u32 = 0;

        for i in 0..data.len() {
            let bit_count = NFP_KEY_INDICES[i + 1] - NFP_KEY_INDICES[i];
            result = set_bits(result, data[i], NFP_KEY_INDICES[i], bit_count);
        }

        result
    }

    pub fn to_rotation_index(rotation: f32, rotation_split: u32) -> u32 {
        const ROTATION_STEP: f32 = 360.0;
        let split = rotation_split as f32;
        let step = ROTATION_STEP / split;
        let index = (rotation / step).round() as i32;
        ((index % rotation_split as i32 + rotation_split as i32) % rotation_split as i32) as u32
    }

    /// Rotate multiple polygon nodes
    ///
    /// Clones the nodes and applies rotation to each node and its children
    pub fn rotate_nodes(nodes: &[PolygonNode]) -> Vec<PolygonNode> {
        let mut result = Self::clone_nodes(nodes);

        for node in result.iter_mut() {
            let rotation = node.rotation;
            Self::rotate_node(node, rotation);
        }

        result
    }

    /// Convert this node (and children) into a `SourceItem`.
    pub fn to_source_item(&self) -> SourceItem {
        SourceItem {
            source: self.source as u16,
            children: self.children.iter().map(|c| c.to_source_item()).collect(),
        }
    }

    /// Rotate a single polygon node and all its children
    fn rotate_node(root_node: &mut PolygonNode, rotation: f32) {
        use crate::utils::number::Number;

        // Rotate the polygon's memory segment
        let mut mem_seg = root_node.mem_seg.to_vec();
        f32::rotate_polygon(&mut mem_seg, rotation);
        root_node.mem_seg = mem_seg.into_boxed_slice();

        // Recursively rotate children
        for child in root_node.children.iter_mut() {
            Self::rotate_node(child, rotation);
        }
    }

    /// Deep clone a slice of polygon nodes
    fn clone_nodes(nodes: &[PolygonNode]) -> Vec<PolygonNode> {
        nodes
            .iter()
            .map(|node| PolygonNode {
                source: node.source,
                rotation: node.rotation,
                seg_size: node.seg_size,
                mem_seg: node.mem_seg.clone(),
                children: Self::clone_nodes(&node.children),
            })
            .collect()
    }

    pub fn convert_to_source_items(nodes: &[PolygonNode]) -> Vec<SourceItem> {
        nodes.iter().map(|node| node.to_source_item()).collect()
    }
}
