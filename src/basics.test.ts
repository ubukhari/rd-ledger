import { describe, expect, it } from "vitest";
import {
  commitShares,
  defaultComponent,
  globToRegExp,
  parseComponentFlag,
  ROOT_COMPONENT,
} from "./components.js";
import { csvField, parseCsv } from "./csv.js";
import { RdLedgerError } from "./errors.js";
import { commitLink, parseLog, parseRemote } from "./git.js";
import { basisOf, matchFigures, parsePeople } from "./people.js";
import { previousMonth, resolvePeriod } from "./period.js";
import {
  aiCoauthors,
  isRevert,
  isSpikeBranch,
  isSpikeLabel,
  messageSignals,
  revertedSha,
  rewriteSize,
  routineMarkers,
  SIGNALS,
} from "./signals.js";

const at = (iso: string) => new Date(iso);

describe("the period", () => {
  it("defaults to last year from January to April, the year being filed", () => {
    const p = resolvePeriod({}, at("2027-01-14T12:00:00Z"));
    expect(p).toMatchObject({ since: "2026-01-01", until: "2026-12-31" });
    expect(p.reason).toContain("last year, 2026");
    expect(resolvePeriod({}, at("2027-04-30T12:00:00Z")).since).toBe("2026-01-01");
  });

  it("defaults to the year to date from May", () => {
    const p = resolvePeriod({}, at("2026-10-09T12:00:00Z"));
    expect(p).toMatchObject({ since: "2026-01-01", until: "2026-10-09" });
    expect(p.reason).toContain("to date");
  });

  it("takes a year, a month, last month, or dates", () => {
    const now = at("2026-10-09T12:00:00Z");
    expect(resolvePeriod({ year: 2025 }, now)).toMatchObject({
      since: "2025-01-01",
      until: "2025-12-31",
    });
    expect(resolvePeriod({ month: "2026-02" }, now)).toMatchObject({
      since: "2026-02-01",
      until: "2026-02-28",
    });
    expect(resolvePeriod({ month: "previous" }, now)).toMatchObject({
      since: "2026-09-01",
      until: "2026-09-30",
    });
    expect(previousMonth(at("2026-01-03T00:00:00Z"))).toBe("2025-12");
    expect(resolvePeriod({ since: "2025-07-01", until: "2026-06-30" }, now)).toMatchObject({
      since: "2025-07-01",
      until: "2026-06-30",
    });
  });

  it("refuses two ways at once, bad dates, and a period that ends before it starts", () => {
    const now = at("2026-10-09T12:00:00Z");
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as RdLedgerError).code;
      }
      return null;
    };
    expect(code(() => resolvePeriod({ year: 2026, month: "2026-01" }, now))).toBe("BAD_PERIOD");
    expect(code(() => resolvePeriod({ since: "2026-02-30" }, now))).toBe("BAD_PERIOD");
    expect(code(() => resolvePeriod({ month: "2026-13" }, now))).toBe("BAD_PERIOD");
    expect(code(() => resolvePeriod({ since: "2026-05-01", until: "2026-04-01" }, now))).toBe(
      "BAD_PERIOD",
    );
  });
});

describe("the message rules", () => {
  const ids = (subject: string, body = "") => messageSignals(subject, body).map((h) => h.id);

  it("finds experiments, approaches, failures and rewrites, with the words as evidence", () => {
    expect(ids("Prototype a graph solver")).toEqual(["experiment-words"]);
    expect(ids("Spike: try H3 cells")).toEqual(["experiment-words", "approach-words"]);
    expect(ids("Benchmark the new parser")).toEqual(["experiment-words"]);
    expect(ids("Abandon the streaming approach: didn't work under load")).toEqual([
      "approach-words",
      "failed-words",
    ]);
    expect(ids("Rewrite the scheduler in Rust")).toEqual(["rewrite"]);
    expect(ids("Replace geohash clustering with H3 cells")).toEqual(["rewrite"]);
    expect(messageSignals("Proof of concept for A/B test routing", "")[0]!.evidence).toBe(
      'the message says "proof of concept", "a/b test"',
    );
  });

  it("finds nothing in ordinary work, and ignores trailers", () => {
    expect(ids("Add date filters to the dashboard")).toEqual([]);
    expect(ids("Retry failed uploads")).toEqual([]);
    expect(
      ids("Add login page", "Body text.\n\nCo-authored-by: Try Bot <try@example.com>"),
    ).toEqual([]);
  });

  it("knows a revert and the commit it names", () => {
    const body = "This reverts commit 0123456789abcdef0123456789abcdef01234567.";
    expect(isRevert('Revert "Try annealing"', body)).toBe(true);
    expect(revertedSha('Revert "Try annealing"', body)).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
    expect(isRevert("Reverse the list", "")).toBe(false);
  });

  it("measures a replacement inside the same files, leaving lockfiles out", () => {
    expect(
      rewriteSize([
        { path: "src/a.ts", added: 130, deleted: 120, binary: false },
        { path: "pnpm-lock.yaml", added: 900, deleted: 900, binary: false },
        { path: "src/b.ts", added: 300, deleted: 0, binary: false },
      ]),
    ).toEqual({ lines: 120, files: 1 });
  });

  it("names spike branches and labels", () => {
    for (const b of ["spike/graph", "exp-cache", "poc_ranker", "alice/experiment-1", "try/h3"])
      expect(isSpikeBranch(b), b).toBe(true);
    for (const b of ["main", "feature/expense-report", "fix/trying-times", "release/1.2"])
      expect(isSpikeBranch(b), b).toBe(false);
    expect(isSpikeLabel("R&D")).toBe(true);
    expect(isSpikeLabel("spike")).toBe(true);
    expect(isSpikeLabel("bug")).toBe(false);
  });

  it("every rule says what the record shows and what it may help document", () => {
    for (const s of SIGNALS) {
      expect(s.shows.length).toBeGreaterThan(20);
      expect(s.element.length).toBeGreaterThan(10);
      expect(s.shows + s.element).not.toMatch(/\bqualif/i);
    }
  });
});

describe("the routine markers", () => {
  const ids = (c: Partial<Parameters<typeof routineMarkers>[0]>) =>
    routineMarkers({
      subject: "",
      author: "Ada",
      email: "ada@example.com",
      parents: ["a"],
      files: [{ path: "src/x.ts", added: 1, deleted: 0, binary: false }],
      ...c,
    }).map((h) => h.id);

  it("marks bots, dependencies, formatting, releases, docs and CI", () => {
    expect(ids({ author: "dependabot[bot]", subject: "Bump vite from 7.1.2 to 7.1.5" })).toEqual([
      "bot",
      "dependency",
    ]);
    expect(ids({ subject: "chore(deps): update dependency eslint to v9" })).toEqual(["dependency"]);
    expect(ids({ subject: "Format with prettier" })).toEqual(["format"]);
    expect(ids({ subject: "style: fix lint" })).toEqual(["format"]);
    expect(ids({ subject: "Release v1.4.0" })).toEqual(["release"]);
    expect(ids({ subject: "v2.0.0" })).toEqual(["release"]);
    expect(
      ids({
        subject: "Explain the solver",
        files: [{ path: "docs/a.md", added: 3, deleted: 0, binary: false }],
      }),
    ).toEqual(["docs-only"]);
    expect(
      ids({
        subject: "cache the store",
        files: [{ path: ".github/workflows/ci.yml", added: 1, deleted: 0, binary: false }],
      }),
    ).toEqual(["ci-only"]);
    expect(ids({ parents: ["a", "b"], subject: "Merge branch 'x'" })).toEqual(["merge"]);
    expect(ids({ subject: "Add the date-format option" })).toEqual([]);
  });
});

describe("AI co-authors", () => {
  it("reads the identities agents write by default", () => {
    const body = [
      "Co-authored-by: Claude <noreply@anthropic.com>",
      "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
      "Co-authored-by: Cursor Agent <cursoragent@cursor.com>",
      "Co-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>",
      "Co-authored-by: Codex <codex@openai.com>",
      "Co-authored-by: Grace Example <grace@example.com>",
    ].join("\n");
    expect(aiCoauthors("Ada Example", "ada@example.com", body)).toEqual([
      "Claude",
      "Cursor",
      "Copilot",
      "Codex",
    ]);
    expect(aiCoauthors("copilot-swe-agent[bot]", "x@users.noreply.github.com", "")).toEqual([
      "Copilot",
    ]);
    expect(aiCoauthors("Ada Example", "ada@example.com", "")).toEqual([]);
  });
});

describe("components", () => {
  it("defaults to workspace packages, then top-level folders, then the root", () => {
    expect(defaultComponent("apps/router/src/solver.ts")).toBe("apps/router");
    expect(defaultComponent("packages/geo/index.ts")).toBe("packages/geo");
    expect(defaultComponent("src/server/main.go")).toBe("src");
    expect(defaultComponent("apps/README.md")).toBe("apps");
    expect(defaultComponent("package.json")).toBe(ROOT_COMPONENT);
  });

  it("matches the user's globs, first rule first", () => {
    expect(globToRegExp("apps/router/**").test("apps/router/src/a.ts")).toBe(true);
    expect(globToRegExp("apps/router").test("apps/router/src/a.ts")).toBe(true);
    expect(globToRegExp("apps/router").test("apps/routers/a.ts")).toBe(false);
    expect(globToRegExp("**/*.sql").test("db/migrations/001.sql")).toBe(true);
    expect(globToRegExp("**/*.sql").test("top.sql")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/b.ts")).toBe(false);
    const rule = parseComponentFlag("Route optimizer=apps/router/**, packages/geo");
    expect(rule.name).toBe("Route optimizer");
    expect(rule.globs).toEqual(["apps/router/**", "packages/geo"]);
    expect(() => parseComponentFlag("no-equals")).toThrow(RdLedgerError);
  });

  it("splits a commit by lines changed, lockfiles aside", () => {
    const shares = commitShares(
      [
        { path: "apps/router/a.ts", added: 30, deleted: 0, binary: false },
        { path: "packages/geo/b.ts", added: 5, deleted: 5, binary: false },
        { path: "pnpm-lock.yaml", added: 500, deleted: 400, binary: false },
      ],
      [parseComponentFlag("Routing=apps/router/**")],
    );
    expect(shares.map((s) => [s.name, s.share])).toEqual([
      ["Routing", 0.75],
      ["packages/geo", 0.25],
    ]);
    expect(
      commitShares([{ path: "pnpm-lock.yaml", added: 5, deleted: 5, binary: false }], []),
    ).toEqual([{ name: ROOT_COMPONENT, share: 1, lines: 10 }]);
  });
});

describe("people's figures", () => {
  it("reads name, email, hours, rate and wages, as the user keeps them", () => {
    const rows = parsePeople(
      'Name,Email,Hours,Hourly Rate,Wages\nAda Example,,"1,450",$95,\n,grace@example.com,,,148000\n',
    );
    expect(rows).toEqual([
      { row: 2, name: "Ada Example", email: null, hours: 1450, hourlyRate: 95, wages: null },
      {
        row: 3,
        name: "",
        email: "grace@example.com",
        hours: null,
        hourlyRate: null,
        wages: 148000,
      },
    ]);
    expect(basisOf(rows[0]!)).toEqual({
      hours: 1450,
      amount: 137750,
      basis: "hours × hourly rate as supplied",
    });
    expect(basisOf(rows[1]!).basis).toBe("wages as supplied");
    expect(matchFigures(rows, { name: "ada  example", emails: [] })).toBe(rows[0]);
    expect(matchFigures(rows, { name: "Grace", emails: ["Grace@Example.com"] })).toBe(rows[1]);
    expect(matchFigures(rows, { name: "Linus", emails: [] })).toBeNull();
  });

  it("refuses a file it cannot read honestly", () => {
    const code = (text: string) => {
      try {
        parsePeople(text);
      } catch (e) {
        return (e as RdLedgerError).code;
      }
      return null;
    };
    expect(code("")).toBe("BAD_PEOPLE_FILE");
    expect(code("name,notes\nAda,x\n")).toBe("BAD_PEOPLE_FILE");
    expect(code("name,hours\nAda,lots\n")).toBe("BAD_PEOPLE_FILE");
    expect(code("name,hours\nAda,-5\n")).toBe("BAD_PEOPLE_FILE");
  });
});

describe("remotes and links", () => {
  it("keeps host, owner and name, and drops any credentials", () => {
    expect(parseRemote("https://x-access-token:ghs_SECRET@github.com/acme/api.git")).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "api",
    });
    expect(parseRemote("git@github.com:acme/api.git")).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "api",
    });
    expect(parseRemote("ssh://git@gitlab.com/group/sub/proj.git")).toEqual({
      host: "gitlab.com",
      owner: "group/sub",
      repo: "proj",
    });
    expect(parseRemote("/srv/git/local.git")).toBeNull();
    expect(JSON.stringify(parseRemote("https://u:SECRET@github.com/a/b"))).not.toContain("SECRET");
  });

  it("links commits on the three hosts whose URLs it knows, and nowhere else", () => {
    const sha = "a".repeat(40);
    expect(commitLink({ host: "github.com", owner: "a", repo: "b" }, sha)).toBe(
      `https://github.com/a/b/commit/${sha}`,
    );
    expect(commitLink({ host: "gitlab.com", owner: "a", repo: "b" }, sha)).toBe(
      `https://gitlab.com/a/b/-/commit/${sha}`,
    );
    expect(commitLink({ host: "git.example.com", owner: "a", repo: "b" }, sha)).toBeNull();
  });

  it("parses git log records with bodies, merges and binary files", () => {
    const RS = "\x1e";
    const US = "\x1f";
    const out =
      `${RS}${"1".repeat(40)}${US}${"2".repeat(40)} ${"3".repeat(40)}${US}Ada${US}ada@example.com${US}2026-03-01T23:30:00-08:00${US}2026-03-02T07:30:00+00:00${US}Merge it${US}line one\nline${US}two\x1d\n` +
      `${RS}${"2".repeat(40)}${US}${US}Ada${US}ada@example.com${US}2026-02-01T10:00:00+00:00${US}2026-02-01T10:00:00+00:00${US}Add${US}\x1d\n\n3\t1\tsrc/a b.ts\n-\t-\timg.png\n`;
    const commits = parseLog(out);
    expect(commits).toHaveLength(2);
    expect(commits[0]!.parents).toHaveLength(2);
    expect(commits[0]!.body).toBe(`line one\nline${US}two`);
    expect(commits[0]!.authored.slice(0, 10)).toBe("2026-03-01");
    expect(commits[1]!.files).toEqual([
      { path: "src/a b.ts", added: 3, deleted: 1, binary: false },
      { path: "img.png", added: 0, deleted: 0, binary: true },
    ]);
  });
});

describe("CSV", () => {
  it("quotes what needs it and defuses spreadsheet formulas", () => {
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(-3)).toBe("-3");
    expect(parseCsv('a,"b, c"\r\n"d ""e""",f\n')).toEqual([
      ["a", "b, c"],
      ['d "e"', "f"],
    ]);
  });
});
