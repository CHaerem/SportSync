import path from "path";
import { readJsonIfExists, rootDataPath } from "./lib/helpers.js";

const MIN_EVENTS = 5;

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

	if (result.pass) {
		console.log("Pre-commit gate: PASS");
		process.exit(0);
	} else {
		console.error("Pre-commit gate: FAIL");
		for (const r of result.reasons) {
			console.error(`  - ${r}`);
		}
		process.exit(1);
	}
}
