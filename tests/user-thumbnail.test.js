/**
 * Saves keep a thumbnail the user set, even when this tab's project info
 * doesn't know about it (set before the flag was stored correctly, or in
 * another tab).
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/user-thumbnail.test.js
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import GlobalVariables from "../src/js/globalvariables.js";
import {
  USER_THUMBNAIL_COMMIT,
  hasUserSetThumbnail,
} from "../src/js/userThumbnail.js";

/** A GitHub client whose last project.png commit has this message. */
function githubWithLastPngCommit(message) {
  return {
    rest: {
      repos: {
        listCommits: vi.fn(async () => ({
          data: message ? [{ commit: { message } }] : [],
        })),
      },
    },
  };
}

beforeEach(() => {
  GlobalVariables.currentAWSnode = { owner: "o", repoName: "r" };
});

describe("Whether the user set the thumbnail", () => {
  it("trusts the flag without asking GitHub", async () => {
    GlobalVariables.currentAWSnode.userSetAsThumbnail = true;
    const github = githubWithLastPngCommit("User Save");
    expect(await hasUserSetThumbnail(github, "o", "r")).toBe(true);
    expect(github.rest.repos.listCommits).not.toHaveBeenCalled();
  });

  it("finds a user thumbnail in GitHub's history and remembers it", async () => {
    const github = githubWithLastPngCommit(USER_THUMBNAIL_COMMIT);
    expect(await hasUserSetThumbnail(github, "o", "r")).toBe(true);
    expect(github.rest.repos.listCommits).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "o", repo: "r", path: "project.png" }),
    );
    expect(GlobalVariables.currentAWSnode.userSetAsThumbnail).toBe(true);
  });

  it("is false when a save made the current thumbnail", async () => {
    const github = githubWithLastPngCommit("User Save");
    expect(await hasUserSetThumbnail(github, "o", "r")).toBe(false);
    expect(GlobalVariables.currentAWSnode.userSetAsThumbnail).toBeUndefined();
  });

  it("is false for a project without a thumbnail yet, or if GitHub fails", async () => {
    expect(await hasUserSetThumbnail(githubWithLastPngCommit(null), "o", "r")).toBe(false);
    const failing = {
      rest: { repos: { listCommits: vi.fn(async () => { throw new Error("offline"); }) } },
    };
    expect(await hasUserSetThumbnail(failing, "o", "r")).toBe(false);
  });
});
