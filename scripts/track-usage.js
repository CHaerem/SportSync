import path from "path";
import { fetchJson, readJsonIfExists, writeJsonPretty, rootDataPath, iso } from "./lib/helpers.js";

const USAGE_API = "https://api.anthropic.com/api/oauth/usage";
const TRACKING_FILE = "usage-tracking.json";
const BEFORE_FILE = ".usage-before.json";
const MS_PER_7D = 7 * 86_400_000;
const GATE_THRESHOLD = 80;

// --- Pure functions (exported for testing) ---

export function calculateDelta(before, after) {
	if (!before || !after) return { delta5h: 0, delta7d: 0 };
	const b5 = before.five_hour?.utilization ?? 0;
	const a5 = after.five_hour?.utilization ?? 0;
	const b7 = before.seven_day?.utilization ?? 0;
	const a7 = after.seven_day?.utilization ?? 0;
	return {
		delta5h: Math.round((a5 - b5) * 100) / 100,
		delta7d: Math.round((a7 - b7) * 100) / 100,
	};
}

export function pruneOldRuns(runs, now = Date.now()) {
	if (!Array.isArray(runs)) return [];
	const cutoff = now - MS_PER_7D;
	return runs.filter((r) => r.timestamp && new Date(r.timestamp).getTime() > cutoff);
}

export function calculateShare(runs) {
	if (!Array.isArray(runs) || runs.length === 0) {
		return { sevenDay: 0, pipelineRuns: 0, autopilotRuns: 0 };
	}
	let total7d = 0;
	let pipelineRuns = 0;
	let autopilotRuns = 0;
	for (const r of runs) {
		total7d += r.delta7d || 0;
		if (r.context === "pipeline") pipelineRuns++;
		if (r.context === "autopilot") autopilotRuns++;
	}
	return {
		sevenDay: Math.round(total7d * 100) / 100,
		pipelineRuns,
		autopilotRuns,
	};
}

export function shouldGate(utilization, threshold = GATE_THRESHOLD) {
	return typeof utilization === "number" && utilization > threshold;
}

// --- API helper ---

async function fetchUsage() {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	if (!token) {
		console.log("No CLAUDE_CODE_OAUTH_TOKEN — skipping usage fetch");
		return null;
	}
	try {
		const data = await fetchJson(USAGE_API, {
			headers: { Authorization: `Bearer ${token}` },
		});
		console.log("Usage API response keys:", Object.keys(data || {}));
		return data;
	} catch (err) {
		console.error("Failed to fetch usage:", err.message);
		return null;
	}
}

// --- Subcommands ---

async function snapshot() {
	const usage = await fetchUsage();
	if (!usage) return;
	const beforePath = path.join(rootDataPath(), BEFORE_FILE);
	writeJsonPretty(beforePath, { timestamp: iso(), usage });
	console.log("Usage snapshot saved");
}

async function report(context) {
	if (!context) {
		console.error("Usage: track-usage.js report <pipeline|autopilot>");
		process.exit(1);
	}
	const dataDir = rootDataPath();
	const beforePath = path.join(dataDir, BEFORE_FILE);
	const trackingPath = path.join(dataDir, TRACKING_FILE);

	const beforeData = readJsonIfExists(beforePath);
	const currentUsage = await fetchUsage();
	if (!currentUsage) return;

	const before = beforeData?.usage || null;
	const delta = calculateDelta(before, currentUsage);
	const now = iso();

	const existing = readJsonIfExists(trackingPath) || { runs: [] };
	const newRun = {
		timestamp: now,
		context,
		delta5h: delta.delta5h,
		delta7d: delta.delta7d,
	};
	const runs = pruneOldRuns([...(existing.runs || []), newRun]);
	const share = calculateShare(runs);

	const tracking = {
		lastUpdated: now,
		current: {
			fiveHour: { utilization: currentUsage.five_hour?.utilization ?? null },
			sevenDay: {
				utilization: currentUsage.seven_day?.utilization ?? null,
				resets_at: currentUsage.seven_day?.resets_at ?? null,
			},
		},
		sportsyncShare: share,
		gateThreshold: GATE_THRESHOLD,
		runs,
	};

	writeJsonPretty(trackingPath, tracking);
	console.log(`Usage report saved (${context}: delta7d=${delta.delta7d}%)`);

	// Clean up before file
	try {
		const fs = await import("fs");
		fs.unlinkSync(beforePath);
	} catch { /* ignore */ }
}

async function gate() {
	const usage = await fetchUsage();
	if (!usage) {
		console.log("No usage data — gate passes by default");
		process.exit(0);
	}
	const util7d = usage.seven_day?.utilization ?? 0;
	console.log(`7-day utilization: ${util7d}% (threshold: ${GATE_THRESHOLD}%)`);
	if (shouldGate(util7d, GATE_THRESHOLD)) {
		console.log("Gate BLOCKED — utilization too high, skipping autopilot");
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
