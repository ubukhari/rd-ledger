/**
 * The hand-off, before it exists: a year-round evidence ledger is not built, so every run and every
 * page says so and offers a waitlist instead (brief DOOR-25). No existing engine fits honestly:
 * okgate's hash-chained log records agent actions, seatledger AI token spend, agentcheck servers.
 *
 * The link goes to a page on agentwares.vercel.app whose page view is the count (the site's
 * existing beacon; no form, no cookie). The CLI's link has its own path, so a click from the CLI
 * and a click from a page can be told apart. No price is shown: the orchestrator has not set one,
 * and nothing names a price until a checkout works.
 */
export const SITE = "https://agentwares.vercel.app";

/** The pages, for `--help` and the summary. */
export const PAGES_URL = `${SITE}/rd-credit`;

export const NOT_BUILT =
  "A year-round R&D evidence ledger, kept month by month as the work happens, is not built.";

export const WAITLIST_OFFER =
  "Each month's evidence captured that month and kept under a date we hold, so the record shows when it existed; at year end, the hours or wages you enter allocated across your business components in Form 6765 Section G's shape; and a read-only link for your tax adviser.";

export const WAITLIST_STATUS =
  "Not built. No price is set and nothing is charged. It gets built only if enough people ask.";

export const WAITLIST_CLI_URL = `${SITE}/rd-credit/waitlist/cli`;
export const WAITLIST_PAGE_URL = `${SITE}/rd-credit/waitlist`;
