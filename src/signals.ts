/**
 * The rules. Each is deterministic and readable by an accountant: a word list, a branch name, a
 * revert, a merge status. A rule's name says what the record shows (a revert, an unmerged branch),
 * never what the law concludes. Nothing here decides whether work qualifies; the adviser does.
 *
 * Candidate evidence of experimentation, under Treas. Reg. §1.41-4(a)(5): "a process designed to
 * evaluate one or more alternatives to achieve a result where the capability or the method of
 * achieving that result, or the appropriate design of that result, is uncertain".
 */
import type { FileChange } from "./git.js";

export type SignalId =
  | "revert"
  | "reverted"
  | "unmerged"
  | "spike-branch"
  | "experiment-words"
  | "approach-words"
  | "failed-words"
  | "rewrite"
  | "pr-closed-unmerged"
  | "pr-label";

export type RoutineId =
  "merge" | "bot" | "dependency" | "format" | "docs-only" | "ci-only" | "release";

export interface Rule<Id extends string> {
  id: Id;
  /** what the record shows, in words */
  shows: string;
  /** the part of the four-part test (IRC §41(d)) it may help document, for the adviser */
  element: string;
  strength: "strong" | "medium" | "weak";
}

export const SIGNALS: readonly Rule<SignalId>[] = [
  {
    id: "revert",
    shows: "The commit reverts an earlier one: an approach was tried and backed out.",
    element: "Process of experimentation: an alternative evaluated and rejected.",
    strength: "strong",
  },
  {
    id: "reverted",
    shows: "The commit was reverted later in the history read.",
    element: "Process of experimentation: an alternative evaluated and rejected.",
    strength: "strong",
  },
  {
    id: "unmerged",
    shows:
      "The commit is only on a branch never merged into the main branch: an approach not taken, or work still open.",
    element: "Process of experimentation: alternatives evaluated.",
    strength: "medium",
  },
  {
    id: "spike-branch",
    shows:
      "The commit is on a branch named as an experiment (spike, experiment, exp, poc, prototype, try, trial, research, rnd, benchmark).",
    element: "Uncertainty, and a process of experimentation to resolve it.",
    strength: "medium",
  },
  {
    id: "experiment-words",
    shows:
      "The message names an experiment, spike, prototype, proof of concept, hypothesis, benchmark or A/B test.",
    element: "Process of experimentation.",
    strength: "medium",
  },
  {
    id: "approach-words",
    shows:
      "The message speaks of trying or attempting something, an alternative or approach, or investigating, evaluating, comparing or exploring.",
    element: "Uncertainty; alternatives evaluated.",
    strength: "weak",
  },
  {
    id: "failed-words",
    shows:
      "The message says something did not work, was a dead end, was abandoned, backed out or rolled back, or brought no improvement.",
    element: "Uncertainty: the outcome was not known in advance.",
    strength: "medium",
  },
  {
    id: "rewrite",
    shows:
      "The commit replaces a large part of the same files (100 or more lines both removed and added), or its message says rewrite, reimplement, replace one thing with another, or switch or migrate from one to another.",
    element: "Alternatives evaluated.",
    strength: "weak",
  },
  {
    id: "pr-closed-unmerged",
    shows: "A pull request closed without being merged: a proposed change not taken.",
    element: "Process of experimentation: an alternative evaluated and rejected.",
    strength: "medium",
  },
  {
    id: "pr-label",
    shows:
      "A pull request labelled spike, experiment, research, R&D, PoC, prototype, investigation or benchmark.",
    element: "Process of experimentation.",
    strength: "medium",
  },
];

export const ROUTINE: readonly Rule<RoutineId>[] = [
  {
    id: "merge",
    shows: "A merge commit; its changes are counted in the commits it merges.",
    element: "None by itself.",
    strength: "strong",
  },
  {
    id: "bot",
    shows: "Written by an automation account, not a person.",
    element: "None: no one's wages.",
    strength: "strong",
  },
  {
    id: "dependency",
    shows: "A dependency update (bump, chore(deps), update dependencies, Dependabot, Renovate).",
    element: "Usually routine.",
    strength: "medium",
  },
  {
    id: "format",
    shows: "Formatting, lint or typo fixes.",
    element: "Usually routine.",
    strength: "medium",
  },
  {
    id: "docs-only",
    shows: "Changes only documentation files.",
    element: "Usually routine.",
    strength: "medium",
  },
  {
    id: "ci-only",
    shows: "Changes only CI configuration.",
    element: "Usually routine.",
    strength: "medium",
  },
  {
    id: "release",
    shows: "A release or a version bump.",
    element: "Usually routine; work after commercial release is excluded by §41(d)(4)(A).",
    strength: "medium",
  },
];

export interface Hit<Id extends string> {
  id: Id;
  evidence: string;
}

const EXPERIMENT =
  /\b(experiment(?:s|al|ally|ing|ed)?|spik(?:e|es|ed|ing)|prototyp(?:e|es|ed|ing)|proof[- ]of[- ]concept|poc|hypothes(?:is|es|ize|ise|ized|ised)|benchmark(?:s|ed|ing)?|a\/b[- ]test(?:s|ing|ed)?)\b/gi;
const APPROACH =
  /\b(try|trying|tried|attempt(?:s|ed|ing)?|alternatives?|approach(?:es)?|investigat(?:e|es|ed|ing|ion)|evaluat(?:e|es|ed|ing|ion)|compar(?:e|es|ed|ing|ison)|explor(?:e|es|ed|ing|ation))\b/gi;
const FAILED =
  /\b(did(?:n'?t| not) work|does(?:n'?t| not) work|not working|dead[- ]end|abandon(?:s|ed|ing)?|gave up|give up|back(?:ed)? out|roll(?:ed)?[- ]back|no improvement|didn'?t help|did not help|no gain|slower than)\b/gi;
const REWRITE_WORDS =
  /\b(rewr(?:ite|ites|ote|itten|iting)|re-?implement(?:s|ed|ing|ation)?|replac(?:e|es|ed|ing) [^.\n]{1,60}? with|switch(?:es|ed|ing)? (?:from|to)|migrat(?:e|es|ed|ing) (?:from|to))\b/gi;
const SPIKE_BRANCH =
  /(?:^|[/_-])(spikes?|experiments?|exp|poc|prototypes?|proto|try|trial|research|rnd|r-and-d|benchmarks?|bench)(?:[/_-]|$)/i;
const PR_LABEL =
  /^(spike|experiment(al)?|research|r&d|rnd|r-and-d|poc|proof of concept|prototype|investigation|benchmark)s?$/i;

const DEPENDENCY =
  /^(?:chore|build|fix|deps)\(deps(?:-dev)?\)|^bump\b.+\bfrom\b.+\bto\b|\bupdate dependenc(?:y|ies)\b|\bupgrade dependenc(?:y|ies)\b|^(?:chore|build)(?:\([^)]*\))?: bump\b/i;
const FORMAT =
  /^style(?:\([^)]*\))?:|\b(?:run|ran|apply|applied|fix|fixed)\s+(?:prettier|eslint|lint|linting|formatting|formatter)\b|\bformat(?:ted)?\s+with\b|\bfix(?:ed)?\s+typos?\b|\btypos?\b|\bwhitespace\b|^(?:chore|ci)(?:\([^)]*\))?:\s*(?:format|lint)/i;
const RELEASE =
  /^(?:chore\(release\)|chore: release|release\b|releasing\b|bump version|version bump)|^v?\d+\.\d+\.\d+(?:[-+][\w.]+)?$|^(?:chore|build)(?:\([^)]*\))?: (?:bump|set) version\b/i;
const DOCS_FILE =
  /(^|\/)(docs?|documentation)\/|\.(md|mdx|rst|adoc|txt)$|(^|\/)(README|CHANGELOG|LICENSE|CONTRIBUTING|NOTICE|AUTHORS)(\.[A-Za-z]+)?$/i;
const CI_FILE =
  /^(\.github\/(workflows|actions)\/|\.gitlab-ci\.ya?ml$|\.circleci\/|\.buildkite\/|azure-pipelines\.ya?ml$|Jenkinsfile$|\.travis\.ya?ml$|bitbucket-pipelines\.ya?ml$)/;
/** Files that do not stand for anyone's work: lockfiles, minified bundles, snapshots. */
export const GENERATED_FILE =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock|composer\.lock|uv\.lock|Pipfile\.lock)$|\.min\.(js|css)$|\.snap$/;

const TRAILER = /^[A-Za-z][\w-]*:\s.+$/;

/** The message without its trailer block (Co-authored-by, Signed-off-by, …). */
export function messageText(subject: string, body: string): string {
  const lines = body.split("\n");
  let end = lines.length;
  while (end > 0 && (lines[end - 1]!.trim() === "" || TRAILER.test(lines[end - 1]!.trim()))) end--;
  return `${subject}\n${lines.slice(0, end).join("\n")}`;
}

function words(re: RegExp, text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(re)) found.add(m[0].toLowerCase().replace(/\s+/g, " "));
  return [...found];
}

const quoteList = (ws: readonly string[]) =>
  ws
    .slice(0, 4)
    .map((w) => `"${w}"`)
    .join(", ");

/** The message rules: the words a person wrote when they made the commit. */
export function messageSignals(subject: string, body: string): Hit<SignalId>[] {
  const text = messageText(subject, body).replace(/This reverts commit [0-9a-f]{7,40}\.?/g, "");
  const hits: Hit<SignalId>[] = [];
  for (const [id, re] of [
    ["experiment-words", EXPERIMENT],
    ["approach-words", APPROACH],
    ["failed-words", FAILED],
    ["rewrite", REWRITE_WORDS],
  ] as const) {
    const ws = words(re, text);
    if (ws.length) hits.push({ id, evidence: `the message says ${quoteList(ws)}` });
  }
  return hits;
}

/** A large replacement inside the same files, from git's line counts. Generated files do not count. */
export function rewriteSize(files: readonly FileChange[]): { lines: number; files: number } {
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

export function isSpikeBranch(name: string): boolean {
  return SPIKE_BRANCH.test(name);
}

export function isSpikeLabel(label: string): boolean {
  return PR_LABEL.test(label.trim());
}

/** `Revert "…"` with `This reverts commit <sha>.`: the sha it names, if any. */
export function revertedSha(subject: string, body: string): string | null {
  const m = /This reverts commit ([0-9a-f]{7,40})/.exec(body);
  if (m) return m[1]!;
  return null;
}

export function isRevert(subject: string, body: string): boolean {
  return /^Revert\s+"/.test(subject) || revertedSha(subject, body) !== null;
}

export function isBotIdentity(name: string, email: string): boolean {
  return /\[bot\]$/i.test(name.trim()) || /\[bot\]@/i.test(email);
}

export function routineMarkers(c: {
  subject: string;
  author: string;
  email: string;
  parents: readonly string[];
  files: readonly FileChange[];
}): Hit<RoutineId>[] {
  const hits: Hit<RoutineId>[] = [];
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

/**
 * AI agents named as the author or in Co-authored-by trailers, by the identities the agents
 * write by default. Agent work is not wages: the adviser decides how a person's time counts.
 */
const AGENTS: readonly [string, RegExp][] = [
  ["Claude", /noreply@anthropic\.com|^claude(\[bot\])?$|^claude\b/i],
  [
    "Copilot",
    /copilot@github\.com|\+copilot@users\.noreply\.github\.com|^copilot(-swe-agent)?(\[bot\])?$/i,
  ],
  ["Cursor", /cursoragent@cursor\.com|^cursor(\[bot\]| agent)$/i],
  ["Codex", /codex@openai\.com|^chatgpt-codex-connector(\[bot\])?$|^codex$/i],
  ["Amp", /amp@ampcode\.com|^amp$/i],
  ["Aider", /noreply@aider\.chat|^aider\b/i],
  ["Gemini", /^gemini\b|gemini-code-assist|gemini-cli/i],
  ["Devin", /^devin-ai-integration(\[bot\])?$|devin-ai-integration\[bot\]@/i],
  ["Jules", /^google-labs-jules(\[bot\])?$|google-labs-jules\[bot\]@/i],
];

function agentOf(name: string, email: string): string | null {
  for (const [agent, re] of AGENTS) if (re.test(name.trim()) || re.test(email.trim())) return agent;
  return null;
}

export function aiCoauthors(author: string, email: string, body: string): string[] {
  const found = new Set<string>();
  const own = agentOf(author, email);
  if (own) found.add(own);
  for (const m of body.matchAll(/^co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/gim)) {
    const agent = agentOf(m[1]!, m[2]!);
    if (agent) found.add(agent);
  }
  return [...found];
}
