#!/usr/bin/env node
// PreToolUse hook: blocks the AUTONOMOUS CI agents from modifying
// scripts/config/interests.json — the file is user-owned (CLAUDE.md).
// The threat is an unattended agent (research/verify/editorial/scout, running
// via claude-code-action in GitHub Actions) drifting the user's intent without
// per-edit approval. A human operator in a local Claude Code session IS the
// user editing their own file, so this only blocks when running in CI.
// Exit 2 blocks the tool call and feeds stderr back to the agent.

const IN_CI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
	if (!IN_CI) process.exit(0); // local operator edits are allowed (user-directed)
	let input = {};
	try {
		input = JSON.parse(raw || "{}");
	} catch {
		process.exit(0); // malformed input — don't break the session
	}
	const tool = input.tool_name || "";
	const ti = input.tool_input || {};
	const target = "scripts/config/interests.json";

	let touches = false;
	const filePath = (ti.file_path || "").replace(/\\/g, "/");
	// Basename check catches absolute, repo-relative AND bare-relative paths.
	if (filePath.split("/").pop() === "interests.json") {
		touches = true;
	}
	if (tool === "Bash" && typeof ti.command === "string") {
		const cmd = ti.command;
		// Block only when a write operation targets the file itself — merely
		// mentioning interests.json (commit messages, greps, 2>&1) is fine.
		// This is defense-in-depth, not a sandbox: an adversarial inline script
		// could still evade it, but the Write/Edit path (covered above) is the
		// channel agents actually use.
		const redirectsInto = />>?\s*[^\s;&|<>]*interests\.json/.test(cmd);
		const pipesInto = /\btee\b[^;&|]*interests\.json/.test(cmd);
		const mutatesInPlace = /\b(?:sed\s+-i|mv|cp|rm|truncate|dd)\b[^;&|]*interests\.json/.test(cmd);
		const scriptWrites = /\bwrite(?:File(?:Sync)?)?\s*\([^)]*interests\.json/.test(cmd);
		if (redirectsInto || pipesInto || mutatesInPlace || scriptWrites) {
			touches = true;
		}
	}

	if (touches) {
		console.error(
			"BLOCKED by hook: scripts/config/interests.json is user-owned — the AI must never modify it. " +
			"If the user's interests should change, tell the user to edit the file themselves."
		);
		process.exit(2);
	}
	process.exit(0);
});
