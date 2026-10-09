/**
 * `rd-ledger demo`: an invented company's route-planning repository, built by git in a temporary
 * folder with fixed dates in 2026, and an invented people file. Everything in it is synthetic and
 * says so; the README's recorded run is this.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { lines, RepoBuilder, type Person } from "./fixture.js";

export const SYNTHETIC_LABEL =
  "SYNTHETIC demo data: an invented company's repository and people, built in a temporary folder. Nothing here is anyone's real work.";

export const DEMO_YEAR = 2026;

const ADA: Person = { name: "Ada Example", email: "ada@example.com" };
const GRACE: Person = { name: "Grace Example", email: "grace@example.com" };
const LINUS: Person = { name: "Linus Example", email: "linus@example.com" };
const BOT: Person = {
  name: "dependabot[bot]",
  email: "49699333+dependabot[bot]@users.noreply.github.com",
};

export const DEMO_PEOPLE_CSV = `name,hours,hourly_rate,wages
Ada Example,1450,95,
Grace Example,,,148000
`;

/** Builds the demo repository in `dir` and writes `people.csv` beside it; returns that file's path. */
export function buildDemo(dir: string, peopleDir: string): string {
  const repo = new RepoBuilder(dir).init("https://git.example.com/example-co/demo-app.git");
  repo.commit({
    author: LINUS,
    date: "2026-01-05",
    message: "Set up the monorepo: router, web and geo packages",
    files: {
      "package.json": '{ "name": "demo-app", "version": "1.3.0" }\n',
      "README.md": "# demo-app\n\nRoute planning for delivery fleets.\n",
      ".github/workflows/ci.yml": "name: CI\non: push\n",
      "apps/router/src/solver.ts": lines(30, "greedy"),
      "apps/web/src/filters.tsx": lines(20, "filter"),
      "packages/geo/src/cluster.ts": lines(120, "geohash"),
    },
  });

  repo.branch("spike/graph-solver");
  repo.commit({
    author: ADA,
    date: "2026-01-13",
    message: "Prototype a graph-based route solver",
    files: { "apps/router/src/graph.ts": lines(60, "graph") },
  });
  repo.commit({
    author: ADA,
    date: "2026-01-15",
    message: "Benchmark the graph solver against the greedy baseline: 3.1x slower on 500 stops",
    files: { "apps/router/bench/graph.bench.ts": lines(25, "bench") },
  });
  repo.checkout("main");

  const annealing = repo.commit({
    author: ADA,
    date: "2026-02-03",
    message:
      "Try simulated annealing for stop ordering\n\nCo-authored-by: Claude <noreply@anthropic.com>",
    files: { "apps/router/src/solver.ts": lines(30, "greedy") + lines(40, "anneal") },
  });
  repo.revert(
    annealing,
    ADA,
    "2026-02-10",
    "Did not converge under 2 s on the 500-stop set; back to greedy ordering.",
  );

  repo.commit({
    author: GRACE,
    date: "2026-03-02",
    message: "Evaluate H3 cells against geohash for stop clustering",
    files: { "packages/geo/bench/cluster.bench.ts": lines(35, "h3bench") },
  });
  repo.commit({
    author: GRACE,
    date: "2026-03-09",
    message: "Replace geohash clustering with H3 cells",
    files: { "packages/geo/src/cluster.ts": lines(130, "h3cell") },
  });

  repo.commit({
    author: LINUS,
    date: "2026-04-14",
    message: "Add date filters to the dispatch dashboard",
    files: { "apps/web/src/filters.tsx": lines(20, "filter") + lines(15, "dateFilter") },
  });
  repo.commit({
    author: LINUS,
    date: "2026-04-15",
    message: "Fix typo in README",
    files: { "README.md": "# demo-app\n\nRoute planning for delivery fleets.\n\n" },
  });
  repo.commit({
    author: BOT,
    date: "2026-04-20",
    message: "chore(deps): bump vite from 7.1.2 to 7.1.5",
    files: {
      "package.json":
        '{ "name": "demo-app", "version": "1.3.0", "devDependencies": { "vite": "7.1.5" } }\n',
      "pnpm-lock.yaml": lines(40, "lock"),
    },
  });

  repo.commit({
    author: ADA,
    date: "2026-05-06",
    message:
      "Experiment: time windows as soft penalties in the solver\n\nCo-authored-by: Claude <noreply@anthropic.com>",
    files: { "apps/router/src/solver.ts": lines(30, "greedy") + lines(25, "softWindow") },
  });
  repo.commit({
    author: GRACE,
    date: "2026-05-07",
    message: "Format with prettier",
    files: { "apps/web/src/filters.tsx": lines(20, "filter") + lines(15, "dateFilter") + "\n" },
  });
  repo.commit({
    author: ADA,
    date: "2026-06-02",
    message: "Abandon soft-penalty time windows: late arrivals doubled on the test set",
    files: { "apps/router/src/solver.ts": lines(30, "greedy") + lines(20, "hardWindow") },
  });

  repo.branch("feature/eta-model");
  repo.commit({
    author: GRACE,
    date: "2026-07-01",
    message: "Compare a gradient-boosted ETA model with the linear baseline",
    files: {
      "apps/router/src/eta.ts": lines(45, "gbm"),
      "apps/router/bench/eta.bench.ts": lines(20, "etaBench"),
    },
  });
  repo.commit({
    author: GRACE,
    date: "2026-07-03",
    message: "Use the gradient-boosted ETA model: 18% lower error on held-out routes",
    files: { "apps/router/src/eta.ts": lines(50, "gbm") },
  });
  repo.checkout("main");
  repo.merge("feature/eta-model", LINUS, "2026-07-06", "Merge branch 'feature/eta-model'");

  repo.commit({
    author: LINUS,
    date: "2026-07-20",
    message: "Release v1.4.0",
    files: {
      "package.json":
        '{ "name": "demo-app", "version": "1.4.0", "devDependencies": { "vite": "7.1.5" } }\n',
    },
  });
  repo.commit({
    author: LINUS,
    date: "2026-08-04",
    message: "ci: cache the pnpm store",
    files: { ".github/workflows/ci.yml": "name: CI\non: push\njobs: {}\n" },
  });
  repo.commit({
    author: ADA,
    date: "2026-09-01",
    message:
      "Investigate geocoder latency on large depots\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>",
    files: { "packages/geo/src/cluster.ts": lines(130, "h3cell") + lines(8, "latency") },
  });
  repo.commit({
    author: ADA,
    date: "2026-09-15",
    message: "Document the routing heuristics",
    files: { "docs/routing.md": "# Routing\n\nGreedy ordering with hard time windows.\n" },
  });

  const people = path.join(peopleDir, "people.csv");
  writeFileSync(people, DEMO_PEOPLE_CSV);
  return people;
}
