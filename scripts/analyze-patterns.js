#!/usr/bin/env node
/**
 * Pattern Analysis System — Meta-Improvement Loop
 *
 * Analyzes diagnostic data (quality-history, health-report, autonomy-trend,
 * autopilot-log) to detect recurring patterns that the autopilot should act on.
 *
 * Five generic detectors:
 *   1. Recurring health warnings — same issue.code across runs
 *   2. Quality decline — editorial/enrichment score trending down
 *   3. Stagnant loops — autonomy loop stuck below 1.0
 *   4. Hint fatigue — hints fire repeatedly without metric improvement
 *   5. Autopilot failures — repeated task failures
 *
 * Output: docs/data/pattern-report.json
 * Runs every 2h via pipeline-health.js
 */

import path from "path";
import { readJsonIfExists, writeJsonPretty, rootDataPath, iso, MS_PER_DAY } from "./lib/helpers.js";

const HISTORY_MAX_AGE_DAYS = 7;

/**
 * Detector 1: Recurring Health Warnings
 * Counts same issue.code across runs. Flags at >= 5 (medium), >= 10 (high).
 */
export function analyzeRecurringHealthWarnings(healthReport, previousHistory = {}) {
	const patterns = [];
	const history = { ...previousHistory };
	const now = Date.now();
	const cutoff = now - HISTORY_MAX_AGE_DAYS * MS_PER_DAY;

	// Prune entries older than 7 days
	for (const [code, entry] of Object.entries(history)) {
		if (new Date(entry.lastSeen).getTime() < cutoff) {
			delete history[code];
		}
	}

	// Count current issues
	const issues = healthReport?.issues || [];
	for (const issue of issues) {
		const code = issue.code;
		if (!code) continue;
		if (!history[code]) {
			history[code] = { count: 0, firstSeen: iso(), lastSeen: iso() };
		}
		history[code].count++;
		history[code].lastSeen = iso();
	}

	// Flag patterns
	for (const [code, entry] of Object.entries(history)) {
		if (entry.count >= 5) {
			const severity = entry.count >= 10 ? "high" : "medium";
			patterns.push({
				type: "recurring_health_warning",
				severity,
				issueCode: code,
				count: entry.count,
				firstSeen: entry.firstSeen,
				lastSeen: entry.lastSeen,
				suggestion: `Health warning "${code}" has fired ${entry.count} times since ${entry.firstSeen.split("T")[0]}. Investigate and fix the root cause rather than letting it keep firing.`,
			});
		}
	}

	return { patterns, issueCodeHistory: history };
}

/**
 * Detector 2: Quality Decline
 * Splits last 12 entries into two halves, compares averages.
 * Flags editorial score drop > 15 or mustWatchCoverage drop > 0.3.
 */
export function analyzeQualityDecline(qualityHistory) {
	const patterns = [];
	if (!Array.isArray(qualityHistory) || qualityHistory.length < 6) return patterns;

	const recent = qualityHistory.slice(-12);
	const mid = Math.floor(recent.length / 2);
	const firstHalf = recent.slice(0, mid);
	const secondHalf = recent.slice(mid);

	function avg(arr, fn) {
		const vals = arr.map(fn).filter((v) => v != null);
		if (vals.length === 0) return null;
		return vals.reduce((a, b) => a + b, 0) / vals.length;
	}

	// Editorial score
	const earlyScore = avg(firstHalf, (e) => e.editorial?.score);
	const lateScore = avg(secondHalf, (e) => e.editorial?.score);
	if (earlyScore != null && lateScore != null) {
		const drop = earlyScore - lateScore;
		if (drop > 15) {
			const severity = lateScore < 70 ? "high" : "medium";
			patterns.push({
				type: "quality_decline",
				severity,
				metric: "editorialScore",
				earlyAvg: Math.round(earlyScore),
				lateAvg: Math.round(lateScore),
				drop: Math.round(drop),
				suggestion: `Editorial quality score dropped from ${Math.round(earlyScore)} to ${Math.round(lateScore)} (${Math.round(drop)} point decline). Investigate recent prompt or data changes.`,
			});
		}
	}

	// Must-watch coverage
	const earlyMW = avg(firstHalf, (e) => e.editorial?.mustWatchCoverage);
	const lateMW = avg(secondHalf, (e) => e.editorial?.mustWatchCoverage);
	if (earlyMW != null && lateMW != null) {
		const drop = earlyMW - lateMW;
		if (drop > 0.3) {
			const severity = lateMW < 0.3 ? "high" : "medium";
			patterns.push({
				type: "quality_decline",
				severity,
				metric: "mustWatchCoverage",
				earlyAvg: Number(earlyMW.toFixed(2)),
				lateAvg: Number(lateMW.toFixed(2)),
				drop: Number(drop.toFixed(2)),
				suggestion: `Must-watch coverage dropped from ${(earlyMW * 100).toFixed(0)}% to ${(lateMW * 100).toFixed(0)}%. Featured content is missing high-importance events.`,
			});
		}
	}

	return patterns;
}

/**
 * Detector 3: Stagnant Loops
 * Checks if a loop score is unchanged for >= 6 runs while < 1.0.
 * Escalates at >= 10 runs.
 */
export function analyzeStagnantLoops(autonomyTrend) {
	const patterns = [];
	if (!Array.isArray(autonomyTrend) || autonomyTrend.length < 6) return patterns;

	const recent = autonomyTrend.slice(-20);
	// Get all loop names from last entry
	const lastEntry = recent[recent.length - 1];
	if (!lastEntry?.loopScores) return patterns;

	for (const [loopName, currentScore] of Object.entries(lastEntry.loopScores)) {
		if (currentScore >= 1.0) continue; // Closed loops are fine

		// Count consecutive runs with same score from the end
		let consecutiveCount = 0;
		for (let i = recent.length - 1; i >= 0; i--) {
			const score = recent[i].loopScores?.[loopName];
			if (score === currentScore) {
				consecutiveCount++;
			} else {
				break;
			}
		}

		if (consecutiveCount >= 6) {
			const severity = consecutiveCount >= 10 ? "high" : "medium";
			patterns.push({
				type: "stagnant_loop",
				severity,
				loopName,
				score: currentScore,
				stagnantRuns: consecutiveCount,
				suggestion: `Feedback loop "${loopName}" has been stuck at ${currentScore} for ${consecutiveCount} consecutive runs. It needs intervention to progress toward 1.0.`,
			});
		}
	}

	return patterns;
}

/**
 * Detector 4: Hint Fatigue
 * Counts hint firings in last 20 entries. Fatigued if fired >= 5 times
 * without metric improvement. High at >= 10.
 */
export function analyzeHintFatigue(qualityHistory) {
	const patterns = [];
	if (!Array.isArray(qualityHistory) || qualityHistory.length < 5) return patterns;

	const recent = qualityHistory.slice(-20);

	// Collect all unique hints and their fire counts
	const hintCounts = new Map();
	for (const entry of recent) {
		const hints = entry.hintsApplied;
		if (!Array.isArray(hints)) continue;
		for (const hint of hints) {
			hintCounts.set(hint, (hintCounts.get(hint) || 0) + 1);
		}
	}

	// Map hint text to metric via substring match
	const hintMetricMap = [
		{ pattern: "must-watch", metric: "mustWatchCoverage", key: "mustWatchCoverage" },
		{ pattern: "must watch", metric: "mustWatchCoverage", key: "mustWatchCoverage" },
		{ pattern: "importance", metric: "mustWatchCoverage", key: "mustWatchCoverage" },
		{ pattern: "editorial", metric: "editorialScore", key: "editorialScore" },
		{ pattern: "sport diversity", metric: "sportDiversity", key: "sportDiversity" },
		{ pattern: "summary", metric: "summaryCoverage", key: "summaryCoverage" },
	];

	for (const [hintText, fireCount] of hintCounts) {
		if (fireCount < 5) continue;

		// Find which metric this hint targets
		const hintLower = hintText.toLowerCase();
		let metricKey = "unknown";
		let metricName = "unknown";
		for (const { pattern, metric, key } of hintMetricMap) {
			if (hintLower.includes(pattern)) {
				metricKey = key;
				metricName = metric;
				break;
			}
		}

		// Check if the metric improved across the window
		const firstVal = getMetricValue(recent[0], metricKey);
		const lastVal = getMetricValue(recent[recent.length - 1], metricKey);
		const improved = firstVal != null && lastVal != null && lastVal > firstVal;

		if (!improved) {
			const severity = fireCount >= 10 ? "high" : "medium";
			patterns.push({
				type: "hint_fatigue",
				severity,
				hintKey: metricName,
				fireCount,
				hintText: hintText.slice(0, 120),
				suggestion: `Hint "${hintText.slice(0, 80)}..." has fired ${fireCount} times without improving ${metricName}. The hint-based approach isn't working — investigate the underlying code or data issue.`,
			});
		}
	}

	return patterns;
}

function getMetricValue(entry, key) {
	if (!entry) return null;
	if (key === "editorialScore") return entry.editorial?.score ?? null;
	if (key === "mustWatchCoverage") return entry.editorial?.mustWatchCoverage ?? null;
	if (key === "sportDiversity") return entry.editorial?.sportDiversity ?? null;
	if (key === "summaryCoverage") return entry.enrichment?.summaryCoverage ?? null;
	return null;
}

/**
 * Detector 5: Autopilot Failures
 * Counts failures in last 10 runs. Flags at >= 3 (30%+).
 */
export function analyzeAutopilotFailures(autopilotLog) {
	const patterns = [];
	const runs = autopilotLog?.runs;
	if (!Array.isArray(runs) || runs.length === 0) return patterns;

	const recent = runs.slice(-10);
	const failures = recent.filter((r) => r.outcome === "failed" || r.outcome === "error");

	if (failures.length >= 3) {
		// Identify repeated task names
		const taskCounts = {};
		for (const f of failures) {
			const task = f.task || "unknown";
			taskCounts[task] = (taskCounts[task] || 0) + 1;
		}
		const repeatedTasks = Object.entries(taskCounts)
			.filter(([, count]) => count >= 2)
			.map(([task]) => task);

		const severity = failures.length >= 5 ? "high" : "medium";
		patterns.push({
			type: "autopilot_failure_pattern",
			severity,
			failureCount: failures.length,
			totalRuns: recent.length,
			failureRate: Number((failures.length / recent.length).toFixed(2)),
			repeatedTasks,
			suggestion: `${failures.length} of last ${recent.length} autopilot runs failed (${Math.round((failures.length / recent.length) * 100)}%). ${repeatedTasks.length > 0 ? `Repeatedly failing: ${repeatedTasks.join(", ")}. Mark these [BLOCKED] or investigate.` : "Review failure logs for common causes."}`,
		});
	}

	return patterns;
}

/**
 * Orchestrator: runs all 5 detectors, sorts by severity.
 */
export function analyzePatterns({ dataDir } = {}) {
	const dir = dataDir || rootDataPath();

	const healthReport = readJsonIfExists(path.join(dir, "health-report.json"));
	const qualityHistory = readJsonIfExists(path.join(dir, "quality-history.json"));
	const autonomyTrend = readJsonIfExists(path.join(dir, "autonomy-trend.json"));
	const autopilotLog = readJsonIfExists(path.join(dir, "autopilot-log.json"));

	// Load previous pattern report for issueCodeHistory
	const previousReport = readJsonIfExists(path.join(dir, "pattern-report.json"));
	const previousHistory = previousReport?.issueCodeHistory || {};

	// Run detectors
	const { patterns: healthPatterns, issueCodeHistory } =
		analyzeRecurringHealthWarnings(healthReport, previousHistory);
	const qualityPatterns = analyzeQualityDecline(qualityHistory);
	const stagnantPatterns = analyzeStagnantLoops(autonomyTrend);
	const fatiguePatterns = analyzeHintFatigue(qualityHistory);
	const failurePatterns = analyzeAutopilotFailures(autopilotLog);

	const allPatterns = [
		...healthPatterns,
		...qualityPatterns,
		...stagnantPatterns,
		...fatiguePatterns,
		...failurePatterns,
	];

	// Sort: high first, then medium
	const severityOrder = { high: 0, medium: 1, low: 2 };
	allPatterns.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

	const highCount = allPatterns.filter((p) => p.severity === "high").length;
	const mediumCount = allPatterns.filter((p) => p.severity === "medium").length;

	let summary = `${allPatterns.length} patterns detected`;
	if (allPatterns.length > 0) {
		const parts = [];
		if (highCount > 0) parts.push(`${highCount} high`);
		if (mediumCount > 0) parts.push(`${mediumCount} medium`);
		summary += ` (${parts.join(", ")})`;
		if (allPatterns[0]) {
			summary += `. Top priority: ${allPatterns[0].type} — ${allPatterns[0].suggestion.split(".")[0]}.`;
		}
	}

	return {
		generatedAt: iso(),
		patternsDetected: allPatterns.length,
		patterns: allPatterns,
		issueCodeHistory,
		summary,
	};
}

// CLI entry point
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
	const report = analyzePatterns();
	const outPath = path.join(rootDataPath(), "pattern-report.json");
	writeJsonPretty(outPath, report);
	console.log(`Pattern Analysis: ${report.patternsDetected} patterns detected`);
	for (const p of report.patterns) {
		const icon = p.severity === "high" ? "[HIGH]" : "[MED] ";
		console.log(`  ${icon} ${p.type}: ${p.suggestion.split(".")[0]}.`);
	}
	if (report.patternsDetected === 0) {
		console.log("  No recurring patterns detected. System is healthy.");
	}
}
