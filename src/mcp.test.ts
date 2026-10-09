import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemo } from "./demo.js";
import { RUN } from "./install.js";
import { callTool, handleMessage, PROTOCOL_VERSIONS, TOOLS } from "./mcp.js";
import { DISCLAIMER } from "./sources.js";

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "rd-ledger-mcp-"));
  buildDemo(path.join(root, "demo-app"), root);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ctx = () => ({ cwd: root, now: () => new Date("2026-10-09T12:00:00Z") });

describe("the tools", () => {
  it("are namespaced, strict, described, and set all four annotations", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["rd_ledger_scan", "rd_ledger_signals"]);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^rd_ledger_[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(100);
      expect(t.description).toMatch(/not tax advice|tax adviser/);
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const [k, p] of Object.entries(t.inputSchema.properties))
        expect(String(p.description ?? ""), `${t.name}.${k}`).not.toBe("");
      expect(t.annotations).toEqual({
        title: t.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it("rd_ledger_scan reads a repository on this machine, candidates first, names only", () => {
    const { structured, isError } = callTool(
      "rd_ledger_scan",
      { path: "demo-app", year: 2026, max_commits: 5, people_path: "people.csv" },
      ctx(),
    );
    expect(isError).toBe(false);
    expect(structured.note).toBe(DISCLAIMER);
    expect(structured.totals).toMatchObject({ commits: 19, candidates: 10, people: 3 });
    const commits = structured.commits as { candidate: boolean }[];
    expect(commits).toHaveLength(5);
    expect(commits.every((c) => c.candidate)).toBe(true);
    expect(structured.commits_total).toBe(20);
    expect(structured.pack).toEqual({
      written: false,
      write_with: `${RUN} "demo-app" --since 2026-01-01 --until 2026-12-31 --people "people.csv"`,
    });
    expect(JSON.stringify(structured)).not.toContain("@example.com");
    expect((structured.allocation as unknown[]).length).toBeGreaterThan(0);
  });

  it("rd_ledger_signals lists the rules", () => {
    const { structured } = callTool("rd_ledger_signals", {}, ctx());
    expect((structured.signals as { id: string }[]).map((s) => s.id)).toContain("unmerged");
    expect((structured.routine as { id: string }[]).map((s) => s.id)).toContain("bot");
  });

  it("answers bad input with a code, a cause and a fix", () => {
    const err = (args: unknown, name = "rd_ledger_scan") => callTool(name, args, ctx());
    expect(err({ path: "demo-app", colour: "red" }).structured).toMatchObject({
      code: "INVALID_INPUT",
      retryable: false,
    });
    expect(err({ path: "demo-app", month: "2026-13" }).structured.code).toBe("INVALID_INPUT");
    expect(err({ path: "demo-app", year: 2026, month: "2026-01" }).structured.code).toBe(
      "BAD_PERIOD",
    );
    expect(err({ path: "nowhere" }).structured.code).toBe("NOT_A_REPO");
    expect(err({ path: "." }).structured.code).toBe("NOT_A_REPO");
    expect(err({ path: "demo-app", components: ["no-equals"] }).structured.code).toBe(
      "BAD_COMPONENT",
    );
    expect(err({ x: 1 }, "rd_ledger_signals").isError).toBe(true);
  });
});

describe("the protocol", () => {
  it("negotiates a version, lists tools, and refuses unknown methods", () => {
    const init = handleMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      ctx(),
    ) as {
      result: { protocolVersion: string; serverInfo: { name: string }; instructions: string };
    };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("rd-ledger");
    expect(init.result.instructions).toContain("not tax advice");
    const newer = handleMessage(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } },
      ctx(),
    ) as { result: { protocolVersion: string } };
    expect(newer.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    const list = handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, ctx()) as {
      result: { tools: unknown[] };
    };
    expect(list.result.tools).toHaveLength(2);
    expect(
      handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx()),
    ).toBeUndefined();
    expect(handleMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }, ctx())).toMatchObject(
      {
        error: { code: -32601 },
      },
    );
    const call = handleMessage(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "rd_ledger_signals", arguments: {} },
      },
      ctx(),
    ) as { result: { isError: boolean; structuredContent: unknown; content: { text: string }[] } };
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(call.result.content[0]!.text)).toEqual(call.result.structuredContent);
  });
});
