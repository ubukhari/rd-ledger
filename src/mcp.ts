/**
 * `rd-ledger mcp`: a local MCP server over stdio with two read-only tools, so an agent helping a
 * founder or their accountant can ask what a repository's history shows for a tax year.
 *
 * - `rd_ledger_scan`: a repository on this machine and a period in; components, people, the
 *   candidate commits and the likely-routine markers out. It writes no file and reads no pull
 *   requests (those need a token, which is the CLI's `--prs`, in a terminal).
 * - `rd_ledger_signals`: the rules, each with what the record shows and the part of the four-part
 *   test it may help document.
 *
 * What the scan returns goes to the agent's model provider like any tool result: names, dates,
 * commit subjects and paths. Emails are left out.
 *
 * Implemented here rather than on the MCP SDK so the package has no runtime dependencies. It speaks
 * the initialize-based protocol revisions (2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05):
 * newline-delimited JSON-RPC, `initialize`, `ping`, `tools/list`, `tools/call`; any other method
 * answers -32601. Nothing but protocol goes to stdout.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { parseComponentFlag } from "./components.js";
import { RdLedgerError } from "./errors.js";
import { gitAt, readRepo } from "./git.js";
import { RUN } from "./install.js";
import { parsePeople } from "./people.js";
import { resolvePeriod } from "./period.js";
import { buildReport, type CommitRow } from "./scan.js";
import { ROUTINE, SIGNALS } from "./signals.js";
import { DISCLAIMER } from "./sources.js";
import { version } from "./version.js";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

type Schema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, Schema>;
    required: string[];
    additionalProperties: false;
  };
  annotations: {
    title: string;
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
}

const DATE = "^\\d{4}-\\d{2}-\\d{2}$";

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "rd_ledger_scan",
    title: "R&D tax-credit evidence from a git repository",
    description:
      "Reads a git repository on this machine for a period (a tax year by default) and returns what its history shows as evidence for an R&D tax credit (US IRC §41, Form 6765): the commits grouped into components (workspace or top-level folders, or the user's own Name=glob rules); each person's commits, active days and first and last dates, by name; the commits that look like experimentation as candidate evidence, each with the rule that matched and its evidence (reverts and reverted commits, commits only on branches never merged into the main branch, branches named spike or experiment, messages naming experiments, prototypes, benchmarks, alternatives tried, approaches abandoned, large rewrites); likely-routine markers for the adviser to exclude (dependency bumps, formatting, docs-only, CI-only, releases, bots, merges); and AI co-authors per commit. With people_path, it splits the hours or wages that file gives across components by each person's commit-days; it never estimates hours from commits. It does not decide whether anything qualifies: say that the output is evidence to review with a tax adviser, not tax advice. Local and read-only: runs git, reads files, no network, writes nothing.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          minLength: 1,
          description:
            "The repository's folder (or any folder inside it). Absolute, or relative to the server's working directory.",
        },
        year: {
          type: "integer",
          minimum: 1990,
          maximum: 2100,
          description:
            "A calendar tax year, e.g. 2026. Omit year, month, since and until for the default: last year from January to April, otherwise this year to date.",
        },
        month: {
          type: "string",
          pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
          description: "One month instead of a year, e.g. 2026-09.",
        },
        since: {
          type: "string",
          pattern: DATE,
          description: "First day of a custom period (a fiscal year), YYYY-MM-DD.",
        },
        until: {
          type: "string",
          pattern: DATE,
          description: "Last day of a custom period, YYYY-MM-DD. Omitted with since: today.",
        },
        base: {
          type: "string",
          minLength: 1,
          description:
            "The main branch that work is merged into, e.g. main or origin/main. Omitted: the origin's default branch, else main or master.",
        },
        components: {
          type: "array",
          maxItems: 50,
          items: { type: "string", minLength: 3 },
          description:
            'The user\'s own components, each "Name=glob,glob" (e.g. "Route optimizer=apps/router/**,packages/geo/**"). Files no rule matches fall back to folders.',
        },
        people_path: {
          type: "string",
          minLength: 1,
          description:
            "A CSV the user keeps with columns name (or email), hours, hourly_rate and wages for the period, as their own records say. Only these figures are allocated; nothing is estimated.",
        },
        max_commits: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description:
            "How many commit rows to return, candidates first. Omitted: 200. The counts always cover every commit.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: {
      title: "R&D tax-credit evidence from a git repository",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "rd_ledger_signals",
    title: "The rules rd-ledger applies to commits",
    description:
      "Lists every rule rd_ledger_scan applies: the candidate-evidence rules (what each shows in the record, the part of the four-part test of IRC §41(d) it may help a tax adviser document, and its weight) and the likely-routine markers. Use it to explain a scan's results. No input; reads nothing.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    annotations: {
      title: "The rules rd-ledger applies to commits",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export interface McpContext {
  cwd?: string;
  now?: () => Date;
}

const invalid = (cause: string, fix: string): never => {
  throw new RdLedgerError("INVALID_INPUT", cause, fix);
};

function checkArgs(tool: ToolDefinition, raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    invalid(
      "arguments must be an object",
      `Pass ${tool.inputSchema.required.join(" and ") || "{}"}.`,
    );
  const a = raw as Record<string, unknown>;
  const props = tool.inputSchema.properties;
  for (const k of Object.keys(a))
    if (!props[k])
      invalid(
        `unknown argument \`${k}\``,
        Object.keys(props).length ? `Use only: ${Object.keys(props).join(", ")}.` : "Pass {}.",
      );
  for (const k of tool.inputSchema.required)
    if (a[k] === undefined) invalid(`\`${k}\` is required`, `Pass ${k}.`);
  for (const [k, v] of Object.entries(a)) {
    const spec = props[k]!;
    if (spec.type === "string") {
      if (typeof v !== "string" || v === "")
        invalid(`\`${k}\` must be a non-empty string`, String(spec.description));
      if (typeof spec.pattern === "string" && !new RegExp(spec.pattern).test(v as string))
        invalid(
          `\`${k}\` ${JSON.stringify(v)} is not in the expected form`,
          String(spec.description),
        );
    } else if (spec.type === "integer") {
      if (
        typeof v !== "number" ||
        !Number.isInteger(v) ||
        v < (spec.minimum as number) ||
        v > (spec.maximum as number)
      )
        invalid(
          `\`${k}\` must be a whole number from ${String(spec.minimum)} to ${String(spec.maximum)}`,
          String(spec.description),
        );
    } else if (spec.type === "array") {
      if (
        !Array.isArray(v) ||
        v.length > (spec.maxItems as number) ||
        v.some((x) => typeof x !== "string" || x.length < 3)
      )
        invalid(`\`${k}\` must be a list of "Name=glob,glob" strings`, String(spec.description));
    }
  }
  return a;
}

const prioritise = (rows: readonly CommitRow[], max: number) =>
  [...rows.filter((r) => r.candidate), ...rows.filter((r) => !r.candidate)].slice(0, max);

export function callTool(
  name: string,
  rawArgs: unknown,
  ctx: McpContext = {},
): { structured: Record<string, unknown>; isError: boolean } {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  try {
    const a = checkArgs(tool, rawArgs ?? {});
    if (name === "rd_ledger_signals")
      return {
        structured: { note: DISCLAIMER, signals: SIGNALS, routine: ROUTINE },
        isError: false,
      };
    const cwd = ctx.cwd ?? process.cwd();
    const dir = path.resolve(cwd, a.path as string);
    try {
      if (!statSync(dir).isDirectory()) throw new Error("not a folder");
    } catch {
      throw new RdLedgerError(
        "NOT_A_REPO",
        `no folder at ${dir}`,
        "Pass the repository's folder; relative paths resolve against the server's working directory.",
      );
    }
    const now = ctx.now?.() ?? new Date();
    const period = resolvePeriod(
      {
        year: a.year as number | undefined,
        month: a.month as string | undefined,
        since: a.since as string | undefined,
        until: a.until as string | undefined,
      },
      now,
    );
    const components = ((a.components as string[] | undefined) ?? []).map(parseComponentFlag);
    let people = null;
    if (typeof a.people_path === "string") {
      const file = path.resolve(cwd, a.people_path);
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        throw new RdLedgerError(
          "FILE_NOT_FOUND",
          `no file at ${file}`,
          "Pass the people CSV's path; relative paths resolve against the server's working directory.",
        );
      }
      people = parsePeople(text);
    }
    const git = gitAt(dir);
    const facts = readRepo(dir, { base: a.base as string | undefined, git });
    const report = buildReport({
      git,
      facts,
      period,
      components,
      people,
      prs: null,
      withEmails: false,
      generated: now.toISOString().slice(0, 10),
      version: version(),
    });
    const max = (a.max_commits as number | undefined) ?? 200;
    const quote = (s: string) => JSON.stringify(s);
    const flags = [
      quote(a.path as string),
      `--since ${period.since}`,
      `--until ${period.until}`,
      ...(typeof a.base === "string" ? [`--base ${quote(a.base)}`] : []),
      ...((a.components as string[] | undefined) ?? []).map((c) => `--component ${quote(c)}`),
      ...(typeof a.people_path === "string" ? [`--people ${quote(a.people_path)}`] : []),
    ];
    return {
      structured: {
        ...report,
        commits: prioritise(report.commits, max),
        commits_total: report.commits.length,
        pack: { written: false, write_with: `${RUN} ${flags.join(" ")}` },
      },
      isError: false,
    };
  } catch (err) {
    const body =
      err instanceof RdLedgerError
        ? err.toJSON()
        : {
            code: "INTERNAL",
            cause: err instanceof Error ? err.message : String(err),
            fix: "Run rd-ledger on the same repository in a terminal to see the error with its context, and report it at https://github.com/agentwares/rd-ledger/issues.",
            retryable: false,
          };
    return { structured: { ...body, note: DISCLAIMER }, isError: true };
  }
}

interface Request {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

const INSTRUCTIONS =
  "rd-ledger reads a git repository on this machine and returns what its history shows as evidence for an R&D tax credit: components, people and time spans, and candidate evidence of experimentation, each traced to a commit. Read-only and local: it runs git, makes no network calls and writes nothing. It never decides whether work qualifies or estimates hours. Its output is evidence to review with a tax adviser, not tax advice.";

export function handleMessage(msg: unknown, ctx: McpContext): unknown {
  if (Array.isArray(msg)) {
    const out = msg.map((m) => handleMessage(m, ctx)).filter((r) => r !== undefined);
    return out.length ? out : undefined;
  }
  const req = (msg && typeof msg === "object" ? msg : {}) as Request;
  const hasId = "id" in req && (typeof req.id === "string" || typeof req.id === "number");
  const id = hasId ? req.id : null;
  const error = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
  if (!("method" in req) && ("result" in req || "error" in req)) return undefined;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return hasId || !("method" in req) ? error(-32600, "Invalid Request") : undefined;
  if (!hasId) return undefined; // notifications
  const params = (req.params && typeof req.params === "object" ? req.params : {}) as Record<
    string,
    unknown
  >;
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
        ? asked
        : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "rd-ledger", title: "rd-ledger", version: version() },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name))
        return error(
          -32602,
          `Unknown tool: ${String(name)}. Tools: ${TOOLS.map((t) => t.name).join(", ")}`,
        );
      const { structured, isError } = callTool(name, params.arguments, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
          isError,
        },
      };
    }
    default:
      return error(-32601, `Method not found: ${req.method}`);
  }
}

/** Serve on stdin/stdout until stdin closes. */
export async function serveStdio(ctx: McpContext = {}): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }) + "\n",
      );
      continue;
    }
    try {
      const res = handleMessage(msg, ctx);
      if (res !== undefined) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err) {
      process.stderr.write(`rd-ledger mcp: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
