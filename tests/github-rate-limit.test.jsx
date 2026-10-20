/**
 * When GitHub's API rate limit runs out, the page says so: signed-out visitors
 * are offered a GitHub sign-in, everyone gets the time it resets.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/github-rate-limit.test.jsx
 */
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = { authorizedUserOcto: null, authRedirectHandler: vi.fn() };
vi.mock("../src/contexts/AuthContext.jsx", () => ({ useAuth: () => auth }));

import GitHubRateLimitBanner from "../src/components/secondary/GitHubRateLimitBanner.jsx";
import {
  getGitHubRateLimitReset,
  watchGitHubRateLimit,
} from "../src/js/githubRateLimit.js";

// What the network answers next, as GitHub would
let nextResponse;
const reset = Math.floor(Date.now() / 1000) + 1800;

function githubResponse(url, status, remaining) {
  return {
    url,
    status,
    headers: new Headers({
      "x-ratelimit-remaining": String(remaining),
      "x-ratelimit-reset": String(reset),
    }),
  };
}

beforeAll(() => {
  window.fetch = async () => nextResponse;
  watchGitHubRateLimit();
  watchGitHubRateLimit(); // installing twice must not double-wrap
});

afterEach(cleanup);

async function respond(response) {
  nextResponse = response;
  await act(async () => {
    expect(await window.fetch(response.url)).toBe(response);
  });
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={["/preview/tester/project"]}>
      <GitHubRateLimitBanner />
    </MemoryRouter>,
  );
}

describe("GitHub rate limit warning", () => {
  it("ignores other failures and other hosts", async () => {
    await respond(githubResponse("https://api.github.com/repos/a/b", 404, 59));
    await respond(githubResponse("https://api.github.com/repos/a/b", 403, 12));
    await respond(githubResponse("https://example.com/x", 403, 0));
    expect(getGitHubRateLimitReset()).toBeNull();
    expect(renderBanner().container.textContent).toBe("");
  });

  it("asks signed-out visitors to sign in once the limit runs out", async () => {
    const view = renderBanner();
    await respond(githubResponse("https://api.github.com/repos/a/b", 403, 0));

    expect(getGitHubRateLimitReset()?.getTime()).toBe(reset * 1000);
    const banner = view.getByRole("alert");
    expect(banner.textContent).toMatch(/Sign in with GitHub to keep opening projects/);

    fireEvent.click(view.getByText("Sign in with GitHub"));
    expect(auth.authRedirectHandler).toHaveBeenCalledWith({
      returnTo: "/preview/tester/project",
    });
  });

  it("only tells signed-in users when it resets", async () => {
    auth.authorizedUserOcto = {};
    const view = renderBanner();
    expect(view.getByRole("alert").textContent).toMatch(/Try again after/);
    expect(view.queryByText("Sign in with GitHub")).toBeNull();
    auth.authorizedUserOcto = null;
  });

  it("stays hidden after dismissing until a new limit", async () => {
    const view = renderBanner();
    fireEvent.click(view.getByLabelText("Dismiss"));
    expect(view.queryByRole("alert")).toBeNull();

    // More failures before the same reset don't bring it back
    await respond(githubResponse("https://api.github.com/repos/a/c", 429, 0));
    expect(view.queryByRole("alert")).toBeNull();
  });
});
