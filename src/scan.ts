/**
 * The pack's content, from the repository's history: commits in the period, grouped into
 * components, with the rules' candidate evidence of experimentation and the likely-routine markers,
 * the people and their time spans, and (only from the user's own figures) an allocation of hours or
 * wages across components. Pure reading: nothing here writes, sends or estimates.
 */
import { commitShares, componentOf, type ComponentRule, type Share } from "./components.js";
import {
  commitLink,
  commitsOnBase,
  readCommits,
  unmergedBranches,
  type Git,
  type RawCommit,
  type RepoFacts,
} from "./git.js";
import type { PrRead } from "./github.js";
import { basisOf, matchFigures, type PersonFigures } from "./people.js";
import type { Period } from "./period.js";
import {
  aiCoauthors,
  isBotIdentity,
  isRevert,
  isSpikeBranch,
  messageSignals,
  revertedSha,
  rewriteSize,
  routineMarkers,
  type Hit,
  type RoutineId,
  type SignalId,
} from "./signals.js";
import { DISCLAIMER } from "./sources.js";
import { NOT_BUILT, WAITLIST_OFFER, WAITLIST_STATUS } from "./waitlist.js";

export interface CommitRow {
  sha: string;
  short: string;
  /** the author's own calendar day */
  date: string;
  author: string;
  /** only with --with-emails */
  email: string | null;
  subject: string;
  merge: boolean;
  bot: boolean;
  /** null when no main branch was found */
  onBase: boolean | null;
  branches: string[];
  components: Share[];
  added: number;
  deleted: number;
  signals: Hit<SignalId>[];
  routine: Hit<RoutineId>[];
  agents: string[];
  candidate: boolean;
  link: string | null;
}

export interface ComponentRow {
  name: string;
  commits: number;
  candidates: number;
  routine: number;
  people: number;
  first: string;
  last: string;
  months: number;
  lines: number;
  signals: Partial<Record<SignalId, number>>;
}

export interface PersonRow {
  name: string;
  email: string | null;
  commits: number;
  activeDays: number;
  first: string;
  last: string;
  months: number;
  /** share of their commit-days, largest first */
  components: { name: string; share: number }[];
  candidates: number;
  agentCoauthored: number;
  figures: { hours: number | null; hourlyRate: number | null; wages: number | null } | null;
}

export interface AllocationRow {
  name: string;
  component: string;
  share: number;
  hours: number | null;
  amount: number | null;
  basis: string;
}

export interface BranchRow {
  name: string;
  commits: number;
  absorbed: boolean | null;
  spike: boolean;
}

export interface PrRow {
  number: number;
  created: string;
  state: string;
  merged: string | null;
  author: string;
  title: string;
  labels: string[];
  signals: Hit<SignalId>[];
  components: string[];
  link: string;
}

export interface Report {
  tool: "rd-ledger";
  version: string;
  note: string;
  generated: string;
  repo: {
    name: string;
    head: string;
    base: string | null;
    baseReason: string | null;
    host: string | null;
    shallow: boolean;
  };
  period: Period;
  totals: {
    commits: number;
    merges: number;
    people: number;
    components: number;
    candidates: number;
    routine: number;
    agentCoauthored: number;
    unmergedBranches: number;
    prs: number | null;
    prCandidates: number | null;
  };
  bySignal: Partial<Record<SignalId, number>>;
  byRoutine: Partial<Record<RoutineId, number>>;
  components: ComponentRow[];
  people: PersonRow[];
  automation: { name: string; commits: number }[];
  allocation: AllocationRow[] | null;
  /** names in the people file that wrote no commit in the period */
  unmatchedFigures: string[];
  branches: BranchRow[];
  prs: PrRow[] | null;
  prNote: string | null;
  commits: CommitRow[];
  notes: string[];
  handoff: { notBuilt: string; offer: string; status: string };
}

export interface ScanInput {
  git: Git;
  facts: RepoFacts;
  period: Period;
  components: readonly ComponentRule[];
  people: readonly PersonFigures[] | null;
  prs: PrRead | null;
  withEmails: boolean;
  generated: string;
  version: string;
}

const MERGE_FROM =
  /^Merge (?:branch|remote-tracking branch) '([^']+)'|^Merge pull request #\d+ from [^/\s]+\/(\S+)/;

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

function count<T extends string>(hits: Iterable<T>): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const h of hits) out[h] = (out[h] ?? 0) + 1;
  return out;
}

export function buildReport(input: ScanInput): Report {
  const { git, facts, period } = input;
  const raw = readCommits(git, period.since, period.until);
  const notes: string[] = [];
  if (facts.shallow)
    notes.push(
      "This is a shallow clone, so history before its cut-off is missing. In CI, check out with fetch-depth: 0.",
    );

  const base = facts.base?.ref ?? null;
  let onBase: Set<string> | null = null;
  let branchInfo: ReturnType<typeof unmergedBranches> | null = null;
  if (base) {
    onBase = commitsOnBase(git, base, period.since);
    branchInfo = unmergedBranches(git, base, period.since, facts.remotes);
    if (branchInfo.truncated) notes.push("Only the first 300 unmerged branches were read.");
    if (!branchInfo.mergeTree)
      notes.push(
        "This git (older than 2.38) cannot tell a squash-merged branch from an unmerged one, so a squash-merged branch may show as unmerged.",
      );
  } else
    notes.push(
      "No main branch was found (main, master, or the origin's default), so no commit is marked unmerged. Pass --base.",
    );

  // a squash-merged pull request's branch is merged, whatever the history says
  const mergedHeads = new Set(
    (input.prs?.prs ?? []).filter((p) => p.state === "merged").map((p) => p.headRef),
  );
  const branches = (branchInfo?.branches ?? []).map((b) => ({
    ...b,
    absorbed: b.absorbed === true || mergedHeads.has(b.name) ? true : b.absorbed,
  }));
  const branchesOf = new Map<string, string[]>();
  for (const b of branches)
    for (const sha of b.commits) branchesOf.set(sha, [...(branchesOf.get(sha) ?? []), b.name]);

  // commits that arrived through a merge of a spike-named branch
  const spikeMerged = new Map<string, string>();
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
  const findSha = (s: string) =>
    bySha.get(s) ?? (s.length < 40 ? raw.find((c) => c.sha.startsWith(s)) : undefined);
  const revertedBy = new Map<string, RawCommit>();
  for (const c of raw)
    if (isRevert(c.subject, c.body)) {
      const target = revertedSha(c.subject, c.body);
      const hit = target ? findSha(target) : undefined;
      if (hit) revertedBy.set(hit.sha, c);
    }

  const rows: CommitRow[] = raw.map((c) => {
    const merge = c.parents.length > 1;
    const bot = isBotIdentity(c.author, c.email);
    const signals: Hit<SignalId>[] = [];
    if (isRevert(c.subject, c.body)) {
      const target = revertedSha(c.subject, c.body);
      const hit = target ? findSha(target) : undefined;
      signals.push({
        id: "revert",
        evidence: hit
          ? `reverts ${hit.sha.slice(0, 7)} (${hit.authored.slice(0, 10)})`
          : target
            ? `reverts ${target.slice(0, 7)}, from before the period`
            : "a revert",
      });
    }
    const by = revertedBy.get(c.sha);
    if (by)
      signals.push({
        id: "reverted",
        evidence: `reverted by ${by.sha.slice(0, 7)} on ${by.authored.slice(0, 10)}`,
      });
    const on = onBase ? onBase.has(c.sha) : null;
    const names = branchesOf.get(c.sha) ?? [];
    if (on === false) {
      const open = branches.filter((b) => names.includes(b.name) && b.absorbed !== true);
      if (open.length)
        signals.push({
          id: "unmerged",
          evidence: `only on branch ${open.map((b) => b.name).join(", ")}, never merged into ${base}`,
        });
    }
    const spikes = names.filter(isSpikeBranch);
    if (spikes.length)
      signals.push({ id: "spike-branch", evidence: `on branch ${spikes.join(", ")}` });
    else if (spikeMerged.has(c.sha))
      signals.push({ id: "spike-branch", evidence: spikeMerged.get(c.sha)! });
    if (!merge) {
      // a revert repeats the reverted subject; only its own words count
      const words = isRevert(c.subject, c.body)
        ? messageSignals("", c.body)
        : messageSignals(c.subject, c.body);
      const size = rewriteSize(c.files);
      const rewriteWords = words.find((w) => w.id === "rewrite");
      for (const w of words) if (w.id !== "rewrite") signals.push(w);
      if (rewriteWords || size.lines >= 100)
        signals.push({
          id: "rewrite",
          evidence: [
            rewriteWords?.evidence,
            size.lines >= 100
              ? `about ${size.lines} lines replaced in ${size.files} file(s)`
              : null,
          ]
            .filter(Boolean)
            .join("; "),
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
      branches: names.map((n) =>
        branches.find((b) => b.name === n)?.absorbed === true ? `${n} (merged by squash)` : n,
      ),
      components: shares,
      added: c.files.reduce((n, f) => n + f.added, 0),
      deleted: c.files.reduce((n, f) => n + f.deleted, 0),
      signals,
      routine,
      agents: aiCoauthors(c.author, c.email, c.body),
      candidate: signals.length > 0 && !merge && !bot,
      link: commitLink(facts.remote, c.sha),
    };
  });

  const work = rows.filter((r) => !r.merge);
  const { people, allocation, matched } = peopleAndAllocation(work, raw, input);
  const components = componentRows(work);
  const unmatchedFigures = (input.people ?? [])
    .filter((f) => !matched.has(f))
    .map((f) => f.name || f.email || `row ${f.row}`);

  const prRows: PrRow[] | null = input.prs
    ? input.prs.prs.map((p) => ({
        number: p.number,
        created: p.created,
        state: p.state,
        merged: p.merged,
        author: p.author,
        title: p.title,
        labels: p.labels,
        signals: p.signals,
        components: p.files
          ? [...new Set(p.files.map((f) => componentOf(f, input.components)))]
          : [],
        link: p.url,
      }))
    : null;

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
      shallow: facts.shallow,
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
      prCandidates: prRows ? prRows.filter((p) => p.signals.length > 0).length : null,
    },
    bySignal: count(work.filter((r) => r.candidate).flatMap((r) => r.signals.map((s) => s.id))),
    byRoutine: count(work.flatMap((r) => r.routine.map((s) => s.id))),
    components,
    people,
    automation: automation
      .map(([name, commits]) => ({ name, commits }))
      .sort((a, b) => b.commits - a.commits),
    allocation,
    unmatchedFigures,
    branches: branches.map((b) => ({
      name: b.name,
      commits: b.commits.filter((s) => bySha.has(s)).length,
      absorbed: b.absorbed,
      spike: isSpikeBranch(b.name),
    })),
    prs: prRows,
    prNote: input.prs?.partial ?? null,
    commits: rows,
    notes,
    handoff: { notBuilt: NOT_BUILT, offer: WAITLIST_OFFER, status: WAITLIST_STATUS },
  };
}

function countMap(values: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

const personKey = (c: { author: string; email: string }) =>
  c.email.trim().toLowerCase() || c.author.trim().toLowerCase();

/** A person as the figures file can name them: their newest name, and every email they used. */
function identity(raws: readonly RawCommit[]): { name: string; emails: string[] } {
  const newest = [...raws].sort((a, b) => b.authored.localeCompare(a.authored))[0]!;
  return { name: newest.author, emails: [...new Set(raws.map((c) => c.email))] };
}

/** Each person's commit-days, each day split among the components that day's commits changed. */
function dayShares(rows: readonly CommitRow[]): Map<string, Map<string, number>> {
  const days = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.components.length === 0) continue;
    const day = days.get(r.date) ?? new Map<string, number>();
    for (const s of r.components) day.set(s.name, (day.get(s.name) ?? 0) + s.share);
    days.set(r.date, day);
  }
  for (const day of days.values()) {
    const total = [...day.values()].reduce((a, b) => a + b, 0);
    for (const [k, v] of day) day.set(k, v / total);
  }
  return days;
}

function componentSplit(rows: readonly CommitRow[]): { name: string; share: number }[] {
  const days = dayShares(rows);
  const sum = new Map<string, number>();
  for (const day of days.values()) for (const [k, v] of day) sum.set(k, (sum.get(k) ?? 0) + v);
  const n = days.size || 1;
  return [...sum.entries()]
    .map(([name, v]) => ({ name, share: v / n }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}

function groupPeople(
  work: readonly CommitRow[],
  raw: readonly RawCommit[],
): Map<string, { rows: CommitRow[]; raws: RawCommit[] }> {
  const rawBySha = new Map(raw.map((c) => [c.sha, c]));
  const groups = new Map<string, { rows: CommitRow[]; raws: RawCommit[] }>();
  for (const r of work) {
    if (r.bot) continue;
    const c = rawBySha.get(r.sha)!;
    const key = personKey(c);
    const g = groups.get(key) ?? { rows: [], raws: [] };
    g.rows.push(r);
    g.raws.push(c);
    groups.set(key, g);
  }
  return groups;
}

/**
 * One row per person (by email, `.mailmap` applied; bots apart), and, only for people the figures
 * file names, their hours or wages split across components by their commit-days.
 */
function peopleAndAllocation(
  work: readonly CommitRow[],
  raw: readonly RawCommit[],
  input: ScanInput,
): { people: PersonRow[]; allocation: AllocationRow[] | null; matched: Set<PersonFigures> } {
  const people: PersonRow[] = [];
  const allocation: AllocationRow[] = [];
  const matched = new Set<PersonFigures>();
  const names = new Map<string, number>();
  const groups = [...groupPeople(work, raw).values()].sort(
    (a, b) =>
      b.rows.length - a.rows.length || identity(a.raws).name.localeCompare(identity(b.raws).name),
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
      const { hours, amount, basis } = basisOf(figures);
      for (const c of split)
        allocation.push({
          name,
          component: c.name,
          share: round(c.share, 4),
          hours: hours === null ? null : round(hours * c.share, 1),
          amount: amount === null ? null : round(amount * c.share, 2),
          basis,
        });
    }
    people.push({
      name,
      email: input.withEmails ? (raws.find((c) => c.author === who.name)?.email ?? null) : null,
      commits: rows.length,
      activeDays: days.length,
      first: days[0]!,
      last: days[days.length - 1]!,
      months: new Set(days.map((d) => d.slice(0, 7))).size,
      components: split.map((c) => ({ name: c.name, share: round(c.share, 4) })),
      candidates: rows.filter((r) => r.candidate).length,
      agentCoauthored: rows.filter((r) => r.agents.length > 0).length,
      figures: figures
        ? { hours: figures.hours, hourlyRate: figures.hourlyRate, wages: figures.wages }
        : null,
    });
  }
  return { people, allocation: input.people ? allocation : null, matched };
}

function componentRows(work: readonly CommitRow[]): ComponentRow[] {
  const m = new Map<string, { rows: CommitRow[]; lines: number }>();
  for (const r of work)
    for (const s of r.components) {
      const e = m.get(s.name) ?? { rows: [], lines: 0 };
      e.rows.push(r);
      e.lines += s.lines;
      m.set(s.name, e);
    }
  return [...m.entries()]
    .map(([name, { rows, lines }]) => {
      const days = rows.map((r) => r.date).sort();
      return {
        name,
        commits: rows.length,
        candidates: rows.filter((r) => r.candidate).length,
        routine: rows.filter((r) => !r.candidate && r.routine.length > 0).length,
        people: new Set(rows.filter((r) => !r.bot).map((r) => r.author)).size,
        first: days[0]!,
        last: days[days.length - 1]!,
        months: new Set(days.map((d) => d.slice(0, 7))).size,
        lines,
        signals: count(rows.filter((r) => r.candidate).flatMap((r) => r.signals.map((s) => s.id))),
      };
    })
    .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}
