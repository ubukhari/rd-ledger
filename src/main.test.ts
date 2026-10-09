/**
 * The command line end to end, on fixture repositories and the demo. GitHub is a fake fetch.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { lines, RepoBuilder } from "./fixture.js";
import { fakeFetch, pull } from "./fake-github.js";
import { main, type Io } from "./main.js";
import { DISCLAIMER } from "./sources.js";
import { NOT_BUILT, WAITLIST_CLI_URL } from "./waitlist.js";

const roots: string[] = [];
const fresh = () => {
  const d = mkdtempSync(path.join(tmpdir(), "rd-ledger-main-"));
  roots.push(d);
  return d;
};
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const noNetwork: Io["fetch"] = async (url) => {
  throw new Error(`unexpected request to ${url}`);
};

async function run(argv: string[], over: Partial<Io> = {}) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: over.cwd ?? fresh(),
    now: new Date("2026-10-09T12:00:00Z"),
    env: {},
    fetch: noNetwork,
    ...over,
  });
  return { code, out, err };
}

function smallRepo(remote?: string) {
  const repo = new RepoBuilder(path.join(fresh(), "repo")).init(remote);
  const ada = { name: "Ada Example", email: "ada@example.com" };
  repo.commit({
    author: ada,
    date: "2026-02-01",
    message: "Start",
    files: { "src/a.ts": lines(5, "a") },
  });
  repo.commit({
    author: ada,
    date: "2026-03-01",
    message: "Benchmark two parsers",
    files: { "src/b.ts": lines(5, "b") },
  });
  return repo;
}

describe("rd-ledger", () => {
  it("--help names what it reads and sends, and the not-advice line", async () => {
    const { code, out } = await run(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain(DISCLAIMER);
    expect(out).toContain("makes no network request");
    expect(out).toContain("never printed or written");
  });

  it("refuses unknown options with exit 2 and a fix", async () => {
    const { code, err } = await run(["--frobnicate"]);
    expect(code).toBe(2);
    expect(err).toContain("unknown option --frobnicate");
    expect(err).toContain("fix:");
    const json = await run(["--year", "26", "--json"]);
    expect(JSON.parse(json.out).error).toMatchObject({ code: "BAD_ARGS", retryable: false });
  });

  it("writes a dated pack with owner-only permissions, every file carrying the not-advice line", async () => {
    const repo = smallRepo();
    const cwd = path.dirname(repo.dir);
    const { code, out } = await run(["repo", "--year", "2026"], { cwd });
    expect(code).toBe(0);
    expect(out).toContain(DISCLAIMER);
    expect(out).toContain("Wrote ./rd-ledger-2026-01-01-to-2026-12-31/");
    expect(out).toContain(NOT_BUILT);
    expect(out).toContain(WAITLIST_CLI_URL);
    const dir = path.join(cwd, "rd-ledger-2026-01-01-to-2026-12-31");
    const files = readdirSync(dir).sort();
    expect(files).toEqual([
      "candidates.csv",
      "commits.csv",
      "components.csv",
      "evidence.md",
      "people.csv",
    ]);
    for (const f of files) {
      expect(readFileSync(path.join(dir, f), "utf8").slice(0, 400)).toContain(DISCLAIMER);
      if (process.platform !== "win32")
        expect(statSync(path.join(dir, f)).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(path.join(dir, "evidence.md"), "utf8")).toContain("Benchmark two parsers");
  });

  it("--json prints the report; --no-files writes nothing; --quiet drops the waitlist line", async () => {
    const repo = smallRepo();
    const cwd = path.dirname(repo.dir);
    const json = await run([repo.dir, "--year", "2026", "--json", "--no-files"], { cwd });
    const report = JSON.parse(json.out);
    expect(report.note).toBe(DISCLAIMER);
    expect(report.totals.candidates).toBe(1);
    expect(existsSync(path.join(cwd, "rd-ledger-2026-01-01-to-2026-12-31"))).toBe(false);
    const quiet = await run([repo.dir, "--year", "2026", "--quiet", "--no-files"], { cwd });
    expect(quiet.out).not.toContain(NOT_BUILT);
  });

  it("allocates the people file's figures and says whose are missing", async () => {
    const repo = smallRepo();
    const cwd = path.dirname(repo.dir);
    writeFileSync(
      path.join(cwd, "people.csv"),
      "name,hours,hourly_rate\nAda Example,200,100\nNo One,10,10\n",
    );
    const { code, out } = await run(
      [repo.dir, "--year", "2026", "--people", "people.csv", "--out", "pack"],
      { cwd },
    );
    expect(code).toBe(0);
    expect(out).toContain("200 h at 100.00/h");
    expect(out).toContain("No One, who made no commit");
    const alloc = readFileSync(path.join(cwd, "pack", "allocation.csv"), "utf8");
    expect(alloc).toContain("Ada Example,src,1,200,20000.00");
    expect(alloc).toContain("not a time record");
  });

  it("--prs needs a token, and a GitHub repository", async () => {
    const plain = smallRepo();
    const noToken = await run([plain.dir, "--prs", "--no-files"]);
    expect(noToken.code).toBe(1);
    expect(noToken.err).toContain("NO_TOKEN");
    const notGithub = await run([plain.dir, "--prs", "--no-files"], { env: { GITHUB_TOKEN: "x" } });
    expect(notGithub.err).toContain("NOT_GITHUB");
  });

  it("--prs reads pull requests with the user's token, and never shows it", async () => {
    const repo = smallRepo("https://github.com/acme/api.git");
    const TOKEN = "fake-token-for-the-test";
    const { fetch, calls } = fakeFetch({
      "/repos/acme/api/pulls?state=all&sort=created&direction=desc&per_page=100&page=1": [
        pull(3, "2026-04-01", {
          title: "Try a trie index",
          state: "closed",
          closed_at: "2026-04-09T00:00:00Z",
        }),
        pull(2, "2025-11-01"),
      ],
      "/repos/acme/api/pulls/3/files?per_page=100": [{ filename: "src/trie.ts" }],
    });
    const cwd = path.dirname(repo.dir);
    const { code, out, err } = await run([repo.dir, "--year", "2026", "--prs", "--out", "pack"], {
      cwd,
      env: { GH_TOKEN: TOKEN },
      fetch,
    });
    expect(code).toBe(0);
    expect(out).toContain("1 pull requests created in the period, 1 flagged");
    expect(calls).toHaveLength(2);
    const prs = readFileSync(path.join(cwd, "pack", "prs.csv"), "utf8");
    expect(prs).toContain("closed-unmerged");
    expect(prs).toContain("pr-closed-unmerged");
    const all = [
      out,
      err,
      ...readdirSync(path.join(cwd, "pack")).map((f) =>
        readFileSync(path.join(cwd, "pack", f), "utf8"),
      ),
    ].join("\n");
    expect(all).not.toContain(TOKEN);
  });

  it("explains a folder that is not a repository", async () => {
    const { code, err } = await run([fresh(), "--no-files"]);
    expect(code).toBe(1);
    expect(err).toContain("NOT_A_REPO");
  });

  it("demo runs on the invented company, says so, and makes no request", async () => {
    const cwd = fresh();
    const { code, out } = await run(["demo"], { cwd });
    expect(code).toBe(0);
    expect(out).toMatch(/^SYNTHETIC demo data/);
    expect(out).toContain("10 candidate commits");
    expect(readdirSync(path.join(cwd, "rd-ledger-demo"))).toContain("allocation.csv");
  });

  it("signals lists every rule", async () => {
    const { code, out } = await run(["signals"]);
    expect(code).toBe(0);
    expect(out).toContain("unmerged (medium)");
    expect(out).toContain("docs-only");
    expect(JSON.parse((await run(["signals", "--json"])).out).signals.length).toBe(10);
  });
});
