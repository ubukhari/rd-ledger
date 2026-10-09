/**
 * Pull requests, only with `--prs` and the user's own token from GITHUB_TOKEN or GH_TOKEN. Read-only
 * GETs to api.github.com and nowhere else. The token is sent in the Authorization header and is
 * never printed, written or returned.
 *
 * What it reads: the repo's pull requests newest first, until one was created before the period
 * (100 a page); then, for each one a rule flags, its changed files (one page of 100), to place it
 * in components. It counts its requests, stops before GitHub's rate limit would run out, and caps
 * itself at `maxRequests`, saying so in the report.
 */
import { RdLedgerError } from "./errors.js";
import { isSpikeLabel, messageSignals, type Hit, type SignalId } from "./signals.js";

export const API = "https://api.github.com";
export const TOKEN_ENVS = ["GITHUB_TOKEN", "GH_TOKEN"] as const;

export type Fetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  created: string;
  state: "open" | "merged" | "closed-unmerged";
  merged: string | null;
  closed: string | null;
  draft: boolean;
  labels: string[];
  headRef: string;
  url: string;
  signals: Hit<SignalId>[];
  files: string[] | null;
}

export interface PrRead {
  prs: PullRequest[];
  requests: number;
  /** why reading stopped early, if it did */
  partial: string | null;
}

interface ApiPull {
  number: number;
  title: string;
  body: string | null;
  user: { login: string } | null;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  state: string;
  draft?: boolean;
  labels: { name: string }[];
  head: { ref: string };
  html_url: string;
}

export function tokenFrom(env: Record<string, string | undefined>): string | null {
  for (const k of TOKEN_ENVS) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return null;
}

export async function readPullRequests(opts: {
  owner: string;
  repo: string;
  since: string;
  until: string;
  token: string;
  fetch: Fetch;
  maxRequests?: number;
}): Promise<PrRead> {
  const max = opts.maxRequests ?? 200;
  let requests = 0;
  let remaining = Infinity;
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "rd-ledger",
  };
  const get = async (pathAndQuery: string): Promise<unknown> => {
    if (remaining < 2)
      throw new RdLedgerError(
        "RATE_LIMITED",
        "GitHub's rate limit for this token is nearly spent",
        "Wait for the hourly reset and run again, or run without --prs.",
        true,
      );
    requests++;
    const res = await opts.fetch(`${API}${pathAndQuery}`, { headers });
    const left = res.headers.get("x-ratelimit-remaining");
    if (left !== null && /^\d+$/.test(left)) remaining = Number(left);
    if (res.status === 401)
      throw new RdLedgerError(
        "TOKEN_REJECTED",
        "GitHub rejected the token (401)",
        "Check GITHUB_TOKEN or GH_TOKEN: it needs read access to the repository's pull requests.",
      );
    if (res.status === 403 || res.status === 429) {
      if (remaining === 0 || res.status === 429)
        throw new RdLedgerError(
          "RATE_LIMITED",
          `GitHub answered ${res.status}: the rate limit is spent`,
          "Wait for the hourly reset and run again, or run without --prs.",
          true,
        );
      throw new RdLedgerError(
        "FORBIDDEN",
        "GitHub answered 403: the token may not read this repository's pull requests",
        "Use a token with read access to pull requests on this repository.",
      );
    }
    if (res.status === 404)
      throw new RdLedgerError(
        "REPO_NOT_FOUND",
        `GitHub has no repository ${opts.owner}/${opts.repo} that this token can read`,
        "Check --repo owner/name, or that the token can read the repository.",
      );
    if (res.status >= 500)
      throw new RdLedgerError(
        "GITHUB_UNAVAILABLE",
        `GitHub answered ${res.status}`,
        "Run again in a few minutes.",
        true,
      );
    if (res.status !== 200)
      throw new RdLedgerError(
        "GITHUB_ERROR",
        `GitHub answered ${res.status}`,
        "Run again; if it repeats, run without --prs.",
      );
    return res.json();
  };

  const repoPath = `/repos/${encodeURIComponent(opts.owner).replace(/%2F/g, "/")}/${encodeURIComponent(opts.repo)}`;
  const prs: PullRequest[] = [];
  let partial: string | null = null;
  for (let page = 1; ; page++) {
    if (requests >= max) {
      partial = `stopped after ${requests} requests (the cap); older pull requests in the period were not read`;
      break;
    }
    const batch = (await get(
      `${repoPath}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
    )) as ApiPull[];
    if (!Array.isArray(batch)) break;
    let older = false;
    for (const p of batch) {
      const created = p.created_at.slice(0, 10);
      if (created < opts.since) {
        older = true;
        continue;
      }
      if (created > opts.until) continue;
      const state: PullRequest["state"] = p.merged_at
        ? "merged"
        : p.state === "closed"
          ? "closed-unmerged"
          : "open";
      const labels = p.labels.map((l) => l.name);
      const signals: Hit<SignalId>[] = [];
      if (state === "closed-unmerged")
        signals.push({
          id: "pr-closed-unmerged",
          evidence: `closed ${p.closed_at?.slice(0, 10) ?? ""} without merging`.trim(),
        });
      const spikeLabels = labels.filter(isSpikeLabel);
      if (spikeLabels.length)
        signals.push({
          id: "pr-label",
          evidence: `labelled ${spikeLabels.map((l) => `"${l}"`).join(", ")}`,
        });
      for (const h of messageSignals(p.title, p.body ?? ""))
        signals.push({ id: h.id, evidence: h.evidence.replace("the message", "the pull request") });
      prs.push({
        number: p.number,
        title: p.title,
        author: p.user?.login ?? "",
        created,
        state,
        merged: p.merged_at?.slice(0, 10) ?? null,
        closed: p.closed_at?.slice(0, 10) ?? null,
        draft: p.draft === true,
        labels,
        headRef: p.head.ref,
        url: p.html_url,
        signals,
        files: null,
      });
    }
    if (older || batch.length < 100) break;
  }
  for (const pr of prs) {
    if (pr.signals.length === 0) continue;
    if (requests >= max) {
      partial ??= `stopped after ${requests} requests (the cap); some flagged pull requests have no component`;
      break;
    }
    const files = (await get(`${repoPath}/pulls/${pr.number}/files?per_page=100`)) as {
      filename: string;
    }[];
    pr.files = Array.isArray(files) ? files.map((f) => f.filename) : [];
  }
  return { prs, requests, partial };
}
