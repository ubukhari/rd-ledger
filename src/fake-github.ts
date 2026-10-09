/**
 * Synthetic recorded responses in GitHub's shape, for the tests: a pull request, and a fetch that
 * answers from a table and records each request. Nothing here reaches the network.
 */
import { API, type Fetch } from "./github.js";

export function pull(
  n: number,
  created: string,
  over: Partial<{
    title: string;
    body: string | null;
    merged_at: string | null;
    closed_at: string | null;
    state: string;
    labels: string[];
    head: string;
    login: string;
  }> = {},
) {
  return {
    number: n,
    title: over.title ?? `Change ${n}`,
    body: over.body ?? null,
    user: { login: over.login ?? "ada-example" },
    created_at: `${created}T09:00:00Z`,
    merged_at: over.merged_at ?? null,
    closed_at: over.closed_at ?? null,
    state: over.state ?? "open",
    draft: false,
    labels: (over.labels ?? []).map((name) => ({ name })),
    head: { ref: over.head ?? `branch-${n}` },
    html_url: `https://github.com/acme/api/pull/${n}`,
  };
}

export function fakeFetch(
  routes: Record<string, unknown>,
  opts: { remaining?: (i: number) => number; status?: Record<string, number> } = {},
) {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    const path = url.slice(API.length);
    const status = opts.status?.[path] ?? (path in routes ? 200 : 404);
    const remaining = opts.remaining ? opts.remaining(calls.length) : 4999;
    return {
      status,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === "x-ratelimit-remaining" ? String(remaining) : null,
      },
      json: async () => routes[path] ?? { message: "Not Found" },
    };
  };
  return { fetch, calls };
}
