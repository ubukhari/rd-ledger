/**
 * How to run rd-ledger: the one constant behind every place the command is shown or printed
 * (`--help` and the CLI's own lines, the README and its recorded run, the plugin skill and
 * marketplace, the Action's example, and the /rd-credit pages on agentwares.vercel.app).
 *
 * The public repo does not exist yet, so PUBLISHED is false and the pages name neither the command,
 * the npm name nor the repo (brief DOOR-25). The day the repo exists, flip PUBLISHED; the day npm
 * serves the package, flip ON_NPM too, then rewrite the files that cannot import this:
 *
 *   RD_LEDGER_WRITE=1 pnpm --filter rd-ledger exec vitest run src/distribution
 *
 * npm 12 refuses a git spec unless `--allow-git` permits it ("Refusing to fetch"); `root` permits
 * only the spec named on the command line, so the GitHub form carries it. src/distribution.test.ts
 * fails while any surface names another form of the command.
 */
export const PUBLISHED: boolean = false;
export const ON_NPM: boolean = false;

export const NAME = "rd-ledger";
export const REPO = `https://github.com/agentwares/${NAME}`;

/** What a person types. */
export const INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;

/** What an agent runs unattended: no install prompt, and on npm the newest version. */
export const RUN = ON_NPM
  ? `npx -y ${NAME}@latest`
  : `npx -y --allow-git=root github:agentwares/${NAME}`;

/** The GitHub Action, as a workflow names it. */
export const ACTION = `agentwares/${NAME}@main`;
