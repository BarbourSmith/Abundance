import { describe, expect, it, vi } from "vitest";
import { hasProjectChanges, loadSavedBom } from "../src/js/projectSaveBaseline.js";
import { fetchGitHubFileContent } from "../src/js/githubFileUtils.js";

vi.mock("../src/js/githubFileUtils.js", () => ({
  fetchGitHubFileContent: vi.fn(),
}));

describe("saved BOM baseline", () => {
  const projectKey = "owner/project";
  const json = '{"unchanged":true}';
  const octokitFor = (getContent) => ({
    rest: { repos: { getContent } },
  });

  it("loads and decodes the remote BOM using the authenticated file helper", async () => {
    const data = { path: "BillOfMaterials.md", content: "encoded" };
    const getContent = vi.fn().mockResolvedValue({ data });
    const octokit = octokitFor(getContent);
    vi.mocked(fetchGitHubFileContent).mockResolvedValueOnce("saved BOM");

    expect(await loadSavedBom(octokit, "owner", "project")).toBe("saved BOM");
    expect(getContent).toHaveBeenCalledWith({
      owner: "owner",
      repo: "project",
      path: "BillOfMaterials.md",
    });
    expect(fetchGitHubFileContent).toHaveBeenCalledWith(data, { octokit });
  });

  it("records a missing BOM as null", async () => {
    const getContent = vi.fn().mockRejectedValue({ status: 404 });
    expect(await loadSavedBom(octokitFor(getContent), "owner", "project")).toBeNull();
  });

  it.each([401, 403, 500, undefined])(
    "propagates a BOM request failure with status %s",
    async (status) => {
      const error = Object.assign(new Error("BOM request failed"), { status });
      const getContent = vi.fn().mockRejectedValue(error);
      await expect(
        loadSavedBom(octokitFor(getContent), "owner", "project"),
      ).rejects.toBe(error);
    },
  );

  it("does not treat a failure decoding the file as a missing BOM", async () => {
    const error = Object.assign(new Error("Raw fetch failed"), { status: 404 });
    vi.mocked(fetchGitHubFileContent).mockRejectedValueOnce(error);
    const getContent = vi.fn().mockResolvedValue({ data: {} });
    await expect(
      loadSavedBom(octokitFor(getContent), "owner", "project"),
    ).rejects.toBe(error);
  });

  it("skips unchanged JSON before and after a matching BOM compiles", () => {
    const baseline = { projectKey, json, bom: "saved BOM" };
    expect(hasProjectChanges(baseline, projectKey, json, null)).toBe(false);
    expect(hasProjectChanges(baseline, projectKey, json, "saved BOM")).toBe(false);
    expect(hasProjectChanges(baseline, projectKey, json, "changed BOM")).toBe(true);
  });

  it("saves a missing BOM once it compiles, then skips after a successful save", () => {
    const baseline = { projectKey, json, bom: null };
    expect(hasProjectChanges(baseline, projectKey, json, null)).toBe(false);
    expect(hasProjectChanges(baseline, projectKey, json, "generated BOM")).toBe(true);
    const saved = { ...baseline, bom: "generated BOM" };
    expect(hasProjectChanges(saved, projectKey, json, "generated BOM")).toBe(false);
  });

  it("keeps unknown BOMs, recovered work, JSON edits and other projects saveable", () => {
    expect(hasProjectChanges({ projectKey, json }, projectKey, json, "")).toBe(true);
    expect(hasProjectChanges(null, projectKey, json, null)).toBe(true);
    const baseline = { projectKey, json, bom: "" };
    expect(hasProjectChanges(baseline, projectKey, "edited", "")).toBe(true);
    expect(hasProjectChanges(baseline, "owner/other", json, "")).toBe(true);
    expect(hasProjectChanges(baseline, projectKey, json, "")).toBe(false);
  });
});
