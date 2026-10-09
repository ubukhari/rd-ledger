# rd-ledger for Claude Code

`/rd-ledger:rd-ledger` reads a repository's git history on your machine for a tax year and explains
what it shows as evidence for an R&D tax credit: the components worked on, who worked on what and
when, and the commits that look like experimentation (reverts, branches never merged, spikes,
benchmarks, approaches abandoned), each traced to its commit. Hours and amounts appear only when
you supply them.

The skill runs one command, which Claude Code asks you to approve first; the plugin pre-approves
nothing:

```sh
npx -y --allow-git=root github:agentwares/rd-ledger
```

It runs git on the repository, makes no network request and calls no LLM of its own, and writes a
dated evidence pack (markdown and CSV) for your accountant. Evidence to review with your tax
adviser; not tax advice. Source and full documentation: https://github.com/agentwares/rd-ledger
(MIT).
