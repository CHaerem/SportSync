#!/usr/bin/env node
// PreToolUse hook: blocks the AUTONOMOUS CI agents from mutating the automation's
// OWN protected paths — the workflow definitions, composite actions, safety hooks,
// and the harness settings that wire them. These are four of the five
// never-auto-merged paths (see CLAUDE.md "Autonomy model" / scripts/merge-gate.js).
//
// Why a hook and not just merge-gate.js: merge-gate stops a PR-based self-fixing
// loop's protected-path change from AUTO-merging, but the five DIRECT-PUSHING
// agents (research/verify/editorial/scout/coverage-critic) commit straight to main
// with NO gate, and main has no branch protection. Without this hook a buggy or
// prompt-injected direct-pusher could rewrite a workflow or disable a safety hook
// and have it land on main unreviewed. This closes that gap at the harness level,
// the same way protect-interests.js guards the user-owned config. It applies to
// EVERY CI agent (the PR loops included): a protected-path change must be authored
// by a human, not any unattended agent — merge-gate.js then remains as complementary
// defense-in-depth for anything that still reaches a branch.
//
// CI-only, exactly like protect-interests.js: the threat is an UNATTENDED agent. A
// human in a local Claude Code session IS the operator editing their own
// automation, so the hook exits 0 and stays out of the way. Exit 2 blocks the tool
// call and feeds stderr back to the agent.
//
// (interests.json is the fifth protected path; it keeps its own dedicated,
// user-owned message in protect-interests.js and is intentionally not repeated
// here.)

const IN_CI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

// True when `raw` (however rooted: absolute, repo-relative, or bare-relative)
// names a protected automation FILE. The three directory classes require a file
// under them; the harness settings is the one exact file.
function isProtectedPath(raw) {
	const s = String(raw || "").replace(/\\/g, "/");
	return (
		/(^|\/)\.github\/workflows\/[^/]/.test(s) ||
		/(^|\/)\.github\/actions\/[^/]/.test(s) ||
		/(^|\/)scripts\/hooks\/[^/]/.test(s) ||
		/(^|\/)\.claude\/settings\.json$/.test(s)
	);
}

// True when a Bash command WRITES to one of the protected paths. Same philosophy
// as protect-interests.js: cover the mutation verbs agents actually use (shell
// redirect, tee, in-place editors, node fs writes) — reads/greps pass. This is
// defense-in-depth, not a sandbox; the Write/Edit path above is the real channel.
function bashMutatesProtected(cmd) {
	const frag = String.raw`(?:\.github\/(?:workflows|actions)\/|scripts\/hooks\/|\.claude\/settings\.json)`;
	const redirectsInto = new RegExp(String.raw`>>?\s*[^\s;&|<>]*${frag}`).test(cmd);
	const pipesInto = new RegExp(String.raw`\btee\b[^;&|]*${frag}`).test(cmd);
	const mutatesInPlace = new RegExp(String.raw`\b(?:sed\s+-i|mv|cp|rm|truncate|dd)\b[^;&|]*${frag}`).test(cmd);
	const scriptWrites = new RegExp(String.raw`\bwrite(?:File(?:Sync)?)?\s*\([^)]*${frag}`).test(cmd);
	return redirectsInto || pipesInto || mutatesInPlace || scriptWrites;
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
	if (!IN_CI) process.exit(0); // local operator edits are the human's own automation
	let input = {};
	try {
		input = JSON.parse(raw || "{}");
	} catch {
		process.exit(0); // malformed input — don't break the session
	}
	const tool = input.tool_name || "";
	const ti = input.tool_input || {};

	let touches = false;
	if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
		if (isProtectedPath(ti.file_path)) touches = true;
	}
	if (tool === "Bash" && typeof ti.command === "string") {
		if (bashMutatesProtected(ti.command)) touches = true;
	}

	if (touches) {
		console.error(
			"BLOCKED by hook: that path is a protected automation path (.github/workflows/**, " +
			".github/actions/**, scripts/hooks/**, or .claude/settings.json). An unattended CI agent " +
			"must not rewrite the workflows, composite actions, safety hooks, or harness settings that " +
			"gate the automation itself. A human must author changes to these files."
		);
		process.exit(2);
	}
	process.exit(0);
});
