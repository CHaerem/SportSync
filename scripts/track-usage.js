import fs from "fs";
import path from "path";
import { fetchJson, readJsonIfExists, writeJsonPretty, rootDataPath, iso, parseSessionUsage } from "./lib/helpers.js";

const USAGE_API = "https://api.anthropic.com/api/oauth/usage";
const TRACKING_FILE = "usage-tracking.json";
const BEFORE_FILE = ".usage-before.json";
const MS_PER_5H = 5 * 3_600_000;
const MS_PER_7D = 7 * 86_400_000;

// Gate thresholds (permissive — Max subscription, self-hosted runner)
const GATE_UTILIZATION_7D = 80;
const GATE_MAX_AUTOPILOT_7D = 14;
const GATE_MAX_RUNS_5H = 10;

// Internal token budgets (self-imposed guardrails)
// Now based on real token counts from CLI JSON output (includes cache tokens)
const DAILY_TOKEN_BUDGET = 5000000;
const WEEKLY_TOKEN_BUDGET = 25000000;

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

export function aggregateInternalTokens(quality) {
	if (!quality || typeof quality !== "object") return null;
	const enrichment = quality.enrichment?.tokenUsage?.total || 0;
	const featured = quality.featured?.tokenUsage?.total || 0;
	const discovery = quality.discovery?.tokenUsage?.total || 0;
	const multiDay = quality.multiDay?.tokenUsage?.total || 0;
	const runTotal = enrichment + featured + discovery + multiDay;
	return { enrichment, featured, discovery, multiDay, runTotal };
}

export function calculateBudget(runs, now = Date.now()) {
	if (!Array.isArray(runs) || runs.length === 0) {
		return { dailyUsed: 0, weeklyUsed: 0, dailyBudget: DAILY_TOKEN_BUDGET, weeklyBudget: WEEKLY_TOKEN_BUDGET, dailyPct: 0, weeklyPct: 0 };
	}
	const dayAgo = now - 86_400_000;
	const weekAgo = now - MS_PER_7D;
	let dailyUsed = 0;
	let weeklyUsed = 0;
	for (const r of runs) {
		const ts = new Date(r.timestamp).getTime();
		const tokens = (r.tokens || 0) + (r.sessionTokens?.total || 0);
		if (ts > dayAgo) dailyUsed += tokens;
		if (ts > weekAgo) weeklyUsed += tokens;
	}
	return {
		dailyUsed,
		weeklyUsed,
		dailyBudget: DAILY_TOKEN_BUDGET,
		weeklyBudget: WEEKLY_TOKEN_BUDGET,
		dailyPct: Math.round((dailyUsed / DAILY_TOKEN_BUDGET) * 100),
		weeklyPct: Math.round((weeklyUsed / WEEKLY_TOKEN_BUDGET) * 100),
	};
}

/**
 * Track quota API availability state transitions.
 * Detects when the API goes from unavailable → available (or vice versa).
 * @param {boolean} apiAvailable - Whether the current API call succeeded
 * @param {object|null} previousStatus - Previous quotaApiStatus from usage-tracking.json
 * @returns {{ available: boolean, since: string, previousState: string|null, transitioned: boolean }}
 */
export function trackApiStatus(apiAvailable, previousStatus) {
	const now = new Date().toISOString();
	const prevAvailable = previousStatus?.available ?? null;
	const transitioned = prevAvailable !== null && prevAvailable !== apiAvailable;
	return {
		available: apiAvailable,
		since: transitioned ? now : (previousStatus?.since || now),
		previousState: prevAvailable === null ? null : (prevAvailable ? "available" : "unavailable"),
		transitioned,
		checkedAt: now,
	};
}

export function shouldGate(runs, utilization, now = Date.now()) {
	// Real utilization gate (preferred)
	if (typeof utilization === "number" && utilization > GATE_UTILIZATION_7D) {
		return { blocked: true, reason: `7d utilization ${utilization}% > ${GATE_UTILIZATION_7D}%` };
	}

	if (!Array.isArray(runs)) return { blocked: false, reason: "no data" };

	// Autopilot frequency over 7d
	const autopilotCount = runs.filter((r) => r.context === "autopilot").length;
	if (autopilotCount >= GATE_MAX_AUTOPILOT_7D) {
		return { blocked: true, reason: `${autopilotCount} autopilot runs in 7d (max ${GATE_MAX_AUTOPILOT_7D})` };
	}

	// Burst: too many AI runs in the last 5h
	const fiveHAgo = now - MS_PER_5H;
	const recentRuns = runs.filter((r) => new Date(r.timestamp).getTime() > fiveHAgo);
	if (recentRuns.length >= GATE_MAX_RUNS_5H) {
		return { blocked: true, reason: `${recentRuns.length} runs in last 5h (max ${GATE_MAX_RUNS_5H})` };
	}

	return { blocked: false, reason: "ok" };
}

// --- API helper ---

async function fetchUsage() {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	if (!token) return null;
	try {
		const data = await fetchJson(USAGE_API, {
			headers: {
				Authorization: `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20",
			},
		});
		if (data?.error) {
			console.error("Usage API error:", data.error.message || JSON.stringify(data.error));
			return null;
		}
		return data;
	} catch (err) {
		console.error("Failed to fetch usage:", err.message);
		return null;
	}
}

// --- Subcommands ---

async function snapshot() {
	const beforePath = path.join(rootDataPath(), BEFORE_FILE);
	const usage = await fetchUsage();
	writeJsonPretty(beforePath, { timestamp: iso(), usage: usage || null });
	console.log(usage ? "Usage snapshot saved (with utilization)" : "Usage snapshot saved (no API data)");
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
	const now = iso();
	const durationMs = beforeData?.timestamp
		? Date.now() - new Date(beforeData.timestamp).getTime()
		: 0;

	// Fetch current utilization
	const usage = await fetchUsage();

	// Read internal token data from ai-quality.json
	const quality = readJsonIfExists(path.join(dataDir, "ai-quality.json"));
	const internalTokens = aggregateInternalTokens(quality);

	// Parse autopilot session tokens if SESSION_ID is set
	const sessionId = process.env.SESSION_ID;
	const sessionTokens = parseSessionUsage(sessionId);
	if (sessionTokens) {
		console.log(`Session tokens: ${sessionTokens.total.toLocaleString()} total (${sessionTokens.output.toLocaleString()} output)`);
	}

	const existing = readJsonIfExists(trackingPath) || { runs: [] };
	const newRun = {
		timestamp: now,
		context,
		durationMs: Math.round(durationMs),
		tokens: internalTokens?.runTotal || 0,
		...(sessionTokens && { sessionTokens }),
	};
	const runs = pruneOldRuns([...(existing.runs || []), newRun]);
	const share = calculateShare(runs);
	const budget = calculateBudget(runs);
	const durationMin = Math.round(durationMs / 60_000);

	// Track quota API availability state
	const apiStatus = trackApiStatus(usage !== null, existing.quotaApiStatus || null);
	if (apiStatus.transitioned) {
		const newState = apiStatus.available ? "AVAILABLE" : "UNAVAILABLE";
		console.log(`*** Quota API state changed: ${apiStatus.previousState} → ${newState} ***`);
	}

	const tracking = {
		lastUpdated: now,
		current: usage ? {
			fiveHour: { utilization: usage.five_hour?.utilization ?? null },
			sevenDay: {
				utilization: usage.seven_day?.utilization ?? null,
				resets_at: usage.seven_day?.resets_at ?? null,
			},
		} : null,
		quotaApiStatus: apiStatus,
		internalTokens,
		...(sessionTokens && { sessionTokens }),
		budget,
		sportsyncShare: share,
		gateConfig: {
			utilizationThreshold: GATE_UTILIZATION_7D,
			maxAutopilot7d: GATE_MAX_AUTOPILOT_7D,
			maxRuns5h: GATE_MAX_RUNS_5H,
		},
		runs,
	};

	writeJsonPretty(trackingPath, tracking);
	const utilStr = usage?.seven_day?.utilization != null ? `, 7d util: ${usage.seven_day.utilization}%` : "";
	console.log(`Usage report saved (${context}: ${durationMin}min${utilStr})`);

	// Clean up before file
	try { fs.unlinkSync(beforePath); } catch { /* ignore */ }
}

async function gate() {
	const dataDir = rootDataPath();
	const trackingPath = path.join(dataDir, TRACKING_FILE);
	const existing = readJsonIfExists(trackingPath);
	const runs = pruneOldRuns(existing?.runs || []);

	// Try to get real utilization for the gate
	const usage = await fetchUsage();
	const util7d = usage?.seven_day?.utilization ?? null;

	const result = shouldGate(runs, util7d);
	console.log(`Gate check: ${result.reason}${util7d != null ? ` (7d: ${util7d}%)` : ""}`);
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
