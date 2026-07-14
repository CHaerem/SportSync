#!/usr/bin/env node
/**
 * Shared merge gate for the three self-fixing loops (ui-fix, self-repair, improve).
 *   node scripts/merge-gate.js <branch-prefix> [--validate-events]
 *
 * ONE place enforces the invariant "protected paths are never auto-merged".
 * Finds the newest open PR whose head branch starts with <branch-prefix> and:
 *   1. If it touches a protected path → leave it OPEN, label `needs-review`.
 *      Protected: the workflows (the automation's own defs + this gate), the
 *      composite actions, the safety hooks, the hook wiring (.claude/settings.json),
 *      and the user-owned interests.json.
 *   2. Otherwise re-run the tests ourselves as a deterministic hard gate
 *      (npm ci + npm test, plus validate-events for self-repair) and auto-merge.
 *      A failing gate command throws → the workflow step fails loudly and the
 *      PR stays open, so a bad fix never reaches the live site.
 *
 * Writes `merged=true|false` to $GITHUB_OUTPUT (drives the deploy job).
 */
import fs from "fs";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

// Paths that must never ship unattended. Kept in sync with CLAUDE.md
// ("Protected paths — never auto-merged") and the agent prompts.
export const PROTECTED_PATHS = [
	/^\.github\/workflows\//, // the automation's own definitions and gates
	/^\.github\/actions\//, // composite actions the workflows invoke
	/^scripts\/hooks\//, // the safety hooks (interests protection, post-write validate)
	/^scripts\/config\/interests\.json$/, // user-owned; AI never writes here
	/^\.claude\/settings\.json$/, // wires the safety hooks into the harness
];

export function findProtectedPaths(files) {
	return files.filter((f) => PROTECTED_PATHS.some((re) => re.test(f)));
}

export function pickLatestPr(prs, prefix) {
	const matching = (prs || []).filter((pr) => pr.headRefName && pr.headRefName.startsWith(prefix));
	if (matching.length === 0) return null;
	return matching.reduce((a, b) => (b.number > a.number ? b : a));
}

/**
 * The gate itself, with all side effects behind `io` so tests can drive it.
 * Returns { merged, reason } and mirrors the decision to io.setOutput("merged", …).
 */
export function runMergeGate({ prefix, validateEvents = false }, io) {
	const pr = pickLatestPr(io.listOpenPrs(), prefix);
	if (!pr) {
		io.log(`No open ${prefix}* PR (nothing to fix / abandoned) — done.`);
		io.setOutput("merged", "false");
		return { merged: false, reason: "no-pr" };
	}

	const blocked = findProtectedPaths(io.prFiles(pr.number));
	if (blocked.length > 0) {
		for (const f of blocked) io.log(`protected path: ${f}`);
		io.log(`PR #${pr.number} touches a protected path — leaving OPEN for review.`);
		io.addLabel(pr.number, "needs-review");
		io.setOutput("merged", "false");
		return { merged: false, reason: "protected-path", blocked };
	}

	io.log(`Re-gating PR #${pr.number} with a fresh test run before auto-merge…`);
	io.checkoutPr(pr.number);
	io.run("npm", ["ci"]);
	io.run("npm", ["test"]);
	if (validateEvents) io.run("node", ["scripts/validate-events.js"]);
	io.merge(pr.number);
	io.log(`Auto-merged PR #${pr.number}.`);
	io.setOutput("merged", "true");
	return { merged: true, reason: "merged" };
}

function realIo() {
	const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
	const ghJson = (args) => JSON.parse(execFileSync("gh", args, { encoding: "utf-8" }));
	return {
		log: (msg) => console.log(msg),
		listOpenPrs: () => ghJson(["pr", "list", "--state", "open", "--json", "number,headRefName"]),
		prFiles: (n) => ghJson(["pr", "view", String(n), "--json", "files"]).files.map((f) => f.path),
		addLabel: (n, label) => {
			try {
				sh("gh", ["pr", "edit", String(n), "--add-label", label]);
			} catch {
				console.log(`(could not add label ${label} — leaving the PR open anyway)`);
			}
		},
		checkoutPr: (n) => sh("gh", ["pr", "checkout", String(n)]),
		run: sh,
		merge: (n) => sh("gh", ["pr", "merge", String(n), "--merge", "--delete-branch"]),
		setOutput: (key, value) => {
			console.log(`${key}=${value}`);
			if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
		},
	};
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	const args = process.argv.slice(2);
	const prefix = args.find((a) => !a.startsWith("--"));
	if (!prefix) {
		console.error("Usage: node scripts/merge-gate.js <branch-prefix> [--validate-events]");
		process.exit(2);
	}
	runMergeGate({ prefix, validateEvents: args.includes("--validate-events") }, realIo());
}
