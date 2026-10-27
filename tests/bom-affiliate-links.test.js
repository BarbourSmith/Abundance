import { describe, it, expect } from "vitest";
import { convertLinks } from "../src/js/BOM.js";

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
