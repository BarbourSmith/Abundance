use crate::clipper_wrapper;
use crate::{
    genetic_algorithm::GeneticAlgorithm,
    geometry::bound_rect::BoundRect,
    nest_config::NestConfig,
    nesting::{
        nfp_store::NFPStore,
        polygon_node::{PolygonNode, SourceItem},
    },
    utils::{bit_ops::get_u16, number::Number},
};
use std::cell::RefCell;

/// WebAssembly interface for the polygon packing algorithm.
///
/// This struct provides the main interface for running the polygon nesting
/// algorithm from JavaScript/WebAssembly. It manages the complete packing
/// workflow including initialization, pair generation, NFP calculation,
/// and final placement optimization.
pub struct WasmPacker {
    /// The bin/container polygon node
    bin_node: Option<PolygonNode>,
    /// Area of the bin
    bin_area: f32,
    /// Bounding rectangle of the bin
    bin_bounds: Option<BoundRect<f32>>,
    /// Bounding rectangle of the result
    result_bounds: Option<BoundRect<f32>>,
    /// Best placement solution found
    best: Option<Vec<f32>>,
    /// List of polygon nodes to place
    nodes: Vec<PolygonNode>,
    /// Configuration parameters
    config: NestConfig,
}

// Singleton instance using thread_local
thread_local! {
    static INSTANCE: RefCell<WasmPacker> = RefCell::new(WasmPacker::new());
}

impl WasmPacker {
    fn new() -> Self {
        WasmPacker {
            bin_node: None,
            bin_area: 0.0,
            bin_bounds: None,
            result_bounds: None,
            best: None,
            nodes: Vec::new(),
            config: NestConfig::new(),
        }
    }

    /// Access the singleton instance
    pub fn with_instance<F, R>(f: F) -> R
    where
        F: FnOnce(&mut WasmPacker) -> R,
    {
        INSTANCE.with(|instance| f(&mut instance.borrow_mut()))
    }

    /// Initializes the packer with configuration and polygon data.
    ///
    /// # Arguments
    /// * `configuration` - Configuration bit flags
    /// * `polygon_data` - Vector of polygon data chunks (size-prefixed f32 arrays)
    pub fn init(&mut self, configuration: u32, mut polygon_data: Vec<Vec<f32>>) {
        // `polygon_data` is expected as a Vec of polygons, where the last polygon
        // is the bin. Take the last element as the bin polygon and treat the
        // remaining polygons as the parts to place.
        if polygon_data.is_empty() {
            panic!("No polygon data provided to WasmPacker::init");
        }

        // Last polygon is the bin
        let bin_polygon = polygon_data.pop().expect("Missing bin polygon");

        // Deserialize config
        self.config.deserialize(configuration);

        // Generate bounds for bin (inline clipper call directly)
        let result = clipper_wrapper::generate_bounds(
            &bin_polygon,
            self.config.spacing as i32,
            self.config.curve_tolerance as f64,
        );

        match result {
            Some((bounds, result_bounds, area, node)) => {
                self.bin_node = Some(node);
                self.bin_bounds = Some(bounds);
                self.result_bounds = Some(result_bounds);
                self.bin_area = area as f32;
            }
            None => panic!("Failed to generate bounds"),
        }

        // Generate tree for other polygons (inline previous helper)
        // `polygon_data` now contains all polygons except the bin. Build the
        // sizes vector (point counts) and a flattened values array expected by
        // the clipper tree generator.
        let mut total_length = 0usize;
        let mut sizes_vec: Vec<u16> = Vec::new();

        for polygon in &polygon_data {
            sizes_vec.push((polygon.len() >> 1) as u16); // Point count
            total_length += polygon.len();
        }

        let mut values = vec![0f32; total_length];
        let mut offset2 = 0;

        for polygon in &polygon_data {
            values[offset2..offset2 + polygon.len()].copy_from_slice(polygon);
            offset2 += polygon.len();
        }

        self.nodes = clipper_wrapper::generate_tree(
            &values,
            &sizes_vec,
            self.config.spacing as i32,
            self.config.curve_tolerance as f64,
        );

        // Initialize genetic algorithm
        GeneticAlgorithm::with_instance(|ga| {
            ga.init(
                &self.nodes,
                self.result_bounds.as_ref().unwrap(),
                &self.config,
            );
        });
    }

    pub fn get_pairs(&mut self) -> Vec<Vec<f32>> {
        let individual = GeneticAlgorithm::with_instance(|ga| ga.get_individual(&self.nodes))
            .expect("Failed to get individual");

        // Update node rotations from individual
        for i in 0..individual.placement().len() {
            let node_index = individual.placement()[i] as usize;
            self.nodes[node_index].rotation = individual.rotation()[i] as f32;
        }

        NFPStore::with_instance(|nfp_store| {
            nfp_store.init(
                &self.nodes,
                self.bin_node.as_ref().unwrap(),
                &self.config,
                individual.source(),
                individual.placement(),
                individual.rotation(),
            );
        });

        let pairs = NFPStore::with_instance(|nfp_store| nfp_store.nfp_pairs().to_vec());

        pairs
    }

    pub fn get_placement_data(&mut self, generated_nfp: Vec<Vec<f32>>) -> Vec<f32> {
        NFPStore::with_instance(|nfp_store| {
            nfp_store.update(generated_nfp);
            nfp_store.get_placement_data(&self.nodes, self.bin_area)
        })
    }

    pub fn get_placement_result(&mut self, placements: Vec<Vec<f32>>) -> Vec<u8> {
        if placements.is_empty() {
            return Vec::new();
        }

        // Use first placement as initial best
        let mut placements_data = placements[0].clone();

        let phenotype_source = NFPStore::with_instance(|nfp_store| nfp_store.phenotype_source());
        GeneticAlgorithm::with_instance(|ga| {
            ga.update_fitness(phenotype_source, placements_data[0]);
        });

        // Find best placement
        for i in 1..placements.len() {
            if placements[i][0] < placements_data[0] {
                placements_data = placements[i].clone();
            }
        }

        let mut num_parts: u16 = 0;
        let mut num_placed_parts: u16 = 0;
        let mut place_percentage: f32 = 0.0;
        let mut has_result = false;

        if self.best.is_none() || placements_data[0] < self.best.as_ref().unwrap()[0] {
            self.best = Some(placements_data.clone());

            let bin_area = self.bin_area.abs();
            let placement_count = placements_data[1] as usize;
            let mut placed_count: u16 = 0;
            let mut placed_area: f32 = 0.0;
            let mut total_area: f32 = 0.0;

            for i in 0..placement_count {
                total_area += bin_area;
                let item_data = Self::read_uint32_from_f32(&placements_data, 2 + i);
                let offset = get_u16(item_data, 1) as usize;
                let size = get_u16(item_data, 0);
                placed_count += size;

                for j in 0..size as usize {
                    let path_data = Self::read_uint32_from_f32(&placements_data, offset + j);
                    let path_id = get_u16(path_data, 1) as usize;
                    placed_area += f32::abs_polygon_area(&self.nodes[path_id].mem_seg) as f32;
                }
            }

            num_parts = NFPStore::with_instance(|nfp_store| nfp_store.placement_count()) as u16;
            num_placed_parts = placed_count;
            place_percentage = placed_area / total_area;
            has_result = true;
        }

        // Serialize result
        Self::serialize_placement_result(
            place_percentage,
            num_placed_parts,
            num_parts,
            self.config.rotations,
            has_result,
            self.bin_bounds.as_ref().unwrap(),
            if has_result {
                PolygonNode::convert_to_source_items(&self.nodes)
            } else {
                Vec::new()
            },
            if has_result { &placements_data } else { &[] },
        )
    }

    pub fn stop(&mut self) {
        self.nodes.clear();
        self.best = None;
        self.bin_node = None;
        GeneticAlgorithm::with_instance(|ga| {
            ga.clean();
        });
        NFPStore::with_instance(|nfp_store| {
            nfp_store.clean();
        });
    }

    fn read_uint32_from_f32(data: &[f32], index: usize) -> u32 {
        data[index].to_bits()
    }

    // generate_bounds_internal removed — call clipper_wrapper::generate_bounds directly.

    // generate_tree_internal removed — call clipper_wrapper::generate_tree directly.

    fn calculate_source_items_size(items: &[SourceItem]) -> usize {
        items.iter().fold(0, |total, item| {
            // Each item: u16 (source) + u16 (children count) = 4 bytes
            let item_size = 4;
            total + item_size + Self::calculate_source_items_size(&item.children)
        })
    }

    fn serialize_source_items_internal(
        items: &[SourceItem],
        buffer: &mut [u8],
        offset: usize,
    ) -> usize {
        let mut current_offset = offset;

        for item in items {
            // Write source (u16)
            buffer[current_offset..current_offset + 2].copy_from_slice(&item.source.to_le_bytes());
            current_offset += 2;

            // Write children count (u16)
            buffer[current_offset..current_offset + 2]
                .copy_from_slice(&(item.children.len() as u16).to_le_bytes());
            current_offset += 2;

            // Recursively serialize children
            current_offset =
                Self::serialize_source_items_internal(&item.children, buffer, current_offset);
        }

        current_offset
    }

    fn serialize_source_items(items: &[SourceItem]) -> Vec<u8> {
        let items_size = Self::calculate_source_items_size(items);
        let total_size = 2 + items_size; // u16 count + items data

        let mut buffer = vec![0u8; total_size];

        // Write items count
        buffer[0..2].copy_from_slice(&(items.len() as u16).to_le_bytes());

        // Serialize items
        Self::serialize_source_items_internal(items, &mut buffer, 2);

        buffer
    }

    fn serialize_placement_result(
        place_percentage: f32,
        num_placed_parts: u16,
        num_parts: u16,
        angle_split: u8,
        has_result: bool,
        bounds: &BoundRect<f32>,
        sources: Vec<SourceItem>,
        placements_data: &[f32],
    ) -> Vec<u8> {
        let serialized_sources = Self::serialize_source_items(&sources);
        let sources_size = serialized_sources.len();
        let placements_data_size = placements_data.len() * 4;

        // Header: 34 bytes
        // placePercentage (4) + numPlacedParts (2) + numParts (2) + angleSplit (1) + hasResult (1)
        // + boundsX (4) + boundsY (4) + boundsWidth (4) + boundsHeight (4)
        // + sourcesSize (4) + placementsDataSize (4)
        let header_size = 34;
        let total_size = header_size + sources_size + placements_data_size;

        let mut buffer = vec![0u8; total_size];
        let mut offset = 0;

        // Write header
        buffer[offset..offset + 4].copy_from_slice(&place_percentage.to_le_bytes());
        offset += 4;

        buffer[offset..offset + 2].copy_from_slice(&num_placed_parts.to_le_bytes());
        offset += 2;

        buffer[offset..offset + 2].copy_from_slice(&num_parts.to_le_bytes());
        offset += 2;

        buffer[offset] = angle_split;
        offset += 1;

        buffer[offset] = if has_result { 1 } else { 0 };
        offset += 1;

        unsafe {
            buffer[offset..offset + 4].copy_from_slice(&bounds.x().to_le_bytes());
            offset += 4;

            buffer[offset..offset + 4].copy_from_slice(&bounds.y().to_le_bytes());
            offset += 4;

            buffer[offset..offset + 4].copy_from_slice(&bounds.width().to_le_bytes());
            offset += 4;

            buffer[offset..offset + 4].copy_from_slice(&bounds.height().to_le_bytes());
            offset += 4;
        }

        buffer[offset..offset + 4].copy_from_slice(&(sources_size as u32).to_le_bytes());
        offset += 4;

        buffer[offset..offset + 4].copy_from_slice(&(placements_data_size as u32).to_le_bytes());
        offset += 4;

        // Write serialized sources
        buffer[offset..offset + sources_size].copy_from_slice(&serialized_sources);
        offset += sources_size;

        // Write placements data
        unsafe {
            std::ptr::copy_nonoverlapping(
                placements_data.as_ptr() as *const u8,
                buffer[offset..].as_mut_ptr(),
                placements_data_size,
            );
        }

        buffer
    }
}

// `SourceItem` is provided by `nesting::polygon_node::SourceItem` now.
