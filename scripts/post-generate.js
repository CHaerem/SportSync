#!/usr/bin/env node
/**
 * Post-generate step — runs after AI content generation.
 *
 * Consolidates three small, independent, non-AI pipeline steps that were
 * previously listed separately in pipeline-manifest.json:
 *   1. generate-multi-day   — recap + preview briefings (may call AI if CLAUDE_CODE_OAUTH_TOKEN set)
 *   2. build-day-snapshots  — deterministic per-day JSON for day-navigator
 *   3. generate-insights    — analytical nuggets from standings/results
 *
 * Each step is independent; a failure in one does not block the others.
 * The --backfill arg for generate-multi-day is forwarded unchanged.
 *
 * Env: inherits CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, OPENAI_API_KEY from parent.
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/**
 * Run a Node script as a child process.
 * @param {string} scriptPath - Absolute path to the script
 * @param {string[]} args - Extra CLI args to forward
 * @param {object} opts - Options (timeout, env overrides)
 */
function runScript(scriptPath, args = [], opts = {}) {
	const cmd = `node ${JSON.stringify(scriptPath)} ${args.join(" ")}`.trim();
	execSync(cmd, {
		cwd: ROOT,
		stdio: "inherit",
		timeout: opts.timeout || 300000,
		env: { ...process.env, ...opts.env },
	});
}

/**
 * Run a step, logging success/failure. Never throws — errors are logged and execution continues.
 * @param {string} name - Human-readable step name for logging
 * @param {Function} fn - Zero-arg function to invoke
 */
function step(name, fn) {
	console.log(`\n[post-generate] Starting: ${name}`);
	try {
		fn();
		console.log(`[post-generate] Done: ${name}`);
	} catch (err) {
		console.error(`[post-generate] Failed: ${name} — ${err.message}`);
	}
}

// Forward --backfill arg to generate-multi-day
const backfillArg = process.argv.find(a => a.startsWith("--backfill"));
const multiDayArgs = backfillArg ? [backfillArg] : ["--backfill", "5"];

step("generate-multi-day", () => {
	runScript(
		path.join(__dirname, "generate-multi-day.js"),
		multiDayArgs,
		{ timeout: 600000 }
	);
});

step("build-day-snapshots", () => {
	runScript(path.join(__dirname, "build-day-snapshots.js"));
});

step("generate-insights", () => {
	runScript(path.join(__dirname, "generate-insights.js"));
});

console.log("\n[post-generate] All post-generate steps complete.");
