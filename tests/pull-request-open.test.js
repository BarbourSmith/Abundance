import { describe, it, expect } from "vitest";
import { openPullRequest } from "../src/js/pullRequestSync.js";

const OPTIONS = {
  baseOwner: "maker",
  baseRepo: "chair",
  headOwner: "me",
  headRepo: "chair",
  title: "Taller legs",
  description: "Legs are 50 mm taller.",
};

/** A fake Octokit answering the requests openPullRequest makes. */
function fakeOcto({ openPRs = [], aheadBy = 1, behindBy = 0 }) {
  const requests = [];
  const octo = {
    request: async (route, params) => {
      requests.push({ route, params });
      switch (route) {
        case "GET /repos/{owner}/{repo}/pulls":
          return { data: openPRs };
        case "GET /repos/{owner}/{repo}/git/ref/{ref}":
          return { data: { object: { sha: `${params.owner}-sha` } } };
        case "GET /repos/{owner}/{repo}/compare/{basehead}":
          return { data: { ahead_by: aheadBy, behind_by: behindBy } };
        case "POST /repos/{owner}/{repo}/pulls":
          return { data: { number: 7, html_url: "https://github.com/pr/7" } };
        default:
          throw new Error(`Unexpected request ${route}`);
      }
    },
  };
  return { octo, requests };
}

describe("openPullRequest", () => {
  it("opens a pull request from the fork's main to the original's", async () => {
    const { octo, requests } = fakeOcto({});
    const result = await openPullRequest(octo, OPTIONS);
    expect(result.status).toBe("created");
    expect(result.pr.html_url).toBe("https://github.com/pr/7");
    const create = requests.find(
      (r) => r.route === "POST /repos/{owner}/{repo}/pulls",
    ).params;
    expect(create).toMatchObject({
      owner: "maker",
      repo: "chair",
      title: "Taller legs",
      head: "me:main",
      base: "main",
    });
    expect(create.body).toContain("Legs are 50 mm taller.");
  });

  it("reports a pull request that's already open", async () => {
    const { octo, requests } = fakeOcto({
      openPRs: [{ number: 3, html_url: "https://github.com/pr/3" }],
    });
    const result = await openPullRequest(octo, OPTIONS);
    expect(result).toMatchObject({ status: "existing", pr: { number: 3 } });
    expect(requests.some((r) => r.route.startsWith("POST"))).toBe(false);
  });

  it("opens nothing when the original has newer changes", async () => {
    const { octo, requests } = fakeOcto({ behindBy: 2 });
    const result = await openPullRequest(octo, OPTIONS);
    expect(result).toEqual({ status: "behind", behindBy: 2 });
    expect(requests.some((r) => r.route.startsWith("POST"))).toBe(false);
  });

  it("opens nothing when the fork has no changes", async () => {
    const { octo } = fakeOcto({ aheadBy: 0 });
    expect(await openPullRequest(octo, OPTIONS)).toEqual({
      status: "no-changes",
    });
  });
});
