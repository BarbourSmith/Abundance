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
    this.BOMitemName = "New Item";
    /**
     * The number of this item needed.
     * @type {number}
     */
    this.numberNeeded = 1;
    /**
     * The cost of one of this item in USD.
     * @type {number}
     */
    this.costUSD = 0.0;
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

const AMAZON_AFFILIATE_TAG = "maslowcnc01-20";

// Amazon storefronts: amazon.com, www.amazon.co.uk, smile.amazon.de, ...
// Not amazonaws.com or other hosts that only contain "amazon".
const AMAZON_STORE_HOST = /(^|\.)amazon(\.[a-z]{2,3}){1,2}$/;

/**
 * Takes a link and converts it to be an affiliate link if it should be.
 * Amazon store links get our tag (unless they already carry one) and are
 * returned as a markdown link; anything else is returned unchanged.
 * @param {string} link - The link to check.
 */
export const convertLinks = function (link) {
  if (typeof link !== "string") {
    return link;
  }
  const trimmed = link.trim();
  let url;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed,
    );
  } catch {
    return link;
  }
  if (!AMAZON_STORE_HOST.test(url.hostname)) {
    return link;
  }
  if (!url.searchParams.has("tag")) {
    url.searchParams.set("tag", AMAZON_AFFILIATE_TAG);
  }
  return "[Amazon](" + url.href + ")";
};
