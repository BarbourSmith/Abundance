use crate::geometry::point::Point;
use crate::utils::number::Number;

/// A rectangular bounding box with position and size.
///
/// This struct represents a 2D axis-aligned bounding rectangle defined by
/// its position (top-left corner) and size (width and height).
pub struct BoundRect<T: Number> {
    /// The position of the top-left corner
    position: Point<T>,
    /// The size (width and height) of the rectangle
    size: Point<T>,
}

impl<T: Number> BoundRect<T> {
    /// Creates a new bounding rectangle.
    ///
    /// # Arguments
    /// * `x` - X-coordinate of the top-left corner
    /// * `y` - Y-coordinate of the top-left corner
    /// * `width` - Width of the rectangle
    /// * `height` - Height of the rectangle
    ///
    /// # Returns
    /// A new BoundRect instance
    pub fn new(x: T, y: T, width: T, height: T) -> Self {
        let position = Point::new(Some(x), Some(y));
        let size = Point::new(Some(width), Some(height));

        Self { position, size }
    }

    /// Creates a bounding rectangle from an array of values.
    ///
    /// # Arguments
    /// * `arr` - Array containing [x, y, width, height] values
    ///
    /// # Returns
    /// A new BoundRect instance, or zero-sized rectangle if array is too small
    pub fn from_array(arr: &[T]) -> Self {
        if arr.len() < 4 {
            return Self::new(T::zero(), T::zero(), T::zero(), T::zero());
        }
        Self::new(arr[0], arr[1], arr[2], arr[3])
    }

    pub unsafe fn update(&mut self, position: *const Point<T>, size: *const Point<T>) {
        self.position.update(position);
        self.size.update(size);
    }

    pub fn position(&self) -> *const Point<T> {
        &self.position as *const Point<T>
    }

    pub fn size(&self) -> *const Point<T> {
        &self.size as *const Point<T>
    }

    /// Gets the x-coordinate of the rectangle's position.
    ///
    /// # Returns
    /// The x-coordinate
    /// # Safety
    /// This method is unsafe because it directly accesses Point fields
    pub unsafe fn x(&self) -> T {
        self.position.x
    }

    /// Gets the y-coordinate of the rectangle's position.
    ///
    /// # Returns
    /// The y-coordinate
    /// # Safety
    /// This method is unsafe because it directly accesses Point fields
    pub unsafe fn y(&self) -> T {
        self.position.y
    }

    /// Gets the width of the rectangle.
    ///
    /// # Returns
    /// The width
    /// # Safety
    /// This method is unsafe because it directly accesses Point fields
    pub unsafe fn width(&self) -> T {
        self.size.x
    }

    /// Gets the height of the rectangle.
    ///
    /// # Returns
    /// The height
    /// # Safety
    /// This method is unsafe because it directly accesses Point fields
    pub unsafe fn height(&self) -> T {
        self.size.y
    }

    pub unsafe fn clean(&mut self) {
        self.position.set(T::zero(), T::zero());
        self.size.set(T::zero(), T::zero());
    }

    // Якщо треба clone (глибоке копіювання)
    pub unsafe fn clone(&self) -> Self {
        Self::new(self.x(), self.y(), self.width(), self.height())
    }
}
