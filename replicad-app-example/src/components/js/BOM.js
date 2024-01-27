/**
 * This class defines a BOMEntry object which is used to define one entry in a bill of materials.
 */
export class BOMEntry {
  /**
   * The constructor returns a new blank BOMEntry object.
   */
  constructor() {
    /**
     * The name of the item.
     * @type {string}
     */
    this.BOMitemName = "name";
    /**
     * The number of this item needed.
     * @type {number}
     */
    this.numberNeeded = 1;
    /**
     * The cost of one of this item in USD.
     * @type {number}
     */
    this.costUSD = 0;
    /**
     * A link to where to purchase the item.
     * @type {string}
     */
    this.source = "www.example.com";

    /**
   
     * This atom's height as drawn on the screen
     */
    this.height;
  }
}

/**
 * Takes a link and converts it to be an affiliate link if it should be.
 * @param {string} link - The link to check.
 */
export const convertLinks = function (link) {
  if (link.toLowerCase().includes("amazon")) {
    return "[Amazon](" + link + "?tag=maslowcnc01-20)";
  }
  return link;
};
