interface FileChange {
    path: string;
    added: number;
    deleted: number;
    binary: boolean;
}
interface RawCommit {
    sha: string;
    parents: string[];
    author: string;
    email: string;
    /** ISO 8601 with the author's own UTC offset */
    authored: string;
    committed: string;
    subject: string;
    body: string;
    files: FileChange[];
}
interface Remote {
    host: string;
    owner: string;
    repo: string;
}
interface RepoFacts {
    /** absolute; used to run git, never printed */
    root: string;
    /** owner/repo from the origin remote, else the folder's name */
    name: string;
    remote: Remote | null;
    head: string;
    base: {
        ref: string;
        reason: string;
    } | null;
    shallow: boolean;
    remotes: string[];
}
interface Git {
    /** stdout of a git command that must succeed */
    run(args: readonly string[]): string;
    /** status and stdout of a git command that may fail */
    tryRun(args: readonly string[]): {
        status: number;
        stdout: string;
    };
}
declare function gitAt(dir: string, env?: NodeJS.ProcessEnv): Git;
/** host, owner and name from a remote URL, with any credentials in it discarded */
declare function parseRemote(url: string): Remote | null;
/** A link to a commit on the three public hosts whose URL shape is known; otherwise none. */
declare function commitLink(remote: Remote | null, sha: string): string | null;
declare function readRepo(dir: string, opts?: {
    base?: string;
    git?: Git;
}): RepoFacts;
declare function parseLog(out: string): RawCommit[];
/**
 * Every commit on local and remote-tracking branches (and HEAD, for a detached checkout) whose
 * author date falls in the period, by the author's own calendar day. `.mailmap` applies.
 */
declare function readCommits(git: Git, since: string, until: string): RawCommit[];

interface ComponentRule {
    name: string;
    globs: string[];
    patterns: RegExp[];
}
declare function defaultComponent(file: string): string;
/** `**` any depth, `*` within one folder, `?` one character; a plain path matches its subtree. */
declare function globToRegExp(glob: string): RegExp;
declare function parseComponentFlag(spec: string): ComponentRule;
interface Share {
    name: string;
    /** 0..1, summing to 1 over a commit's components */
    share: number;
    lines: number;
}
/**
 * A commit's split across components by lines changed (a binary file counts as one line).
 * Lockfiles and other generated files count only when the commit touches nothing else.
 */
declare function commitShares(files: readonly FileChange[], rules: readonly ComponentRule[]): Share[];

/**
 * The rules. Each is deterministic and readable by an accountant: a word list, a branch name, a
 * revert, a merge status. A rule's name says what the record shows (a revert, an unmerged branch),
 * never what the law concludes. Nothing here decides whether work qualifies; the adviser does.
 *
 * Candidate evidence of experimentation, under Treas. Reg. §1.41-4(a)(5): "a process designed to
 * evaluate one or more alternatives to achieve a result where the capability or the method of
 * achieving that result, or the appropriate design of that result, is uncertain".
 */

type SignalId = "revert" | "reverted" | "unmerged" | "spike-branch" | "experiment-words" | "approach-words" | "failed-words" | "rewrite" | "pr-closed-unmerged" | "pr-label";
type RoutineId = "merge" | "bot" | "dependency" | "format" | "docs-only" | "ci-only" | "release";
interface Rule<Id extends string> {
    id: Id;
    /** what the record shows, in words */
    shows: string;
    /** the part of the four-part test (IRC §41(d)) it may help document, for the adviser */
    element: string;
    strength: "strong" | "medium" | "weak";
}
declare const SIGNALS: readonly Rule<SignalId>[];
declare const ROUTINE: readonly Rule<RoutineId>[];
interface Hit<Id extends string> {
    id: Id;
    evidence: string;
}
/** The message rules: the words a person wrote when they made the commit. */
declare function messageSignals(subject: string, body: string): Hit<SignalId>[];
declare function routineMarkers(c: {
    subject: string;
    author: string;
    email: string;
    parents: readonly string[];
    files: readonly FileChange[];
}): Hit<RoutineId>[];
declare function aiCoauthors(author: string, email: string, body: string): string[];

type Fetch = (url: string, init: {
    headers: Record<string, string>;
}) => Promise<{
    status: number;
    headers: {
        get(name: string): string | null;
    };
    json(): Promise<unknown>;
}>;
interface PullRequest {
    number: number;
    title: string;
    author: string;
    created: string;
    state: "open" | "merged" | "closed-unmerged";
    merged: string | null;
    closed: string | null;
    draft: boolean;
    labels: string[];
    headRef: string;
    url: string;
    signals: Hit<SignalId>[];
    files: string[] | null;
}
interface PrRead {
    prs: PullRequest[];
    requests: number;
    /** why reading stopped early, if it did */
    partial: string | null;
}
declare function tokenFrom(env: Record<string, string | undefined>): string | null;
declare function readPullRequests(opts: {
    owner: string;
    repo: string;
    since: string;
    until: string;
    token: string;
    fetch: Fetch;
    maxRequests?: number;
}): Promise<PrRead>;

interface PersonFigures {
    /** the row in the file, from 2 (the header is row 1) */
    row: number;
    name: string;
    email: string | null;
    hours: number | null;
    hourlyRate: number | null;
    wages: number | null;
}
declare function parsePeople(text: string): PersonFigures[];

interface Period {
    /** first day, YYYY-MM-DD */
    since: string;
    /** last day included, YYYY-MM-DD */
    until: string;
    /** how the period was chosen, in words */
    reason: string;
}
interface PeriodInput {
    year?: number;
    month?: string;
    since?: string;
    until?: string;
}
declare function resolvePeriod(input: PeriodInput, now: Date): Period;

/**
 * The pack's content, from the repository's history: commits in the period, grouped into
 * components, with the rules' candidate evidence of experimentation and the likely-routine markers,
 * the people and their time spans, and (only from the user's own figures) an allocation of hours or
 * wages across components. Pure reading: nothing here writes, sends or estimates.
 */

interface CommitRow {
    sha: string;
    short: string;
    /** the author's own calendar day */
    date: string;
    author: string;
    /** only with --with-emails */
    email: string | null;
    subject: string;
    merge: boolean;
    bot: boolean;
    /** null when no main branch was found */
    onBase: boolean | null;
    branches: string[];
    components: Share[];
    added: number;
    deleted: number;
    signals: Hit<SignalId>[];
    routine: Hit<RoutineId>[];
    agents: string[];
    candidate: boolean;
    link: string | null;
}
interface ComponentRow {
    name: string;
    commits: number;
    candidates: number;
    routine: number;
    people: number;
    first: string;
    last: string;
    months: number;
    lines: number;
    signals: Partial<Record<SignalId, number>>;
}
interface PersonRow {
    name: string;
    email: string | null;
    commits: number;
    activeDays: number;
    first: string;
    last: string;
    months: number;
    /** share of their commit-days, largest first */
    components: {
        name: string;
        share: number;
    }[];
    candidates: number;
    agentCoauthored: number;
    figures: {
        hours: number | null;
        hourlyRate: number | null;
        wages: number | null;
    } | null;
}
interface AllocationRow {
    name: string;
    component: string;
    share: number;
    hours: number | null;
    amount: number | null;
    basis: string;
}
interface BranchRow {
    name: string;
    commits: number;
    absorbed: boolean | null;
    spike: boolean;
}
interface PrRow {
    number: number;
    created: string;
    state: string;
    merged: string | null;
    author: string;
    title: string;
    labels: string[];
    signals: Hit<SignalId>[];
    components: string[];
    link: string;
}
interface Report {
    tool: "rd-ledger";
    version: string;
    note: string;
    generated: string;
    repo: {
        name: string;
        head: string;
        base: string | null;
        baseReason: string | null;
        host: string | null;
        shallow: boolean;
    };
    period: Period;
    totals: {
        commits: number;
        merges: number;
        people: number;
        components: number;
        candidates: number;
        routine: number;
        agentCoauthored: number;
        unmergedBranches: number;
        prs: number | null;
        prCandidates: number | null;
    };
    bySignal: Partial<Record<SignalId, number>>;
    byRoutine: Partial<Record<RoutineId, number>>;
    components: ComponentRow[];
    people: PersonRow[];
    automation: {
        name: string;
        commits: number;
    }[];
    allocation: AllocationRow[] | null;
    /** names in the people file that wrote no commit in the period */
    unmatchedFigures: string[];
    branches: BranchRow[];
    prs: PrRow[] | null;
    prNote: string | null;
    commits: CommitRow[];
    notes: string[];
    handoff: {
        notBuilt: string;
        offer: string;
        status: string;
    };
}
interface ScanInput {
    git: Git;
    facts: RepoFacts;
    period: Period;
    components: readonly ComponentRule[];
    people: readonly PersonFigures[] | null;
    prs: PrRead | null;
    withEmails: boolean;
    generated: string;
    version: string;
}
declare function buildReport(input: ScanInput): Report;

declare function packDir(report: Report): string;
declare function renderCsvs(report: Report): Record<string, string>;
declare function renderMarkdown(report: Report, csvs: Record<string, string>): string;
declare function renderText(report: Report, opts: {
    waitlist: boolean;
    wrote: {
        dir: string;
        files: string[];
    } | null;
}): string;

/**
 * Every error rd-ledger reports carries a code, what happened, how to fix it, and whether retrying
 * the same call can help: the shape the CLI's `--json`, the MCP tools and the README all use.
 */
declare class RdLedgerError extends Error {
    readonly code: string;
    readonly cause_: string;
    readonly fix: string;
    readonly retryable: boolean;
    constructor(code: string, cause_: string, fix: string, retryable?: boolean);
    toJSON(): {
        code: string;
        cause: string;
        fix: string;
        retryable: boolean;
    };
}

/**
 * The line every output carries, and the rules the pack is shaped by, each with the date it was
 * read. The pack cites them under "What this is"; the README cites the same list.
 */
declare const DISCLAIMER = "Evidence to review with your tax adviser; not tax advice.";
interface Source {
    label: string;
    url: string;
    read: string;
}
declare const SOURCES: readonly Source[];

type Schema = Record<string, unknown>;
interface ToolDefinition {
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
declare const TOOLS: readonly ToolDefinition[];
interface McpContext {
    cwd?: string;
    now?: () => Date;
}
declare function callTool(name: string, rawArgs: unknown, ctx?: McpContext): {
    structured: Record<string, unknown>;
    isError: boolean;
};

export { type AllocationRow, type CommitRow, type ComponentRow, type ComponentRule, DISCLAIMER, type Fetch, type Git, type Period, type PersonFigures, type PersonRow, ROUTINE, RdLedgerError, type Report, type RoutineId, SIGNALS, SOURCES, type ScanInput, type SignalId, TOOLS, aiCoauthors, buildReport, callTool, commitLink, commitShares, defaultComponent, gitAt, globToRegExp, messageSignals, packDir, parseComponentFlag, parseLog, parsePeople, parseRemote, readCommits, readPullRequests, readRepo, renderCsvs, renderMarkdown, renderText, resolvePeriod, routineMarkers, tokenFrom };
