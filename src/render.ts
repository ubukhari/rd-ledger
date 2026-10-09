/**
 * The pack as files and as the terminal summary: `evidence.md` for the accountant, the CSVs behind
 * it, and the few lines a person reads in the terminal. Every file opens with the not-advice line,
 * and `evidence.md` names each CSV's SHA-256 so the set can be checked later.
 */
import { createHash } from "node:crypto";
import { csvRow } from "./csv.js";
import type { CommitRow, PersonRow, Report } from "./scan.js";
import { ROUTINE, SIGNALS, type SignalId } from "./signals.js";
import { DISCLAIMER, SOURCES } from "./sources.js";
import { WAITLIST_CLI_URL } from "./waitlist.js";

export const PACK_FILES = [
  "evidence.md",
  "commits.csv",
  "candidates.csv",
  "components.csv",
  "people.csv",
] as const;

const pct = (share: number) => `${Math.round(share * 100)}%`;
const num = (n: number) => n.toLocaleString("en-US");
const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function packDir(report: Report): string {
  return `rd-ledger-${report.period.since}-to-${report.period.until}`;
}

function preamble(report: Report): string {
  return `# rd-ledger ${report.version} · ${report.repo.name} · ${report.period.since} to ${report.period.until} · generated ${report.generated} · ${DISCLAIMER}`;
}

const signalList = (r: { signals: { id: string }[] }) => r.signals.map((s) => s.id).join("; ");
const evidenceList = (r: { signals: { id: string; evidence: string }[] }) =>
  r.signals.map((s) => `${s.id}: ${s.evidence}`).join("; ");
const componentList = (r: CommitRow) =>
  r.components.map((c) => `${c.name} ${pct(c.share)}`).join("; ");

export function renderCsvs(report: Report): Record<string, string> {
  const withEmail = report.commits.some((c) => c.email !== null);
  const files: Record<string, string> = {};
  const lines = (header: string[], rows: (string | number | null)[][]) =>
    [preamble(report), csvRow(header), ...rows.map(csvRow)].join("\n") + "\n";

  files["commits.csv"] = lines(
    [
      "date",
      "sha",
      "author",
      ...(withEmail ? ["email"] : []),
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
      "link",
    ],
    report.commits.map((c) => [
      c.date,
      c.sha,
      c.author,
      ...(withEmail ? [c.email] : []),
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
      c.link,
    ]),
  );

  const candidateRows: (string | number | null)[][] = [];
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
        c.link,
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
        p.link,
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
      "link",
    ],
    candidateRows,
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
      "adviser_notes",
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
      Object.entries(c.signals)
        .map(([k, v]) => `${k} ${v}`)
        .join("; "),
      "",
      "",
      "",
    ]),
  );

  files["people.csv"] = lines(
    [
      "name",
      ...(withEmail ? ["email"] : []),
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
      "wages_supplied",
    ],
    report.people.map((p) => [
      p.name,
      ...(withEmail ? [p.email] : []),
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
      p.figures?.wages ?? null,
    ]),
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
        `${a.basis}; an allocation by commit activity, not a time record`,
      ]),
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
        "link",
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
        p.link,
      ]),
    );
  return files;
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Table cells: one line, no pipes, no HTML. */
const cell = (s: string) =>
  s
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function mdTable(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");
}

/** What the user supplied for a person, in words; never anything rd-ledger worked out. */
export function figuresText(p: PersonRow): string {
  const f = p.figures;
  if (!f || (f.hours === null && f.wages === null && f.hourlyRate === null)) return "not supplied";
  const parts: string[] = [];
  if (f.hours !== null) parts.push(`${num(f.hours)} h`);
  if (f.hourlyRate !== null) parts.push(`at ${money(f.hourlyRate)}/h`);
  if (f.wages !== null) parts.push(`wages ${money(f.wages)}`);
  return parts.join(" ");
}

const commitRef = (c: CommitRow) => (c.link ? `[\`${c.short}\`](${c.link})` : `\`${c.short}\``);

export function renderMarkdown(report: Report, csvs: Record<string, string>): string {
  const t = report.totals;
  const out: string[] = [];
  out.push(
    `# R&D evidence pack: ${report.repo.name}, ${report.period.since} to ${report.period.until}`,
  );
  out.push("");
  out.push(`> **${DISCLAIMER}**`);
  out.push(">");
  out.push(
    `> Generated ${report.generated} by rd-ledger ${report.version} from the git history at \`${report.repo.head.slice(0, 7)}\`${report.repo.base ? `, main branch \`${report.repo.base}\` (${report.repo.baseReason})` : ""}. Period: ${report.period.reason}.`,
  );
  out.push("");
  out.push("## What this is");
  out.push("");
  out.push(
    "An index of the commits made in the period, written as the work happened, grouped into components, with the commits that look like experimentation marked as candidate evidence. Each line names its commit, so every statement here can be checked against the repository itself.",
  );
  out.push("");
  out.push(
    "It does not decide whether any work qualifies for a research credit. The four-part test (IRC §41(d)), the internal-use software rules, the exclusions in §41(d)(4) and the business components are your tax adviser's to apply. A folder is a stand-in for a business component; rename or merge them with `--component`. No hours or amounts were estimated from commits.",
  );
  out.push("");
  out.push("## Summary");
  out.push("");
  const summary: [string, string][] = [
    ["Period", `${report.period.since} to ${report.period.until}`],
    ["Commits (merges apart)", num(t.commits)],
    ["Merge commits", num(t.merges)],
    ["People", num(t.people)],
    ["Components", num(t.components)],
    ["Candidate commits", num(t.candidates)],
    ["Likely routine commits", num(t.routine)],
    ["Commits with an AI co-author", num(t.agentCoauthored)],
    ["Branches never merged", num(t.unmergedBranches)],
  ];
  if (t.prs !== null)
    summary.push([
      "Pull requests created in the period",
      `${num(t.prs)} (${num(t.prCandidates ?? 0)} flagged)`,
    ]);
  if (report.automation.length)
    summary.push([
      "Automation accounts",
      report.automation.map((a) => `${a.name} (${a.commits})`).join(", "),
    ]);
  out.push(
    mdTable(
      ["", ""],
      summary.map(([a, b]) => [a, b]),
    ),
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
        num(c.months),
      ]),
    ),
  );
  out.push("");
  out.push(
    "Folders stand in for business components. Form 6765 Section G asks, per component, for its type (Product, Process or All Others), for software whether it is internal-use, and for wages, supplies and contract research: `components.csv` leaves those columns for your adviser.",
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
        `- ${c.date} ${commitRef(c)} ${cell(c.author)}: ${cell(c.subject)}. _${c.signals.map((s) => `${s.id} (${cell(s.evidence)})`).join("; ")}_`,
      );
    if (mine.length > shown.length)
      out.push(`- …and ${mine.length - shown.length} more in \`candidates.csv\`.`);
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
        `- ${p.created} [#${p.number}](${p.link}) ${cell(p.author)}: ${cell(p.title)} (${p.state}). _${p.signals.map((s) => `${s.id} (${cell(s.evidence)})`).join("; ")}_`,
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
        "Figures (supplied)",
      ],
      report.people.map((p) => [
        p.name,
        num(p.commits),
        num(p.activeDays),
        p.first,
        p.last,
        num(p.months),
        p.components
          .slice(0, 3)
          .map((c) => `${c.name} ${pct(c.share)}`)
          .join(", "),
        num(p.candidates),
        num(p.agentCoauthored),
        figuresText(p),
      ]),
    ),
  );
  out.push("");
  out.push(
    "Active days are the days a person committed, by their own clock. They say when someone worked on the code, not for how long. A commit with an AI co-author was written with an agent; agent work is not wages, and how the person's time counts is for your adviser.",
  );
  out.push("");

  if (report.allocation) {
    out.push("## Allocation of the figures you supplied");
    out.push("");
    out.push(
      "Each person's hours or wages, from your people file, split across components by their commit-days (each day they committed counts once, divided among the components that day's commits changed). **An allocation by commit activity, not a time record.**",
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
          a.basis,
        ]),
      ),
    );
    out.push("");
    const without = report.people.filter((p) => p.figures === null).map((p) => p.name);
    if (without.length)
      out.push(`No figures were supplied for ${without.join(", ")}, so none are shown.`);
    if (report.unmatchedFigures.length)
      out.push(
        `The people file names ${report.unmatchedFigures.join(", ")}, who made no commit in the period.`,
      );
    if (without.length || report.unmatchedFigures.length) out.push("");
  }

  out.push("## Likely routine work (for your adviser to exclude)");
  out.push("");
  const routine = ROUTINE.map(
    (r) => [r.id, r.shows, num(report.byRoutine[r.id] ?? 0)] as [string, string, string],
  ).filter((r) => r[2] !== "0");
  if (routine.length === 0) out.push("No commit carried a routine marker.");
  else out.push(mdTable(["Marker", "What it shows", "Commits"], routine));
  out.push("");
  out.push(
    "Markers never remove a commit: a candidate that also carries one is listed with both, in `commits.csv`.",
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
          b.absorbed === true
            ? "its changes are already on the main branch (squash-merged or cherry-picked)"
            : b.spike
              ? "never merged; named as an experiment"
              : "never merged",
        ]),
      ),
    );
    out.push("");
  }

  out.push("## What the rules look for");
  out.push("");
  out.push(
    mdTable(
      ["Rule", "What the record shows", "What it may help your adviser document", "Weight"],
      SIGNALS.map((s) => [s.id, s.shows, s.element, s.strength]),
    ),
  );
  out.push("");
  out.push(
    'Treas. Reg. §1.41-4(a)(5) describes a process of experimentation as one "designed to evaluate one or more alternatives". The rules find records that may show one; whether they do is a judgment for your adviser.',
  );
  out.push("");

  out.push("## Method and limits");
  out.push("");
  const method = [
    "Commits are read from the repository's local and remote-tracking branches, and placed in the period by the author's own date.",
    "Dates in git are written by the committer's machine. The hosting service's record of pushes and pull requests is the stronger timestamp; `--prs` reads GitHub's.",
    "A branch whose changes are already on the main branch is not counted as unmerged: merging it would change nothing, or at least 90% of the files it changed reached the main branch in the same versions (a squash merge or a cherry-pick). A branch squashed with its files edited on the way in may still show as unmerged; `--prs` settles it from GitHub's record.",
    'Commit messages carry the rules\' words only when people wrote them; a team that writes "wip" leaves little to find.',
    "Lockfiles and other generated files do not count towards a commit's components.",
    ...report.notes,
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
      Object.entries(csvs).map(([name, text]) => [name, `\`${sha256(text)}\``]),
    ),
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push(`**${report.handoff.notBuilt}** ${report.handoff.offer} ${report.handoff.status}`);
  out.push("");
  return out.join("\n");
}

function textTable(header: string[], rows: string[][], right: ReadonlySet<number>): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (r: string[]) =>
    "  " +
    r
      .map((c, i) => (right.has(i) ? c.padStart(widths[i]!) : c.padEnd(widths[i]!)))
      .join("  ")
      .trimEnd();
  return [line(header), ...rows.map(line)];
}

export function renderText(
  report: Report,
  opts: { waitlist: boolean; wrote: { dir: string; files: string[] } | null },
): string {
  const t = report.totals;
  const out: string[] = [];
  out.push(
    `rd-ledger ${report.version} · ${report.repo.name} · ${report.period.since} to ${report.period.until}`,
  );
  out.push(`Period: ${report.period.reason}.`);
  out.push(DISCLAIMER);
  out.push("");
  const bots = report.automation.reduce((n, a) => n + a.commits, 0);
  out.push(
    `  ${num(t.commits)} commits across ${num(t.components)} component${t.components === 1 ? "" : "s"} by ${num(t.people)} ${t.people === 1 ? "person" : "people"}${bots ? ` and ${report.automation.length} automation account${report.automation.length === 1 ? "" : "s"}` : ""}${t.merges ? `, plus ${num(t.merges)} merge commit${t.merges === 1 ? "" : "s"}` : ""}`,
  );
  out.push(
    `  ${num(t.candidates)} candidate commits · ${num(t.routine)} likely routine · ${num(t.agentCoauthored)} with an AI co-author · ${num(t.unmergedBranches)} branch${t.unmergedBranches === 1 ? "" : "es"} never merged`,
  );
  if (t.prs !== null)
    out.push(
      `  ${num(t.prs)} pull requests created in the period, ${num(t.prCandidates ?? 0)} flagged`,
    );
  out.push("");
  if (report.components.length) {
    out.push(
      ...textTable(
        ["Component", "Commits", "Candidates", "People", "First", "Last"],
        report.components
          .slice(0, 12)
          .map((c) => [c.name, num(c.commits), num(c.candidates), num(c.people), c.first, c.last]),
        new Set([1, 2, 3]),
      ),
    );
    if (report.components.length > 12)
      out.push(`  …and ${report.components.length - 12} more in components.csv`);
    out.push("");
  }
  const order = SIGNALS.map((s) => s.id).filter((id) => (report.bySignal[id] ?? 0) > 0);
  if (order.length) {
    out.push(
      `  Candidates by rule: ${order.map((id: SignalId) => `${id} ${num(report.bySignal[id]!)}`).join(", ")}`,
    );
    out.push("");
  }
  if (report.people.length) {
    out.push(
      ...textTable(
        ["Person", "Commits", "Active days", "First", "Last", "Candidates", "Figures (yours)"],
        report.people
          .slice(0, 12)
          .map((p) => [
            p.name,
            num(p.commits),
            num(p.activeDays),
            p.first,
            p.last,
            num(p.candidates),
            p.figures ? figuresText(p) : "-",
          ]),
        new Set([1, 2, 5]),
      ),
    );
    if (report.people.length > 12)
      out.push(`  …and ${report.people.length - 12} more in people.csv`);
    out.push("");
  }
  for (const n of report.notes) out.push(`  Note: ${n}`);
  if (report.unmatchedFigures.length)
    out.push(
      `  Note: the people file names ${report.unmatchedFigures.join(", ")}, who made no commit in the period.`,
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
