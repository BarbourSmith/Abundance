use crate::utils::bit_ops::{get_bits, set_bits};

/// Configuration parameters for the polygon nesting algorithm.
///
/// This struct contains all the configurable parameters that control
/// the behavior of the nesting algorithm, including spacing, rotations,
/// genetic algorithm settings, and other optimization parameters.
#[derive(Debug, Clone, Copy)]
pub struct NestConfig {
    /// Curve tolerance for polygon simplification
    pub curve_tolerance: f32,
    /// Spacing between nested polygons
    pub spacing: u8,
    /// Number of rotation angles to try for each polygon
    pub rotations: u8,
    /// Population size for genetic algorithm
    pub population_size: u8,
    /// Mutation rate for genetic algorithm (0-100)
    pub mutation_rate: u8,
    /// Whether to consider holes in polygons during nesting
    pub use_holes: bool,
}

const NEST_OFFSETS: [u8; 6] = [0, 4, 9, 14, 21, 28];

const NEST_BITS: [u8; 6] = [4, 5, 5, 7, 7, 1];

impl NestConfig {
    /// Creates a new NestConfig with default values.
    ///
    /// # Returns
    /// A new NestConfig instance with default settings
    pub fn new() -> NestConfig {
        NestConfig {
            curve_tolerance: 0.0,
            spacing: 0,
            rotations: 0,
            population_size: 0,
            mutation_rate: 0,
            use_holes: false,
        }
    }

    /// Deserializes configuration from a packed u32 value.
    ///
    /// # Arguments
    /// * `packed` - The packed u32 value containing configuration bits
    pub fn deserialize(&mut self, packed: u32) {
        self.curve_tolerance = get_bits(packed, NEST_OFFSETS[0], NEST_BITS[0]) as f32 / 10.0;
        self.spacing = get_bits(packed, NEST_OFFSETS[1], NEST_BITS[1]) as u8;
        self.rotations = get_bits(packed, NEST_OFFSETS[2], NEST_BITS[2]) as u8;
        self.population_size = get_bits(packed, NEST_OFFSETS[3], NEST_BITS[3]) as u8;
        self.mutation_rate = get_bits(packed, NEST_OFFSETS[4], NEST_BITS[4]) as u8;
        self.use_holes = get_bits(packed, NEST_OFFSETS[5], NEST_BITS[5]) != 0;
    }

    /// Serializes the configuration into a packed u32 value.
    ///
    /// # Returns
    /// A u32 containing the packed configuration bits
    pub fn serialize(&self) -> u32 {
        let mut result: u32 = 0;

        result = set_bits(
            result,
            (self.curve_tolerance * 10.0) as u16,
            NEST_OFFSETS[0],
            NEST_BITS[0],
        );
        result = set_bits(result, self.spacing as u16, NEST_OFFSETS[1], NEST_BITS[1]);
        result = set_bits(result, self.rotations as u16, NEST_OFFSETS[2], NEST_BITS[2]);
        result = set_bits(
            result,
            self.population_size as u16,
            NEST_OFFSETS[3],
            NEST_BITS[3],
        );
        result = set_bits(
            result,
            self.mutation_rate as u16,
            NEST_OFFSETS[4],
            NEST_BITS[4],
        );
        result = set_bits(result, self.use_holes as u16, NEST_OFFSETS[5], NEST_BITS[5]);

        return result;
    }
}
