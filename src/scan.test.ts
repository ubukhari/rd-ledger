/**
 * The reader and the rules on fixture repositories, each built by git in a temporary folder with
 * fixed dates and invented people. No test reads a real repository or the network.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseComponentFlag } from "./components.js";
import { buildDemo } from "./demo.js";
import { lines, RepoBuilder, type Person } from "./fixture.js";
import { gitAt, readRepo } from "./git.js";
import { parsePeople } from "./people.js";
import { resolvePeriod } from "./period.js";
import { buildReport, type Report, type ScanInput } from "./scan.js";

const ADA: Person = { name: "Ada Example", email: "ada@example.com" };
const GRACE: Person = { name: "Grace Example", email: "grace@example.com" };

const roots: string[] = [];
function fresh(name: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `rd-ledger-test-${name}-`));
  roots.push(root);
  return root;
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function scan(
  dir: string,
  over: Partial<ScanInput> & { year?: number; base?: string } = {},
): Report {
  const git = gitAt(dir);
  const facts = readRepo(dir, { base: over.base, git });
  return buildReport({
    git,
    facts,
    period:
      over.period ?? resolvePeriod({ year: over.year ?? 2026 }, new Date("2026-10-09T12:00:00Z")),
    components: over.components ?? [],
    people: over.people ?? null,
    prs: over.prs ?? null,
    withEmails: over.withEmails ?? false,
    generated: "2026-10-09",
    version: "0.0.0-test",
  });
}

const bySubject = (r: Report, subject: string) => {
  const c = r.commits.find((x) => x.subject === subject);
  if (!c) throw new Error(`no commit "${subject}"`);
  return c;
};
const ids = (r: Report, subject: string) => bySubject(r, subject).signals.map((s) => s.id);

describe("the demo company's repository", () => {
  let report: Report;
  beforeAll(() => {
    const root = fresh("demo");
    const people = buildDemo(path.join(root, "repo"), root);
    report = scan(path.join(root, "repo"), { people: parsePeople(readFileSync(people, "utf8")) });
  });

  it("counts the period's commits, people, components and merges", () => {
    expect(report.repo.name).toBe("example-co/demo-app");
    expect(report.repo.base).toBe("main");
    expect(report.totals).toMatchObject({
      commits: 19,
      merges: 1,
      people: 3,
      components: 6,
      candidates: 10,
      agentCoauthored: 3,
      unmergedBranches: 1,
      prs: null,
    });
    expect(report.automation).toEqual([{ name: "dependabot[bot]", commits: 1 }]);
  });

  it("marks the spike branch, the revert pair, and the words people wrote", () => {
    expect(ids(report, "Prototype a graph-based route solver")).toEqual([
      "unmerged",
      "spike-branch",
      "experiment-words",
    ]);
    expect(bySubject(report, "Prototype a graph-based route solver").onBase).toBe(false);
    expect(ids(report, "Try simulated annealing for stop ordering")).toEqual([
      "reverted",
      "approach-words",
    ]);
    expect(ids(report, 'Revert "Try simulated annealing for stop ordering"')).toEqual(["revert"]);
    expect(
      ids(report, "Abandon soft-penalty time windows: late arrivals doubled on the test set"),
    ).toEqual(["failed-words"]);
    expect(ids(report, "Replace geohash clustering with H3 cells")).toEqual(["rewrite"]);
    expect(
      bySubject(report, "Replace geohash clustering with H3 cells").signals[0]!.evidence,
    ).toContain("about 120 lines replaced in 1 file(s)");
    expect(ids(report, "Add date filters to the dispatch dashboard")).toEqual([]);
  });

  it("keeps routine work in, marked for the adviser", () => {
    const bot = bySubject(report, "chore(deps): bump vite from 7.1.2 to 7.1.5");
    expect(bot.bot).toBe(true);
    expect(bot.candidate).toBe(false);
    expect(bot.routine.map((r) => r.id)).toEqual(["bot", "dependency"]);
    expect(bySubject(report, "Release v1.4.0").routine.map((r) => r.id)).toEqual(["release"]);
    expect(bySubject(report, "Merge branch 'feature/eta-model'").merge).toBe(true);
    expect(report.byRoutine).toMatchObject({ "docs-only": 2, format: 2, "ci-only": 1 });
  });

  it("names AI co-authors per commit", () => {
    expect(
      bySubject(report, "Experiment: time windows as soft penalties in the solver").agents,
    ).toEqual(["Claude"]);
    expect(bySubject(report, "Investigate geocoder latency on large depots").agents).toEqual([
      "Cursor",
    ]);
  });

  it("gives people by name only, with their spans", () => {
    expect(report.people.map((p) => [p.name, p.commits, p.activeDays, p.first, p.last])).toEqual([
      ["Ada Example", 8, 8, "2026-01-13", "2026-09-15"],
      ["Grace Example", 5, 5, "2026-03-02", "2026-07-03"],
      ["Linus Example", 5, 5, "2026-01-05", "2026-08-04"],
    ]);
    const text = JSON.stringify(report);
    expect(text).not.toContain("@example.com");
  });

  it("allocates only the figures supplied, and nobody else's", () => {
    const ada = report.allocation!.filter((a) => a.name === "Ada Example");
    expect(ada.map((a) => [a.component, a.share, a.hours])).toEqual([
      ["apps/router", 0.75, 1087.5],
      ["docs", 0.125, 181.3],
      ["packages/geo", 0.125, 181.3],
    ]);
    expect(ada.reduce((n, a) => n + a.amount!, 0)).toBeCloseTo(1450 * 95, 0);
    const grace = report.allocation!.filter((a) => a.name === "Grace Example");
    expect(grace.every((a) => a.hours === null)).toBe(true);
    expect(grace.reduce((n, a) => n + a.amount!, 0)).toBeCloseTo(148000, 2);
    expect(report.allocation!.some((a) => a.name === "Linus Example")).toBe(false);
    expect(report.people.find((p) => p.name === "Linus Example")!.figures).toBeNull();
  });

  it("renames components with the user's rules", () => {
    const root = fresh("demo-rules");
    buildDemo(path.join(root, "repo"), root);
    const r = scan(path.join(root, "repo"), {
      components: [parseComponentFlag("Route optimizer=apps/router/**,packages/geo/**")],
    });
    expect(r.components[0]!.name).toBe("Route optimizer");
    expect(r.components.some((c) => c.name === "packages/geo")).toBe(false);
  });
});

describe("branches", () => {
  it("does not call a squash-merged branch unmerged, and still names it a spike", () => {
    const repo = new RepoBuilder(path.join(fresh("squash"), "r")).init();
    repo.commit({
      author: ADA,
      date: "2026-02-01",
      message: "Start",
      files: { "src/a.ts": lines(10, "a") },
    });
    repo.branch("try/fast-path");
    repo.commit({
      author: ADA,
      date: "2026-02-02",
      message: "Fast path for small inputs",
      files: { "src/b.ts": lines(10, "b") },
    });
    repo.checkout("main");
    repo.squash("try/fast-path", ADA, "2026-02-03", "Fast path for small inputs (#4)");
    const r = scan(repo.dir);
    const c = bySubject(r, "Fast path for small inputs");
    expect(c.onBase).toBe(false);
    expect(c.signals.map((s) => s.id)).toEqual(["spike-branch"]);
    expect(c.branches).toEqual(["try/fast-path (merged by squash)"]);
    expect(r.totals.unmergedBranches).toBe(0);
    expect(r.branches).toEqual([
      { name: "try/fast-path", commits: 1, absorbed: true, spike: true },
    ]);
  });

  it("knows a squash-merged branch even after the main branch changed its files again", () => {
    const repo = new RepoBuilder(path.join(fresh("squash-later"), "r")).init();
    repo.commit({
      author: ADA,
      date: "2026-02-01",
      message: "Start",
      files: { "src/a.ts": lines(10, "a"), "CHANGELOG.md": "# Changes\n" },
    });
    repo.branch("feature/export");
    repo.commit({
      author: ADA,
      date: "2026-02-02",
      message: "CSV export",
      files: { "src/export.ts": lines(10, "e"), "CHANGELOG.md": "# Changes\n\n- export\n" },
    });
    repo.checkout("main");
    repo.squash("feature/export", ADA, "2026-02-03", "CSV export (#7)");
    repo.commit({
      author: GRACE,
      date: "2026-02-04",
      message: "Another change",
      files: { "src/export.ts": lines(12, "e"), "CHANGELOG.md": "# Changes\n\n- export\n- more\n" },
    });
    // merging the old branch now would conflict, but its versions are on main's history
    const r = scan(repo.dir);
    expect(bySubject(r, "CSV export").signals.map((s) => s.id)).toEqual([]);
    expect(r.branches).toEqual([
      { name: "feature/export", commits: 1, absorbed: true, spike: false },
    ]);
  });

  it("still calls a branch with changes main never had unmerged", () => {
    const repo = new RepoBuilder(path.join(fresh("half"), "r")).init();
    repo.commit({ author: ADA, date: "2026-02-01", message: "Start", files: { "a.ts": "1\n" } });
    repo.branch("idea");
    repo.commit({
      author: ADA,
      date: "2026-02-02",
      message: "Two files",
      files: { "b.ts": "2\n", "c.ts": "3\n" },
    });
    repo.checkout("main");
    repo.commit({
      author: ADA,
      date: "2026-02-03",
      message: "Take b only",
      files: { "b.ts": "2\n" },
    });
    const r = scan(repo.dir);
    expect(ids(r, "Two files")).toEqual(["unmerged"]);
  });

  it("reads remote-tracking branches with no local copy", () => {
    const repo = new RepoBuilder(path.join(fresh("remote"), "r")).init(
      "https://github.com/acme/api.git",
    );
    repo.commit({
      author: ADA,
      date: "2026-03-01",
      message: "Start",
      files: { "src/a.ts": lines(10, "a") },
    });
    repo.branch("cache-idea");
    const sha = repo.commit({
      author: GRACE,
      date: "2026-03-04",
      message: "LRU cache for lookups",
      files: { "src/c.ts": lines(12, "c") },
    });
    repo.checkout("main");
    repo.git(["update-ref", "refs/remotes/origin/cache-idea", sha]);
    repo.git(["branch", "-D", "cache-idea"]);
    const r = scan(repo.dir);
    const c = bySubject(r, "LRU cache for lookups");
    expect(c.signals.map((s) => s.id)).toEqual(["unmerged"]);
    expect(c.signals[0]!.evidence).toBe("only on branch cache-idea, never merged into main");
    expect(c.link).toBe(`https://github.com/acme/api/commit/${sha}`);
  });

  it("finds commits merged in from a spike-named branch", () => {
    const repo = new RepoBuilder(path.join(fresh("merged-spike"), "r")).init();
    repo.commit({
      author: ADA,
      date: "2026-04-01",
      message: "Start",
      files: { "src/a.ts": lines(5, "a") },
    });
    repo.branch("spike/h3");
    repo.commit({
      author: GRACE,
      date: "2026-04-02",
      message: "H3 cells for clustering",
      files: { "src/h3.ts": lines(15, "h") },
    });
    repo.checkout("main");
    repo.merge("spike/h3", ADA, "2026-04-03", "Merge branch 'spike/h3'");
    repo.git(["branch", "-D", "spike/h3"]);
    const c = bySubject(scan(repo.dir), "H3 cells for clustering");
    expect(c.onBase).toBe(true);
    expect(c.signals).toEqual([
      {
        id: "spike-branch",
        evidence: expect.stringMatching(/^merged from branch spike\/h3 in [0-9a-f]{7}$/),
      },
    ]);
  });

  it("says so when no main branch exists, and marks nothing unmerged", () => {
    const repo = new RepoBuilder(path.join(fresh("nobase"), "r")).init();
    repo.commit({
      author: ADA,
      date: "2026-05-01",
      message: "Prototype the parser",
      files: { "src/p.ts": lines(5, "p") },
    });
    repo.git(["branch", "-m", "main", "work"]);
    const r = scan(repo.dir);
    expect(r.repo.base).toBeNull();
    expect(r.notes.join(" ")).toContain("No main branch was found");
    expect(bySubject(r, "Prototype the parser").onBase).toBeNull();
    expect(ids(r, "Prototype the parser")).toEqual(["experiment-words"]);
  });
});

describe("dates and people", () => {
  it("places a commit by its author's own day, whatever the commit date or UTC says", () => {
    const repo = new RepoBuilder(path.join(fresh("dates"), "r")).init();
    repo.commit({ author: ADA, date: "2026-01-02", message: "Start", files: { "a.ts": "1\n" } });
    // authored on 31 Dec 2025, rebased (committed) on 3 Jan 2026: last year's work
    repo.write({ "b.ts": "2\n" });
    repo.git(["add", "-A"]);
    repo.git(["commit", "-q", "-m", "Late December work"], ADA);
    repo.git(
      ["commit", "-q", "--amend", "--no-edit", "--date=2025-12-31T15:00:00+00:00"],
      ADA,
      "2026-01-03",
    );
    // authored 31 Dec 2026 at 23:00 in California, already 2027 in UTC: this year's work
    repo.commit({
      author: GRACE,
      date: "2026-12-31T23:00:00-08:00",
      message: "New Year's Eve fix",
      files: { "c.ts": "3\n" },
    });
    const r = scan(repo.dir);
    const subjects = r.commits.map((c) => c.subject);
    expect(subjects).toContain("New Year's Eve fix");
    expect(subjects).not.toContain("Late December work");
    expect(bySubject(r, "New Year's Eve fix").date).toBe("2026-12-31");
  });

  it("joins one person's identities through .mailmap", () => {
    const repo = new RepoBuilder(path.join(fresh("mailmap"), "r")).init();
    repo.commit({
      author: { name: "ada", email: "ada@old.example.com" },
      date: "2026-06-01",
      message: "One",
      files: { "a.ts": "1\n" },
    });
    repo.commit({
      author: ADA,
      date: "2026-06-02",
      message: "Two",
      files: {
        "a.ts": "2\n",
        ".mailmap": "Ada Example <ada@example.com> ada <ada@old.example.com>\n",
      },
    });
    const r = scan(repo.dir);
    expect(r.people.map((p) => [p.name, p.commits])).toEqual([["Ada Example", 2]]);
  });

  it("includes emails only when asked", () => {
    const repo = new RepoBuilder(path.join(fresh("emails"), "r")).init();
    repo.commit({ author: ADA, date: "2026-06-01", message: "One", files: { "a.ts": "1\n" } });
    expect(JSON.stringify(scan(repo.dir))).not.toContain("ada@example.com");
    const r = scan(repo.dir, { withEmails: true });
    expect(r.people[0]!.email).toBe("ada@example.com");
    expect(r.commits[0]!.email).toBe("ada@example.com");
  });

  it("names people in the figures file who made no commit", () => {
    const repo = new RepoBuilder(path.join(fresh("unmatched"), "r")).init();
    repo.commit({ author: ADA, date: "2026-06-01", message: "One", files: { "a.ts": "1\n" } });
    const r = scan(repo.dir, { people: parsePeople("name,hours\nAda Example,100\nNo One,50\n") });
    expect(r.unmatchedFigures).toEqual(["No One"]);
    expect(r.allocation).toEqual([
      expect.objectContaining({
        name: "Ada Example",
        component: "(root files)",
        share: 1,
        hours: 100,
        amount: null,
      }),
    ]);
  });
});

describe("errors", () => {
  it("refuses a folder that is not a repository, and an empty one", () => {
    const dir = fresh("not-repo");
    expect(() => readRepo(dir)).toThrow(expect.objectContaining({ code: "NOT_A_REPO" }));
    const empty = new RepoBuilder(path.join(fresh("empty"), "r")).init();
    expect(() => readRepo(empty.dir)).toThrow(expect.objectContaining({ code: "EMPTY_REPO" }));
  });

  it("refuses a --base that does not exist", () => {
    const repo = new RepoBuilder(path.join(fresh("badbase"), "r")).init();
    repo.commit({ author: ADA, date: "2026-06-01", message: "One", files: { "a.ts": "1\n" } });
    expect(() => readRepo(repo.dir, { base: "trunk" })).toThrow(
      expect.objectContaining({ code: "BASE_NOT_FOUND" }),
    );
  });
});
