// src/errors.ts
var RdLedgerError = class extends Error {
  constructor(code, cause_, fix, retryable = false) {
    super(cause_);
    this.code = code;
    this.cause_ = cause_;
    this.fix = fix;
    this.retryable = retryable;
    this.name = "RdLedgerError";
  }
  code;
  cause_;
  fix;
  retryable;
  toJSON() {
    return { code: this.code, cause: this.cause_, fix: this.fix, retryable: this.retryable };
  }
};

// src/signals.ts
var SIGNALS = [
  {
    id: "revert",
    shows: "The commit reverts an earlier one: an approach was tried and backed out.",
    element: "Process of experimentation: an alternative evaluated and rejected.",
    strength: "strong"
  },
  {
    id: "reverted",
    shows: "The commit was reverted later in the history read.",
    element: "Process of experimentation: an alternative evaluated and rejected.",
    strength: "strong"
  },
  {
    id: "unmerged",
    shows: "The commit is only on a branch never merged into the main branch: an approach not taken, or work still open.",
    element: "Process of experimentation: alternatives evaluated.",
    strength: "medium"
  },
  {
    id: "spike-branch",
    shows: "The commit is on a branch named as an experiment (spike, experiment, exp, poc, prototype, try, trial, research, rnd, benchmark).",
    element: "Uncertainty, and a process of experimentation to resolve it.",
    strength: "medium"
  },
  {
    id: "experiment-words",
    shows: "The message names an experiment, spike, prototype, proof of concept, hypothesis, benchmark or A/B test.",
    element: "Process of experimentation.",
    strength: "medium"
  },
  {
    id: "approach-words",
    shows: "The message speaks of trying or attempting something, an alternative or approach, or investigating, evaluating, comparing or exploring.",
    element: "Uncertainty; alternatives evaluated.",
    strength: "weak"
  },
  {
    id: "failed-words",
    shows: "The message says something did not work, was a dead end, was abandoned, backed out or rolled back, or brought no improvement.",
    element: "Uncertainty: the outcome was not known in advance.",
    strength: "medium"
  },
  {
    id: "rewrite",
    shows: "The commit replaces a large part of the same files (100 or more lines both removed and added), or its message says rewrite, reimplement, replace one thing with another, or switch or migrate from one to another.",
    element: "Alternatives evaluated.",
    strength: "weak"
  },
  {
    id: "pr-closed-unmerged",
    shows: "A pull request closed without being merged: a proposed change not taken.",
    element: "Process of experimentation: an alternative evaluated and rejected.",
    strength: "medium"
  },
  {
    id: "pr-label",
    shows: "A pull request labelled spike, experiment, research, R&D, PoC, prototype, investigation or benchmark.",
    element: "Process of experimentation.",
    strength: "medium"
  }
];
var ROUTINE = [
  {
    id: "merge",
    shows: "A merge commit; its changes are counted in the commits it merges.",
    element: "None by itself.",
    strength: "strong"
  },
  {
    id: "bot",
    shows: "Written by an automation account, not a person.",
    element: "None: no one's wages.",
    strength: "strong"
  },
  {
    id: "dependency",
    shows: "A dependency update (bump, chore(deps), update dependencies, Dependabot, Renovate).",
    element: "Usually routine.",
    strength: "medium"
  },
  {
    id: "format",
    shows: "Formatting, lint or typo fixes.",
    element: "Usually routine.",
    strength: "medium"
  },
  {
    id: "docs-only",
    shows: "Changes only documentation files.",
    element: "Usually routine.",
    strength: "medium"
  },
  {
    id: "ci-only",
    shows: "Changes only CI configuration.",
    element: "Usually routine.",
    strength: "medium"
  },
  {
    id: "release",
    shows: "A release or a version bump.",
    element: "Usually routine; work after commercial release is excluded by \xA741(d)(4)(A).",
    strength: "medium"
  }
];
var EXPERIMENT = /\b(experiment(?:s|al|ally|ing|ed)?|spik(?:e|es|ed|ing)|prototyp(?:e|es|ed|ing)|proof[- ]of[- ]concept|poc|hypothes(?:is|es|ize|ise|ized|ised)|benchmark(?:s|ed|ing)?|a\/b[- ]test(?:s|ing|ed)?)\b/gi;
var APPROACH = /\b(try|trying|tried|attempt(?:s|ed|ing)?|alternatives?|approach(?:es)?|investigat(?:e|es|ed|ing|ion)|evaluat(?:e|es|ed|ing|ion)|compar(?:e|es|ed|ing|ison)|explor(?:e|es|ed|ing|ation))\b/gi;
var FAILED = /\b(did(?:n'?t| not) work|does(?:n'?t| not) work|not working|dead[- ]end|abandon(?:s|ed|ing)?|gave up|give up|back(?:ed)? out|roll(?:ed)?[- ]back|no improvement|didn'?t help|did not help|no gain|slower than)\b/gi;
var REWRITE_WORDS = /\b(rewr(?:ite|ites|ote|itten|iting)|re-?implement(?:s|ed|ing|ation)?|replac(?:e|es|ed|ing) [^.\n]{1,60}? with|switch(?:es|ed|ing)? (?:from|to)|migrat(?:e|es|ed|ing) (?:from|to))\b/gi;
var SPIKE_BRANCH = /(?:^|[/_-])(spikes?|experiments?|exp|poc|prototypes?|proto|try|trial|research|rnd|r-and-d|benchmarks?|bench)(?:[/_-]|$)/i;
var PR_LABEL = /^(spike|experiment(al)?|research|r&d|rnd|r-and-d|poc|proof of concept|prototype|investigation|benchmark)s?$/i;
var DEPENDENCY = /^(?:chore|build|fix|deps)\(deps(?:-dev)?\)|^bump\b.+\bfrom\b.+\bto\b|\bupdate dependenc(?:y|ies)\b|\bupgrade dependenc(?:y|ies)\b|^(?:chore|build)(?:\([^)]*\))?: bump\b/i;
var FORMAT = /^style(?:\([^)]*\))?:|\b(?:run|ran|apply|applied|fix|fixed)\s+(?:prettier|eslint|lint|linting|formatting|formatter)\b|\bformat(?:ted)?\s+with\b|\bfix(?:ed)?\s+typos?\b|\btypos?\b|\bwhitespace\b|^(?:chore|ci)(?:\([^)]*\))?:\s*(?:format|lint)/i;
var RELEASE = /^(?:chore\(release\)|chore: release|release\b|releasing\b|bump version|version bump)|^v?\d+\.\d+\.\d+(?:[-+][\w.]+)?$|^(?:chore|build)(?:\([^)]*\))?: (?:bump|set) version\b/i;
var DOCS_FILE = /(^|\/)(docs?|documentation)\/|\.(md|mdx|rst|adoc|txt)$|(^|\/)(README|CHANGELOG|LICENSE|CONTRIBUTING|NOTICE|AUTHORS)(\.[A-Za-z]+)?$/i;
var CI_FILE = /^(\.github\/(workflows|actions)\/|\.gitlab-ci\.ya?ml$|\.circleci\/|\.buildkite\/|azure-pipelines\.ya?ml$|Jenkinsfile$|\.travis\.ya?ml$|bitbucket-pipelines\.ya?ml$)/;
var GENERATED_FILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock|composer\.lock|uv\.lock|Pipfile\.lock)$|\.min\.(js|css)$|\.snap$/;
var TRAILER = /^[A-Za-z][\w-]*:\s.+$/;
function messageText(subject, body) {
  const lines = body.split("\n");
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === "" || TRAILER.test(lines[end - 1].trim()))) end--;
  return `${subject}
${lines.slice(0, end).join("\n")}`;
}
function words(re, text) {
  const found = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(re)) found.add(m[0].toLowerCase().replace(/\s+/g, " "));
  return [...found];
}
var quoteList = (ws) => ws.slice(0, 4).map((w) => `"${w}"`).join(", ");
function messageSignals(subject, body) {
  const text = messageText(subject, body).replace(/This reverts commit [0-9a-f]{7,40}\.?/g, "");
  const hits = [];
  for (const [id, re] of [
    ["experiment-words", EXPERIMENT],
    ["approach-words", APPROACH],
    ["failed-words", FAILED],
    ["rewrite", REWRITE_WORDS]
  ]) {
    const ws = words(re, text);
    if (ws.length) hits.push({ id, evidence: `the message says ${quoteList(ws)}` });
  }
  return hits;
}
function rewriteSize(files) {
  let lines = 0;
  let n = 0;
  for (const f of files) {
    if (f.binary || GENERATED_FILE.test(f.path)) continue;
    const both = Math.min(f.added, f.deleted);
    if (both >= 10) {
      lines += both;
      n++;
    }
  }
  return { lines, files: n };
}
function isSpikeBranch(name) {
  return SPIKE_BRANCH.test(name);
}
function isSpikeLabel(label) {
  return PR_LABEL.test(label.trim());
}
function revertedSha(subject, body) {
  const m = /This reverts commit ([0-9a-f]{7,40})/.exec(body);
  if (m) return m[1];
  return null;
}
function isRevert(subject, body) {
  return /^Revert\s+"/.test(subject) || revertedSha(subject, body) !== null;
}
function isBotIdentity(name, email) {
  return /\[bot\]$/i.test(name.trim()) || /\[bot\]@/i.test(email);
}
function routineMarkers(c) {
  const hits = [];
  if (c.parents.length > 1) hits.push({ id: "merge", evidence: "a merge commit" });
  if (isBotIdentity(c.author, c.email))
    hits.push({ id: "bot", evidence: `written by ${c.author}` });
  if (/^(dependabot|renovate)/i.test(c.author) || DEPENDENCY.test(c.subject))
    hits.push({ id: "dependency", evidence: "a dependency update" });
  if (FORMAT.test(c.subject)) hits.push({ id: "format", evidence: "formatting, lint or typos" });
  if (RELEASE.test(c.subject.trim()))
    hits.push({ id: "release", evidence: "a release or version bump" });
  const paths = c.files.map((f) => f.path);
  if (paths.length && paths.every((p) => DOCS_FILE.test(p)))
    hits.push({ id: "docs-only", evidence: "documentation files only" });
  else if (paths.length && paths.every((p) => CI_FILE.test(p)))
    hits.push({ id: "ci-only", evidence: "CI configuration only" });
  return hits;
}
var AGENTS = [
  ["Claude", /noreply@anthropic\.com|^claude(\[bot\])?$|^claude\b/i],
  [
    "Copilot",
    /copilot@github\.com|\+copilot@users\.noreply\.github\.com|^copilot(-swe-agent)?(\[bot\])?$/i
  ],
  ["Cursor", /cursoragent@cursor\.com|^cursor(\[bot\]| agent)$/i],
  ["Codex", /codex@openai\.com|^chatgpt-codex-connector(\[bot\])?$|^codex$/i],
  ["Amp", /amp@ampcode\.com|^amp$/i],
  ["Aider", /noreply@aider\.chat|^aider\b/i],
  ["Gemini", /^gemini\b|gemini-code-assist|gemini-cli/i],
  ["Devin", /^devin-ai-integration(\[bot\])?$|devin-ai-integration\[bot\]@/i],
  ["Jules", /^google-labs-jules(\[bot\])?$|google-labs-jules\[bot\]@/i]
];
function agentOf(name, email) {
  for (const [agent, re] of AGENTS) if (re.test(name.trim()) || re.test(email.trim())) return agent;
  return null;
}
function aiCoauthors(author, email, body) {
  const found = /* @__PURE__ */ new Set();
  const own = agentOf(author, email);
  if (own) found.add(own);
  for (const m of body.matchAll(/^co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/gim)) {
    const agent = agentOf(m[1], m[2]);
    if (agent) found.add(agent);
  }
  return [...found];
}

// src/components.ts
var ROOT_COMPONENT = "(root files)";
var WORKSPACE_ROOTS = /* @__PURE__ */ new Set([
  "apps",
  "packages",
  "services",
  "libs",
  "crates",
  "modules",
  "plugins",
  "projects",
  "cmd",
  "internal",
  "workers",
  "functions",
  "extensions"
]);
function defaultComponent(file) {
  const segs = file.split("/");
  if (segs.length >= 3 && WORKSPACE_ROOTS.has(segs[0])) return `${segs[0]}/${segs[1]}`;
  if (segs.length >= 2) return segs[0];
  return ROOT_COMPONENT;
}
function globToRegExp(glob) {
  const g = glob.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!/[*?]/.test(g)) {
    const plain = g.replace(/\/+$/, "").replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${plain}(?:/.*)?$`);
  }
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
function parseComponentFlag(spec) {
  const eq = spec.indexOf("=");
  const name = eq > 0 ? spec.slice(0, eq).trim() : "";
  const globs = eq > 0 ? spec.slice(eq + 1).split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!name || globs.length === 0 || name.length > 80)
    throw new RdLedgerError(
      "BAD_COMPONENT",
      `--component ${JSON.stringify(spec)} is not Name=glob[,glob]`,
      'Write it like --component "Route optimizer=apps/router/**,packages/geo/**".'
    );
  return { name, globs, patterns: globs.map(globToRegExp) };
}
function componentOf(file, rules) {
  for (const r of rules) if (r.patterns.some((p) => p.test(file))) return r.name;
  return defaultComponent(file);
}
function commitShares(files, rules) {
  if (files.length === 0) return [];
  const real = files.filter((f) => !GENERATED_FILE.test(f.path));
  const used = real.length ? real : files;
  const lines = /* @__PURE__ */ new Map();
  for (const f of used) {
    const name = componentOf(f.path, rules);
    lines.set(name, (lines.get(name) ?? 0) + (f.binary ? 1 : Math.max(1, f.added + f.deleted)));
  }
  const total = [...lines.values()].reduce((a, b) => a + b, 0);
  return [...lines.entries()].map(([name, n]) => ({ name, share: n / total, lines: n })).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}

// src/git.ts
import { spawnSync } from "child_process";
import path from "path";
var MAX_BUFFER = 1024 * 1024 * 1024;
function gitAt(dir, env = process.env) {
  const exec = (args) => {
    const res = spawnSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      env: { ...env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", LC_ALL: "C" }
    });
    if (res.error) {
      const e = res.error;
      if (e.code === "ENOENT")
        throw new RdLedgerError(
          "GIT_NOT_FOUND",
          "the git command is not installed or not on PATH",
          "Install git (https://git-scm.com/downloads) and run again."
        );
      throw new RdLedgerError(
        "GIT_FAILED",
        `git ${args[0] ?? ""} failed: ${e.message}`,
        "Run the same git command yourself to see why.",
        true
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
          "Check that the folder is a git repository you can read, and run again."
        );
      return r.stdout;
    },
    tryRun(args) {
      const r = exec(args);
      return { status: r.status, stdout: r.stdout };
    }
  };
}
function parseRemote(url) {
  const u = url.trim();
  let host;
  let rest;
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
  const parts = rest.replace(/\.git\/?$/, "").replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const repo = parts[parts.length - 1];
  const owner = parts.slice(0, -1).join("/");
  if (!/^[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(owner)) return null;
  return { host: host.toLowerCase(), owner, repo };
}
function commitLink(remote, sha) {
  if (!remote) return null;
  const base = `https://${remote.host}/${remote.owner}/${remote.repo}`;
  if (remote.host === "github.com") return `${base}/commit/${sha}`;
  if (remote.host === "gitlab.com") return `${base}/-/commit/${sha}`;
  if (remote.host === "bitbucket.org") return `${base}/commits/${sha}`;
  return null;
}
function detectBase(git, asked) {
  const exists = (ref) => git.tryRun(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).status === 0;
  if (asked) {
    if (!exists(asked))
      throw new RdLedgerError(
        "BASE_NOT_FOUND",
        `no branch or commit named ${asked} in this repository`,
        "Pass the main branch with --base (e.g. --base main or --base origin/main), or leave it out to detect it."
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
function readRepo(dir, opts = {}) {
  const git = opts.git ?? gitAt(dir);
  const top = git.tryRun(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0)
    throw new RdLedgerError(
      "NOT_A_REPO",
      `no git repository at ${dir}`,
      "Run it inside a git repository, or pass the repository's folder as the first argument."
    );
  const root = top.stdout.trim();
  const head = git.tryRun(["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (head.status !== 0)
    throw new RdLedgerError(
      "EMPTY_REPO",
      "the repository has no commits yet",
      "Run it on a repository with history."
    );
  const shallow = git.run(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  const remotes = git.run(["remote"]).split("\n").map((s) => s.trim()).filter(Boolean);
  let remote = null;
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
    remotes
  };
}
var RS = "";
var US = "";
var END = "";
var FORMAT2 = `--format=${RS}%H${US}%P${US}%aN${US}%aE${US}%aI${US}%cI${US}%s${US}%b${END}`;
function sinceMargin(since) {
  const d = /* @__PURE__ */ new Date(`${since}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}
function parseLog(out) {
  const commits = [];
  for (const record of out.split(RS)) {
    if (!record.trim()) continue;
    const end = record.indexOf(END);
    if (end < 0) continue;
    const [sha, parents, author, email, authored, committed, subject, ...body] = record.slice(0, end).split(US);
    if (!sha || !authored) continue;
    const files = [];
    for (const line of record.slice(end + 1).split("\n")) {
      const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(line);
      if (!m) continue;
      const binary = m[1] === "-";
      files.push({
        path: m[3],
        added: binary ? 0 : Number(m[1]),
        deleted: binary ? 0 : Number(m[2]),
        binary
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
      files
    });
  }
  return commits;
}
function readCommits(git, since, until) {
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
    FORMAT2
  ]);
  return parseLog(out).filter((c) => {
    const day = c.authored.slice(0, 10);
    return day >= since && day <= until;
  });
}
function commitsOnBase(git, base, since) {
  return new Set(
    git.run(["rev-list", base, `--since=${sinceMargin(since)}`]).split("\n").map((s) => s.trim()).filter(Boolean)
  );
}
function rawChanges(out) {
  const changes = [];
  for (const line of out.split("\n")) {
    const m = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) [A-Z]\d*\t(.+)$/.exec(line);
    if (m) changes.push({ path: m[2], blob: m[1] });
  }
  return changes;
}
function unmergedBranches(git, base, since, remotes, limit = 300) {
  const refs = git.run([
    "for-each-ref",
    `--no-merged=${base}`,
    `--format=%(refname)${US}%(refname:short)${US}%(symref)`,
    "refs/heads",
    "refs/remotes"
  ]).split("\n").map((l) => l.split(US)).filter((p) => p[0] && !p[2]);
  const baseTree = git.run(["rev-parse", `${base}^{tree}`]).trim();
  let baseBlobs = null;
  const blobsOnBase = () => baseBlobs ??= new Set(
    rawChanges(
      git.run([
        "log",
        base,
        `--since=${sinceMargin(since)}`,
        "--raw",
        "--no-abbrev",
        "--no-renames",
        "--no-color",
        "--format="
      ])
    ).map((c) => `${c.path}\0${c.blob}`)
  );
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  let mergeTree = true;
  const local = new Set(refs.filter((p) => p[0].startsWith("refs/heads/")).map((p) => p[1]));
  for (const [ref, short] of refs) {
    if (out.length >= limit) return { branches: out, truncated: true, mergeTree };
    let name = short;
    if (ref.startsWith("refs/remotes/")) {
      const remote = remotes.find((r) => name.startsWith(`${r}/`));
      const bare = remote ? name.slice(remote.length + 1) : name;
      if (local.has(bare)) continue;
      name = remote === "origin" ? bare : name;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    const commits = git.run(["rev-list", ref, `^${base}`, `--since=${sinceMargin(since)}`]).split("\n").map((s) => s.trim()).filter(Boolean);
    if (commits.length === 0) continue;
    let absorbed = null;
    if (mergeTree) {
      const r = git.tryRun(["merge-tree", "--write-tree", base, ref]);
      if (r.status === 0) absorbed = r.stdout.split("\n")[0].trim() === baseTree;
      else if (r.status === 1) absorbed = false;
      else mergeTree = false;
    }
    if (absorbed !== true) {
      const mb = git.tryRun(["merge-base", base, ref]);
      if (mb.status === 0) {
        const changed = rawChanges(
          git.run([
            "diff",
            "--raw",
            "--no-abbrev",
            "--no-renames",
            "--no-color",
            mb.stdout.trim(),
            ref
          ])
        ).filter((c) => !GENERATED_FILE.test(c.path));
        if (changed.length > 0) {
          const on = blobsOnBase();
          const found = changed.filter((c) => on.has(`${c.path}\0${c.blob}`)).length;
          if (found / changed.length >= 0.9) absorbed = true;
        }
      }
    }
    out.push({ name, ref, commits, absorbed });
  }
  return { branches: out, truncated: false, mergeTree };
}

// src/csv.ts
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
function csvField(v) {
  if (v === null || v === void 0) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) {
  return cells.map(csvField).join(",");
}

// src/people.ts
var bad = (cause) => new RdLedgerError(
  "BAD_PEOPLE_FILE",
  cause,
  "Write a CSV with a header row: name,hours,hourly_rate,wages (email optional; leave a cell empty when you do not have the figure)."
);
function amount(cell2, what, row) {
  const s = (cell2 ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/[$£€,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0)
    throw bad(`row ${row}: ${what} ${JSON.stringify(s)} is not a number`);
  return n;
}
function parsePeople(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw bad("the people file is empty");
  const header = rows[0].map(
    (h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_")
  );
  const col = (...names) => header.findIndex((h) => names.includes(h));
  const name = col("name", "person", "employee");
  const email = col("email", "e_mail");
  const hours = col("hours", "hours_worked");
  const rate = col("hourly_rate", "rate", "hourly");
  const wages = col("wages", "w2_wages", "w_2_wages", "box_1", "salary");
  if (name < 0 && email < 0) throw bad("no name (or email) column in the header row");
  if (hours < 0 && wages < 0) throw bad("no hours or wages column in the header row");
  const out = [];
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const n = name >= 0 ? (r[name] ?? "").trim() : "";
    const e = email >= 0 ? (r[email] ?? "").trim().toLowerCase() : "";
    if (!n && !e) throw bad(`row ${row}: no name or email`);
    out.push({
      row,
      name: n,
      email: e || null,
      hours: hours >= 0 ? amount(r[hours], "hours", row) : null,
      hourlyRate: rate >= 0 ? amount(r[rate], "hourly_rate", row) : null,
      wages: wages >= 0 ? amount(r[wages], "wages", row) : null
    });
  });
  return out;
}
var norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
function matchFigures(figures, person) {
  const emails = new Set(person.emails.map((e) => e.toLowerCase()));
  return figures.find((f) => f.email !== null && emails.has(f.email)) ?? figures.find((f) => f.name !== "" && norm(f.name) === norm(person.name)) ?? null;
}
function basisOf(f) {
  if (f.wages !== null) return { hours: f.hours, amount: f.wages, basis: "wages as supplied" };
  if (f.hours !== null && f.hourlyRate !== null)
    return {
      hours: f.hours,
      amount: f.hours * f.hourlyRate,
      basis: "hours \xD7 hourly rate as supplied"
    };
  if (f.hours !== null) return { hours: f.hours, amount: null, basis: "hours as supplied" };
  return { hours: null, amount: null, basis: "no figures supplied" };
}

// src/sources.ts
var DISCLAIMER = "Evidence to review with your tax adviser; not tax advice.";
var SOURCES = [
  {
    label: "Treas. Reg. \xA71.41-4: the process of experimentation, (a)(5); records to substantiate the credit, (d)",
    url: "https://www.law.cornell.edu/cfr/text/26/1.41-4",
    read: "2026-10-09"
  },
  {
    label: "IRS, Instructions for Form 6765 (rev. 12/2025): Section G business components, required for tax years beginning after 2025",
    url: "https://www.irs.gov/instructions/i6765",
    read: "2026-10-09"
  },
  {
    label: "George v. Commissioner, T.C. Memo. 2026-10: records made during the work, not reconstructed studies (PKF O'Connor Davies, 9 Mar 2026)",
    url: "https://www.pkfod.com/insights/irs-rd-credit-audits-tax-court-reinforces-documentation-requirements/",
    read: "2026-10-09"
  },
  {
    label: "IRS: the qualified small business payroll tax election, up to $500,000 a year",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/qualified-small-business-payroll-tax-credit-for-increasing-research-activities",
    read: "2026-10-09"
  }
];

// src/waitlist.ts
var SITE = "https://agentwares.vercel.app";
var PAGES_URL = `${SITE}/rd-credit`;
var NOT_BUILT = "A year-round R&D evidence ledger, kept month by month as the work happens, is not built.";
var WAITLIST_OFFER = "Each month's evidence captured that month and kept under a date we hold, so the record shows when it existed; at year end, the hours or wages you enter allocated across your business components in Form 6765 Section G's shape; and a read-only link for your tax adviser.";
var WAITLIST_STATUS = "Not built. No price is set and nothing is charged. It gets built only if enough people ask.";
var WAITLIST_CLI_URL = `${SITE}/rd-credit/waitlist/cli`;
var WAITLIST_PAGE_URL = `${SITE}/rd-credit/waitlist`;

// src/scan.ts
var MERGE_FROM = /^Merge (?:branch|remote-tracking branch) '([^']+)'|^Merge pull request #\d+ from [^/\s]+\/(\S+)/;
var round = (n, places) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
function count(hits) {
  const out = {};
  for (const h of hits) out[h] = (out[h] ?? 0) + 1;
  return out;
}
function buildReport(input) {
  const { git, facts, period } = input;
  const raw = readCommits(git, period.since, period.until);
  const notes = [];
  if (facts.shallow)
    notes.push(
      "This is a shallow clone, so history before its cut-off is missing. In CI, check out with fetch-depth: 0."
    );
  const base = facts.base?.ref ?? null;
  let onBase = null;
  let branchInfo = null;
  if (base) {
    onBase = commitsOnBase(git, base, period.since);
    branchInfo = unmergedBranches(git, base, period.since, facts.remotes);
    if (branchInfo.truncated) notes.push("Only the first 300 unmerged branches were read.");
    if (!branchInfo.mergeTree)
      notes.push(
        "This git (older than 2.38) cannot tell a squash-merged branch from an unmerged one, so a squash-merged branch may show as unmerged."
      );
  } else
    notes.push(
      "No main branch was found (main, master, or the origin's default), so no commit is marked unmerged. Pass --base."
    );
  const mergedHeads = new Set(
    (input.prs?.prs ?? []).filter((p) => p.state === "merged").map((p) => p.headRef)
  );
  const branches = (branchInfo?.branches ?? []).map((b) => ({
    ...b,
    absorbed: b.absorbed === true || mergedHeads.has(b.name) ? true : b.absorbed
  }));
  const branchesOf = /* @__PURE__ */ new Map();
  for (const b of branches)
    for (const sha of b.commits) branchesOf.set(sha, [...branchesOf.get(sha) ?? [], b.name]);
  const spikeMerged = /* @__PURE__ */ new Map();
  for (const c of raw) {
    if (c.parents.length < 2) continue;
    const m = MERGE_FROM.exec(c.subject);
    const name = m?.[1] ?? m?.[2];
    if (!name || !isSpikeBranch(name)) continue;
    const out = git.tryRun(["rev-list", `${c.sha}^2`, `^${c.sha}^1`]);
    if (out.status !== 0) continue;
    for (const sha of out.stdout.split("\n").filter(Boolean))
      if (!spikeMerged.has(sha))
        spikeMerged.set(sha, `merged from branch ${name} in ${c.sha.slice(0, 7)}`);
  }
  const bySha = new Map(raw.map((c) => [c.sha, c]));
  const findSha = (s) => bySha.get(s) ?? (s.length < 40 ? raw.find((c) => c.sha.startsWith(s)) : void 0);
  const revertedBy = /* @__PURE__ */ new Map();
  for (const c of raw)
    if (isRevert(c.subject, c.body)) {
      const target = revertedSha(c.subject, c.body);
      const hit = target ? findSha(target) : void 0;
      if (hit) revertedBy.set(hit.sha, c);
    }
  const rows = raw.map((c) => {
    const merge = c.parents.length > 1;
    const bot = isBotIdentity(c.author, c.email);
    const signals = [];
    if (isRevert(c.subject, c.body)) {
      const target = revertedSha(c.subject, c.body);
      const hit = target ? findSha(target) : void 0;
      signals.push({
        id: "revert",
        evidence: hit ? `reverts ${hit.sha.slice(0, 7)} (${hit.authored.slice(0, 10)})` : target ? `reverts ${target.slice(0, 7)}, from before the period` : "a revert"
      });
    }
    const by = revertedBy.get(c.sha);
    if (by)
      signals.push({
        id: "reverted",
        evidence: `reverted by ${by.sha.slice(0, 7)} on ${by.authored.slice(0, 10)}`
      });
    const on = onBase ? onBase.has(c.sha) : null;
    const names = branchesOf.get(c.sha) ?? [];
    if (on === false) {
      const open = branches.filter((b) => names.includes(b.name) && b.absorbed !== true);
      if (open.length)
        signals.push({
          id: "unmerged",
          evidence: `only on branch ${open.map((b) => b.name).join(", ")}, never merged into ${base}`
        });
    }
    const spikes = names.filter(isSpikeBranch);
    if (spikes.length)
      signals.push({ id: "spike-branch", evidence: `on branch ${spikes.join(", ")}` });
    else if (spikeMerged.has(c.sha))
      signals.push({ id: "spike-branch", evidence: spikeMerged.get(c.sha) });
    if (!merge) {
      const words2 = isRevert(c.subject, c.body) ? messageSignals("", c.body) : messageSignals(c.subject, c.body);
      const size = rewriteSize(c.files);
      const rewriteWords = words2.find((w) => w.id === "rewrite");
      for (const w of words2) if (w.id !== "rewrite") signals.push(w);
      if (rewriteWords || size.lines >= 100)
        signals.push({
          id: "rewrite",
          evidence: [
            rewriteWords?.evidence,
            size.lines >= 100 ? `about ${size.lines} lines replaced in ${size.files} file(s)` : null
          ].filter(Boolean).join("; ")
        });
    }
    const routine = routineMarkers(c);
    const shares = merge ? [] : commitShares(c.files, input.components);
    return {
      sha: c.sha,
      short: c.sha.slice(0, 7),
      date: c.authored.slice(0, 10),
      author: c.author,
      email: input.withEmails ? c.email : null,
      subject: c.subject,
      merge,
      bot,
      onBase: on,
      branches: names.map(
        (n) => branches.find((b) => b.name === n)?.absorbed === true ? `${n} (merged by squash)` : n
      ),
      components: shares,
      added: c.files.reduce((n, f) => n + f.added, 0),
      deleted: c.files.reduce((n, f) => n + f.deleted, 0),
      signals,
      routine,
      agents: aiCoauthors(c.author, c.email, c.body),
      candidate: signals.length > 0 && !merge && !bot,
      link: commitLink(facts.remote, c.sha)
    };
  });
  const work = rows.filter((r) => !r.merge);
  const { people, allocation, matched } = peopleAndAllocation(work, raw, input);
  const components = componentRows(work);
  const unmatchedFigures = (input.people ?? []).filter((f) => !matched.has(f)).map((f) => f.name || f.email || `row ${f.row}`);
  const prRows = input.prs ? input.prs.prs.map((p) => ({
    number: p.number,
    created: p.created,
    state: p.state,
    merged: p.merged,
    author: p.author,
    title: p.title,
    labels: p.labels,
    signals: p.signals,
    components: p.files ? [...new Set(p.files.map((f) => componentOf(f, input.components)))] : [],
    link: p.url
  })) : null;
  const automation = [...countMap(rows.filter((r) => r.bot).map((r) => r.author)).entries()];
  return {
    tool: "rd-ledger",
    version: input.version,
    note: DISCLAIMER,
    generated: input.generated,
    repo: {
      name: facts.name,
      head: facts.head,
      base,
      baseReason: facts.base?.reason ?? null,
      host: facts.remote?.host ?? null,
      shallow: facts.shallow
    },
    period,
    totals: {
      commits: work.length,
      merges: rows.length - work.length,
      people: people.length,
      components: components.length,
      candidates: work.filter((r) => r.candidate).length,
      routine: work.filter((r) => !r.candidate && r.routine.length > 0).length,
      agentCoauthored: work.filter((r) => r.agents.length > 0).length,
      unmergedBranches: branches.filter((b) => b.absorbed !== true).length,
      prs: prRows ? prRows.length : null,
      prCandidates: prRows ? prRows.filter((p) => p.signals.length > 0).length : null
    },
    bySignal: count(work.filter((r) => r.candidate).flatMap((r) => r.signals.map((s) => s.id))),
    byRoutine: count(work.flatMap((r) => r.routine.map((s) => s.id))),
    components,
    people,
    automation: automation.map(([name, commits]) => ({ name, commits })).sort((a, b) => b.commits - a.commits),
    allocation,
    unmatchedFigures,
    branches: branches.map((b) => ({
      name: b.name,
      commits: b.commits.filter((s) => bySha.has(s)).length,
      absorbed: b.absorbed,
      spike: isSpikeBranch(b.name)
    })),
    prs: prRows,
    prNote: input.prs?.partial ?? null,
    commits: rows,
    notes,
    handoff: { notBuilt: NOT_BUILT, offer: WAITLIST_OFFER, status: WAITLIST_STATUS }
  };
}
function countMap(values) {
  const m = /* @__PURE__ */ new Map();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
var personKey = (c) => c.email.trim().toLowerCase() || c.author.trim().toLowerCase();
function identity(raws) {
  const newest = [...raws].sort((a, b) => b.authored.localeCompare(a.authored))[0];
  return { name: newest.author, emails: [...new Set(raws.map((c) => c.email))] };
}
function dayShares(rows) {
  const days = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.components.length === 0) continue;
    const day = days.get(r.date) ?? /* @__PURE__ */ new Map();
    for (const s of r.components) day.set(s.name, (day.get(s.name) ?? 0) + s.share);
    days.set(r.date, day);
  }
  for (const day of days.values()) {
    const total = [...day.values()].reduce((a, b) => a + b, 0);
    for (const [k, v] of day) day.set(k, v / total);
  }
  return days;
}
function componentSplit(rows) {
  const days = dayShares(rows);
  const sum = /* @__PURE__ */ new Map();
  for (const day of days.values()) for (const [k, v] of day) sum.set(k, (sum.get(k) ?? 0) + v);
  const n = days.size || 1;
  return [...sum.entries()].map(([name, v]) => ({ name, share: v / n })).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}
function groupPeople(work, raw) {
  const rawBySha = new Map(raw.map((c) => [c.sha, c]));
  const groups = /* @__PURE__ */ new Map();
  for (const r of work) {
    if (r.bot) continue;
    const c = rawBySha.get(r.sha);
    const key = personKey(c);
    const g = groups.get(key) ?? { rows: [], raws: [] };
    g.rows.push(r);
    g.raws.push(c);
    groups.set(key, g);
  }
  return groups;
}
function peopleAndAllocation(work, raw, input) {
  const people = [];
  const allocation = [];
  const matched = /* @__PURE__ */ new Set();
  const names = /* @__PURE__ */ new Map();
  const groups = [...groupPeople(work, raw).values()].sort(
    (a, b) => b.rows.length - a.rows.length || identity(a.raws).name.localeCompare(identity(b.raws).name)
  );
  for (const { rows, raws } of groups) {
    const who = identity(raws);
    const seen = names.get(who.name) ?? 0;
    names.set(who.name, seen + 1);
    const name = seen > 0 ? `${who.name} #${seen + 1}` : who.name;
    const days = [...new Set(rows.map((r) => r.date))].sort();
    const split = componentSplit(rows);
    const figures = input.people ? matchFigures(input.people, who) : null;
    if (figures) {
      matched.add(figures);
      const { hours, amount: amount2, basis } = basisOf(figures);
      for (const c of split)
        allocation.push({
          name,
          component: c.name,
          share: round(c.share, 4),
          hours: hours === null ? null : round(hours * c.share, 1),
          amount: amount2 === null ? null : round(amount2 * c.share, 2),
          basis
        });
    }
    people.push({
      name,
      email: input.withEmails ? raws.find((c) => c.author === who.name)?.email ?? null : null,
      commits: rows.length,
      activeDays: days.length,
      first: days[0],
      last: days[days.length - 1],
      months: new Set(days.map((d) => d.slice(0, 7))).size,
      components: split.map((c) => ({ name: c.name, share: round(c.share, 4) })),
      candidates: rows.filter((r) => r.candidate).length,
      agentCoauthored: rows.filter((r) => r.agents.length > 0).length,
      figures: figures ? { hours: figures.hours, hourlyRate: figures.hourlyRate, wages: figures.wages } : null
    });
  }
  return { people, allocation: input.people ? allocation : null, matched };
}
function componentRows(work) {
  const m = /* @__PURE__ */ new Map();
  for (const r of work)
    for (const s of r.components) {
      const e = m.get(s.name) ?? { rows: [], lines: 0 };
      e.rows.push(r);
      e.lines += s.lines;
      m.set(s.name, e);
    }
  return [...m.entries()].map(([name, { rows, lines }]) => {
    const days = rows.map((r) => r.date).sort();
    return {
      name,
      commits: rows.length,
      candidates: rows.filter((r) => r.candidate).length,
      routine: rows.filter((r) => !r.candidate && r.routine.length > 0).length,
      people: new Set(rows.filter((r) => !r.bot).map((r) => r.author)).size,
      first: days[0],
      last: days[days.length - 1],
      months: new Set(days.map((d) => d.slice(0, 7))).size,
      lines,
      signals: count(rows.filter((r) => r.candidate).flatMap((r) => r.signals.map((s) => s.id)))
    };
  }).sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}

// src/period.ts
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function isDate(s) {
  if (!DATE.test(s)) return false;
  const d = /* @__PURE__ */ new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
var bad2 = (cause, fix) => new RdLedgerError("BAD_PERIOD", cause, fix);
function monthEnd(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function previousMonth(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}
function resolvePeriod(input, now) {
  const given = [
    input.year !== void 0,
    input.month !== void 0,
    input.since !== void 0 || input.until !== void 0
  ].filter(Boolean).length;
  if (given > 1)
    throw bad2(
      "give one of --year, --month, or --since/--until",
      "Pick one way to name the period, e.g. --year 2026."
    );
  const today = now.toISOString().slice(0, 10);
  if (input.year !== void 0) {
    if (!Number.isInteger(input.year) || input.year < 1990 || input.year > 2100)
      throw bad2(`--year ${String(input.year)} is not a year`, "Write it like --year 2026.");
    return {
      since: `${input.year}-01-01`,
      until: `${input.year}-12-31`,
      reason: `the calendar year ${input.year}`
    };
  }
  if (input.month !== void 0) {
    const m = input.month === "previous" ? previousMonth(now) : input.month;
    if (!MONTH.test(m))
      throw bad2(`--month ${input.month} is not a month`, "Write it like --month 2026-09.");
    return {
      since: `${m}-01`,
      until: monthEnd(m),
      reason: input.month === "previous" ? `last month, ${m}` : `the month ${m}`
    };
  }
  if (input.since !== void 0 || input.until !== void 0) {
    for (const [flag, v] of [
      ["--since", input.since],
      ["--until", input.until]
    ])
      if (v !== void 0 && !isDate(v))
        throw bad2(`${flag} ${v} is not a date`, `Write it like ${flag} 2026-01-01.`);
    const since = input.since ?? `${(input.until ?? today).slice(0, 4)}-01-01`;
    const until = input.until ?? today;
    if (since > until)
      throw bad2(`--since ${since} is after --until ${until}`, "Swap them, or fix one.");
    return {
      since,
      until,
      reason: input.since && input.until ? `the dates given, ${since} to ${until}` : input.since ? `from ${since} to today` : `the year to ${until}`
    };
  }
  const year = now.getUTCFullYear();
  if (now.getUTCMonth() <= 3)
    return {
      since: `${year - 1}-01-01`,
      until: `${year - 1}-12-31`,
      reason: `no period given; January to April defaults to last year, ${year - 1}, the year being filed (--year to choose)`
    };
  return {
    since: `${year}-01-01`,
    until: today,
    reason: `no period given; the year ${year} to date (--year ${year - 1} for last year)`
  };
}

// src/github.ts
var API = "https://api.github.com";
var TOKEN_ENVS = ["GITHUB_TOKEN", "GH_TOKEN"];
function tokenFrom(env) {
  for (const k of TOKEN_ENVS) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return null;
}
async function readPullRequests(opts) {
  const max = opts.maxRequests ?? 200;
  let requests = 0;
  let remaining = Infinity;
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "rd-ledger"
  };
  const get = async (pathAndQuery) => {
    if (remaining < 2)
      throw new RdLedgerError(
        "RATE_LIMITED",
        "GitHub's rate limit for this token is nearly spent",
        "Wait for the hourly reset and run again, or run without --prs.",
        true
      );
    requests++;
    const res = await opts.fetch(`${API}${pathAndQuery}`, { headers });
    const left = res.headers.get("x-ratelimit-remaining");
    if (left !== null && /^\d+$/.test(left)) remaining = Number(left);
    if (res.status === 401)
      throw new RdLedgerError(
        "TOKEN_REJECTED",
        "GitHub rejected the token (401)",
        "Check GITHUB_TOKEN or GH_TOKEN: it needs read access to the repository's pull requests."
      );
    if (res.status === 403 || res.status === 429) {
      if (remaining === 0 || res.status === 429)
        throw new RdLedgerError(
          "RATE_LIMITED",
          `GitHub answered ${res.status}: the rate limit is spent`,
          "Wait for the hourly reset and run again, or run without --prs.",
          true
        );
      throw new RdLedgerError(
        "FORBIDDEN",
        "GitHub answered 403: the token may not read this repository's pull requests",
        "Use a token with read access to pull requests on this repository."
      );
    }
    if (res.status === 404)
      throw new RdLedgerError(
        "REPO_NOT_FOUND",
        `GitHub has no repository ${opts.owner}/${opts.repo} that this token can read`,
        "Check --repo owner/name, or that the token can read the repository."
      );
    if (res.status >= 500)
      throw new RdLedgerError(
        "GITHUB_UNAVAILABLE",
        `GitHub answered ${res.status}`,
        "Run again in a few minutes.",
        true
      );
    if (res.status !== 200)
      throw new RdLedgerError(
        "GITHUB_ERROR",
        `GitHub answered ${res.status}`,
        "Run again; if it repeats, run without --prs."
      );
    return res.json();
  };
  const repoPath = `/repos/${encodeURIComponent(opts.owner).replace(/%2F/g, "/")}/${encodeURIComponent(opts.repo)}`;
  const prs = [];
  let partial = null;
  for (let page = 1; ; page++) {
    if (requests >= max) {
      partial = `stopped after ${requests} requests (the cap); older pull requests in the period were not read`;
      break;
    }
    const batch = await get(
      `${repoPath}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`
    );
    if (!Array.isArray(batch)) break;
    let older = false;
    for (const p of batch) {
      const created = p.created_at.slice(0, 10);
      if (created < opts.since) {
        older = true;
        continue;
      }
      if (created > opts.until) continue;
      const state = p.merged_at ? "merged" : p.state === "closed" ? "closed-unmerged" : "open";
      const labels = p.labels.map((l) => l.name);
      const signals = [];
      if (state === "closed-unmerged")
        signals.push({
          id: "pr-closed-unmerged",
          evidence: `closed ${p.closed_at?.slice(0, 10) ?? ""} without merging`.trim()
        });
      const spikeLabels = labels.filter(isSpikeLabel);
      if (spikeLabels.length)
        signals.push({
          id: "pr-label",
          evidence: `labelled ${spikeLabels.map((l) => `"${l}"`).join(", ")}`
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
        files: null
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
    const files = await get(`${repoPath}/pulls/${pr.number}/files?per_page=100`);
    pr.files = Array.isArray(files) ? files.map((f) => f.filename) : [];
  }
  return { prs, requests, partial };
}

// src/render.ts
import { createHash } from "crypto";
var pct = (share) => `${Math.round(share * 100)}%`;
var num = (n) => n.toLocaleString("en-US");
var money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function packDir(report) {
  return `rd-ledger-${report.period.since}-to-${report.period.until}`;
}
function preamble(report) {
  return `# rd-ledger ${report.version} \xB7 ${report.repo.name} \xB7 ${report.period.since} to ${report.period.until} \xB7 generated ${report.generated} \xB7 ${DISCLAIMER}`;
}
var signalList = (r) => r.signals.map((s) => s.id).join("; ");
var evidenceList = (r) => r.signals.map((s) => `${s.id}: ${s.evidence}`).join("; ");
var componentList = (r) => r.components.map((c) => `${c.name} ${pct(c.share)}`).join("; ");
function renderCsvs(report) {
  const withEmail = report.commits.some((c) => c.email !== null);
  const files = {};
  const lines = (header, rows) => [preamble(report), csvRow(header), ...rows.map(csvRow)].join("\n") + "\n";
  files["commits.csv"] = lines(
    [
      "date",
      "sha",
      "author",
      ...withEmail ? ["email"] : [],
      "components",
      "lines_added",
      "lines_deleted",
      "on_main_branch",
      "branches",
      "candidate",
      "signals",
      "routine",
      "ai_coauthors",
      "merge",
      "subject",
      "link"
    ],
    report.commits.map((c) => [
      c.date,
      c.sha,
      c.author,
      ...withEmail ? [c.email] : [],
      componentList(c),
      c.added,
      c.deleted,
      c.onBase === null ? "unknown" : c.onBase ? "yes" : "no",
      c.branches.join("; "),
      c.candidate ? "yes" : "no",
      signalList(c),
      c.routine.map((r) => r.id).join("; "),
      c.agents.join("; "),
      c.merge ? "yes" : "no",
      c.subject,
      c.link
    ])
  );
  const candidateRows = [];
  for (const c of report.commits.filter((x) => x.candidate))
    for (const s of c.signals)
      candidateRows.push([
        "commit",
        c.date,
        c.short,
        c.author,
        c.components[0]?.name ?? "",
        s.id,
        s.evidence,
        c.routine.map((r) => r.id).join("; "),
        c.subject,
        c.link
      ]);
  for (const p of report.prs ?? [])
    for (const s of p.signals)
      candidateRows.push([
        "pull request",
        p.created,
        `#${p.number}`,
        p.author,
        p.components[0] ?? "",
        s.id,
        s.evidence,
        "",
        p.title,
        p.link
      ]);
  files["candidates.csv"] = lines(
    [
      "kind",
      "date",
      "id",
      "author",
      "component",
      "signal",
      "evidence",
      "routine",
      "subject",
      "link"
    ],
    candidateRows
  );
  files["components.csv"] = lines(
    [
      "component",
      "commits",
      "candidate_commits",
      "likely_routine_commits",
      "people",
      "first",
      "last",
      "months_active",
      "lines_changed",
      "signals",
      "section_g_type",
      "software_type",
      "adviser_notes"
    ],
    report.components.map((c) => [
      c.name,
      c.commits,
      c.candidates,
      c.routine,
      c.people,
      c.first,
      c.last,
      c.months,
      c.lines,
      Object.entries(c.signals).map(([k, v]) => `${k} ${v}`).join("; "),
      "",
      "",
      ""
    ])
  );
  files["people.csv"] = lines(
    [
      "name",
      ...withEmail ? ["email"] : [],
      "commits",
      "active_days",
      "first",
      "last",
      "months_active",
      "components_by_commit_days",
      "candidate_commits",
      "ai_coauthored_commits",
      "hours_supplied",
      "hourly_rate_supplied",
      "wages_supplied"
    ],
    report.people.map((p) => [
      p.name,
      ...withEmail ? [p.email] : [],
      p.commits,
      p.activeDays,
      p.first,
      p.last,
      p.months,
      p.components.map((c) => `${c.name} ${pct(c.share)}`).join("; "),
      p.candidates,
      p.agentCoauthored,
      p.figures?.hours ?? null,
      p.figures?.hourlyRate ?? null,
      p.figures?.wages ?? null
    ])
  );
  if (report.allocation)
    files["allocation.csv"] = lines(
      ["name", "component", "share_of_commit_days", "hours", "amount", "basis"],
      report.allocation.map((a) => [
        a.name,
        a.component,
        a.share,
        a.hours,
        a.amount === null ? null : a.amount.toFixed(2),
        `${a.basis}; an allocation by commit activity, not a time record`
      ])
    );
  if (report.prs)
    files["prs.csv"] = lines(
      [
        "number",
        "created",
        "state",
        "merged",
        "author",
        "labels",
        "components",
        "signals",
        "title",
        "link"
      ],
      report.prs.map((p) => [
        p.number,
        p.created,
        p.state,
        p.merged,
        p.author,
        p.labels.join("; "),
        p.components.join("; "),
        evidenceList(p),
        p.title,
        p.link
      ])
    );
  return files;
}
var sha256 = (text) => createHash("sha256").update(text).digest("hex");
var cell = (s) => s.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function mdTable(header, rows) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)
  ].join("\n");
}
function figuresText(p) {
  const f = p.figures;
  if (!f || f.hours === null && f.wages === null && f.hourlyRate === null) return "not supplied";
  const parts = [];
  if (f.hours !== null) parts.push(`${num(f.hours)} h`);
  if (f.hourlyRate !== null) parts.push(`at ${money(f.hourlyRate)}/h`);
  if (f.wages !== null) parts.push(`wages ${money(f.wages)}`);
  return parts.join(" ");
}
var commitRef = (c) => c.link ? `[\`${c.short}\`](${c.link})` : `\`${c.short}\``;
function renderMarkdown(report, csvs) {
  const t = report.totals;
  const out = [];
  out.push(
    `# R&D evidence pack: ${report.repo.name}, ${report.period.since} to ${report.period.until}`
  );
  out.push("");
  out.push(`> **${DISCLAIMER}**`);
  out.push(">");
  out.push(
    `> Generated ${report.generated} by rd-ledger ${report.version} from the git history at \`${report.repo.head.slice(0, 7)}\`${report.repo.base ? `, main branch \`${report.repo.base}\` (${report.repo.baseReason})` : ""}. Period: ${report.period.reason}.`
  );
  out.push("");
  out.push("## What this is");
  out.push("");
  out.push(
    "An index of the commits made in the period, written as the work happened, grouped into components, with the commits that look like experimentation marked as candidate evidence. Each line names its commit, so every statement here can be checked against the repository itself."
  );
  out.push("");
  out.push(
    "It does not decide whether any work qualifies for a research credit. The four-part test (IRC \xA741(d)), the internal-use software rules, the exclusions in \xA741(d)(4) and the business components are your tax adviser's to apply. A folder is a stand-in for a business component; rename or merge them with `--component`. No hours or amounts were estimated from commits."
  );
  out.push("");
  out.push("## Summary");
  out.push("");
  const summary = [
    ["Period", `${report.period.since} to ${report.period.until}`],
    ["Commits (merges apart)", num(t.commits)],
    ["Merge commits", num(t.merges)],
    ["People", num(t.people)],
    ["Components", num(t.components)],
    ["Candidate commits", num(t.candidates)],
    ["Likely routine commits", num(t.routine)],
    ["Commits with an AI co-author", num(t.agentCoauthored)],
    ["Branches never merged", num(t.unmergedBranches)]
  ];
  if (t.prs !== null)
    summary.push([
      "Pull requests created in the period",
      `${num(t.prs)} (${num(t.prCandidates ?? 0)} flagged)`
    ]);
  if (report.automation.length)
    summary.push([
      "Automation accounts",
      report.automation.map((a) => `${a.name} (${a.commits})`).join(", ")
    ]);
  out.push(
    mdTable(
      ["", ""],
      summary.map(([a, b]) => [a, b])
    )
  );
  out.push("");
  out.push("## Components");
  out.push("");
  out.push(
    mdTable(
      ["Component", "Commits", "Candidates", "Likely routine", "People", "First", "Last", "Months"],
      report.components.map((c) => [
        c.name,
        num(c.commits),
        num(c.candidates),
        num(c.routine),
        num(c.people),
        c.first,
        c.last,
        num(c.months)
      ])
    )
  );
  out.push("");
  out.push(
    "Folders stand in for business components. Form 6765 Section G asks, per component, for its type (Product, Process or All Others), for software whether it is internal-use, and for wages, supplies and contract research: `components.csv` leaves those columns for your adviser."
  );
  out.push("");
  out.push("## Candidate evidence of experimentation, by component");
  out.push("");
  const candidates = report.commits.filter((c) => c.candidate);
  if (candidates.length === 0) out.push("No commit in the period matched a rule.");
  for (const comp of report.components.filter((c) => c.candidates > 0)) {
    out.push(`### ${comp.name}`);
    out.push("");
    const mine = candidates.filter((c) => c.components[0]?.name === comp.name);
    const shown = mine.slice(0, 40);
    for (const c of shown)
      out.push(
        `- ${c.date} ${commitRef(c)} ${cell(c.author)}: ${cell(c.subject)}. _${c.signals.map((s) => `${s.id} (${cell(s.evidence)})`).join("; ")}_`
      );
    if (mine.length > shown.length)
      out.push(`- \u2026and ${mine.length - shown.length} more in \`candidates.csv\`.`);
    if (mine.length === 0)
      out.push("- Candidate commits here mostly changed other components; see `candidates.csv`.");
    out.push("");
  }
  const flaggedPrs = (report.prs ?? []).filter((p) => p.signals.length > 0);
  if (report.prs) {
    out.push("### Pull requests");
    out.push("");
    if (flaggedPrs.length === 0) out.push("No pull request created in the period matched a rule.");
    for (const p of flaggedPrs.slice(0, 60))
      out.push(
        `- ${p.created} [#${p.number}](${p.link}) ${cell(p.author)}: ${cell(p.title)} (${p.state}). _${p.signals.map((s) => `${s.id} (${cell(s.evidence)})`).join("; ")}_`
      );
    if (report.prNote) out.push(`- ${report.prNote}.`);
    out.push("");
  }
  out.push("## People");
  out.push("");
  out.push(
    mdTable(
      [
        "Person",
        "Commits",
        "Active days",
        "First",
        "Last",
        "Months",
        "Main components",
        "Candidates",
        "AI co-authored",
        "Figures (supplied)"
      ],
      report.people.map((p) => [
        p.name,
        num(p.commits),
        num(p.activeDays),
        p.first,
        p.last,
        num(p.months),
        p.components.slice(0, 3).map((c) => `${c.name} ${pct(c.share)}`).join(", "),
        num(p.candidates),
        num(p.agentCoauthored),
        figuresText(p)
      ])
    )
  );
  out.push("");
  out.push(
    "Active days are the days a person committed, by their own clock. They say when someone worked on the code, not for how long. A commit with an AI co-author was written with an agent; agent work is not wages, and how the person's time counts is for your adviser."
  );
  out.push("");
  if (report.allocation) {
    out.push("## Allocation of the figures you supplied");
    out.push("");
    out.push(
      "Each person's hours or wages, from your people file, split across components by their commit-days (each day they committed counts once, divided among the components that day's commits changed). **An allocation by commit activity, not a time record.**"
    );
    out.push("");
    out.push(
      mdTable(
        ["Person", "Component", "Share", "Hours", "Amount", "Basis"],
        report.allocation.map((a) => [
          a.name,
          a.component,
          pct(a.share),
          a.hours === null ? "" : num(a.hours),
          a.amount === null ? "" : money(a.amount),
          a.basis
        ])
      )
    );
    out.push("");
    const without = report.people.filter((p) => p.figures === null).map((p) => p.name);
    if (without.length)
      out.push(`No figures were supplied for ${without.join(", ")}, so none are shown.`);
    if (report.unmatchedFigures.length)
      out.push(
        `The people file names ${report.unmatchedFigures.join(", ")}, who made no commit in the period.`
      );
    if (without.length || report.unmatchedFigures.length) out.push("");
  }
  out.push("## Likely routine work (for your adviser to exclude)");
  out.push("");
  const routine = ROUTINE.map(
    (r) => [r.id, r.shows, num(report.byRoutine[r.id] ?? 0)]
  ).filter((r) => r[2] !== "0");
  if (routine.length === 0) out.push("No commit carried a routine marker.");
  else out.push(mdTable(["Marker", "What it shows", "Commits"], routine));
  out.push("");
  out.push(
    "Markers never remove a commit: a candidate that also carries one is listed with both, in `commits.csv`."
  );
  out.push("");
  if (report.branches.length) {
    out.push("## Branches never merged into the main branch");
    out.push("");
    out.push(
      mdTable(
        ["Branch", "Commits in the period", "Status"],
        report.branches.map((b) => [
          b.name,
          num(b.commits),
          b.absorbed === true ? "its changes are already on the main branch (squash-merged or cherry-picked)" : b.spike ? "never merged; named as an experiment" : "never merged"
        ])
      )
    );
    out.push("");
  }
  out.push("## What the rules look for");
  out.push("");
  out.push(
    mdTable(
      ["Rule", "What the record shows", "What it may help your adviser document", "Weight"],
      SIGNALS.map((s) => [s.id, s.shows, s.element, s.strength])
    )
  );
  out.push("");
  out.push(
    'Treas. Reg. \xA71.41-4(a)(5) describes a process of experimentation as one "designed to evaluate one or more alternatives". The rules find records that may show one; whether they do is a judgment for your adviser.'
  );
  out.push("");
  out.push("## Method and limits");
  out.push("");
  const method = [
    "Commits are read from the repository's local and remote-tracking branches, and placed in the period by the author's own date.",
    "Dates in git are written by the committer's machine. The hosting service's record of pushes and pull requests is the stronger timestamp; `--prs` reads GitHub's.",
    "A branch whose changes are already on the main branch is not counted as unmerged: merging it would change nothing, or at least 90% of the files it changed reached the main branch in the same versions (a squash merge or a cherry-pick). A branch squashed with its files edited on the way in may still show as unmerged; `--prs` settles it from GitHub's record.",
    `Commit messages carry the rules' words only when people wrote them; a team that writes "wip" leaves little to find.`,
    "Lockfiles and other generated files do not count towards a commit's components.",
    ...report.notes
  ];
  for (const m of method) out.push(`- ${m}`);
  out.push("");
  out.push("Rules and forms this pack is shaped by, as read:");
  out.push("");
  for (const s of SOURCES) out.push(`- [${s.label}](${s.url}), read ${s.read}`);
  out.push("");
  out.push("## Files");
  out.push("");
  out.push(
    mdTable(
      ["File", "SHA-256"],
      Object.entries(csvs).map(([name, text]) => [name, `\`${sha256(text)}\``])
    )
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push(`**${report.handoff.notBuilt}** ${report.handoff.offer} ${report.handoff.status}`);
  out.push("");
  return out.join("\n");
}
function textTable(header, rows, right) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (r) => "  " + r.map((c, i) => right.has(i) ? c.padStart(widths[i]) : c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(header), ...rows.map(line)];
}
function renderText(report, opts) {
  const t = report.totals;
  const out = [];
  out.push(
    `rd-ledger ${report.version} \xB7 ${report.repo.name} \xB7 ${report.period.since} to ${report.period.until}`
  );
  out.push(`Period: ${report.period.reason}.`);
  out.push(DISCLAIMER);
  out.push("");
  const bots = report.automation.reduce((n, a) => n + a.commits, 0);
  out.push(
    `  ${num(t.commits)} commits across ${num(t.components)} component${t.components === 1 ? "" : "s"} by ${num(t.people)} ${t.people === 1 ? "person" : "people"}${bots ? ` and ${report.automation.length} automation account${report.automation.length === 1 ? "" : "s"}` : ""}${t.merges ? `, plus ${num(t.merges)} merge commit${t.merges === 1 ? "" : "s"}` : ""}`
  );
  out.push(
    `  ${num(t.candidates)} candidate commits \xB7 ${num(t.routine)} likely routine \xB7 ${num(t.agentCoauthored)} with an AI co-author \xB7 ${num(t.unmergedBranches)} branch${t.unmergedBranches === 1 ? "" : "es"} never merged`
  );
  if (t.prs !== null)
    out.push(
      `  ${num(t.prs)} pull requests created in the period, ${num(t.prCandidates ?? 0)} flagged`
    );
  out.push("");
  if (report.components.length) {
    out.push(
      ...textTable(
        ["Component", "Commits", "Candidates", "People", "First", "Last"],
        report.components.slice(0, 12).map((c) => [c.name, num(c.commits), num(c.candidates), num(c.people), c.first, c.last]),
        /* @__PURE__ */ new Set([1, 2, 3])
      )
    );
    if (report.components.length > 12)
      out.push(`  \u2026and ${report.components.length - 12} more in components.csv`);
    out.push("");
  }
  const order = SIGNALS.map((s) => s.id).filter((id) => (report.bySignal[id] ?? 0) > 0);
  if (order.length) {
    out.push(
      `  Candidates by rule: ${order.map((id) => `${id} ${num(report.bySignal[id])}`).join(", ")}`
    );
    out.push("");
  }
  if (report.people.length) {
    out.push(
      ...textTable(
        ["Person", "Commits", "Active days", "First", "Last", "Candidates", "Figures (yours)"],
        report.people.slice(0, 12).map((p) => [
          p.name,
          num(p.commits),
          num(p.activeDays),
          p.first,
          p.last,
          num(p.candidates),
          p.figures ? figuresText(p) : "-"
        ]),
        /* @__PURE__ */ new Set([1, 2, 5])
      )
    );
    if (report.people.length > 12)
      out.push(`  \u2026and ${report.people.length - 12} more in people.csv`);
    out.push("");
  }
  for (const n of report.notes) out.push(`  Note: ${n}`);
  if (report.unmatchedFigures.length)
    out.push(
      `  Note: the people file names ${report.unmatchedFigures.join(", ")}, who made no commit in the period.`
    );
  if (report.prNote) out.push(`  Note: pull requests ${report.prNote}.`);
  if (report.notes.length || report.unmatchedFigures.length || report.prNote) out.push("");
  if (opts.wrote) {
    out.push(`  Wrote ${opts.wrote.dir}/: ${opts.wrote.files.join(", ")}`);
    out.push("");
  }
  if (opts.waitlist) {
    out.push(report.handoff.notBuilt);
    out.push(`If you want it: ${WAITLIST_CLI_URL}`);
  }
  return out.join("\n") + "\n";
}

// src/mcp.ts
import { readFileSync as readFileSync2, statSync } from "fs";
import path2 from "path";
import { createInterface } from "readline";

// src/install.ts
var ON_NPM = false;
var NAME = "rd-ledger";
var REPO = `https://github.com/agentwares/${NAME}`;
var INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;
var RUN = ON_NPM ? `npx -y ${NAME}@latest` : `npx -y --allow-git=root github:agentwares/${NAME}`;
var ACTION = `agentwares/${NAME}@main`;

// src/version.ts
import { readFileSync } from "fs";
var cached;
function version() {
  if (cached !== void 0) return cached;
  try {
    cached = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

// src/mcp.ts
var DATE2 = "^\\d{4}-\\d{2}-\\d{2}$";
var TOOLS = [
  {
    name: "rd_ledger_scan",
    title: "R&D tax-credit evidence from a git repository",
    description: "Reads a git repository on this machine for a period (a tax year by default) and returns what its history shows as evidence for an R&D tax credit (US IRC \xA741, Form 6765): the commits grouped into components (workspace or top-level folders, or the user's own Name=glob rules); each person's commits, active days and first and last dates, by name; the commits that look like experimentation as candidate evidence, each with the rule that matched and its evidence (reverts and reverted commits, commits only on branches never merged into the main branch, branches named spike or experiment, messages naming experiments, prototypes, benchmarks, alternatives tried, approaches abandoned, large rewrites); likely-routine markers for the adviser to exclude (dependency bumps, formatting, docs-only, CI-only, releases, bots, merges); and AI co-authors per commit. With people_path, it splits the hours or wages that file gives across components by each person's commit-days; it never estimates hours from commits. It does not decide whether anything qualifies: say that the output is evidence to review with a tax adviser, not tax advice. Local and read-only: runs git, reads files, no network, writes nothing.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          minLength: 1,
          description: "The repository's folder (or any folder inside it). Absolute, or relative to the server's working directory."
        },
        year: {
          type: "integer",
          minimum: 1990,
          maximum: 2100,
          description: "A calendar tax year, e.g. 2026. Omit year, month, since and until for the default: last year from January to April, otherwise this year to date."
        },
        month: {
          type: "string",
          pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
          description: "One month instead of a year, e.g. 2026-09."
        },
        since: {
          type: "string",
          pattern: DATE2,
          description: "First day of a custom period (a fiscal year), YYYY-MM-DD."
        },
        until: {
          type: "string",
          pattern: DATE2,
          description: "Last day of a custom period, YYYY-MM-DD. Omitted with since: today."
        },
        base: {
          type: "string",
          minLength: 1,
          description: "The main branch that work is merged into, e.g. main or origin/main. Omitted: the origin's default branch, else main or master."
        },
        components: {
          type: "array",
          maxItems: 50,
          items: { type: "string", minLength: 3 },
          description: `The user's own components, each "Name=glob,glob" (e.g. "Route optimizer=apps/router/**,packages/geo/**"). Files no rule matches fall back to folders.`
        },
        people_path: {
          type: "string",
          minLength: 1,
          description: "A CSV the user keeps with columns name (or email), hours, hourly_rate and wages for the period, as their own records say. Only these figures are allocated; nothing is estimated."
        },
        max_commits: {
          type: "integer",
          minimum: 1,
          maximum: 1e3,
          description: "How many commit rows to return, candidates first. Omitted: 200. The counts always cover every commit."
        }
      },
      required: ["path"],
      additionalProperties: false
    },
    annotations: {
      title: "R&D tax-credit evidence from a git repository",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "rd_ledger_signals",
    title: "The rules rd-ledger applies to commits",
    description: "Lists every rule rd_ledger_scan applies: the candidate-evidence rules (what each shows in the record, the part of the four-part test of IRC \xA741(d) it may help a tax adviser document, and its weight) and the likely-routine markers. Use it to explain a scan's results. No input; reads nothing.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: {
      title: "The rules rd-ledger applies to commits",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];
var invalid = (cause, fix) => {
  throw new RdLedgerError("INVALID_INPUT", cause, fix);
};
function checkArgs(tool, raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    invalid(
      "arguments must be an object",
      `Pass ${tool.inputSchema.required.join(" and ") || "{}"}.`
    );
  const a = raw;
  const props = tool.inputSchema.properties;
  for (const k of Object.keys(a))
    if (!props[k])
      invalid(
        `unknown argument \`${k}\``,
        Object.keys(props).length ? `Use only: ${Object.keys(props).join(", ")}.` : "Pass {}."
      );
  for (const k of tool.inputSchema.required)
    if (a[k] === void 0) invalid(`\`${k}\` is required`, `Pass ${k}.`);
  for (const [k, v] of Object.entries(a)) {
    const spec = props[k];
    if (spec.type === "string") {
      if (typeof v !== "string" || v === "")
        invalid(`\`${k}\` must be a non-empty string`, String(spec.description));
      if (typeof spec.pattern === "string" && !new RegExp(spec.pattern).test(v))
        invalid(
          `\`${k}\` ${JSON.stringify(v)} is not in the expected form`,
          String(spec.description)
        );
    } else if (spec.type === "integer") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < spec.minimum || v > spec.maximum)
        invalid(
          `\`${k}\` must be a whole number from ${String(spec.minimum)} to ${String(spec.maximum)}`,
          String(spec.description)
        );
    } else if (spec.type === "array") {
      if (!Array.isArray(v) || v.length > spec.maxItems || v.some((x) => typeof x !== "string" || x.length < 3))
        invalid(`\`${k}\` must be a list of "Name=glob,glob" strings`, String(spec.description));
    }
  }
  return a;
}
var prioritise = (rows, max) => [...rows.filter((r) => r.candidate), ...rows.filter((r) => !r.candidate)].slice(0, max);
function callTool(name, rawArgs, ctx = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  try {
    const a = checkArgs(tool, rawArgs ?? {});
    if (name === "rd_ledger_signals")
      return {
        structured: { note: DISCLAIMER, signals: SIGNALS, routine: ROUTINE },
        isError: false
      };
    const cwd = ctx.cwd ?? process.cwd();
    const dir = path2.resolve(cwd, a.path);
    try {
      if (!statSync(dir).isDirectory()) throw new Error("not a folder");
    } catch {
      throw new RdLedgerError(
        "NOT_A_REPO",
        `no folder at ${dir}`,
        "Pass the repository's folder; relative paths resolve against the server's working directory."
      );
    }
    const now = ctx.now?.() ?? /* @__PURE__ */ new Date();
    const period = resolvePeriod(
      {
        year: a.year,
        month: a.month,
        since: a.since,
        until: a.until
      },
      now
    );
    const components = (a.components ?? []).map(parseComponentFlag);
    let people = null;
    if (typeof a.people_path === "string") {
      const file = path2.resolve(cwd, a.people_path);
      let text;
      try {
        text = readFileSync2(file, "utf8");
      } catch {
        throw new RdLedgerError(
          "FILE_NOT_FOUND",
          `no file at ${file}`,
          "Pass the people CSV's path; relative paths resolve against the server's working directory."
        );
      }
      people = parsePeople(text);
    }
    const git = gitAt(dir);
    const facts = readRepo(dir, { base: a.base, git });
    const report = buildReport({
      git,
      facts,
      period,
      components,
      people,
      prs: null,
      withEmails: false,
      generated: now.toISOString().slice(0, 10),
      version: version()
    });
    const max = a.max_commits ?? 200;
    const quote = (s) => JSON.stringify(s);
    const flags = [
      quote(a.path),
      `--since ${period.since}`,
      `--until ${period.until}`,
      ...typeof a.base === "string" ? [`--base ${quote(a.base)}`] : [],
      ...(a.components ?? []).map((c) => `--component ${quote(c)}`),
      ...typeof a.people_path === "string" ? [`--people ${quote(a.people_path)}`] : []
    ];
    return {
      structured: {
        ...report,
        commits: prioritise(report.commits, max),
        commits_total: report.commits.length,
        pack: { written: false, write_with: `${RUN} ${flags.join(" ")}` }
      },
      isError: false
    };
  } catch (err) {
    const body = err instanceof RdLedgerError ? err.toJSON() : {
      code: "INTERNAL",
      cause: err instanceof Error ? err.message : String(err),
      fix: "Run rd-ledger on the same repository in a terminal to see the error with its context, and report it at https://github.com/agentwares/rd-ledger/issues.",
      retryable: false
    };
    return { structured: { ...body, note: DISCLAIMER }, isError: true };
  }
}
export {
  DISCLAIMER,
  ROUTINE,
  RdLedgerError,
  SIGNALS,
  SOURCES,
  TOOLS,
  aiCoauthors,
  buildReport,
  callTool,
  commitLink,
  commitShares,
  defaultComponent,
  gitAt,
  globToRegExp,
  messageSignals,
  packDir,
  parseComponentFlag,
  parseLog,
  parsePeople,
  parseRemote,
  readCommits,
  readPullRequests,
  readRepo,
  renderCsvs,
  renderMarkdown,
  renderText,
  resolvePeriod,
  routineMarkers,
  tokenFrom
};
//# sourceMappingURL=index.js.map