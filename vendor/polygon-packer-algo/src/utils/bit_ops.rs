use crate::constants::{UINT16_BIT_COUNT, MAX_U32_BITS};

#[inline(always)]
fn get_mask(bit_count: u8, offset: u8) -> u32 {
    ((1u32 << bit_count) - 1) << offset
}

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
#[inline(always)]
pub fn set_bits(source: u32, value: u16, index: u8, bit_count: u8) -> u32 {
    let mask = get_mask(bit_count, index);
    (source & !mask) | (((value as u32) << index) & mask)
}

/// Gets bits from a u32 value at a specified position.
///
/// # Arguments
/// * `source` - The u32 value to extract from
/// * `index` - The bit position to start extracting
/// * `num_bits` - Number of bits to extract
///
/// # Returns
/// The extracted bits as u16
#[inline(always)]
pub fn get_bits(source: u32, index: u8, num_bits: u8) -> u16 {
    ((source >> index) & get_mask(num_bits, 0)) as u16
}

/// Gets a u16 value from a u32 at a specified bit position.
///
/// # Arguments
/// * `source` - The u32 value to extract from
/// * `index` - The bit position (must be multiple of 16)
///
/// # Returns
/// The extracted u16 value
#[inline(always)]
pub fn get_u16(source: u32, index: u8) -> u16 {
    get_bits(source, index * UINT16_BIT_COUNT, UINT16_BIT_COUNT)
}

/// Joins two u16 values into a single u32.
///
/// # Arguments
/// * `value1` - First u16 value (lower 16 bits)
/// * `value2` - Second u16 value (upper 16 bits)
///
/// # Returns
/// A u32 containing both values
#[inline(always)]
pub fn join_u16(value1: u16, value2: u16) -> u32 {
    (value1 as u32) | ((value2 as u32) << UINT16_BIT_COUNT)
}

/// Finds the highest set bit index in a u32 mask.
///
/// # Arguments
/// * `mask` - The u32 value to check
///
/// # Returns
/// The index of the highest set bit (0-31)
#[inline(always)]
pub fn highest_bit_index(mask: u32) -> u8 {
    debug_assert!(mask != 0, "highest_bit_index called with 0");
    MAX_U32_BITS - (mask.leading_zeros() as u8)
}
