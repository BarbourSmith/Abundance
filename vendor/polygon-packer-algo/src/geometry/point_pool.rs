use crate::constants::POOL_SIZE;
use crate::geometry::point::Point;
use crate::utils::bit_ops::highest_bit_index;
use crate::utils::number::Number;

/// A memory pool for managing Point objects efficiently.
///
/// This struct provides a pre-allocated pool of Point objects to avoid
/// frequent allocations and deallocations during polygon processing.
pub struct PointPool<T: Number> {
    /// Array of point objects in the pool
    items: Box<[Point<T>]>,
    /// Bitmask indicating which items are currently in use
    used: u32,
}

impl<T: Number> PointPool<T> {
    /// Creates a new PointPool with pre-allocated points.
    ///
    /// # Returns
    /// A new PointPool instance
    pub fn new() -> Self {
        let mut items_vec = Vec::with_capacity(POOL_SIZE);

        for _i in 0..POOL_SIZE {
            items_vec.push(Point::<T>::new(None, None));
        }

        let items = items_vec.into_boxed_slice();
        Self { items, used: 0 }
    }

    /// Allocates a point from the pool.
    ///
    /// # Arguments
    /// * `count` - Number of points to allocate (must be power of 2)
    ///
    /// # Returns
    /// A bitmask representing the allocated points
    pub fn alloc(&mut self, count: usize) -> u32 {
        let mut result = 0u32;
        let mut current_count = 0;
        let mut free_bits = !self.used;

        while free_bits != 0 {
            let bit = highest_bit_index(free_bits);
            let mask = 1 << bit;
            result |= mask;
            free_bits &= !mask;
            current_count += 1;

            if current_count == count {
                self.used |= result;
                return result;
            }
        }

        panic!("PointPool: out of space");
    }

    pub fn malloc(&mut self, mask: u32) {
        self.used &= !mask;
    }

    pub fn get(&mut self, mask: u32, index: u8) -> *mut Point<T> {
        let mut current_index = 0;
        let mut bit_mask = mask;

        while bit_mask != 0 {
            let bit = highest_bit_index(bit_mask);
            let flag = 1 << bit;
            if current_index == index {
                return &mut self.items[bit as usize] as *mut Point<T>;
            }
            bit_mask &= !flag;
            current_index += 1;
        }

        panic!("PointPool::get: index out of bounds");
    }
}
