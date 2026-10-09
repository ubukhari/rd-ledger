---
name: rd-ledger
description: Gather R&D tax-credit evidence from a git repository by running rd-ledger on the user's own repository for a tax year - the components worked on, who worked on what and when, and the commits that look like experimentation (reverts, branches never merged, spike branches, benchmarks, prototypes, approaches abandoned) as candidate evidence, each traced to its commit, with likely-routine work marked for exclusion and hours or wages allocated only from figures the user supplies. Use when the user asks about R&D tax credit documentation, Form 6765 or Section G, IRC section 41 evidence for software, what their accountant needs for an R&D claim, or which of their engineering work looked like experimentation.
argument-hint: '[repo-folder] [--year 2026] [--people people.csv] [--component "Name=glob"]'
---

# What does the history show?

rd-ledger (MIT, [source](https://github.com/agentwares/rd-ledger)) reads a git repository on this
machine. It makes no network calls unless the user adds `--prs` with their own GitHub token in their
own terminal, and it sends nothing anywhere else. Its output is evidence to review with a tax
adviser, not tax advice; say so when you summarise it, and never say that any work or component
qualifies for the credit.

Run it with the Bash tool (Claude Code asks the user to approve the command; this skill pre-approves
nothing). With no repository to hand, `demo` shows it on an invented company:

```sh
npx -y --allow-git=root github:agentwares/rd-ledger $ARGUMENTS
```

What to pass:

- the repository's folder (default: the current one), and the tax year with `--year` (default: last
  year from January to April, otherwise this year to date);
- `--component "Name=glob,glob"` to name business components in the user's own words, when folders
  do not match how they describe their products;
- `--people people.csv` only if the user has hours, an hourly rate or wages per person
  (columns name, hours, hourly_rate, wages). Never make up hours or estimate them from commits.

Then explain it in plain words:

1. **The components**: which ones had the most work and the most candidate commits. A folder stands
   in for a business component; the adviser decides what the components are.
2. **The candidates**: the strongest first (reverts, branches never merged, spike branches, failed
   approaches), each with its commit. They are records that may show a process of experimentation,
   not conclusions.
3. **The people**: who worked on what, and when. Active days are days with a commit, not hours.
4. **What is missing**: wages and hours come from payroll, not git; vague commit messages leave
   little evidence; a shallow clone hides history.
5. **The pack**: where `evidence.md` and the CSVs were written, for the user's accountant.

Do not read or ask for the user's GitHub token. Do not change the repository.
