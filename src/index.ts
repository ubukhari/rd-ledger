/** The library: the same reader, rules and pack the CLI and the MCP tools use. */
export {
  buildReport,
  type Report,
  type CommitRow,
  type ComponentRow,
  type PersonRow,
  type AllocationRow,
  type ScanInput,
} from "./scan.js";
export {
  gitAt,
  readRepo,
  readCommits,
  parseLog,
  parseRemote,
  commitLink,
  type Git,
} from "./git.js";
export {
  SIGNALS,
  ROUTINE,
  messageSignals,
  routineMarkers,
  aiCoauthors,
  type SignalId,
  type RoutineId,
} from "./signals.js";
export {
  parseComponentFlag,
  defaultComponent,
  globToRegExp,
  commitShares,
  type ComponentRule,
} from "./components.js";
export { parsePeople, type PersonFigures } from "./people.js";
export { resolvePeriod, type Period } from "./period.js";
export { readPullRequests, tokenFrom, type Fetch } from "./github.js";
export { renderCsvs, renderMarkdown, renderText, packDir } from "./render.js";
export { RdLedgerError } from "./errors.js";
export { DISCLAIMER, SOURCES } from "./sources.js";
export { TOOLS, callTool } from "./mcp.js";
