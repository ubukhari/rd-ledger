import { defineConfig } from "tsup";

/**
 * No runtime dependencies: the git reader, the rules, the pack writer and the MCP server are this
 * package's own code, so `npx` installs one package. Nothing in it opens a network connection
 * unless the user passes `--prs` with their own GitHub token.
 */
export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  splitting: false,
});
