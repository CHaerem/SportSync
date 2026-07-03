#!/usr/bin/env node
// PostToolUse hook: after any write to docs/data/events.json, run the event
// validator and feed failures straight back to the agent (exit 2 → stderr is
// shown to Claude). Turns "remember to run validate-events.js" into a guarantee.

import { spawnSync } from "child_process";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
	let input = {};
	try {
		input = JSON.parse(raw || "{}");
	} catch {
		process.exit(0);
	}
	const filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
	if (!filePath.endsWith("docs/data/events.json")) process.exit(0);

	const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
	const result = spawnSync("node", ["scripts/validate-events.js"], {
		cwd: projectDir,
		encoding: "utf-8",
		env: process.env,
	});
	if (result.status !== 0) {
		console.error(
			"events.json failed validation after your write — fix these before continuing:\n" +
			(result.stdout || "") + (result.stderr || "")
		);
		process.exit(2);
	}
	process.exit(0);
});
