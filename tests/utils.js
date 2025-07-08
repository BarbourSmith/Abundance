
/**
 * Returns true iff this shape is an assembly. Returns false if it's
 * a simple sketch or solid. Throws an error if the shape is not a valid
 * library object.
 */
function isAssembly(part) {
  if (part == undefined || part.geometry == undefined) {
    throw new Error('Invalid part object');
  }
  if (part.geometry.length > 0) {
    if (part.geometry[0].geometry) {
      return true;
    } else {
      return false;
    }
  } else {
    throw new Error("Part has no geometry");
  }
}


module.exports = {
  isAssembly,
};
