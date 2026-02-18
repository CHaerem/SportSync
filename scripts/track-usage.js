import fs from "fs";
import path from "path";
import { readJsonIfExists, writeJsonPretty, rootDataPath, iso, parseSessionUsage } from "./lib/helpers.js";
import { probeQuota, parseRateLimitHeaders, evaluateQuota } from "./lib/quota-probe.js";

const TRACKING_FILE = "usage-tracking.json";
const BEFORE_FILE = ".usage-before.json";
const MS_PER_5H = 5 * 3_600_000;
const MS_PER_7D = 7 * 86_400_000;

// Autopilot-specific frequency guards (complement quota tier system)
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

/**
 * Determine whether the autopilot should be gated.
 * Uses the tiered quota system from quota-probe.js for utilization-based decisions,
 * plus autopilot-specific frequency guards.
 *
 * @param {Array} runs — recent run history (from usage-tracking.json)
 * @param {object|null} evaluation — result from evaluateQuota() (tier, tierName, etc.)
 * @param {number} now — current timestamp (for testing)
 * @returns {{ blocked: boolean, reason: string, tier: number, tierName: string }}
 */
export function shouldGate(runs, evaluation, now = Date.now()) {
	const tier = evaluation?.tier ?? 0;
	const tierName = evaluation?.tierName ?? "green";

	// Quota tier gate — blocks at critical (tier 3)
	if (evaluation && tier >= 3) {
		return { blocked: true, reason: `quota ${tierName}: ${evaluation.reason}`, tier, tierName };
	}

	if (!Array.isArray(runs)) return { blocked: false, reason: "no data", tier, tierName };

	// Autopilot frequency over 7d
	const autopilotCount = runs.filter((r) => r.context === "autopilot").length;
	if (autopilotCount >= GATE_MAX_AUTOPILOT_7D) {
		return { blocked: true, reason: `${autopilotCount} autopilot runs in 7d (max ${GATE_MAX_AUTOPILOT_7D})`, tier, tierName };
	}

	// Burst: too many AI runs in the last 5h
	const fiveHAgo = now - MS_PER_5H;
	const recentRuns = runs.filter((r) => new Date(r.timestamp).getTime() > fiveHAgo);
	if (recentRuns.length >= GATE_MAX_RUNS_5H) {
		return { blocked: true, reason: `${recentRuns.length} runs in last 5h (max ${GATE_MAX_RUNS_5H})`, tier, tierName };
	}

	return { blocked: false, reason: "ok", tier, tierName };
}

// --- API helper ---

/**
 * Probe subscription utilization via a minimal API call.
 * Reads real 5h/7d utilization from response headers.
 * Returns { five_hour: { utilization }, seven_day: { utilization, resets_at } } or null.
 */
async function fetchUsage() {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	if (!token) return null;
	try {
		const quota = await probeQuota(token);
		if (!quota) return null;
		// Normalize to the shape the rest of track-usage expects
		return {
			five_hour: { utilization: quota.fiveHour },
			seven_day: { utilization: quota.sevenDay, resets_at: quota.sevenDayReset },
		};
	} catch (err) {
		console.error("Quota probe failed:", err.message);
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

	// Evaluate quota tier for tracking
	const quotaEvaluation = usage ? evaluateQuota({
		fiveHour: usage.five_hour?.utilization ?? null,
		sevenDay: usage.seven_day?.utilization ?? null,
		fiveHourReset: null,
		sevenDayReset: usage.seven_day?.resets_at ?? null,
	}) : null;

	const tracking = {
		lastUpdated: now,
		current: usage ? {
			fiveHour: { utilization: usage.five_hour?.utilization ?? null },
			sevenDay: {
				utilization: usage.seven_day?.utilization ?? null,
				resets_at: usage.seven_day?.resets_at ?? null,
			},
			evaluation: quotaEvaluation,
		} : null,
		quotaApiStatus: apiStatus,
		internalTokens,
		...(sessionTokens && { sessionTokens }),
		budget,
		sportsyncShare: share,
		gateConfig: {
			quotaTiers: "graduated (see quota-probe.js TIERS)",
			blocksAtTier: 3,
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

	// Probe real quota and evaluate using the tiered system
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	const quota = await probeQuota(token);
	const evaluation = evaluateQuota(quota);

	const result = shouldGate(runs, evaluation);

	// Write quota status for the autopilot to read at startup
	const statusPath = path.join(dataDir, ".quota-status.json");
	try {
		writeJsonPretty(statusPath, {
			probedAt: new Date().toISOString(),
			quota,
			evaluation,
			gateResult: { blocked: result.blocked, reason: result.reason },
		});
	} catch { /* non-fatal — data dir may not exist yet */ }

	const tierInfo = `tier ${evaluation.tier} (${evaluation.tierName})`;
	console.log(`Gate check: ${result.reason} [${tierInfo}]`);
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
