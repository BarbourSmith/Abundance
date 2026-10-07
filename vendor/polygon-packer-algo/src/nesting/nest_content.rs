use crate::nest_config::NestConfig;
use crate::nesting::polygon_node::PolygonNode;

/// Container for nesting content including configuration and polygon nodes.
///
/// This struct manages a collection of polygon nodes and their associated
/// nesting configuration parameters.
#[derive(Debug)]
pub struct NestContent {
    /// Configuration parameters for the nesting process
    nest_config: NestConfig,
    /// Vector of polygon nodes to be nested
    nodes: Vec<PolygonNode>,
}

impl NestContent {
    /// Creates a new empty NestContent instance.
    ///
    /// # Returns
    /// A new NestContent with default configuration and empty node list
    pub fn new() -> NestContent {
        NestContent {
            nodes: Vec::new(),
            nest_config: NestConfig::new(),
        }
    }

    /// Initializes the content from a buffer and node offset.
    ///
    /// # Arguments
    /// * `buffer` - Float32 buffer containing serialized data
    /// * `node_offset` - Offset into buffer where node data starts
    pub fn init(&mut self, buffer: &[f32], node_offset: usize) {
        let nest_data = buffer[1].to_bits();
        let mut nodes = PolygonNode::deserialize(buffer, node_offset);

        self.nest_config.deserialize(nest_data);
        self.nodes.append(&mut nodes);
    }

    /// Initialize from f32 buffer (for PlaceContent)
    /// Buffer contains only the nodes section starting with node count
    pub fn init_from_f32(&mut self, buffer: &[f32], nest_config: u32) {
        self.nest_config.deserialize(nest_config);

        if buffer.is_empty() {
            return;
        }

        self.nodes = PolygonNode::deserialize(buffer, 0);
    }

    pub fn clean(&mut self) {
        self.nodes.clear();
    }

    pub fn is_broken(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Gets the number of nodes in this content.
    ///
    /// # Returns
    /// The number of polygon nodes
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Gets a reference to the node at the specified index.
    ///
    /// # Arguments
    /// * `index` - Index of the node to retrieve
    ///
    /// # Returns
    /// A reference to the PolygonNode at the given index
    pub fn node_at(&self, index: usize) -> &PolygonNode {
        &self.nodes[index]
    }

    pub fn remove_node(&mut self, index: usize) {
        if index < self.nodes.len() {
            self.nodes.remove(index);
        }
    }

    pub fn use_holes(&self) -> bool {
        self.nest_config.use_holes
    }
}
