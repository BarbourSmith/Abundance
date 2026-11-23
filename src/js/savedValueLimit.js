/**
 * The longest text value an atom saves into project.abundance.
 *
 * The limit stops runaway data (stringified geometry or objects) from being
 * written into the project file. Real values, such as point lists or SVG paths
 * passed to a Code atom, are far shorter, so they are always saved.
 */
export const MAX_SAVED_VALUE_LENGTH = 1_000_000;

// Values left out of the project file by the most recent serialize, so the
// save can tell the user instead of only logging to the console.
let droppedValues = [];

/**
 * Record a value that was too large to save.
 * @param {string} atomName - Name of the atom holding the value
 * @param {string} key - Input or field name
 * @param {number} length - Size of the value in characters
 */
export function noteDroppedValue(atomName, key, length) {
  console.warn(
    `Not saving ${atomName}.${key}: ${length} characters is over the ${MAX_SAVED_VALUE_LENGTH} limit`,
  );
  droppedValues.push({ atomName, key, length });
}

/**
 * Return the values dropped since the last call and start a new list.
 * @returns {{atomName: string, key: string, length: number}[]}
 */
export function takeDroppedValues() {
  const taken = droppedValues;
  droppedValues = [];
  return taken;
}
