/**
 * Lists of numbers wired into number inputs.
 *
 * An atom that supports it computes once for every combination of the values
 * in its listed inputs, as if each combination had been typed in by hand. Two
 * lists give a grid of results and three a 3D grid. The first listed input
 * changes slowest, so x = [1, 2] and y = [5, 6] run (1, 5), (1, 6), (2, 5),
 * (2, 6).
 */

/**
 * The numbers in a list wired into the input `name`, or an error saying why
 * it can't be used.
 * @param {string} name
 * @param {Array} list
 * @returns {number[]}
 */
export function numbersIn(name, list) {
  if (list.length === 0) {
    throw new Error(`"${name}" is an empty list, so there is nothing to make.`);
  }
  return list.map((item) => {
    const number =
      typeof item === "string" && item.trim() === "" ? NaN : Number(item);
    if (!Number.isFinite(number)) {
      throw new Error(
        `"${name}" is a list holding ${JSON.stringify(item)}, which isn't a number.`,
      );
    }
    return number;
  });
}

/**
 * Every combination of one value from each list.
 * @param {Array<[string, number[]]>} lists name and values of each list
 * @returns {Array<Object<string, number>>} one {name: value} per combination
 */
export function combinationsOf(lists) {
  return lists.reduce(
    (combinations, [name, values]) =>
      combinations.flatMap((combination) =>
        values.map((value) => ({ ...combination, [name]: value })),
      ),
    [{}],
  );
}
