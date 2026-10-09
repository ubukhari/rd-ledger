/**
 * The line every output carries, and the rules the pack is shaped by, each with the date it was
 * read. The pack cites them under "What this is"; the README cites the same list.
 */
export const DISCLAIMER = "Evidence to review with your tax adviser; not tax advice.";

export interface Source {
  label: string;
  url: string;
  read: string;
}

export const SOURCES: readonly Source[] = [
  {
    label:
      "Treas. Reg. §1.41-4: the process of experimentation, (a)(5); records to substantiate the credit, (d)",
    url: "https://www.law.cornell.edu/cfr/text/26/1.41-4",
    read: "2026-10-09",
  },
  {
    label:
      "IRS, Instructions for Form 6765 (rev. 12/2025): Section G business components, required for tax years beginning after 2025",
    url: "https://www.irs.gov/instructions/i6765",
    read: "2026-10-09",
  },
  {
    label:
      "George v. Commissioner, T.C. Memo. 2026-10: records made during the work, not reconstructed studies (PKF O'Connor Davies, 9 Mar 2026)",
    url: "https://www.pkfod.com/insights/irs-rd-credit-audits-tax-court-reinforces-documentation-requirements/",
    read: "2026-10-09",
  },
  {
    label: "IRS: the qualified small business payroll tax election, up to $500,000 a year",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/qualified-small-business-payroll-tax-credit-for-increasing-research-activities",
    read: "2026-10-09",
  },
];
