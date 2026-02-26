import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath } from "./lib/helpers.js";

const MIN_EVENTS = 5;

/** Paths the data pipeline is allowed to commit (glob prefixes). */
const PIPELINE_ALLOWED_PREFIXES = [
	"docs/data/",
	"scripts/config/",
];

/**
 * Check that staged files only touch pipeline-allowed paths.
 * Prevents the soft-reset retry from accidentally committing stale
 * versions of frontend or script files.
 * @param {string[]} stagedFiles - list of staged file paths from git
 * @returns {{ pass: boolean, violations: string[] }}
 */
export function evaluateCommitSafety(stagedFiles) {
	const violations = [];
	for (const file of stagedFiles) {
		const allowed = PIPELINE_ALLOWED_PREFIXES.some(prefix => file.startsWith(prefix));
		if (!allowed) {
			violations.push(file);
		}
	}
	return { pass: violations.length === 0, violations };
}

/**
 * Evaluate whether the pipeline output is safe to commit.
 * @param {Array|null} events - parsed events.json
 * @param {object|null} healthReport - parsed health-report.json
 * @returns {{ pass: boolean, reasons: string[] }}
 */
export function evaluateGate(events, healthReport) {
	const reasons = [];

	const eventCount = Array.isArray(events) ? events.length : 0;
	if (eventCount < MIN_EVENTS) {
		reasons.push(`Too few events: ${eventCount} (minimum ${MIN_EVENTS})`);
	}

	if (healthReport && healthReport.status === "critical") {
		reasons.push(`Health status is critical`);
	}

	return { pass: reasons.length === 0, reasons };
}

// CLI entry point
const isMain =
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
	const dataDir = rootDataPath();
	const events = readJsonIfExists(path.join(dataDir, "events.json"));
	const healthReport = readJsonIfExists(path.join(dataDir, "health-report.json"));

	const result = evaluateGate(events, healthReport);

	// Commit safety: verify staged files are within pipeline-allowed paths
	let safetyResult = { pass: true, violations: [] };
	try {
		const staged = execSync("git diff --staged --name-only", { encoding: "utf-8" })
			.trim()
			.split("\n")
			.filter(Boolean);
		if (staged.length > 0) {
			safetyResult = evaluateCommitSafety(staged);
		}
	} catch {
		// git not available (e.g., test environment) — skip safety check
	}

	const allPass = result.pass && safetyResult.pass;

	if (allPass) {
		console.log("Pre-commit gate: PASS");
		process.exit(0);
	} else {
		console.error("Pre-commit gate: FAIL");
		for (const r of result.reasons) {
			console.error(`  - ${r}`);
		}
		for (const v of safetyResult.violations) {
			console.error(`  - Non-pipeline file staged: ${v}`);
		}
		process.exit(1);
	}
}
