import fs from "fs";
import path from "path";
import { readJsonIfExists, writeJsonPretty, rootDataPath, iso } from "./lib/helpers.js";

const TRACKING_FILE = "usage-tracking.json";
const BEFORE_FILE = ".usage-before.json";
const MS_PER_5H = 5 * 3_600_000;
const MS_PER_7D = 7 * 86_400_000;

// Max autopilot runs per 7-day window before gating
const GATE_MAX_AUTOPILOT_7D = 7;
// Max total AI runs (pipeline+autopilot) in a 5h window before gating
const GATE_MAX_RUNS_5H = 4;

// --- Pure functions (exported for testing) ---

export function pruneOldRuns(runs, now = Date.now()) {
	if (!Array.isArray(runs)) return [];
	const cutoff = now - MS_PER_7D;
	return runs.filter((r) => r.timestamp && new Date(r.timestamp).getTime() > cutoff);
}

export function calculateShare(runs) {
	if (!Array.isArray(runs) || runs.length === 0) {
		return { pipelineRuns: 0, autopilotRuns: 0, totalDurationMs: 0 };
	}
	let pipelineRuns = 0;
	let autopilotRuns = 0;
	let totalDurationMs = 0;
	for (const r of runs) {
		if (r.context === "pipeline") pipelineRuns++;
		if (r.context === "autopilot") autopilotRuns++;
		totalDurationMs += r.durationMs || 0;
	}
	return { pipelineRuns, autopilotRuns, totalDurationMs };
}

export function shouldGate(runs, now = Date.now()) {
	if (!Array.isArray(runs)) return { blocked: false, reason: "no data" };

	// Check autopilot frequency over 7d
	const autopilotCount = runs.filter((r) => r.context === "autopilot").length;
	if (autopilotCount >= GATE_MAX_AUTOPILOT_7D) {
		return { blocked: true, reason: `${autopilotCount} autopilot runs in 7d (max ${GATE_MAX_AUTOPILOT_7D})` };
	}

	// Check burst: too many AI runs in the last 5h
	const fiveHAgo = now - MS_PER_5H;
	const recentRuns = runs.filter((r) => new Date(r.timestamp).getTime() > fiveHAgo);
	if (recentRuns.length >= GATE_MAX_RUNS_5H) {
		return { blocked: true, reason: `${recentRuns.length} runs in last 5h (max ${GATE_MAX_RUNS_5H})` };
	}

	return { blocked: false, reason: "ok" };
}

// --- Subcommands ---

function snapshot() {
	const beforePath = path.join(rootDataPath(), BEFORE_FILE);
	writeJsonPretty(beforePath, { timestamp: iso() });
	console.log("Usage snapshot saved (timestamp only)");
}

function report(context) {
	if (!context) {
		console.error("Usage: track-usage.js report <pipeline|autopilot>");
		process.exit(1);
	}
	const dataDir = rootDataPath();
	const beforePath = path.join(dataDir, BEFORE_FILE);
	const trackingPath = path.join(dataDir, TRACKING_FILE);

	const beforeData = readJsonIfExists(beforePath);
	const now = iso();
	const durationMs = beforeData?.timestamp
		? Date.now() - new Date(beforeData.timestamp).getTime()
		: 0;

	const existing = readJsonIfExists(trackingPath) || { runs: [] };
	const newRun = {
		timestamp: now,
		context,
		durationMs: Math.round(durationMs),
	};
	const runs = pruneOldRuns([...(existing.runs || []), newRun]);
	const share = calculateShare(runs);

	const durationMin = Math.round(durationMs / 60_000);
	const tracking = {
		lastUpdated: now,
		sportsyncShare: share,
		gateConfig: {
			maxAutopilot7d: GATE_MAX_AUTOPILOT_7D,
			maxRuns5h: GATE_MAX_RUNS_5H,
		},
		runs,
	};

	writeJsonPretty(trackingPath, tracking);
	console.log(`Usage report saved (${context}: ${durationMin}min, ${share.pipelineRuns} pipeline + ${share.autopilotRuns} autopilot in 7d)`);

	// Clean up before file
	try {
		fs.unlinkSync(beforePath);
	} catch { /* ignore */ }
}

function gate() {
	const dataDir = rootDataPath();
	const trackingPath = path.join(dataDir, TRACKING_FILE);
	const existing = readJsonIfExists(trackingPath);
	const runs = pruneOldRuns(existing?.runs || []);
	const result = shouldGate(runs);

	console.log(`Gate check: ${result.reason}`);
	if (result.blocked) {
		console.log("Gate BLOCKED — backing off to preserve quota");
		process.exit(1);
	}
	console.log("Gate passed");
}

// --- CLI entry ---

const scriptName = path.basename(process.argv[1] || "");
if (scriptName === "track-usage.js") {
	const cmd = process.argv[2];
	const arg = process.argv[3];
	switch (cmd) {
		case "snapshot":
			snapshot();
			break;
		case "report":
			report(arg);
			break;
		case "gate":
			gate();
			break;
		default:
			console.log("Usage: track-usage.js <snapshot|report|gate>");
			process.exit(1);
	}
}
