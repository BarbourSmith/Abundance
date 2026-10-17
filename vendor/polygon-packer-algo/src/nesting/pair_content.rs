use crate::constants::NFP_KEY_INDICES;
use crate::nesting::constants::NFP_INFO_START_INDEX;
use crate::nesting::nest_content::NestContent;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::bit_ops::{get_bits, join_u16};

/// PairContent represents a pair of polygons and their NFP (No-Fit Polygon) relationship
///
/// This structure contains information about two polygons that are being processed
/// together, including their geometric relationship and nesting properties.
#[derive(Debug)]
pub struct PairContent {
    /// The nested content containing the polygon pair data
    nest_content: NestContent,
    /// Bit-packed key containing various flags and indices
    key: u32,
    /// Whether the second polygon is inside the first polygon
    is_inside: bool,
}

impl PairContent {
    /// Creates a new empty PairContent instance
    ///
    /// # Returns
    /// * `PairContent` - A new instance with default values
    pub fn new() -> PairContent {
        PairContent {
            nest_content: NestContent::new(),
            key: 0,
            is_inside: false,
        }
    }

    /// Initializes the PairContent from a buffer containing serialized NFP data
    ///
    /// # Arguments
    /// * `buffer` - Float32 buffer containing the serialized pair data
    pub fn init(&mut self, buffer: &[f32]) {
        self.key = buffer[2].to_bits();
        self.is_inside = get_bits(self.key, NFP_KEY_INDICES[4], 1) != 0;

        self.nest_content.init(buffer, 3);
    }

    /// Gets the bit-packed key containing various flags and indices
    ///
    /// # Returns
    /// * `u32` - The packed key value
    pub fn key(&self) -> u32 {
        self.key
    }

    /// Checks if the second polygon is inside the first polygon
    ///
    /// # Returns
    /// * `bool` - True if the second polygon is contained within the first
    pub fn is_inside(&self) -> bool {
        self.is_inside
    }

    /// Checks if holes should be used in the nesting calculation
    ///
    /// # Returns
    /// * `bool` - True if holes should be considered
    pub fn use_holes(&self) -> bool {
        self.nest_content.use_holes()
    }

    /// Gets the first polygon node in the pair
    ///
    /// # Returns
    /// * `&PolygonNode` - Reference to the first polygon
    pub fn first_node(&self) -> &PolygonNode {
        self.nest_content.node_at(0)
    }

    /// Gets the second polygon node in the pair
    ///
    /// # Returns
    /// * `&PolygonNode` - Reference to the second polygon
    pub fn second_node(&self) -> &PolygonNode {
        self.nest_content.node_at(1)
    }

    pub fn serialize_result(&self, mut nfp_arrays: Vec<Vec<f32>>) -> Vec<f32> {
        let n = nfp_arrays.len();

        let mut result = Vec::new();

        result.push(f32::from_bits(self.key));
        result.push(f32::from_bits(n as u32));

        let mut offset = NFP_INFO_START_INDEX as u16 + n as u16;
        for arr in &nfp_arrays {
            let len = arr.len() as u16;
            let packed = join_u16(len, offset);
            result.push(f32::from_bits(packed));
            offset += len;
        }

        for mut nfp in nfp_arrays.iter_mut() {
            result.append(&mut nfp);
        }

        result
    }
}
