# Changelog

## 0.1.0 (2026-10-09)

R&D tax-credit evidence from your git history, on your machine.

- Reads a repository's commits on local and remote-tracking branches for a period (a calendar year,
  a month, or custom dates; by default last year from January to April and this year to date
  otherwise), placed by the author's own date, with `.mailmap` applied.
- Groups them into components: workspace packages, else top-level folders, or the user's own
  `--component "Name=glob,glob"` rules; a commit touching several counts in each by lines changed,
  lockfiles aside.
- Marks candidate evidence of experimentation with deterministic rules, each with its evidence:
  `revert`, `reverted`, `unmerged` (a branch never merged into the main branch; a squash-merged one
  is told apart with `git merge-tree`), `spike-branch` (including commits merged in from one),
  `experiment-words`, `approach-words`, `failed-words` and `rewrite`.
- Marks likely-routine work for the adviser, never removing it: merges, bots, dependency bumps,
  formatting, docs only, CI only, releases. Names AI co-authors per commit.
- People and time spans by name: commits, active days, first and last, months, components.
- Hours and amounts only from the user's own `--people` file (hours, hourly rate, wages), allocated
  across components by commit-days and labelled as an allocation, not a time record.
- `--prs` reads pull requests with the user's own `GITHUB_TOKEN` or `GH_TOKEN` (GETs to
  api.github.com only; capped, rate-limit aware): closed-unmerged and labelled ones, placed in
  components by their files. A merged pull request's branch is never counted as unmerged.
- Writes a dated pack with owner-only permissions: `evidence.md` (with each CSV's SHA-256),
  `commits.csv`, `candidates.csv`, `components.csv`, `people.csv`, and `allocation.csv` and
  `prs.csv` when asked. `--json`, `--no-files`, `--quiet`, `--with-emails`, `demo`, `signals`.
- A GitHub Action (`action.yml`) that runs the committed CLI for last month by default, writes the
  pack and the job summary, and an example monthly workflow.
- `rd-ledger mcp`: a local stdio MCP server with two read-only tools, `rd_ledger_scan` and
  `rd_ledger_signals`, each with all four annotations set.
- No network unless `--prs`, no LLM, no telemetry, no runtime dependencies. Every output says
  "Evidence to review with your tax adviser; not tax advice."
