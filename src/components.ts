/**
 * Components. Form 6765 Section G asks for QREs by business component: a product, process,
 * software, technique, formula or invention. Git knows folders, not business components, so a
 * folder stands in for one: a workspace package (`apps/x`, `packages/y`, `services/z`, …) or
 * else a top-level folder. The user names and merges them with `--component "Name=glob,glob"`;
 * every output says the adviser decides what a business component is.
 */
import { RdLedgerError } from "./errors.js";
import type { FileChange } from "./git.js";
import { GENERATED_FILE } from "./signals.js";

export const ROOT_COMPONENT = "(root files)";

/** Folders whose children are each a package or service in common monorepo layouts. */
const WORKSPACE_ROOTS = new Set([
  "apps",
  "packages",
  "services",
  "libs",
  "crates",
  "modules",
  "plugins",
  "projects",
  "cmd",
  "internal",
  "workers",
  "functions",
  "extensions",
]);

export interface ComponentRule {
  name: string;
  globs: string[];
  patterns: RegExp[];
}

export function defaultComponent(file: string): string {
  const segs = file.split("/");
  if (segs.length >= 3 && WORKSPACE_ROOTS.has(segs[0]!)) return `${segs[0]}/${segs[1]}`;
  if (segs.length >= 2) return segs[0]!;
  return ROOT_COMPONENT;
}

/** `**` any depth, `*` within one folder, `?` one character; a plain path matches its subtree. */
export function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!/[*?]/.test(g)) {
    const plain = g.replace(/\/+$/, "").replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${plain}(?:/.*)?$`);
  }
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i]!;
    if (ch === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function parseComponentFlag(spec: string): ComponentRule {
  const eq = spec.indexOf("=");
  const name = eq > 0 ? spec.slice(0, eq).trim() : "";
  const globs =
    eq > 0
      ? spec
          .slice(eq + 1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  if (!name || globs.length === 0 || name.length > 80)
    throw new RdLedgerError(
      "BAD_COMPONENT",
      `--component ${JSON.stringify(spec)} is not Name=glob[,glob]`,
      'Write it like --component "Route optimizer=apps/router/**,packages/geo/**".',
    );
  return { name, globs, patterns: globs.map(globToRegExp) };
}

export function componentOf(file: string, rules: readonly ComponentRule[]): string {
  for (const r of rules) if (r.patterns.some((p) => p.test(file))) return r.name;
  return defaultComponent(file);
}

export interface Share {
  name: string;
  /** 0..1, summing to 1 over a commit's components */
  share: number;
  lines: number;
}

/**
 * A commit's split across components by lines changed (a binary file counts as one line).
 * Lockfiles and other generated files count only when the commit touches nothing else.
 */
export function commitShares(
  files: readonly FileChange[],
  rules: readonly ComponentRule[],
): Share[] {
  if (files.length === 0) return [];
  const real = files.filter((f) => !GENERATED_FILE.test(f.path));
  const used = real.length ? real : files;
  const lines = new Map<string, number>();
  for (const f of used) {
    const name = componentOf(f.path, rules);
    lines.set(name, (lines.get(name) ?? 0) + (f.binary ? 1 : Math.max(1, f.added + f.deleted)));
  }
  const total = [...lines.values()].reduce((a, b) => a + b, 0);
  return [...lines.entries()]
    .map(([name, n]) => ({ name, share: n / total, lines: n }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}
