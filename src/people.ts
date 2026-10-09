/**
 * Hours and money come only from the user. `--people people.csv` names each person with the hours
 * they worked in the period, an hourly rate, or wages, as the user's own records say. rd-ledger
 * never estimates hours from commits: a commit's timestamp says when it was written, not how long
 * the work took.
 *
 * Given those figures, a person's hours (or wages) are split across components by their share of
 * commit-days: each day they committed counts once, divided among the components they changed that
 * day by lines changed. The table says so: an allocation by commit activity, not a time record.
 */
import { parseCsv } from "./csv.js";
import { RdLedgerError } from "./errors.js";

export interface PersonFigures {
  /** the row in the file, from 2 (the header is row 1) */
  row: number;
  name: string;
  email: string | null;
  hours: number | null;
  hourlyRate: number | null;
  wages: number | null;
}

const bad = (cause: string) =>
  new RdLedgerError(
    "BAD_PEOPLE_FILE",
    cause,
    "Write a CSV with a header row: name,hours,hourly_rate,wages (email optional; leave a cell empty when you do not have the figure).",
  );

function amount(cell: string | undefined, what: string, row: number): number | null {
  const s = (cell ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/[$£€,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0)
    throw bad(`row ${row}: ${what} ${JSON.stringify(s)} is not a number`);
  return n;
}

export function parsePeople(text: string): PersonFigures[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw bad("the people file is empty");
  const header = rows[0]!.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  );
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const name = col("name", "person", "employee");
  const email = col("email", "e_mail");
  const hours = col("hours", "hours_worked");
  const rate = col("hourly_rate", "rate", "hourly");
  const wages = col("wages", "w2_wages", "w_2_wages", "box_1", "salary");
  if (name < 0 && email < 0) throw bad("no name (or email) column in the header row");
  if (hours < 0 && wages < 0) throw bad("no hours or wages column in the header row");
  const out: PersonFigures[] = [];
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const n = name >= 0 ? (r[name] ?? "").trim() : "";
    const e = email >= 0 ? (r[email] ?? "").trim().toLowerCase() : "";
    if (!n && !e) throw bad(`row ${row}: no name or email`);
    out.push({
      row,
      name: n,
      email: e || null,
      hours: hours >= 0 ? amount(r[hours], "hours", row) : null,
      hourlyRate: rate >= 0 ? amount(r[rate], "hourly_rate", row) : null,
      wages: wages >= 0 ? amount(r[wages], "wages", row) : null,
    });
  });
  return out;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Which figures row is this person: by email when the file has one, else by name. */
export function matchFigures(
  figures: readonly PersonFigures[],
  person: { name: string; emails: readonly string[] },
): PersonFigures | null {
  const emails = new Set(person.emails.map((e) => e.toLowerCase()));
  return (
    figures.find((f) => f.email !== null && emails.has(f.email)) ??
    figures.find((f) => f.name !== "" && norm(f.name) === norm(person.name)) ??
    null
  );
}

/** What the allocation multiplies: wages when given, else hours × rate; hours always when given. */
export function basisOf(f: PersonFigures): {
  hours: number | null;
  amount: number | null;
  basis: string;
} {
  if (f.wages !== null) return { hours: f.hours, amount: f.wages, basis: "wages as supplied" };
  if (f.hours !== null && f.hourlyRate !== null)
    return {
      hours: f.hours,
      amount: f.hours * f.hourlyRate,
      basis: "hours × hourly rate as supplied",
    };
  if (f.hours !== null) return { hours: f.hours, amount: null, basis: "hours as supplied" };
  return { hours: null, amount: null, basis: "no figures supplied" };
}
