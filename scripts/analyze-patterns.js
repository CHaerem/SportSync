#!/usr/bin/env node
/**
 * Pattern Analysis System — Meta-Improvement Loop
 *
 * Analyzes diagnostic data (quality-history, health-report, autonomy-trend,
 * autopilot-log) to detect recurring patterns that the autopilot should act on.
 *
 * Seven generic detectors:
 *   1. Recurring health warnings — same issue.code across runs
 *   2. Quality decline — editorial/enrichment score trending down
 *   3. Stagnant loops — autonomy loop stuck below 1.0
 *   4. Hint fatigue — hints fire repeatedly without metric improvement
 *   5. Autopilot failures — repeated task failures
 *   6. Intervention effectiveness — hint fire vs metric improvement correlation
 *   7. Cross-loop dependencies — upstream quality drops causing downstream drops
 *
 * Output: docs/data/pattern-report.json
 * Runs every 2h via pipeline-health.js
 */

import path from "path";
import fs from "fs";
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
 * Detector 6: Intervention Effectiveness
 * Compares consecutive quality-history entries. When a hint fires in entry N,
 * checks if the targeted metric improved in entry N+1. Tracks per-hint-type
 * effectiveness rates so the autopilot can replace ineffective hints.
 */
export function analyzeInterventionEffectiveness(qualityHistory) {
	if (!Array.isArray(qualityHistory) || qualityHistory.length < 2) return {};

	const hintMetricMap = [
		{ pattern: "must-watch", key: "mustWatchCoverage" },
		{ pattern: "must watch", key: "mustWatchCoverage" },
		{ pattern: "importance", key: "mustWatchCoverage" },
		{ pattern: "editorial", key: "editorialScore" },
		{ pattern: "sport diversity", key: "sportDiversity" },
		{ pattern: "summary", key: "summaryCoverage" },
		{ pattern: "results note", key: "resultsScore" },
		{ pattern: "sanity", key: "sanityScore" },
	];

	function resolveHintKey(hintText) {
		const lower = hintText.toLowerCase();
		for (const { pattern, key } of hintMetricMap) {
			if (lower.includes(pattern)) return key;
		}
		return "unknown";
	}

	const recent = qualityHistory.slice(-20);
	const effectiveness = {};

	for (let i = 0; i < recent.length - 1; i++) {
		const entry = recent[i];
		const next = recent[i + 1];
		const hints = entry.hintsApplied;
		if (!Array.isArray(hints) || hints.length === 0) continue;

		// Track each unique hint type in this entry
		const seenKeys = new Set();
		for (const hint of hints) {
			const metricKey = resolveHintKey(hint);
			if (seenKeys.has(metricKey)) continue;
			seenKeys.add(metricKey);

			if (!effectiveness[metricKey]) {
				effectiveness[metricKey] = { fires: 0, improved: 0, unchanged: 0, worsened: 0 };
			}

			effectiveness[metricKey].fires++;

			const before = getMetricValue(entry, metricKey);
			const after = getMetricValue(next, metricKey);

			if (before == null || after == null) {
				effectiveness[metricKey].unchanged++;
			} else if (after > before) {
				effectiveness[metricKey].improved++;
			} else if (after < before) {
				effectiveness[metricKey].worsened++;
			} else {
				effectiveness[metricKey].unchanged++;
			}
		}
	}

	// Compute rates
	for (const data of Object.values(effectiveness)) {
		data.effectivenessRate = data.fires > 0
			? Number((data.improved / data.fires).toFixed(2))
			: 0;
	}

	return effectiveness;
}

/**
 * Detector 7: Cross-Loop Dependency Detection
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
 * Detector 8: Architectural Fitness
 * Evaluates codebase module structure: proliferation, fragmentation,
 * pipeline complexity, test coverage ratio, and orphan scripts.
 * Suggests specific consolidation targets. Tracks baseline for self-adjusting thresholds.
 */
export function detectArchitecturalFitness({ projectRoot, pipelineManifest, baseline } = {}) {
	const patterns = [];
	const root = projectRoot || path.resolve(process.cwd());
	const scriptsDir = path.join(root, "scripts");
	const libDir = path.join(scriptsDir, "lib");
	const fetchDir = path.join(scriptsDir, "fetch");
	const testsDir = path.join(root, "tests");

	// --- Count modules ---
	const countJsFiles = (dir) => {
		try {
			return fs.readdirSync(dir).filter(f => f.endsWith(".js")).length;
		} catch { return 0; }
	};

	const scriptCount = countJsFiles(scriptsDir);
	const libCount = countJsFiles(libDir);
	const fetchCount = countJsFiles(fetchDir);
	const moduleCount = scriptCount + libCount + fetchCount;

	// --- Module sizes ---
	const getModuleSizes = (dir) => {
		try {
			return fs.readdirSync(dir)
				.filter(f => f.endsWith(".js"))
				.map(f => {
					try {
						const content = fs.readFileSync(path.join(dir, f), "utf8");
						return { file: f, lines: content.split("\n").length };
					} catch { return null; }
				})
				.filter(Boolean);
		} catch { return []; }
	};

	const allModules = [
		...getModuleSizes(scriptsDir).map(m => ({ ...m, dir: "scripts" })),
		...getModuleSizes(libDir).map(m => ({ ...m, dir: "lib" })),
		...getModuleSizes(fetchDir).map(m => ({ ...m, dir: "fetch" })),
	];

	const avgModuleSize = allModules.length > 0
		? Math.round(allModules.reduce((sum, m) => sum + m.lines, 0) / allModules.length)
		: 0;

	// --- Small module ratio ---
	const smallModules = allModules.filter(m => m.lines < 30);
	const smallModuleRatio = allModules.length > 0
		? Number((smallModules.length / allModules.length).toFixed(2))
		: 0;

	// --- Pipeline step count ---
	const manifest = pipelineManifest || readJsonIfExists(path.join(scriptsDir, "pipeline-manifest.json"));
	const pipelineSteps = (manifest?.phases || []).reduce(
		(sum, phase) => sum + (phase.steps?.length || 0), 0
	);

	// --- Test coverage ratio ---
	const testCount = countJsFiles(testsDir);
	const sourceCount = moduleCount;
	const testCoverageRatio = sourceCount > 0
		? Number((testCount / sourceCount).toFixed(2))
		: 0;

	// --- Orphan detection ---
	// Collect all script references from pipeline-manifest and package.json
	const referencedScripts = new Set();
	const manifestStr = JSON.stringify(manifest || {});
	const pkgPath = path.join(root, "package.json");
	const pkgStr = (() => { try { return fs.readFileSync(pkgPath, "utf8"); } catch { return ""; } })();

	// Extract script filenames from commands
	const commandPattern = /scripts\/(?:[\w-]+\/)?[\w-]+\.js/g;
	for (const match of manifestStr.matchAll(commandPattern)) {
		referencedScripts.add(path.basename(match[0]));
	}
	for (const match of pkgStr.matchAll(commandPattern)) {
		referencedScripts.add(path.basename(match[0]));
	}
	// npm run commands resolve to package.json scripts — mark those targets as referenced
	const npmRunPattern = /npm run (\S+)/g;
	const pkgJson = readJsonIfExists(pkgPath);
	for (const match of (manifestStr + pkgStr).matchAll(npmRunPattern)) {
		const scriptCmd = pkgJson?.scripts?.[match[1]] || "";
		for (const m of scriptCmd.matchAll(commandPattern)) {
			referencedScripts.add(path.basename(m[0]));
		}
	}

	// Also scan all scripts for import references to find internal consumers
	const importCounts = new Map(); // file → count of internal imports
	for (const m of allModules) {
		const fullPath = path.join(root, "scripts", m.dir === "scripts" ? "" : m.dir, m.file);
		try {
			const content = fs.readFileSync(fullPath, "utf8");
			const importMatches = content.matchAll(/from\s+["']\..*?["']/g);
			let internalImports = 0;
			for (const im of importMatches) {
				internalImports++;
				// Mark imported file as referenced
				const importedFile = im[0].match(/\/([\w-]+)\.js/)?.[1];
				if (importedFile) referencedScripts.add(importedFile + ".js");
			}
			importCounts.set(m.file, internalImports);
		} catch { /* ignore */ }
	}

	// lib and fetch modules are referenced via imports, not pipeline — only check top-level scripts
	const topLevelScripts = allModules.filter(m => m.dir === "scripts");
	const orphans = topLevelScripts
		.filter(m => !referencedScripts.has(m.file))
		.map(m => m.file);

	// --- Apply thresholds (with overrides from baseline) ---
	const overrides = baseline?.thresholdOverrides || {};
	const thresholds = {
		moduleCountWarn: overrides.moduleCountWarn ?? 50,
		moduleCountHigh: overrides.moduleCountHigh ?? 65,
		smallModuleRatioWarn: overrides.smallModuleRatioWarn ?? 0.25,
		pipelineStepsWarn: overrides.pipelineStepsWarn ?? 20,
		pipelineStepsHigh: overrides.pipelineStepsHigh ?? 25,
		testCoverageWarn: overrides.testCoverageWarn ?? 0.5,
		orphanScriptsWarn: overrides.orphanScriptsWarn ?? 3,
	};

	// Module proliferation
	if (moduleCount > thresholds.moduleCountWarn) {
		const severity = moduleCount > thresholds.moduleCountHigh ? "high" : "medium";
		// Suggest consolidation: find modules with fewest lines that are imported by exactly 1 consumer
		const inlineCandidates = allModules
			.filter(m => m.dir === "lib" && m.lines < 60)
			.slice(0, 3)
			.map(m => m.file);
		patterns.push({
			type: "architecture_module_proliferation",
			severity,
			moduleCount,
			threshold: thresholds.moduleCountWarn,
			breakdown: { scripts: scriptCount, lib: libCount, fetch: fetchCount },
			inlineCandidates,
			suggestion: `${moduleCount} modules exceed threshold of ${thresholds.moduleCountWarn}. ${inlineCandidates.length > 0 ? `Consider inlining small lib modules: ${inlineCandidates.join(", ")}.` : "Review scripts/ for consolidation opportunities."}`,
		});
	}

	// Small module ratio
	if (smallModuleRatio > thresholds.smallModuleRatioWarn) {
		patterns.push({
			type: "architecture_small_module_ratio",
			severity: "medium",
			ratio: smallModuleRatio,
			threshold: thresholds.smallModuleRatioWarn,
			smallModules: smallModules.map(m => `${m.dir}/${m.file} (${m.lines}L)`).slice(0, 5),
			suggestion: `${Math.round(smallModuleRatio * 100)}% of modules are under 30 lines (threshold: ${Math.round(thresholds.smallModuleRatioWarn * 100)}%). Consider inlining into consumers.`,
		});
	}

	// Pipeline steps
	if (pipelineSteps > thresholds.pipelineStepsWarn) {
		const severity = pipelineSteps > thresholds.pipelineStepsHigh ? "high" : "medium";
		patterns.push({
			type: "architecture_pipeline_bloat",
			severity,
			pipelineSteps,
			threshold: thresholds.pipelineStepsWarn,
			suggestion: `Pipeline has ${pipelineSteps} steps (threshold: ${thresholds.pipelineStepsWarn}). Consider combining steps that always run together.`,
		});
	}

	// Test coverage (skip when no source modules — nothing to test)
	if (sourceCount > 0 && testCoverageRatio < thresholds.testCoverageWarn) {
		patterns.push({
			type: "architecture_low_test_coverage",
			severity: "medium",
			testCount,
			sourceCount,
			ratio: testCoverageRatio,
			threshold: thresholds.testCoverageWarn,
			suggestion: `Test coverage ratio is ${testCoverageRatio} (${testCount} test files for ${sourceCount} source modules, threshold: ${thresholds.testCoverageWarn}). Add tests for untested modules.`,
		});
	}

	// Orphan scripts
	if (orphans.length > thresholds.orphanScriptsWarn) {
		patterns.push({
			type: "architecture_orphan_scripts",
			severity: "medium",
			orphanCount: orphans.length,
			threshold: thresholds.orphanScriptsWarn,
			orphans: orphans.slice(0, 8),
			suggestion: `${orphans.length} scripts not referenced from pipeline-manifest or package.json: ${orphans.slice(0, 5).join(", ")}. Verify they are needed or remove them.`,
		});
	}

	// --- Compute baseline delta ---
	const currentMetrics = { moduleCount, avgModuleSize, pipelineSteps, testCoverageRatio, smallModuleRatio };
	let baselineDelta = null;
	if (baseline?.moduleCount != null) {
		baselineDelta = {
			moduleCount: moduleCount - baseline.moduleCount,
			avgModuleSize: avgModuleSize - (baseline.avgModuleSize || 0),
			pipelineSteps: pipelineSteps - (baseline.pipelineSteps || 0),
		};
	}

	const newBaseline = {
		recordedAt: iso(),
		moduleCount,
		avgModuleSize,
		pipelineSteps,
		testCoverageRatio,
		smallModuleRatio,
		thresholdOverrides: baseline?.thresholdOverrides || {},
	};

	return { patterns, metrics: currentMetrics, baseline: newBaseline, baselineDelta };
}

/**
 * Orchestrator: runs all detectors, sorts by severity.
 */
export function analyzePatterns({ dataDir, projectRoot } = {}) {
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
	const interventionEffectiveness = analyzeInterventionEffectiveness(qualityHistory);
	const crossLoopPatterns = analyzeCrossLoopDependencies(qualityHistory);
	const archResult = detectArchitecturalFitness({
		projectRoot,
		baseline: previousReport?.architectureBaseline,
	});

	const allPatterns = [
		...healthPatterns,
		...qualityPatterns,
		...stagnantPatterns,
		...fatiguePatterns,
		...failurePatterns,
		...crossLoopPatterns,
		...archResult.patterns,
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
		interventionEffectiveness,
		architectureBaseline: archResult.baseline,
		architectureDelta: archResult.baselineDelta,
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
