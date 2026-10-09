/**
 * Reading a repository's history with the `git` the user already has: arguments only, never a
 * shell, and only read commands (log, rev-list, rev-parse, for-each-ref, remote, merge-tree
 * --write-tree, which writes a tree object to compare and touches no branch, index or file).
 *
 * The remote's URL is parsed for its host, owner and name and then dropped: a URL can carry a
 * token (https://user:token@host/…), so it is never printed, written or returned whole.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { RdLedgerError } from "./errors.js";
import { GENERATED_FILE } from "./signals.js";

export interface FileChange {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

export interface RawCommit {
  sha: string;
  parents: string[];
  author: string;
  email: string;
  /** ISO 8601 with the author's own UTC offset */
  authored: string;
  committed: string;
  subject: string;
  body: string;
  files: FileChange[];
}

export interface Remote {
  host: string;
  owner: string;
  repo: string;
}

export interface BranchInfo {
  /** as shown: `spike/graph`, or `origin/spike/graph` when only the remote has it */
  name: string;
  ref: string;
  /** commits on it and not on the base branch, newest first */
  commits: string[];
  /** merging it into the base would change nothing: squash-merged or cherry-picked already */
  absorbed: boolean | null;
}

export interface RepoFacts {
  /** absolute; used to run git, never printed */
  root: string;
  /** owner/repo from the origin remote, else the folder's name */
  name: string;
  remote: Remote | null;
  head: string;
  base: { ref: string; reason: string } | null;
  shallow: boolean;
  remotes: string[];
}

export interface Git {
  /** stdout of a git command that must succeed */
  run(args: readonly string[]): string;
  /** status and stdout of a git command that may fail */
  tryRun(args: readonly string[]): { status: number; stdout: string };
}

const MAX_BUFFER = 1024 * 1024 * 1024;

export function gitAt(dir: string, env: NodeJS.ProcessEnv = process.env): Git {
  const exec = (args: readonly string[]) => {
    const res = spawnSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", LC_ALL: "C" },
    });
    if (res.error) {
      const e = res.error as NodeJS.ErrnoException;
      if (e.code === "ENOENT")
        throw new RdLedgerError(
          "GIT_NOT_FOUND",
          "the git command is not installed or not on PATH",
          "Install git (https://git-scm.com/downloads) and run again.",
        );
      throw new RdLedgerError(
        "GIT_FAILED",
        `git ${args[0] ?? ""} failed: ${e.message}`,
        "Run the same git command yourself to see why.",
        true,
      );
    }
    return { status: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  };
  return {
    run(args) {
      const r = exec(args);
      if (r.status !== 0)
        throw new RdLedgerError(
          "GIT_FAILED",
          `git ${args.join(" ")} exited ${r.status}: ${r.stderr.trim().split("\n")[0] ?? ""}`,
          "Check that the folder is a git repository you can read, and run again.",
        );
      return r.stdout;
    },
    tryRun(args) {
      const r = exec(args);
      return { status: r.status, stdout: r.stdout };
    },
  };
}

/** host, owner and name from a remote URL, with any credentials in it discarded */
export function parseRemote(url: string): Remote | null {
  const u = url.trim();
  let host: string | undefined;
  let rest: string | undefined;
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(u);
  if (scp) [, host, rest] = scp;
  else {
    try {
      const parsed = new URL(u);
      if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol)) return null;
      host = parsed.hostname;
      rest = parsed.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }
  if (!host || !rest) return null;
  const parts = rest
    .replace(/\.git\/?$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;
  const repo = parts[parts.length - 1]!;
  const owner = parts.slice(0, -1).join("/");
  if (!/^[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(owner)) return null;
  return { host: host.toLowerCase(), owner, repo };
}

/** A link to a commit on the three public hosts whose URL shape is known; otherwise none. */
export function commitLink(remote: Remote | null, sha: string): string | null {
  if (!remote) return null;
  const base = `https://${remote.host}/${remote.owner}/${remote.repo}`;
  if (remote.host === "github.com") return `${base}/commit/${sha}`;
  if (remote.host === "gitlab.com") return `${base}/-/commit/${sha}`;
  if (remote.host === "bitbucket.org") return `${base}/commits/${sha}`;
  return null;
}

function detectBase(git: Git, asked: string | undefined): { ref: string; reason: string } | null {
  const exists = (ref: string) =>
    git.tryRun(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).status === 0;
  if (asked) {
    if (!exists(asked))
      throw new RdLedgerError(
        "BASE_NOT_FOUND",
        `no branch or commit named ${asked} in this repository`,
        "Pass the main branch with --base (e.g. --base main or --base origin/main), or leave it out to detect it.",
      );
    return { ref: asked, reason: "given with --base" };
  }
  const originHead = git.tryRun(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead.status === 0) {
    const ref = originHead.stdout.trim();
    if (ref && exists(ref)) return { ref, reason: "the origin remote's default branch" };
  }
  for (const ref of ["main", "master", "origin/main", "origin/master", "trunk", "develop"])
    if (exists(ref)) return { ref, reason: `a branch named ${ref}` };
  return null;
}

export function readRepo(dir: string, opts: { base?: string; git?: Git } = {}): RepoFacts {
  const git = opts.git ?? gitAt(dir);
  const top = git.tryRun(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0)
    throw new RdLedgerError(
      "NOT_A_REPO",
      `no git repository at ${dir}`,
      "Run it inside a git repository, or pass the repository's folder as the first argument.",
    );
  const root = top.stdout.trim();
  const head = git.tryRun(["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (head.status !== 0)
    throw new RdLedgerError(
      "EMPTY_REPO",
      "the repository has no commits yet",
      "Run it on a repository with history.",
    );
  const shallow = git.run(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  const remotes = git
    .run(["remote"])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  let remote: Remote | null = null;
  const pick = remotes.includes("origin") ? "origin" : remotes[0];
  if (pick) {
    const url = git.tryRun(["remote", "get-url", pick]);
    if (url.status === 0) remote = parseRemote(url.stdout);
  }
  return {
    root,
    name: remote ? `${remote.owner}/${remote.repo}` : path.basename(root),
    remote,
    head: head.stdout.trim(),
    base: detectBase(git, opts.base),
    shallow,
    remotes,
  };
}

const RS = "\x1e";
const US = "\x1f";
const END = "\x1d";
const FORMAT = `--format=${RS}%H${US}%P${US}%aN${US}%aE${US}%aI${US}%cI${US}%s${US}%b${END}`;

/** git's own --since, a little early: the exact cut is the author's date, applied after reading */
export function sinceMargin(since: string): string {
  const d = new Date(`${since}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

export function parseLog(out: string): RawCommit[] {
  const commits: RawCommit[] = [];
  for (const record of out.split(RS)) {
    if (!record.trim()) continue;
    const end = record.indexOf(END);
    if (end < 0) continue;
    const [sha, parents, author, email, authored, committed, subject, ...body] = record
      .slice(0, end)
      .split(US);
    if (!sha || !authored) continue;
    const files: FileChange[] = [];
    for (const line of record.slice(end + 1).split("\n")) {
      const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(line);
      if (!m) continue;
      const binary = m[1] === "-";
      files.push({
        path: m[3]!,
        added: binary ? 0 : Number(m[1]),
        deleted: binary ? 0 : Number(m[2]),
        binary,
      });
    }
    commits.push({
      sha,
      parents: (parents ?? "").split(" ").filter(Boolean),
      author: author ?? "",
      email: email ?? "",
      authored,
      committed: committed ?? authored,
      subject: subject ?? "",
      body: body.join(US).trim(),
      files,
    });
  }
  return commits;
}

/**
 * Every commit on local and remote-tracking branches (and HEAD, for a detached checkout) whose
 * author date falls in the period, by the author's own calendar day. `.mailmap` applies.
 */
export function readCommits(git: Git, since: string, until: string): RawCommit[] {
  const out = git.run([
    "-c",
    "core.quotepath=off",
    "-c",
    "log.showSignature=false",
    "log",
    "--no-color",
    "--branches",
    "--remotes",
    "HEAD",
    "--no-renames",
    "--numstat",
    "--date-order",
    `--since=${sinceMargin(since)}`,
    FORMAT,
  ]);
  return parseLog(out).filter((c) => {
    const day = c.authored.slice(0, 10);
    return day >= since && day <= until;
  });
}

/** The commits the base branch contains, from the period's start. */
export function commitsOnBase(git: Git, base: string, since: string): Set<string> {
  return new Set(
    git
      .run(["rev-list", base, `--since=${sinceMargin(since)}`])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** `:mode mode old new status<TAB>path` lines from --raw output, as path and new blob. */
function rawChanges(out: string): { path: string; blob: string }[] {
  const changes: { path: string; blob: string }[] = [];
  for (const line of out.split("\n")) {
    const m = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) [A-Z]\d*\t(.+)$/.exec(line);
    if (m) changes.push({ path: m[2]!, blob: m[1]! });
  }
  return changes;
}

/**
 * Branches (local and remote-tracking) never merged into the base, with their own commits.
 *
 * A branch whose changes reached the base by a squash merge or a cherry-pick has no merge in the
 * history, so git calls it unmerged. Two checks tell it apart, and either is enough:
 * - merging it into the base would change nothing (`git merge-tree`, git 2.38 or later);
 * - at least 90% of the files it changed, in the exact versions it left them, also appear in the
 *   base's own history from the period on. That is what a squash merge leaves behind, even after
 *   the base changed those files again.
 */
export function unmergedBranches(
  git: Git,
  base: string,
  since: string,
  remotes: readonly string[],
  limit = 300,
): { branches: BranchInfo[]; truncated: boolean; mergeTree: boolean } {
  const refs = git
    .run([
      "for-each-ref",
      `--no-merged=${base}`,
      `--format=%(refname)${US}%(refname:short)${US}%(symref)`,
      "refs/heads",
      "refs/remotes",
    ])
    .split("\n")
    .map((l) => l.split(US))
    .filter((p) => p[0] && !p[2]);
  const baseTree = git.run(["rev-parse", `${base}^{tree}`]).trim();
  let baseBlobs: Set<string> | null = null;
  const blobsOnBase = (): Set<string> =>
    (baseBlobs ??= new Set(
      rawChanges(
        git.run([
          "log",
          base,
          `--since=${sinceMargin(since)}`,
          "--raw",
          "--no-abbrev",
          "--no-renames",
          "--no-color",
          "--format=",
        ]),
      ).map((c) => `${c.path}\0${c.blob}`),
    ));
  const out: BranchInfo[] = [];
  const seen = new Set<string>();
  let mergeTree = true;
  const local = new Set(refs.filter((p) => p[0]!.startsWith("refs/heads/")).map((p) => p[1]!));
  for (const [ref, short] of refs) {
    if (out.length >= limit) return { branches: out, truncated: true, mergeTree };
    let name = short!;
    if (ref!.startsWith("refs/remotes/")) {
      const remote = remotes.find((r) => name.startsWith(`${r}/`));
      const bare = remote ? name.slice(remote.length + 1) : name;
      if (local.has(bare)) continue; // the local branch already stands for it
      name = remote === "origin" ? bare : name;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    const commits = git
      .run(["rev-list", ref!, `^${base}`, `--since=${sinceMargin(since)}`])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (commits.length === 0) continue;
    let absorbed: boolean | null = null;
    if (mergeTree) {
      const r = git.tryRun(["merge-tree", "--write-tree", base, ref!]);
      if (r.status === 0) absorbed = r.stdout.split("\n")[0]!.trim() === baseTree;
      else if (r.status === 1) absorbed = false;
      else mergeTree = false; // git older than 2.38 has no --write-tree
    }
    if (absorbed !== true) {
      const mb = git.tryRun(["merge-base", base, ref!]);
      if (mb.status === 0) {
        const changed = rawChanges(
          git.run([
            "diff",
            "--raw",
            "--no-abbrev",
            "--no-renames",
            "--no-color",
            mb.stdout.trim(),
            ref!,
          ]),
        ).filter((c) => !GENERATED_FILE.test(c.path));
        if (changed.length > 0) {
          const on = blobsOnBase();
          const found = changed.filter((c) => on.has(`${c.path}\0${c.blob}`)).length;
          if (found / changed.length >= 0.9) absorbed = true;
        }
      }
    }
    out.push({ name, ref: ref!, commits, absorbed });
  }
  return { branches: out, truncated: false, mergeTree };
}
