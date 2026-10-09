/**
 * Every error rd-ledger reports carries a code, what happened, how to fix it, and whether retrying
 * the same call can help: the shape the CLI's `--json`, the MCP tools and the README all use.
 */
export class RdLedgerError extends Error {
  constructor(
    readonly code: string,
    readonly cause_: string,
    readonly fix: string,
    readonly retryable = false,
  ) {
    super(cause_);
    this.name = "RdLedgerError";
  }

  toJSON(): { code: string; cause: string; fix: string; retryable: boolean } {
    return { code: this.code, cause: this.cause_, fix: this.fix, retryable: this.retryable };
  }
}
