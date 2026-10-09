# rd-ledger

R&D tax-credit evidence from your git history. rd-ledger reads a repository's commits for a tax
year, groups them into components, lists who worked on what and when, and marks the commits that
look like experimentation as candidate evidence, each traced to its commit. It writes a dated pack
for your accountant: `evidence.md` and the CSVs behind it.

Evidence to review with your tax adviser; not tax advice.

```sh
npx --allow-git=root github:agentwares/rd-ledger --year 2026
```

No account, no LLM. It runs `git` on your repository and makes no network request, unless you ask
it to read pull requests with your own GitHub token (below). It never decides whether any work
qualifies, and it never invents hours.

## What the pack gives your accountant

**Components.** Form 6765's Section G asks for research expenses by business component. Git knows
folders, so a folder stands in for one: a workspace package (`apps/router`, `packages/geo`), or
else a top-level folder. Name your own with `--component "Route optimizer=apps/router/**,packages/geo/**"`.
`components.csv` leaves Section G's type and software-type columns blank for your adviser.

**Candidate evidence of experimentation.** Treas. Reg. §1.41-4(a)(5) describes a process
"designed to evaluate one or more alternatives". These rules find records that may show one:

| Rule                 | What the record shows                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `revert`, `reverted` | an approach tried and backed out                                                             |
| `unmerged`           | commits only on a branch never merged into the main branch: an approach not taken            |
| `spike-branch`       | a branch named spike, experiment, poc, prototype, try, research or benchmark                 |
| `experiment-words`   | the message names an experiment, spike, prototype, proof of concept, hypothesis or benchmark |
| `approach-words`     | trying, attempting, an alternative or approach, investigating, evaluating, comparing         |
| `failed-words`       | did not work, dead end, abandoned, backed out, rolled back, no improvement                   |
| `rewrite`            | 100 or more lines replaced in the same files, or "rewrite", "replace X with Y"               |
| `pr-closed-unmerged` | with `--prs`: a pull request closed without merging                                          |
| `pr-label`           | with `--prs`: a pull request labelled spike, experiment, research, R&D, PoC or benchmark     |

A squash-merged branch is not counted as unmerged: rd-ledger asks git whether merging it would
change anything, and whether at least 90% of the files it changed reached the main branch in the
same versions. With `--prs`, a merged pull request's branch is never unmerged. `rd-ledger signals`
prints every rule with the part of the four-part test it may help document.

**Likely-routine markers,** shown for your adviser to exclude and never removed: dependency bumps,
formatting and lint, docs only, CI only, releases and version bumps, bot authors, merge commits.

**People and time spans.** Commits, active days, first and last commit, months active and main
components, per person (`.mailmap` honoured). Names only, unless `--with-emails`. Commits written
with an AI agent (Claude, Copilot, Cursor, Codex, Amp, Aider, Gemini, Devin, Jules, by the
identities they write by default) are counted per person. Agent work is not wages; how the person's
time counts is for your adviser.

**Hours and amounts only from you.** A commit says when someone worked, not for how long, so
rd-ledger never estimates hours. Give it the figures you keep:

```csv
name,hours,hourly_rate,wages
Ada Example,1450,95,
Grace Example,,,148000
```

```sh
npx --allow-git=root github:agentwares/rd-ledger --year 2026 --people people.csv
```

`allocation.csv` then splits each person's hours, or wages, across components by their
commit-days: each day they committed counts once, divided among the components that day's commits
changed. It is an allocation by commit activity, not a time record, and it says so.

## Why git

The IRS asks for records "in sufficiently usable form and detail to substantiate" a claim
(Treas. Reg. §1.41-4(d)). In _George v. Commissioner_, T.C. Memo. 2026-10, the Tax Court rejected
credit studies reconstructed after the fact. A commit is written as the work happens, so the
history is already a record made at the time. rd-ledger indexes it; it does not replace it. Each
line of the pack names its commit, so your adviser can check it against the repository.

Section G of Form 6765 is required for tax years beginning after 2025, so for 2026 returns filed in 2027. It is not required for a qualified small business taking the payroll election (up to $500,000
a year), or for a filer with QREs of $1.5M or less and gross receipts of $50M or less on an original
return. Exempt or not, the claim still needs records behind it.

Sources, read 9 October 2026:

- [Treas. Reg. §1.41-4](https://www.law.cornell.edu/cfr/text/26/1.41-4) (process of experimentation; records)
- [IRS, Instructions for Form 6765, rev. 12/2025](https://www.irs.gov/instructions/i6765)
- [_George v. Commissioner_, T.C. Memo. 2026-10](https://www.pkfod.com/insights/irs-rd-credit-audits-tax-court-reinforces-documentation-requirements/) (PKF O'Connor Davies, 9 March 2026)
- [IRS, the qualified small business payroll tax election](https://www.irs.gov/businesses/small-businesses-self-employed/qualified-small-business-payroll-tax-credit-for-increasing-research-activities)

## Usage

```text
rd-ledger [repo-folder] [--year 2026 | --month 2026-09 | --since 2025-07-01 --until 2026-06-30]
          [--base main] [--component "Name=glob,glob"] [--people people.csv]
          [--prs [--repo owner/name]] [--with-emails] [--out dir] [--no-files] [--json] [--quiet]
rd-ledger demo       an invented company's repository, built in a temporary folder
rd-ledger signals    the rules
rd-ledger mcp        a local MCP server over stdio
```

With no period, it covers last year from January to April (filing season), and this year to date
otherwise. The pack goes to `./rd-ledger-<since>-to-<until>/`, with owner-only permissions:
`evidence.md`, `commits.csv`, `candidates.csv`, `components.csv`, `people.csv`, and
`allocation.csv` and `prs.csv` when asked for. `evidence.md` lists each CSV's SHA-256.

It reads commits on local and remote-tracking branches, placed in the period by the author's own
date. Run `git fetch --all` first so the branches people pushed are there. A shallow clone hides
history; the pack says so when it is one.

### Pull requests

```sh
GH_TOKEN=$(gh auth token) npx --allow-git=root github:agentwares/rd-ledger --year 2026 --prs
```

With `--prs` and your token in `GITHUB_TOKEN` or `GH_TOKEN`, it reads the pull requests created in
the period with GET requests to `api.github.com`, and the files of each one a rule flags. It counts
its requests and stops before the rate limit runs out (`--max-requests`, default 200). The token is
sent only to `api.github.com`, and it is never printed or written.

### Every month, in GitHub Actions

A pack made each month is a record made that month. The Action runs the CLI on your own runner:

```yaml
- uses: actions/checkout@v5
  with:
    fetch-depth: 0
- id: ledger
  uses: agentwares/rd-ledger@main
  with:
    month: previous
```

It writes `evidence.md` to the job summary and the pack to `$RUNNER_TEMP/rd-ledger/pack`, with the
outputs `pack`, `evidence`, `commits` and `candidates`. `examples/github-workflow.yml` runs it on the
1st of each month and keeps the pack as an artifact.

### MCP

`rd-ledger mcp` serves two read-only tools over stdio, each with all four annotations set
(`readOnlyHint` true, `destructiveHint` false, `idempotentHint` true, `openWorldHint` false):

- `rd_ledger_scan`: a repository folder and a period in; components, people, candidates and
  routine markers out. It writes nothing and reads no pull requests.
- `rd_ledger_signals`: the rules.

```json
{
  "mcpServers": {
    "rd-ledger": {
      "command": "npx",
      "args": ["-y", "--allow-git=root", "github:agentwares/rd-ledger", "mcp"]
    }
  }
}
```

Errors carry `code`, `cause`, `fix` and `retryable`, in the CLI's `--json` and in the tools.

## A run

The demo builds an invented company's repository in a temporary folder, with fixed dates in 2026,
and runs on it with an invented people file:

<!-- recorded-run -->

```text
$ npx --allow-git=root github:agentwares/rd-ledger demo --out rd-ledger-demo
SYNTHETIC demo data: an invented company's repository and people, built in a temporary folder. Nothing here is anyone's real work.

rd-ledger 0.1.0 · example-co/demo-app · 2026-01-01 to 2026-12-31
Period: the calendar year 2026.
Evidence to review with your tax adviser; not tax advice.

  19 commits across 6 components by 3 people and 1 automation account, plus 1 merge commit
  10 candidate commits · 6 likely routine · 3 with an AI co-author · 1 branch never merged

  Component     Commits  Candidates  People  First       Last
  apps/router         9           7       3  2026-01-05  2026-07-03
  (root files)        4           0       1  2026-01-05  2026-07-20
  packages/geo        4           3       3  2026-01-05  2026-09-01
  apps/web            3           0       2  2026-01-05  2026-05-07
  .github             2           0       1  2026-01-05  2026-08-04
  docs                1           0       1  2026-09-15  2026-09-15

  Candidates by rule: revert 1, reverted 1, unmerged 2, spike-branch 2, experiment-words 3, approach-words 4, failed-words 1, rewrite 1

  Person         Commits  Active days  First       Last        Candidates  Figures (yours)
  Ada Example          8            8  2026-01-13  2026-09-15           7  1,450 h at 95.00/h
  Grace Example        5            5  2026-03-02  2026-07-03           3  wages 148,000.00
  Linus Example        5            5  2026-01-05  2026-08-04           0  -

  Wrote ./rd-ledger-demo/: evidence.md, commits.csv, candidates.csv, components.csv, people.csv, allocation.csv

A year-round R&D evidence ledger, kept month by month as the work happens, is not built.
If you want it: https://agentwares.vercel.app/rd-credit/waitlist/cli
(exit 0)

$ ls rd-ledger-demo
allocation.csv
candidates.csv
commits.csv
components.csv
evidence.md
people.csv
```

<!-- /recorded-run -->

## What it reads and sends

It runs `git` (log, rev-list, rev-parse, for-each-ref, remote, and merge-tree to tell squash-merged
branches apart) on the folder you name, reads the people file if you give one, and writes the pack.
It makes no network request, unless you pass `--prs`. It has no runtime dependencies, no telemetry
and no LLM. The remote's URL is used for its host, owner and name only, so a token inside it is never
printed.

## Not built yet

**A year-round R&D evidence ledger, kept month by month as the work happens, is not built.** It would
capture each month's evidence that month, under a date we hold, so the record shows when it existed;
allocate the hours or wages you enter across your components in Section G's shape at year end; and
give your adviser a read-only link. No price is set and nothing is charged. If you want it, the CLI's
last line links the waitlist, where your visit is the count.

## License

MIT
