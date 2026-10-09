/**
 * Pull requests from synthetic recorded responses in GitHub's shape. No test calls GitHub.
 */
import { describe, expect, it } from "vitest";
import { fakeFetch, pull } from "./fake-github.js";
import { readPullRequests, tokenFrom } from "./github.js";

const TOKEN = "test-token-not-real";

const PAGE = "/repos/acme/api/pulls?state=all&sort=created&direction=desc&per_page=100&page=";

describe("pull requests", () => {
  it("reads the period's pull requests, flags the rules' ones, and places them by their files", async () => {
    const { fetch, calls } = fakeFetch({
      [`${PAGE}1`]: [
        pull(9, "2027-01-02"),
        pull(8, "2026-11-20", {
          title: "Spike: streaming parser",
          state: "closed",
          closed_at: "2026-11-25T10:00:00Z",
          head: "spike/streaming",
        }),
        pull(7, "2026-09-01", {
          title: "Add CSV export",
          labels: ["research"],
          merged_at: "2026-09-03T10:00:00Z",
          state: "closed",
          head: "csv-export",
        }),
        pull(6, "2026-03-01", {
          title: "Fix login",
          merged_at: "2026-03-02T00:00:00Z",
          state: "closed",
        }),
        pull(5, "2025-12-30", { title: "Prototype old thing" }),
      ],
      "/repos/acme/api/pulls/8/files?per_page=100": [{ filename: "apps/parser/src/stream.ts" }],
      "/repos/acme/api/pulls/7/files?per_page=100": [{ filename: "apps/export/csv.ts" }],
    });
    const read = await readPullRequests({
      owner: "acme",
      repo: "api",
      since: "2026-01-01",
      until: "2026-12-31",
      token: TOKEN,
      fetch,
    });
    expect(read.prs.map((p) => [p.number, p.state, p.signals.map((s) => s.id)])).toEqual([
      [8, "closed-unmerged", ["pr-closed-unmerged", "experiment-words"]],
      [7, "merged", ["pr-label"]],
      [6, "merged", []],
    ]);
    expect(read.prs[0]!.files).toEqual(["apps/parser/src/stream.ts"]);
    expect(read.prs[2]!.files).toBeNull();
    expect(read.requests).toBe(3);
    expect(read.partial).toBeNull();
    for (const c of calls) {
      expect(new URL(c.url).origin).toBe("https://api.github.com");
      expect(c.auth).toBe(`Bearer ${TOKEN}`);
    }
    expect(JSON.stringify(read)).not.toContain(TOKEN);
  });

  it("pages until a pull request older than the period, and stops at its own cap", async () => {
    const full = Array.from({ length: 100 }, (_, i) => pull(500 - i, "2026-06-01"));
    const { fetch, calls } = fakeFetch({
      [`${PAGE}1`]: full,
      [`${PAGE}2`]: full,
      [`${PAGE}3`]: full,
    });
    const read = await readPullRequests({
      owner: "acme",
      repo: "api",
      since: "2026-01-01",
      until: "2026-12-31",
      token: TOKEN,
      fetch,
      maxRequests: 2,
    });
    expect(calls).toHaveLength(2);
    expect(read.partial).toContain("stopped after 2 requests");
  });

  it("stops before the rate limit runs out, and says retrying later helps", async () => {
    const full = Array.from({ length: 100 }, (_, i) => pull(500 - i, "2026-06-01"));
    const { fetch } = fakeFetch({ [`${PAGE}1`]: full, [`${PAGE}2`]: full }, { remaining: () => 1 });
    await expect(
      readPullRequests({
        owner: "acme",
        repo: "api",
        since: "2026-01-01",
        until: "2026-12-31",
        token: TOKEN,
        fetch,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });

  it("explains a rejected token and a repository it cannot see", async () => {
    const args = {
      owner: "acme",
      repo: "api",
      since: "2026-01-01",
      until: "2026-12-31",
      token: TOKEN,
    };
    await expect(
      readPullRequests({ ...args, fetch: fakeFetch({}, { status: { [`${PAGE}1`]: 401 } }).fetch }),
    ).rejects.toMatchObject({ code: "TOKEN_REJECTED" });
    await expect(readPullRequests({ ...args, fetch: fakeFetch({}).fetch })).rejects.toMatchObject({
      code: "REPO_NOT_FOUND",
    });
  });

  it("takes the token from GITHUB_TOKEN, then GH_TOKEN", () => {
    expect(tokenFrom({ GH_TOKEN: "b", GITHUB_TOKEN: "a" })).toBe("a");
    expect(tokenFrom({ GH_TOKEN: "b" })).toBe("b");
    expect(tokenFrom({ GITHUB_TOKEN: "  " })).toBeNull();
  });
});
