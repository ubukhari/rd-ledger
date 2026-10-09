/**
 * The period a pack covers. Dates are calendar days; `until` is the last day included. Commits are
 * placed by their author date, as the author's own clock wrote it, because that is when the work was
 * done (a rebase moves the commit date, not the author date).
 *
 * With no period given: the previous calendar year from January to April (filing season), the
 * current year to date otherwise. Every output says which, and why.
 */
import { RdLedgerError } from "./errors.js";

export interface Period {
  /** first day, YYYY-MM-DD */
  since: string;
  /** last day included, YYYY-MM-DD */
  until: string;
  /** how the period was chosen, in words */
  reason: string;
}

export interface PeriodInput {
  year?: number;
  month?: string;
  since?: string;
  until?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const bad = (cause: string, fix: string) => new RdLedgerError("BAD_PERIOD", cause, fix);

/** The last day of a month, YYYY-MM-DD. */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The month before `now`'s, YYYY-MM: what the Action's monthly run covers by default. */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function resolvePeriod(input: PeriodInput, now: Date): Period {
  const given = [
    input.year !== undefined,
    input.month !== undefined,
    input.since !== undefined || input.until !== undefined,
  ].filter(Boolean).length;
  if (given > 1)
    throw bad(
      "give one of --year, --month, or --since/--until",
      "Pick one way to name the period, e.g. --year 2026.",
    );
  const today = now.toISOString().slice(0, 10);
  if (input.year !== undefined) {
    if (!Number.isInteger(input.year) || input.year < 1990 || input.year > 2100)
      throw bad(`--year ${String(input.year)} is not a year`, "Write it like --year 2026.");
    return {
      since: `${input.year}-01-01`,
      until: `${input.year}-12-31`,
      reason: `the calendar year ${input.year}`,
    };
  }
  if (input.month !== undefined) {
    const m = input.month === "previous" ? previousMonth(now) : input.month;
    if (!MONTH.test(m))
      throw bad(`--month ${input.month} is not a month`, "Write it like --month 2026-09.");
    return {
      since: `${m}-01`,
      until: monthEnd(m),
      reason: input.month === "previous" ? `last month, ${m}` : `the month ${m}`,
    };
  }
  if (input.since !== undefined || input.until !== undefined) {
    for (const [flag, v] of [
      ["--since", input.since],
      ["--until", input.until],
    ] as const)
      if (v !== undefined && !isDate(v))
        throw bad(`${flag} ${v} is not a date`, `Write it like ${flag} 2026-01-01.`);
    const since = input.since ?? `${(input.until ?? today).slice(0, 4)}-01-01`;
    const until = input.until ?? today;
    if (since > until)
      throw bad(`--since ${since} is after --until ${until}`, "Swap them, or fix one.");
    return {
      since,
      until,
      reason:
        input.since && input.until
          ? `the dates given, ${since} to ${until}`
          : input.since
            ? `from ${since} to today`
            : `the year to ${until}`,
    };
  }
  const year = now.getUTCFullYear();
  if (now.getUTCMonth() <= 3)
    return {
      since: `${year - 1}-01-01`,
      until: `${year - 1}-12-31`,
      reason: `no period given; January to April defaults to last year, ${year - 1}, the year being filed (--year to choose)`,
    };
  return {
    since: `${year}-01-01`,
    until: today,
    reason: `no period given; the year ${year} to date (--year ${year - 1} for last year)`,
  };
}

/** The day after `date`, for git's exclusive `--until`-style comparisons. */
export function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
