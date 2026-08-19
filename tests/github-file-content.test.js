/**
 * Tests for fetchGitHubFileContent, which resolves file bodies from GitHub
 * contents API responses.  Files over ~1 MB come back with an empty `content`
 * field and must be re-requested; doing that through `download_url` fails for
 * private repositories once the token baked into that URL expires, so the
 * authenticated API is used whenever an Octokit instance is available.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// globalvariables.js drags in the whole geometry stack, which isn't needed
// here -- only its UTF-8 helper is.  Mocking it keeps this suite fast.
vi.mock("../src/js/globalvariables.js", () => ({
  default: {
    fromBinaryStr: (binaryStr) => decodeURIComponent(escape(binaryStr)),
  },
}));

import { fetchGitHubFileContent } from "../src/js/githubFileUtils.js";

const projectJson = JSON.stringify({ filetypeVersion: 1, name: "test" });

const largeFileResponse = {
  path: "project.abundance",
  encoding: "base64",
  content: "",
  url: "https://api.github.com/repos/o/r/contents/project.abundance?ref=main",
  download_url:
    "https://raw.githubusercontent.com/o/r/main/project.abundance?token=abc",
};

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("fetchGitHubFileContent", () => {
  it("decodes inlined base64 content without any extra request", async () => {
    const content = await fetchGitHubFileContent({
      path: "project.abundance",
      encoding: "base64",
      content: btoa(projectJson),
    });

    expect(content).toBe(projectJson);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches large files through the authenticated API, not download_url", async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: projectJson }),
    };

    const content = await fetchGitHubFileContent(largeFileResponse, {
      octokit,
    });

    expect(content).toBe(projectJson);
    expect(octokit.request).toHaveBeenCalledWith(
      `GET ${largeFileResponse.url}`,
      {
        mediaType: { format: "raw" },
      },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("re-stringifies a body octokit parsed as JSON", async () => {
    const parsed = JSON.parse(projectJson);
    const octokit = { request: vi.fn().mockResolvedValue({ data: parsed }) };

    const content = await fetchGitHubFileContent(largeFileResponse, {
      octokit,
    });

    expect(JSON.parse(content)).toEqual(parsed);
  });

  it("busts the cache on the API request when asked", async () => {
    const octokit = {
      request: vi.fn().mockResolvedValue({ data: projectJson }),
    };

    await fetchGitHubFileContent(largeFileResponse, {
      octokit,
      bustCache: true,
    });

    const [requestedUrl] = octokit.request.mock.calls[0];
    expect(requestedUrl).toMatch(/[?&]_=\d+/);
    expect(requestedUrl.startsWith(`GET ${largeFileResponse.url}`)).toBe(true);
  });

  it("falls back to download_url when there is no octokit", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => projectJson,
    });

    const content = await fetchGitHubFileContent(largeFileResponse);

    expect(content).toBe(projectJson);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      largeFileResponse.download_url,
      { cache: "no-store" },
    );
  });

  it("surfaces a failing download_url status", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(fetchGitHubFileContent(largeFileResponse)).rejects.toThrow(
      "download_url returned 404 Not Found",
    );
  });

  it("falls back to download_url when the API request fails", async () => {
    const octokit = {
      request: vi.fn().mockRejectedValue(new Error("rate limited")),
    };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => projectJson,
    });

    const content = await fetchGitHubFileContent(largeFileResponse, {
      octokit,
    });

    expect(content).toBe(projectJson);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("reports the API error when both paths fail", async () => {
    const octokit = {
      request: vi.fn().mockRejectedValue(new Error("bad credentials")),
    };
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      fetchGitHubFileContent(largeFileResponse, { octokit }),
    ).rejects.toThrow("bad credentials");
  });
});
