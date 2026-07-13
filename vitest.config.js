import { defineConfig } from "vitest/config";

// Agent-worktrees under .claude/worktrees/ inneholder stale kopier av
// testfilene — uten denne eksklusjonen plukker vitest dem opp fra
// hovedkjøringen og gamle kontrakts-tester feiler mot nye skjemaer.
export default defineConfig({
	test: {
		exclude: ["**/node_modules/**", ".claude/**"],
	},
});
