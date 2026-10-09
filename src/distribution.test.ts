/**
 * The files that put rd-ledger where people already are: the package, the README and its recorded
 * run, the CHANGELOG, the repo-root files the sync copies from `distribution/root` (the Action and
 * the Claude Code plugin marketplace), and the mirror the /rd-credit pages on agentwares.vercel.app
 * import. The public repo has the root files at its root and no site, so those checks run in the
 * monorepo only.
 *
 * After changing the CLI's output, rewrite the recorded run (docs/recorded-run.txt and the README
 * block) and the site's mirror:
 *
 *   pnpm --filter rd-ledger record
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lines, RepoBuilder } from "./fixture.js";
import { INSTALL, ON_NPM, PUBLISHED, REPO, RUN } from "./install.js";
import { main } from "./main.js";
import { DISCLAIMER, SOURCES } from "./sources.js";
import {
  NOT_BUILT,
  PAGES_URL,
  WAITLIST_OFFER,
  WAITLIST_PAGE_URL,
  WAITLIST_STATUS,
} from "./waitlist.js";

const here = (rel: string): URL => new URL(`../${rel}`, import.meta.url);
const read = (rel: string): string => readFileSync(here(rel), "utf8");
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T;
const WRITE = Boolean(process.env["RD_LEDGER_WRITE"]);
const pkg = json<{
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  files: string[];
  bin: Record<string, string>;
  homepage: string;
}>("package.json");

/** The demo, run the way the README shows it, in an empty folder, with no network. */
async function recordedRun(): Promise<string> {
  const cwd = mkdtempSync(path.join(tmpdir(), "rd-ledger-record-"));
  try {
    let out = "";
    const args = ["demo", "--out", "rd-ledger-demo"];
    const code = await main(args, {
      stdout: (s) => (out += s),
      stderr: (s) => (out += s),
      cwd,
      now: new Date("2026-10-09T12:00:00Z"),
      env: {},
      fetch: async (url) => {
        throw new Error(`the demo made a request to ${url}`);
      },
    });
    const files = readdirSync(path.join(cwd, "rd-ledger-demo")).sort();
    return [
      `$ ${INSTALL} ${args.join(" ")}`,
      out.trimEnd(),
      `(exit ${code})`,
      "",
      "$ ls rd-ledger-demo",
      ...files,
      "",
    ].join("\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

let recording: string;
beforeAll(async () => {
  recording = await recordedRun();
});

describe("package", () => {
  it("has no runtime dependencies", () => {
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it("ships the CLI and the files the README points at", () => {
    expect(pkg.name).toBe("rd-ledger");
    expect(pkg.bin).toEqual({ "rd-ledger": "./dist/cli.js" });
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
    expect(pkg.homepage).toBe(PAGES_URL);
  });

  it("CHANGELOG has a section for this version", () => {
    expect(read("CHANGELOG.md")).toMatch(
      new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} `, "m"),
    );
  });
});

// blank lines around the fence, as prettier writes them
const BLOCK = /<!-- recorded-run -->\n+```text\n[\s\S]*?```\n+<!-- \/recorded-run -->/;

describe("README", () => {
  it("leads with the one-line use and the disclaimer", () => {
    const readme = read("README.md");
    expect(readme).toContain("```sh\n" + INSTALL + " --year 2026\n```");
    expect(readme.slice(0, 800)).toContain(DISCLAIMER);
  });

  it("carries the recorded run on invented data, which is the CLI's real output", () => {
    const block =
      "<!-- recorded-run -->\n\n```text\n" + recording + "```\n\n<!-- /recorded-run -->";
    if (WRITE) {
      writeFileSync(here("docs/recorded-run.txt"), recording);
      writeFileSync(here("README.md"), read("README.md").replace(BLOCK, block));
    }
    expect(read("docs/recorded-run.txt")).toBe(recording);
    expect(read("README.md")).toContain(block);
    expect(recording).toMatch(/^SYNTHETIC demo data/m);
    expect(recording).toContain(DISCLAIMER);
    expect(recording).toContain(NOT_BUILT);
    expect(recording).not.toContain(tmpdir());
    expect(recording).not.toContain("@example.com");
  });

  it("names what it sends, never invents hours, and cites its sources with the date read", () => {
    const readme = read("README.md");
    expect(readme).toContain("makes no network request");
    expect(readme).toContain("never invents hours");
    expect(readme).toContain("never printed or written");
    expect(readme).toContain(NOT_BUILT);
    expect(readme).toContain("read 9 October 2026");
    for (const s of SOURCES) expect(readme).toContain(s.url);
    // no price for the ledger anywhere until a checkout works
    expect(readme).not.toMatch(/\$\d+ (per|a) (month|year)/);
  });
});

const root = "distribution/root";
const frontmatter = (text: string): Record<string, string> =>
  Object.fromEntries(
    (text.split("---")[1] ?? "")
      .split("\n")
      .map((l) => /^([a-z-]+):\s*(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^"|"$/g, "")]),
  );

describe.skipIf(!existsSync(here(root)))("repo-root files (distribution/root)", () => {
  it("the marketplace's plugin resolves, and its version matches this package", () => {
    const marketplace = json<{
      name: string;
      owner: { name: string };
      plugins: { name: string; source: string }[];
    }>(`${root}/.claude-plugin/marketplace.json`);
    expect(marketplace.name).toBe("rd-ledger");
    expect(marketplace.owner.name).toBe("agentwares");
    expect(marketplace.plugins).toHaveLength(1);
    for (const entry of marketplace.plugins) {
      expect(entry.source.startsWith("./")).toBe(true);
      const plugin = json<{ name: string; version: string }>(
        `${root}/${entry.source.slice(2)}/.claude-plugin/plugin.json`,
      );
      expect(plugin.name).toBe(entry.name);
      expect(plugin.version).toBe(pkg.version);
    }
  });

  it("plugin.json links the page, the docs, the repository, privacy, terms and support", () => {
    const plugin = json<Record<string, string>>(
      `${root}/plugins/rd-ledger/.claude-plugin/plugin.json`,
    );
    expect(plugin.homepage).toBe(pkg.homepage);
    expect(plugin.documentationUrl).toBe(`${REPO}#readme`);
    expect(plugin.repository).toBe(REPO);
    for (const k of ["privacyPolicyUrl", "termsOfServiceUrl", "supportUrl"])
      expect(plugin[k]).toMatch(/^https:\/\/agentwares\.vercel\.app\//);
    expect(plugin.license).toBe("MIT");
  });

  it("the one skill runs the CLI, says the output is not advice, and never asks for a token", () => {
    expect(readdirSync(here(`${root}/plugins/rd-ledger/skills`))).toEqual(["rd-ledger"]);
    const text = read(`${root}/plugins/rd-ledger/skills/rd-ledger/SKILL.md`);
    const front = frontmatter(text);
    expect(front.name).toBe("rd-ledger");
    expect(front.description!.length).toBeGreaterThan(80);
    expect(front.description!.length).toBeLessThanOrEqual(1024);
    expect(text).toContain(`${RUN} $ARGUMENTS`);
    expect(text).toContain("not tax advice");
    expect(text).toContain("Never make up hours");
    expect(text).toContain("Do not read or ask for the user's GitHub token");
  });

  it("no skill or manifest pre-approves a tool: Claude Code asks before every command", () => {
    const walk = (dir: string): string[] =>
      readdirSync(here(dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const files = walk(`${root}/plugins`);
    for (const f of files.filter((x) => x.endsWith(".md"))) {
      const text = read(f);
      const front = text.startsWith("---") ? (text.split("---")[1] ?? "") : "";
      expect(front, f).not.toMatch(/^\s*(allowed-tools|allowedTools)\s*:/m);
    }
    for (const f of [
      ...files.filter((x) => x.endsWith(".json")),
      `${root}/.claude-plugin/marketplace.json`,
    ])
      expect(read(f), f).not.toMatch(/allowed-?tools/i);
  });

  it("the listing icon is a 1024 px square PNG drawn from distribution/icon.svg (`pnpm icon`)", () => {
    const plugin = json<{ icon?: string }>(`${root}/plugins/rd-ledger/.claude-plugin/plugin.json`);
    expect(plugin.icon).toBe("./.claude-plugin/icon.png");
    const file = `${root}/plugins/rd-ledger/${plugin.icon!.slice(2)}`;
    const png = readFileSync(here(file));
    expect(statSync(here(file)).size).toBeLessThan(2 * 1024 * 1024);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    const key = "rd-ledger-icon-source-sha256\0";
    const at = png.indexOf(key, 0, "latin1");
    expect(at, "icon.png carries no source hash: run `pnpm icon`").toBeGreaterThan(0);
    const drawnFrom = png.subarray(at + key.length, at + key.length + 64).toString("latin1");
    const svg = createHash("sha256").update(read("distribution/icon.svg")).digest("hex");
    expect(drawnFrom, "distribution/icon.svg changed: run `pnpm icon`").toBe(svg);
  });

  it("the plugin folder has the README the directory lists it by, naming what it runs", () => {
    const readme = read(`${root}/plugins/rd-ledger/README.md`);
    expect(readme.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(40);
    expect(readme).toContain(RUN);
    expect(readme).toContain("pre-approves");
  });
});

/** The Action's script, run as GitHub runs it, on a fixture repository: no request is made. */
describe.skipIf(!existsSync(here("dist/cli.js")) || !existsSync(here(`${root}/action.yml`)))(
  "the GitHub Action",
  () => {
    // vitest runs a skipped block's body while collecting, so read only where the file exists
    const action = existsSync(here(`${root}/action.yml`)) ? read(`${root}/action.yml`) : "run: |\n";
    const script = /run: \|\n([\s\S]*)$/.exec(action)![1]!.replace(/^ {8}/gm, "");
    const dirs: string[] = [];
    afterAll(() => {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    });

    function runAction(env: Record<string, string>) {
      const dir = mkdtempSync(path.join(tmpdir(), "rd-ledger-action-"));
      dirs.push(dir);
      const repo = new RepoBuilder(path.join(dir, "work")).init();
      const ada = { name: "Ada Example", email: "ada@example.com" };
      repo.commit({
        author: ada,
        date: "2026-09-02",
        message: "Start",
        files: { "src/a.ts": lines(5, "a") },
      });
      repo.commit({
        author: ada,
        date: "2026-09-08",
        message: "Prototype a faster index",
        files: { "src/i.ts": lines(9, "i") },
      });
      const summary = path.join(dir, "summary.md");
      const outputs = path.join(dir, "outputs.txt");
      writeFileSync(summary, "");
      writeFileSync(outputs, "");
      let status = 0;
      let stdout: string;
      try {
        stdout = execFileSync("bash", ["-c", script], {
          cwd: repo.dir,
          env: {
            PATH: process.env["PATH"],
            HOME: dir,
            GITHUB_ACTION_PATH: fileURLToPath(here(".")),
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: summary,
            GITHUB_OUTPUT: outputs,
            RDL_PATH: ".",
            RDL_MONTH: "2026-09",
            RDL_YEAR: "",
            RDL_SINCE: "",
            RDL_UNTIL: "",
            RDL_BASE: "",
            RDL_COMPONENTS: "Search index=src/**\n",
            ...env,
          },
          encoding: "utf8",
        });
      } catch (e) {
        status = (e as { status: number }).status;
        stdout = String((e as { stdout: unknown }).stdout ?? "");
      }
      return {
        status,
        stdout,
        summary: readFileSync(summary, "utf8"),
        outputs: Object.fromEntries(
          readFileSync(outputs, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((l) => l.split(/=(.*)/s).slice(0, 2) as [string, string]),
        ),
      };
    }

    it("writes the pack, the job summary and the outputs", () => {
      const r = runAction({});
      expect(r.status).toBe(0);
      expect(r.summary).toContain("# R&D evidence pack: work, 2026-09-01 to 2026-09-30");
      expect(r.summary).toContain(DISCLAIMER);
      expect(r.summary).toContain("### Search index");
      expect(r.outputs).toMatchObject({ commits: "2", candidates: "1" });
      expect(existsSync(r.outputs["evidence"]!)).toBe(true);
      expect(r.stdout).toContain(NOT_BUILT);
    });

    it("stops on a bad period with the CLI's error", () => {
      const r = runAction({ RDL_YEAR: "2026", RDL_SINCE: "2026-01-01" });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("BAD_PERIOD");
    });
  },
);

/**
 * One install command (src/install.ts), everywhere it is shown. Any form of it found elsewhere must
 * be INSTALL, or RUN where an agent runs it unattended; code imports it rather than spell it.
 */
const COMMAND =
  /npx (?:-{1,2}[\w-]+(?:=[\w-]+)? )*(?:github:agentwares\/)?rd-ledger(?:@latest)?(?![\w./-])/g;
const forms = (text: string): string[] => [...text.matchAll(COMMAND)].map((m) => m[0]);
const walk = (rel: string): string[] =>
  !existsSync(here(rel))
    ? []
    : statSync(here(rel)).isFile()
      ? [rel]
      : readdirSync(here(rel), { withFileTypes: true })
          .filter((e) => !["node_modules", "dist", ".next"].includes(e.name))
          .flatMap((e) => walk(`${rel}/${e.name}`));

describe("the install command", () => {
  it(`is ${INSTALL} while ON_NPM is ${String(ON_NPM)}`, () => {
    expect(INSTALL).toBe(`npx ${ON_NPM ? "" : "--allow-git=root github:agentwares/"}${pkg.name}`);
    expect(RUN).toBe(
      ON_NPM
        ? `npx -y ${pkg.name}@latest`
        : `npx -y --allow-git=root github:agentwares/${pkg.name}`,
    );
    expect(REPO).toBe(`https://github.com/agentwares/${pkg.name}`);
    // npm cannot serve what has no public repo to publish from
    if (ON_NPM) expect(PUBLISHED).toBe(true);
  });

  const UNFLAGGED = /npx (?:(?:-y|--yes) )?github:agentwares\/rd-ledger(?![\w./-])/;
  it("never shows the GitHub form without --allow-git, which npm 12 refuses", () => {
    if (!ON_NPM)
      for (const form of [INSTALL, RUN]) expect(form).toContain("--allow-git=root github:");
    const files = [
      "README.md",
      "CHANGELOG.md",
      "docs/recorded-run.txt",
      ...walk("distribution"),
      ...walk("examples"),
      ...walk("src"),
      ...walk("scripts"),
      ...walk("../site/src/app/rd-credit"),
      ...walk("../../docs/CHANGELOG.md"),
      ...walk("../../scripts/sync-oss-repos.sh"),
    ].filter((f) => /\.(md|json|txt|ts|tsx|mjs|sh|yml)$/.test(f));
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) expect(read(file), file).not.toMatch(UNFLAGGED);
  });

  const docs = [
    "README.md",
    "CHANGELOG.md",
    "docs/recorded-run.txt",
    ...walk("distribution"),
    ...walk("examples"),
  ].filter((f) => /\.(md|json|txt|yml)$/.test(f));

  it.each(docs)("%s names only INSTALL or RUN", (file) => {
    const text = read(file);
    if (WRITE) {
      const next = text.replace(COMMAND, (m) => (/ (?:-y|--yes) /.test(m) ? RUN : INSTALL));
      if (next !== text) writeFileSync(here(file), next);
    }
    for (const form of forms(read(file))) expect([INSTALL, RUN], file).toContain(form);
  });

  it("code, scripts and tests import it rather than spell it", () => {
    const files = [...walk("src"), ...walk("scripts")].filter((f) => f !== "src/install.ts");
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });
});

/** The /rd-credit pages import a mirror of src/install.ts and src/waitlist.ts, written here. */
const SITE = "../site/src/app/rd-credit";
const MIRROR = `${SITE}/_install.ts`;
describe.skipIf(!existsSync(here(SITE)))(
  "the command and the waitlist on agentwares.vercel.app/rd-credit",
  () => {
    it("the mirror the pages import is src/install.ts and src/waitlist.ts", () => {
      // laid out the way prettier would, so the generated file passes `prettier --check`
      const decl = (name: string, value: string, type = "") => {
        const one = `export const ${name}${type} = ${value};`;
        return one.length <= 100 ? one : `export const ${name}${type} =\n  ${value};`;
      };
      const text = [
        "/**",
        " * How to run the command and what the hand-off says, mirrored from the CLI's src/install.ts and",
        " * src/waitlist.ts. Written by apps/rd-ledger-cli/src/distribution.test.ts, which fails when",
        " * they differ: `pnpm --filter rd-ledger record`. While PUBLISHED is false no page shows INSTALL",
        " * or REPO.",
        " */",
        decl("PUBLISHED", String(PUBLISHED), ": boolean"),
        decl("ON_NPM", String(ON_NPM), ": boolean"),
        decl("INSTALL", JSON.stringify(INSTALL)),
        decl("REPO", JSON.stringify(REPO)),
        decl("DISCLAIMER", JSON.stringify(DISCLAIMER)),
        decl("NOT_BUILT", JSON.stringify(NOT_BUILT)),
        decl("WAITLIST_OFFER", JSON.stringify(WAITLIST_OFFER)),
        decl("WAITLIST_STATUS", JSON.stringify(WAITLIST_STATUS)),
        decl("WAITLIST_PATH", JSON.stringify(new URL(WAITLIST_PAGE_URL).pathname)),
        "",
      ].join("\n");
      if (WRITE) writeFileSync(here(MIRROR), text);
      expect(read(MIRROR)).toBe(text);
    });

    it("no other page file spells the command, the npm name or the repo", () => {
      const files = walk(SITE).filter(
        (f) => f !== MIRROR && !f.endsWith(".test.ts") && /\.(tsx?|md|txt|json)$/.test(f),
      );
      expect(files.length).toBeGreaterThan(4);
      for (const file of files) {
        const text = read(file);
        expect(forms(text), file).toEqual([]);
        expect(text, file).not.toContain("github.com/agentwares/rd-ledger");
        expect(text, file).not.toMatch(/\brd-ledger\b/);
      }
    });
  },
);
