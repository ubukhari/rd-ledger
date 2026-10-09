/**
 * The command line.
 *
 *   rd-ledger [repo-folder] [--year 2026 | --month 2026-09 | --since … --until …] [options]
 *   rd-ledger --prs                          pull requests too, with GITHUB_TOKEN or GH_TOKEN
 *   rd-ledger demo [--out dir]               an invented company's repository
 *   rd-ledger signals                        the rules
 *   rd-ledger mcp                            a local stdio MCP server
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseComponentFlag, type ComponentRule } from "./components.js";
import { buildDemo, DEMO_YEAR, SYNTHETIC_LABEL } from "./demo.js";
import { RdLedgerError } from "./errors.js";
import { gitAt, readRepo } from "./git.js";
import { readPullRequests, tokenFrom, TOKEN_ENVS, type Fetch, type PrRead } from "./github.js";
import { INSTALL } from "./install.js";
import { serveStdio } from "./mcp.js";
import { parsePeople, type PersonFigures } from "./people.js";
import { resolvePeriod, type PeriodInput } from "./period.js";
import { packDir, renderCsvs, renderMarkdown, renderText } from "./render.js";
import { buildReport } from "./scan.js";
import { ROUTINE, SIGNALS } from "./signals.js";
import { DISCLAIMER } from "./sources.js";
import { version } from "./version.js";
import { PAGES_URL } from "./waitlist.js";

export function help(): string {
  return `rd-ledger ${version()}: R&D tax-credit evidence from your git history.
${DISCLAIMER}

Usage
  ${INSTALL} [repo-folder] [options]
  ${INSTALL} demo
  ${INSTALL} signals
  ${INSTALL} mcp

It reads the repository's commits for a period, groups them into components, lists who worked on
what and when, and marks the commits that look like experimentation (reverts, branches never
merged, spikes, benchmarks, approaches abandoned) as candidate evidence, each traced to its commit.
It writes a dated pack for your accountant: evidence.md and the CSVs behind it.

Period (one of; default: last year from January to April, otherwise this year to date)
  --year <YYYY>            a calendar tax year
  --month <YYYY-MM>        one month (or --month previous, for last month)
  --since <YYYY-MM-DD>     a custom period, e.g. a fiscal year, with --until <YYYY-MM-DD>

Options
  --base <branch>          the main branch work is merged into (default: the origin's default
                           branch, else main or master)
  --component <spec>       name your own components: --component "Route optimizer=apps/router/**"
                           (repeat; files no rule matches fall back to folders)
  --people <file.csv>      the hours, hourly rate or wages you record for each person:
                           name,hours,hourly_rate,wages (email optional). Only these are allocated
                           across components; nothing is ever estimated from commits
  --prs                    read pull requests too, with your token from ${TOKEN_ENVS.join(" or ")}
  --repo <owner/name>      the GitHub repository for --prs, when origin is not on GitHub
  --max-requests <n>       cap GitHub requests for --prs (default 200)
  --with-emails            include authors' emails in the pack (names only by default)
  --out <dir>              where the pack goes (default ./rd-ledger-<since>-to-<until>)
  --no-files               print the summary, write nothing
  --json                   the whole report as JSON on stdout
  --quiet                  leave out the line about the evidence ledger
  -h, --help               this text
  -v, --version            the version

What it reads and sends
  It runs git on the folder you name and writes the pack where --out says (owner-only
  permissions). It makes no network request and calls no LLM, unless you pass --prs: then it
  sends GET requests to api.github.com with your token, and nothing anywhere else. The token is
  never printed or written. It does not decide whether any work qualifies.

Guides: ${PAGES_URL}
`;
}

interface Args {
  dir: string | null;
  period: PeriodInput;
  base?: string;
  components: string[];
  people?: string;
  prs: boolean;
  repo?: string;
  maxRequests?: number;
  withEmails: boolean;
  out: string | null;
  noFiles: boolean;
  json: boolean;
  quiet: boolean;
  command: "scan" | "demo" | "signals" | "mcp";
  help: boolean;
  version: boolean;
}

const bad = (cause: string, fix = `See ${INSTALL} --help.`) =>
  new RdLedgerError("BAD_ARGS", cause, fix);

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    dir: null,
    period: {},
    components: [],
    prs: false,
    withEmails: false,
    out: null,
    noFiles: false,
    json: false,
    quiet: false,
    command: "scan",
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? arg.split(/=(.*)/s) : [arg];
    const take = (): string => {
      if (inline !== undefined) return inline;
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith("--") && v.length > 2))
        throw bad(`${flag} needs a value`);
      i++;
      return v;
    };
    switch (flag) {
      case "--year": {
        const v = take();
        if (!/^\d{4}$/.test(v))
          throw bad(`--year ${v} is not a year`, "Write it like --year 2026.");
        a.period.year = Number(v);
        break;
      }
      case "--month":
        a.period.month = take();
        break;
      case "--since":
        a.period.since = take();
        break;
      case "--until":
        a.period.until = take();
        break;
      case "--base":
        a.base = take();
        break;
      case "--component":
        a.components.push(take());
        break;
      case "--people":
        a.people = take();
        break;
      case "--prs":
        a.prs = true;
        break;
      case "--repo": {
        const v = take();
        if (!/^[\w.-]+\/[\w.-]+$/.test(v))
          throw bad(`--repo ${v} is not owner/name`, "Write it like --repo acme/api.");
        a.repo = v;
        break;
      }
      case "--max-requests": {
        const v = take();
        if (!/^\d{1,4}$/.test(v) || Number(v) < 1)
          throw bad(`--max-requests ${v} is not a number from 1 to 9999`);
        a.maxRequests = Number(v);
        break;
      }
      case "--with-emails":
        a.withEmails = true;
        break;
      case "--out":
        a.out = take();
        break;
      case "--no-files":
        a.noFiles = true;
        break;
      case "--json":
        a.json = true;
        break;
      case "--quiet":
      case "-q":
        a.quiet = true;
        break;
      case "-h":
      case "--help":
      case "help":
        a.help = true;
        break;
      case "-v":
      case "--version":
        a.version = true;
        break;
      default:
        if (i === 0 && (arg === "demo" || arg === "signals" || arg === "mcp")) {
          a.command = arg;
          break;
        }
        if (arg.startsWith("-")) throw bad(`unknown option ${arg}`);
        if (a.dir !== null)
          throw bad(`two folders given (${a.dir}, ${arg})`, "Name one repository folder.");
        a.dir = arg;
    }
  }
  return a;
}

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  cwd: string;
  now: Date;
  env: Record<string, string | undefined>;
  fetch: Fetch;
}

const defaultIo = (): Io => ({
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  cwd: process.cwd(),
  now: new Date(),
  env: process.env,
  fetch: (url, init) => fetch(url, init),
});

function fail(io: Io, json: boolean, err: RdLedgerError): number {
  if (json) io.stdout(JSON.stringify({ error: err.toJSON(), note: DISCLAIMER }, null, 2) + "\n");
  else io.stderr(`rd-ledger: ${err.cause_}\n  fix: ${err.fix}\n  (${err.code})\n`);
  return err.code === "BAD_ARGS" ? 2 : 1;
}

function signalsText(): string {
  const out = [
    `The rules rd-ledger applies. ${DISCLAIMER}`,
    "",
    "Candidate evidence of experimentation:",
  ];
  for (const s of SIGNALS)
    out.push(`  ${s.id} (${s.strength})`, `    ${s.shows}`, `    May help document: ${s.element}`);
  out.push("", "Likely-routine markers (shown for your adviser; nothing is removed):");
  for (const r of ROUTINE) out.push(`  ${r.id}: ${r.shows}`);
  return out.join("\n") + "\n";
}

const today = (d: Date) => d.toISOString().slice(0, 10);

export async function main(argv: readonly string[], io: Io = defaultIo()): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof RdLedgerError) return fail(io, argv.includes("--json"), err);
    throw err;
  }
  if (args.help) {
    io.stdout(help());
    return 0;
  }
  if (args.version) {
    io.stdout(version() + "\n");
    return 0;
  }
  if (args.command === "mcp") {
    await serveStdio({ cwd: io.cwd });
    return 0;
  }
  if (args.command === "signals") {
    io.stdout(
      args.json
        ? JSON.stringify({ note: DISCLAIMER, signals: SIGNALS, routine: ROUTINE }, null, 2) + "\n"
        : signalsText(),
    );
    return 0;
  }
  let scratch: string | null = null;
  try {
    const components: ComponentRule[] = args.components.map(parseComponentFlag);
    let dir: string;
    let people: PersonFigures[] | null = null;
    let periodInput = args.period;
    if (args.command === "demo") {
      if (args.prs) throw bad("--prs reads GitHub; the demo is local", "Leave out --prs.");
      scratch = mkdtempSync(path.join(tmpdir(), "rd-ledger-demo-"));
      dir = path.join(scratch, "demo-app");
      const peopleFile = buildDemo(dir, scratch);
      people = parsePeople(readFileSync(peopleFile, "utf8"));
      if (Object.keys(periodInput).length === 0) periodInput = { year: DEMO_YEAR };
    } else {
      dir = path.resolve(io.cwd, args.dir ?? ".");
      if (args.people) {
        const file = path.resolve(io.cwd, args.people);
        let text: string;
        try {
          text = readFileSync(file, "utf8");
        } catch {
          throw new RdLedgerError(
            "FILE_NOT_FOUND",
            `cannot read ${file}`,
            "Check the path of your people CSV (name,hours,hourly_rate,wages).",
          );
        }
        people = parsePeople(text);
      }
    }
    const period = resolvePeriod(periodInput, io.now);
    const git = gitAt(dir);
    const facts = readRepo(dir, { base: args.base, git });

    let prs: PrRead | null = null;
    if (args.prs) {
      const token = tokenFrom(io.env);
      if (!token)
        throw new RdLedgerError(
          "NO_TOKEN",
          `--prs needs your GitHub token in ${TOKEN_ENVS.join(" or ")}`,
          "Set GITHUB_TOKEN (or GH_TOKEN, e.g. GH_TOKEN=$(gh auth token)) in your terminal, or leave out --prs.",
        );
      let owner: string;
      let repo: string;
      if (args.repo) [owner, repo] = args.repo.split("/") as [string, string];
      else if (facts.remote?.host === "github.com") ({ owner, repo } = facts.remote);
      else
        throw new RdLedgerError(
          "NOT_GITHUB",
          "the origin remote is not a GitHub repository, so --prs does not know which to read",
          "Pass --repo owner/name.",
        );
      prs = await readPullRequests({
        owner,
        repo,
        since: period.since,
        until: period.until,
        token,
        fetch: io.fetch,
        maxRequests: args.maxRequests,
      });
    }

    const report = buildReport({
      git,
      facts,
      period,
      components,
      people,
      prs,
      withEmails: args.withEmails,
      generated: today(io.now),
      version: version(),
    });

    let wrote: { dir: string; files: string[] } | null = null;
    if (!args.noFiles) {
      const outDir = path.resolve(
        io.cwd,
        args.out ?? (args.command === "demo" ? "rd-ledger-demo" : packDir(report)),
      );
      const csvs = renderCsvs(report);
      const files: Record<string, string> = {
        "evidence.md": renderMarkdown(report, csvs),
        ...csvs,
      };
      mkdirSync(outDir, { recursive: true, mode: 0o700 });
      for (const [name, text] of Object.entries(files)) {
        const p = path.join(outDir, name);
        writeFileSync(p, text, { mode: 0o600 });
        chmodSync(p, 0o600);
      }
      const rel = path.relative(io.cwd, outDir);
      wrote = {
        dir: rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? `./${rel}` : outDir,
        files: Object.keys(files),
      };
    }
    if (args.json) io.stdout(JSON.stringify(report, null, 2) + "\n");
    else {
      if (args.command === "demo") io.stdout(`${SYNTHETIC_LABEL}\n\n`);
      io.stdout(renderText(report, { waitlist: !args.quiet, wrote }));
    }
    return 0;
  } catch (err) {
    if (err instanceof RdLedgerError) return fail(io, args.json, err);
    throw err;
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}
