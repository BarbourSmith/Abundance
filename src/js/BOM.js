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

/**
 * Shown with a bill of materials whenever one of its links carries our tag.
 */
export const AFFILIATE_DISCLOSURE =
  "Amazon links in this list are affiliate links to fund development";

// Amazon storefronts: amazon.com, www.amazon.co.uk, smile.amazon.de, ...
// Not amazonaws.com or other hosts that only contain "amazon".
const AMAZON_STORE_HOST = /(^|\.)amazon(\.[a-z]{2,3}){1,2}$/;

/**
 * Returns the link with our affiliate tag added if it points at an Amazon
 * store (unless it already carries a tag), or null if it doesn't.
 * @param {string} link - The link to check.
 */
export const affiliateUrl = function (link) {
  if (typeof link !== "string") {
    return null;
  }
  const trimmed = link.trim();
  let url;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed,
    );
  } catch {
    return null;
  }
  if (!AMAZON_STORE_HOST.test(url.hostname)) {
    return null;
  }
  if (!url.searchParams.has("tag")) {
    url.searchParams.set("tag", AMAZON_AFFILIATE_TAG);
  }
  return url.href;
};

/**
 * Takes a link and converts it to be an affiliate link if it should be.
 * Amazon store links are returned as a tagged markdown link; anything else
 * is returned unchanged.
 * @param {string} link - The link to check.
 */
export const convertLinks = function (link) {
  const tagged = affiliateUrl(link);
  return tagged ? "[Amazon](" + tagged + ")" : link;
};
