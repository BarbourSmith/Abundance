import { importingSVG } from "../src/worker/worker.ts";
import { init } from "../src/worker/util.ts";

// A single-path SVG of the kind exported by cutline tools
const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><path d="M 10 10 L 90 10 L 90 40 L 10 40 Z" fill="#1a7a3a"/></svg>`;

describe("importingSVG", () => {
  beforeAll(async () => {
    await init();
  });

  it("imports an SVG passed as a string", async () => {
    const result = await importingSVG(SVG_CONTENT, { project: "test" }, 100);

    expect(result.geometryType).toEqual("2D");
    expect(result.geometry).toBeTruthy();
  });

  // A fresh upload hands the File straight to the worker rather than reading
  // it into a string first, which used to blow up inside the SVG parser.
  it("imports an SVG passed as a File", async () => {
    const file = new File([SVG_CONTENT], "cutline.svg", {
      type: "image/svg+xml",
    });

    const result = await importingSVG(file, { project: "test" }, 100);

    expect(result.geometryType).toEqual("2D");
    expect(result.geometry).toBeTruthy();
  });
});
