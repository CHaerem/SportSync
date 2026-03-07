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
 *   3. Hint fatigue — hints fire repeatedly without metric improvement
 *   4. Autopilot failures — repeated task failures
 *   5. Cross-loop dependencies — upstream quality drops causing downstream drops
 *
 * Output: docs/data/pattern-report.json
 * Runs every 2h via pipeline-health.js
 */

import path from "path";
import fs from "fs";
import { readJsonIfExists, writeJsonPretty, rootDataPath, iso, MS_PER_DAY } from "./lib/helpers.js";

const HISTORY_MAX_AGE_DAYS = 7;

/**
 * Health warning codes that are already observed and acted upon by existing feedback loops
 * or autonomous infrastructure (quota adaptation, sync-configs pruning, etc.).
 * These codes are still tracked in issueCodeHistory for observability, but they should NOT
 * surface as actionable recurring_health_warning patterns — doing so would pollute the pattern
 * report with noise and mask genuine unmanaged issues.
 *
 * Mirror of KNOWN_DATA_GAPS in autonomy-scorecard.js — keep in sync when adding new codes.
 */
const KNOWN_MANAGED_CODES = new Set([
	"sport_zero_events",        // loop 4: data file exists, 0 events (legitimate data gap)
	"quota_api_unavailable",    // heuristic J: upstream API scope limitation (uncontrollable)
	"stale_data",               // loop 7+8: fetcher returned empty, sync-configs retains cached data
	"chronic_data_retention",   // loop 7: repeated empty fetches, discovery loop re-researches
	"streaming_low_match_rate",         // loop 12: alias mining and trend tracking address this
	"streaming_match_rate_declining",   // loop 12: relevantMatchRate now scopes to covered leagues; rate noise from uncovered leagues is expected
	"streaming_coverage_gap",           // loop 12: streaming verification tracks coverage gaps through match rate trends and alias mining
	"invisible_events",         // loop 7: past events pruned by sync-configs on next cycle
	"low_confidence_config",    // loop 8: verification loop re-verifies, discovery re-researches
	"component_unresolvable",   // loop 3: featured quality gates monitor and adapt prompts
	"stale_output",             // quota adaptation: AI steps skipped when quota is tier 3
	"quota_high_utilization",   // quota adaptation: informational — quota system manages tier transitions
	"ux_eval_fallback",         // infrastructure: Playwright unavailable in CI, file-based fallback is acceptable
	"step_timeout_hit",         // quota adaptation: AI steps hit timeouts when quota-limited
	"missing_snapshot",         // loop 9: snapshot rebuilt every pipeline cycle, transient gap
	"model_change_quality_drop",// loop 1+2: adaptive hints manage quality recovery after model changes; quality loops monitor and self-correct
	"stale_snapshot",           // quota adaptation: post-generate quota-skipped → snapshots not rebuilt; next run repairs
	"snapshot_event_mismatch",  // loop 9: snapshot event counts drift between rebuilds; self-corrects on next post-generate
	"bracket_stale_matches",    // quota adaptation: discover-events quota-skipped → bracket data not refreshed; next run repairs
	"quota_skip_time_critical", // quota adaptation: time-critical steps skipped due to quota; next higher-quota run will run them
	"recipe_persistent_failure",// loop 13: learn-recipes self-repairs broken recipes; quota-skipped when tier is low
	"recipe_repair_exhausted",  // loop 13: recipe self-repair has exhaustion fallback; autopilot investigates via health report
]);

/**
 * Detector 1: Recurring Health Warnings
 * Counts same issue.code across runs. Flags at >= 5 (medium), >= 10 (high).
 * Codes in KNOWN_MANAGED_CODES are still tracked in history for observability,
 * but are not surfaced as actionable patterns since they're handled by feedback loops.
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

	// Decay resolved issues: if lastSeen is more than 3 days ago, halve the count.
	// This lets one-time spikes (e.g. failed_batches_increase) fade naturally
	// once they stop appearing in the health report, without waiting 7 full days.
	const decayCutoff = now - 3 * MS_PER_DAY;
	for (const [code, entry] of Object.entries(history)) {
		if (new Date(entry.lastSeen).getTime() < decayCutoff) {
			entry.count = Math.floor(entry.count / 2);
			if (entry.count < 5) {
				delete history[code];
			}
		}
	}

	// Count current issues (only warning/critical — info-severity issues are expected and
	// should not accumulate as recurring health warnings; they decay naturally via 3-day cutoff)
	const issues = healthReport?.issues || [];
	for (const issue of issues) {
		const code = issue.code;
		if (!code) continue;
		if (issue.severity === "info") continue;
		if (!history[code]) {
			history[code] = { count: 0, firstSeen: iso(), lastSeen: iso() };
		}
		history[code].count++;
		history[code].lastSeen = iso();
	}

	// Flag patterns — skip codes that are already managed by feedback loops or infrastructure.
	// These are expected operational noise; surfacing them as patterns adds no actionable signal.
	for (const [code, entry] of Object.entries(history)) {
		if (KNOWN_MANAGED_CODES.has(code)) continue;
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
 * Detector 3: Hint Fatigue
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
		{ pattern: "results note", metric: "resultsScore", key: "resultsScore" },
		{ pattern: "sanity", metric: "sanityScore", key: "sanityScore" },
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
	if (key === "resultsScore") return entry.results?.score ?? null;
	if (key === "sanityScore") {
		// Lower findingCount is better, so invert: fewer findings = higher score
		const count = entry.sanity?.findingCount;
		return count != null ? Math.max(0, 1 - count / 20) : null;
	}
	return null;
}

/**
 * Detector 4: Autopilot Failures
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
 * Detector 5: Cross-Loop Dependency Detection
 * When featured quality drops, checks if enrichment quality dropped in the
 * same window. Enrichment feeds featured, so upstream drops are the root cause.
 * Also checks results → editorial dependency (results data feeds editorial narrative).
 */
export function analyzeCrossLoopDependencies(qualityHistory) {
	const patterns = [];
	if (!Array.isArray(qualityHistory) || qualityHistory.length < 4) return patterns;

	const recent = qualityHistory.slice(-10);

	// Check consecutive pairs for correlated drops
	const dependencies = [
		{
			upstream: { name: "enrichment", getter: e => e.enrichment?.score },
			downstream: { name: "featured/editorial", getter: e => e.editorial?.score },
			description: "Enrichment quality affects featured editorial quality",
		},
		{
			upstream: { name: "results", getter: e => e.results?.score },
			downstream: { name: "featured/editorial", getter: e => e.editorial?.score },
			description: "Results data quality affects editorial narrative accuracy",
		},
	];

	for (const dep of dependencies) {
		let correlatedDrops = 0;
		let totalDownstreamDrops = 0;

		for (let i = 1; i < recent.length; i++) {
			const prev = recent[i - 1];
			const curr = recent[i];

			const prevDown = dep.downstream.getter(prev);
			const currDown = dep.downstream.getter(curr);
			const prevUp = dep.upstream.getter(prev);
			const currUp = dep.upstream.getter(curr);

			if (prevDown == null || currDown == null) continue;

			const downDrop = prevDown - currDown;
			if (downDrop > 5) {
				totalDownstreamDrops++;
				if (prevUp != null && currUp != null && prevUp - currUp > 5) {
					correlatedDrops++;
				}
			}
		}

		if (correlatedDrops >= 2 || (totalDownstreamDrops >= 3 && correlatedDrops >= 1)) {
			patterns.push({
				type: "cross_loop_dependency",
				severity: correlatedDrops >= 3 ? "high" : "medium",
				upstream: dep.upstream.name,
				downstream: dep.downstream.name,
				correlatedDrops,
				totalDownstreamDrops,
				suggestion: `${dep.description}. ${dep.downstream.name} dropped ${totalDownstreamDrops} times, and ${correlatedDrops} of those correlated with ${dep.upstream.name} drops. Fix ${dep.upstream.name} first — it's the root cause.`,
			});
		}
	}

	return patterns;
}

/**
 * Orchestrator: runs all detectors, sorts by severity.
 */
export function analyzePatterns({ dataDir, projectRoot } = {}) {
	const dir = dataDir || rootDataPath();

	const healthReport = readJsonIfExists(path.join(dir, "health-report.json"));
	const qualityHistory = readJsonIfExists(path.join(dir, "quality-history.json"));
	const autopilotLog = readJsonIfExists(path.join(dir, "autopilot-log.json"));

	// Load previous pattern report for issueCodeHistory
	const previousReport = readJsonIfExists(path.join(dir, "pattern-report.json"));
	const previousHistory = previousReport?.issueCodeHistory || {};

	// Run detectors
	const { patterns: healthPatterns, issueCodeHistory } =
		analyzeRecurringHealthWarnings(healthReport, previousHistory);
	const qualityPatterns = analyzeQualityDecline(qualityHistory);
	const fatiguePatterns = analyzeHintFatigue(qualityHistory);
	const failurePatterns = analyzeAutopilotFailures(autopilotLog);
	const crossLoopPatterns = analyzeCrossLoopDependencies(qualityHistory);

	const allPatterns = [
		...healthPatterns,
		...qualityPatterns,
		...fatiguePatterns,
		...failurePatterns,
		...crossLoopPatterns,
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
