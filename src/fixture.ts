/**
 * Building a repository with `git` in a folder, with fixed dates and invented people: the demo's
 * synthetic company, and the tests' fixture repos. It ignores the user's own git configuration
 * (global and system), so signing, hooks and default branches there change nothing.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import path from "node:path";

export interface Person {
  name: string;
  email: string;
}

export interface CommitSpec {
  author: Person;
  /** YYYY-MM-DD, or a full ISO date with time and offset */
  date: string;
  message: string;
  /** contents to write; null deletes the file */
  files: Record<string, string | null>;
}

const iso = (date: string) => (date.length === 10 ? `${date}T10:00:00+00:00` : date);

export class RepoBuilder {
  constructor(readonly dir: string) {}

  git(args: readonly string[], who?: Person, date?: string): string {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
    };
    if (who) {
      env.GIT_AUTHOR_NAME = who.name;
      env.GIT_AUTHOR_EMAIL = who.email;
      env.GIT_COMMITTER_NAME = who.name;
      env.GIT_COMMITTER_EMAIL = who.email;
    }
    if (date) {
      env.GIT_AUTHOR_DATE = iso(date);
      env.GIT_COMMITTER_DATE = iso(date);
    }
    const res = spawnSync("git", ["-c", "commit.gpgsign=false", "-C", this.dir, ...args], {
      encoding: "utf8",
      env,
    });
    if (res.error) throw res.error;
    if (res.status !== 0)
      throw new Error(`git ${args.join(" ")} failed: ${res.stderr || res.stdout}`);
    return res.stdout;
  }

  init(remote?: string): this {
    mkdirSync(this.dir, { recursive: true });
    this.git(["init", "-q", "-b", "main"]);
    if (remote) this.git(["remote", "add", "origin", remote]);
    return this;
  }

  write(files: Record<string, string | null>): void {
    for (const [rel, text] of Object.entries(files)) {
      const p = path.join(this.dir, rel);
      if (text === null) rmSync(p, { force: true });
      else {
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, text);
      }
    }
  }

  commit(spec: CommitSpec): string {
    this.write(spec.files);
    this.git(["add", "-A"]);
    this.git(["commit", "-q", "--allow-empty", "-m", spec.message], spec.author, spec.date);
    return this.head();
  }

  head(): string {
    return this.git(["rev-parse", "HEAD"]).trim();
  }

  branch(name: string): this {
    this.git(["checkout", "-q", "-b", name]);
    return this;
  }

  checkout(name: string): this {
    this.git(["checkout", "-q", name]);
    return this;
  }

  merge(branch: string, who: Person, date: string, message: string): string {
    this.git(["merge", "-q", "--no-ff", "-m", message, branch], who, date);
    return this.head();
  }

  /** `git revert`'s own message, plus a line of why. */
  revert(sha: string, who: Person, date: string, why: string): string {
    const subject = this.git(["log", "-1", "--format=%s", sha]).trim();
    this.git(["revert", "--no-commit", sha]);
    this.git(
      ["commit", "-q", "-m", `Revert "${subject}"`, "-m", `This reverts commit ${sha}.`, "-m", why],
      who,
      date,
    );
    return this.head();
  }

  /** a squash merge: the branch's changes as one new commit on the current branch */
  squash(branch: string, who: Person, date: string, message: string): string {
    this.git(["merge", "-q", "--squash", branch]);
    this.git(["commit", "-q", "-m", message], who, date);
    return this.head();
  }
}

/** `n` lines of plausible source, so line counts mean something. */
export function lines(n: number, tag: string): string {
  return Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};`).join("\n") + "\n";
}
