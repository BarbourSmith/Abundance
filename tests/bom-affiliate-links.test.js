import { describe, it, expect } from "vitest";
import {
  AFFILIATE_DISCLOSURE,
  affiliateUrl,
  convertLinks,
} from "../src/js/BOM.js";
// Load order matters: attachmentpoint first, or molecule.js hits a circular import.
import "../src/prototypes/attachmentpoint.js";
import Molecule from "../src/molecules/molecule.js";
import GlobalVariables from "../src/js/globalvariables.js";

describe("convertLinks", () => {
  it("adds the affiliate tag to a plain Amazon link", () => {
    expect(convertLinks("https://www.amazon.com/dp/B07XYZ1234")).toBe(
      "[Amazon](https://www.amazon.com/dp/B07XYZ1234?tag=maslowcnc01-20)",
    );
  });

  it("appends with & when the link already has a query string", () => {
    expect(convertLinks("https://www.amazon.com/dp/B07XYZ1234?th=1")).toBe(
      "[Amazon](https://www.amazon.com/dp/B07XYZ1234?th=1&tag=maslowcnc01-20)",
    );
  });

  it("keeps a fragment after the query string", () => {
    expect(convertLinks("https://www.amazon.com/dp/B07XYZ1234#reviews")).toBe(
      "[Amazon](https://www.amazon.com/dp/B07XYZ1234?tag=maslowcnc01-20#reviews)",
    );
  });

  it("handles links without a protocol", () => {
    expect(convertLinks("amazon.com/dp/B07XYZ1234")).toBe(
      "[Amazon](https://amazon.com/dp/B07XYZ1234?tag=maslowcnc01-20)",
    );
  });

  it("tags other Amazon storefronts", () => {
    expect(convertLinks("https://www.amazon.co.uk/dp/B07XYZ1234")).toBe(
      "[Amazon](https://www.amazon.co.uk/dp/B07XYZ1234?tag=maslowcnc01-20)",
    );
    expect(convertLinks("https://smile.amazon.de/dp/B07XYZ1234")).toBe(
      "[Amazon](https://smile.amazon.de/dp/B07XYZ1234?tag=maslowcnc01-20)",
    );
  });

  it("leaves an existing tag alone", () => {
    expect(
      convertLinks("https://www.amazon.com/dp/B07XYZ1234?tag=other-20"),
    ).toBe("[Amazon](https://www.amazon.com/dp/B07XYZ1234?tag=other-20)");
  });

  it("does not tag hosts that only contain 'amazon'", () => {
    for (const link of [
      "https://my-bucket.s3.amazonaws.com/part.pdf",
      "https://www.mcmaster.com/amazon-style-bolt",
      "https://notamazon.com/dp/B07XYZ1234",
    ]) {
      expect(convertLinks(link)).toBe(link);
    }
  });

  it("returns non-links unchanged", () => {
    expect(convertLinks("www.example.com")).toBe("www.example.com");
    expect(convertLinks("")).toBe("");
    expect(convertLinks(undefined)).toBe(undefined);
  });
});

describe("affiliateUrl", () => {
  it("returns the tagged URL for Amazon links", () => {
    expect(affiliateUrl("www.amazon.com/dp/B07XYZ1234?th=1")).toBe(
      "https://www.amazon.com/dp/B07XYZ1234?th=1&tag=maslowcnc01-20",
    );
  });

  it("returns null for other links", () => {
    expect(affiliateUrl("https://www.mcmaster.com/91251A540")).toBeNull();
    expect(affiliateUrl("")).toBeNull();
    expect(affiliateUrl(undefined)).toBeNull();
  });
});

describe("BOM side panel source links", () => {
  const sourceLinks = (compiledBom) => {
    const params = Molecule.prototype.createBom.call({ compiledBom }, () => {});
    return Object.fromEntries(
      compiledBom.map((item) => [
        item.BOMitemName,
        params[item.BOMitemName].sourceLink,
      ]),
    );
  };

  it("tags Amazon links and leaves others as they were", () => {
    expect(
      sourceLinks([
        { BOMitemName: "Motor", numberNeeded: 1, source: "amazon.com/dp/B1" },
        { BOMitemName: "Bolt", numberNeeded: 4, source: "mcmaster.com/9125" },
        { BOMitemName: "Washer", numberNeeded: 4, source: "  " },
      ]),
    ).toEqual({
      Motor: "https://amazon.com/dp/B1?tag=maslowcnc01-20",
      Bolt: "https://mcmaster.com/9125",
      Washer: undefined,
    });
  });
});

describe("affiliate disclosure", () => {
  const amazonItem = {
    BOMitemName: "Motor",
    numberNeeded: 1,
    costUSD: 20,
    source: "amazon.com/dp/B1",
  };
  const otherItem = {
    BOMitemName: "Bolt",
    numberNeeded: 4,
    costUSD: 1,
    source: "mcmaster.com/9125",
  };

  const panelNote = (compiledBom) =>
    Molecule.prototype.createBom.call({ compiledBom }, () => {})[
      "Affiliate Disclosure"
    ];

  const bomFile = (compiledBom) => {
    // Set the backing field: the setter disables the old molecule.
    const previous = GlobalVariables._topLevelMolecule;
    GlobalVariables._topLevelMolecule = { compiledBom };
    try {
      return Molecule.prototype.formatBom.call({});
    } finally {
      GlobalVariables._topLevelMolecule = previous;
    }
  };

  it("appears in the side panel and BOM file when a link is tagged", () => {
    expect(panelNote([amazonItem, otherItem])).toEqual({
      type: "note",
      value: AFFILIATE_DISCLOSURE,
    });
    expect(bomFile([amazonItem, otherItem])).toMatch(
      new RegExp(
        "\\|\\n\\n_" + AFFILIATE_DISCLOSURE.replace(/\./g, "\\.") + "_$",
      ),
    );
  });

  it("is left out when no link is tagged", () => {
    expect(panelNote([otherItem])).toBeUndefined();
    expect(bomFile([otherItem])).not.toContain(AFFILIATE_DISCLOSURE);
  });
});
