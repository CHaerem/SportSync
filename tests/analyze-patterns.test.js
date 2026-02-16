import { describe, it, expect, beforeEach } from "vitest";
import {
	analyzeRecurringHealthWarnings,
	analyzeQualityDecline,
	analyzeStagnantLoops,
	analyzeHintFatigue,
	analyzeAutopilotFailures,
	analyzePatterns,
} from "../scripts/analyze-patterns.js";
import fs from "fs";
import path from "path";
import os from "os";

// --- Detector 1: Recurring Health Warnings ---

describe("analyzeRecurringHealthWarnings", () => {
	it("returns empty patterns for null health report", () => {
		const { patterns } = analyzeRecurringHealthWarnings(null);
		expect(patterns).toEqual([]);
	});

	it("returns empty patterns for report with no issues", () => {
		const { patterns } = analyzeRecurringHealthWarnings({ issues: [] });
		expect(patterns).toEqual([]);
	});

	it("accumulates counts from previous history", () => {
		const history = {
			stale_data: { count: 4, firstSeen: "2026-02-12T00:00:00Z", lastSeen: "2026-02-12T12:00:00Z" },
		};
		const report = { issues: [{ severity: "warning", code: "stale_data", message: "data is old" }] };
		const { patterns, issueCodeHistory } = analyzeRecurringHealthWarnings(report, history);

		expect(issueCodeHistory.stale_data.count).toBe(5);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].severity).toBe("medium");
		expect(patterns[0].issueCode).toBe("stale_data");
	});

	it("flags high severity at >= 10 occurrences", () => {
		const history = {
			rss_low: { count: 9, firstSeen: "2026-02-10T00:00:00Z", lastSeen: "2026-02-12T00:00:00Z" },
		};
		const report = { issues: [{ severity: "warning", code: "rss_low", message: "rss low" }] };
		const { patterns } = analyzeRecurringHealthWarnings(report, history);

		expect(patterns).toHaveLength(1);
		expect(patterns[0].severity).toBe("high");
		expect(patterns[0].count).toBe(10);
	});

	it("does not flag below threshold", () => {
		const history = {
			stale_data: { count: 3, firstSeen: "2026-02-12T00:00:00Z", lastSeen: "2026-02-12T12:00:00Z" },
		};
		const report = { issues: [{ severity: "warning", code: "stale_data", message: "data is old" }] };
		const { patterns } = analyzeRecurringHealthWarnings(report, history);
		expect(patterns).toHaveLength(0);
	});

	it("prunes entries older than 7 days", () => {
		const oldDate = new Date(Date.now() - 8 * 86400000).toISOString();
		const history = {
			old_issue: { count: 20, firstSeen: oldDate, lastSeen: oldDate },
		};
		const { patterns, issueCodeHistory } = analyzeRecurringHealthWarnings({ issues: [] }, history);
		expect(patterns).toHaveLength(0);
		expect(issueCodeHistory.old_issue).toBeUndefined();
	});

	it("handles multiple issue codes in one report", () => {
		const report = {
			issues: [
				{ code: "stale_data", severity: "warning", message: "a" },
				{ code: "rss_low", severity: "warning", message: "b" },
			],
		};
		const { issueCodeHistory } = analyzeRecurringHealthWarnings(report, {});
		expect(issueCodeHistory.stale_data.count).toBe(1);
		expect(issueCodeHistory.rss_low.count).toBe(1);
	});

	it("skips issues without a code", () => {
		const report = { issues: [{ severity: "warning", message: "no code" }] };
		const { issueCodeHistory } = analyzeRecurringHealthWarnings(report, {});
		expect(Object.keys(issueCodeHistory)).toHaveLength(0);
	});
});

// --- Detector 2: Quality Decline ---

describe("analyzeQualityDecline", () => {
	it("returns empty for null input", () => {
		expect(analyzeQualityDecline(null)).toEqual([]);
	});

	it("returns empty for too few entries", () => {
		expect(analyzeQualityDecline([{}, {}, {}])).toEqual([]);
	});

	it("detects editorial score decline", () => {
		const history = [
			...Array(6).fill({ editorial: { score: 90, mustWatchCoverage: 1 } }),
			...Array(6).fill({ editorial: { score: 60, mustWatchCoverage: 1 } }),
		];
		const patterns = analyzeQualityDecline(history);
		const editorial = patterns.find((p) => p.metric === "editorialScore");
		expect(editorial).toBeDefined();
		expect(editorial.severity).toBe("high"); // lateScore 60 < 70 floor
		expect(editorial.drop).toBe(30);
	});

	it("detects must-watch coverage decline", () => {
		const history = [
			...Array(6).fill({ editorial: { score: 90, mustWatchCoverage: 0.8 } }),
			...Array(6).fill({ editorial: { score: 90, mustWatchCoverage: 0.1 } }),
		];
		const patterns = analyzeQualityDecline(history);
		const mw = patterns.find((p) => p.metric === "mustWatchCoverage");
		expect(mw).toBeDefined();
		expect(mw.severity).toBe("high"); // lateMW 0.1 < 0.3 floor
	});

	it("does not flag small declines", () => {
		const history = [
			...Array(6).fill({ editorial: { score: 85, mustWatchCoverage: 0.9 } }),
			...Array(6).fill({ editorial: { score: 80, mustWatchCoverage: 0.8 } }),
		];
		expect(analyzeQualityDecline(history)).toEqual([]);
	});

	it("handles entries with missing editorial data", () => {
		const history = Array(8).fill({});
		expect(analyzeQualityDecline(history)).toEqual([]);
	});

	it("uses only last 12 entries from longer history", () => {
		const old = Array(20).fill({ editorial: { score: 95, mustWatchCoverage: 1 } });
		const recent = [
			...Array(6).fill({ editorial: { score: 90, mustWatchCoverage: 1 } }),
			...Array(6).fill({ editorial: { score: 60, mustWatchCoverage: 1 } }),
		];
		const patterns = analyzeQualityDecline([...old, ...recent]);
		const editorial = patterns.find((p) => p.metric === "editorialScore");
		expect(editorial).toBeDefined();
		expect(editorial.drop).toBe(30);
	});

	it("flags medium severity when late score above floor", () => {
		const history = [
			...Array(6).fill({ editorial: { score: 95, mustWatchCoverage: 1 } }),
			...Array(6).fill({ editorial: { score: 75, mustWatchCoverage: 1 } }),
		];
		const patterns = analyzeQualityDecline(history);
		expect(patterns[0].severity).toBe("medium");
	});
});

// --- Detector 3: Stagnant Loops ---

describe("analyzeStagnantLoops", () => {
	it("returns empty for null input", () => {
		expect(analyzeStagnantLoops(null)).toEqual([]);
	});

	it("returns empty for too few entries", () => {
		expect(analyzeStagnantLoops([{}, {}])).toEqual([]);
	});

	it("detects stagnant loop at 6 runs", () => {
		const trend = Array(6).fill({
			loopScores: { scheduleVerification: 0.33, featuredQuality: 1.0 },
		});
		const patterns = analyzeStagnantLoops(trend);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].loopName).toBe("scheduleVerification");
		expect(patterns[0].severity).toBe("medium");
		expect(patterns[0].stagnantRuns).toBe(6);
	});

	it("escalates to high at >= 10 runs", () => {
		const trend = Array(12).fill({
			loopScores: { scheduleVerification: 0.33 },
		});
		const patterns = analyzeStagnantLoops(trend);
		expect(patterns[0].severity).toBe("high");
		expect(patterns[0].stagnantRuns).toBe(12);
	});

	it("ignores closed loops (score 1.0)", () => {
		const trend = Array(10).fill({
			loopScores: { featuredQuality: 1.0, enrichmentQuality: 1.0 },
		});
		expect(analyzeStagnantLoops(trend)).toEqual([]);
	});

	it("ignores loops that recently changed", () => {
		const trend = [
			...Array(5).fill({ loopScores: { myLoop: 0.5 } }),
			{ loopScores: { myLoop: 0.66 } },
			...Array(4).fill({ loopScores: { myLoop: 0.66 } }),
		];
		// Only 5 consecutive at 0.66, not enough
		expect(analyzeStagnantLoops(trend)).toEqual([]);
	});

	it("handles entries without loopScores", () => {
		const trend = Array(8).fill({});
		expect(analyzeStagnantLoops(trend)).toEqual([]);
	});
});

// --- Detector 4: Hint Fatigue ---

describe("analyzeHintFatigue", () => {
	it("returns empty for null input", () => {
		expect(analyzeHintFatigue(null)).toEqual([]);
	});

	it("returns empty for too few entries", () => {
		expect(analyzeHintFatigue([{}, {}])).toEqual([]);
	});

	it("detects must-watch hint fatigue", () => {
		const history = Array(10).fill({
			hintsApplied: ["CORRECTION: Recent outputs missed must-watch events."],
			editorial: { score: 65, mustWatchCoverage: 0 },
		});
		const patterns = analyzeHintFatigue(history);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].type).toBe("hint_fatigue");
		expect(patterns[0].hintKey).toBe("mustWatchCoverage");
		expect(patterns[0].fireCount).toBe(10);
		expect(patterns[0].severity).toBe("high");
	});

	it("flags medium severity at 5-9 firings", () => {
		const history = [
			...Array(5).fill({
				hintsApplied: ["Fix editorial quality"],
				editorial: { score: 70 },
			}),
			...Array(3).fill({ hintsApplied: [], editorial: { score: 70 } }),
		];
		const patterns = analyzeHintFatigue(history);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].severity).toBe("medium");
	});

	it("does not flag hints that improved the metric", () => {
		const history = [
			{ hintsApplied: ["Improve must-watch coverage"], editorial: { mustWatchCoverage: 0 } },
			{ hintsApplied: ["Improve must-watch coverage"], editorial: { mustWatchCoverage: 0.2 } },
			{ hintsApplied: ["Improve must-watch coverage"], editorial: { mustWatchCoverage: 0.4 } },
			{ hintsApplied: ["Improve must-watch coverage"], editorial: { mustWatchCoverage: 0.6 } },
			{ hintsApplied: ["Improve must-watch coverage"], editorial: { mustWatchCoverage: 0.8 } },
		];
		expect(analyzeHintFatigue(history)).toEqual([]);
	});

	it("does not flag below 5 firings", () => {
		const history = Array(6).fill({
			hintsApplied: [],
			editorial: { score: 70 },
		});
		history[0] = { hintsApplied: ["Fix something"], editorial: { score: 70 } };
		history[1] = { hintsApplied: ["Fix something"], editorial: { score: 70 } };
		expect(analyzeHintFatigue(history)).toEqual([]);
	});

	it("detects RESULTS NOTE hint fatigue", () => {
		const history = Array(8).fill({
			hintsApplied: ["RESULTS NOTE: Few recap headlines available — focus on scorelines"],
			results: { score: 70 },
		});
		const patterns = analyzeHintFatigue(history);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].hintKey).toBe("resultsScore");
		expect(patterns[0].fireCount).toBe(8);
	});

	it("detects SANITY hint fatigue", () => {
		const history = Array(7).fill({
			hintsApplied: ["SANITY: Previous brief had content issues: data mismatch"],
			sanity: { findingCount: 5 },
		});
		const patterns = analyzeHintFatigue(history);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].hintKey).toBe("sanityScore");
	});

	it("does not flag RESULTS hint when results score improved", () => {
		const history = [
			{ hintsApplied: ["RESULTS NOTE: stale data"], results: { score: 40 } },
			{ hintsApplied: ["RESULTS NOTE: stale data"], results: { score: 50 } },
			{ hintsApplied: ["RESULTS NOTE: stale data"], results: { score: 60 } },
			{ hintsApplied: ["RESULTS NOTE: stale data"], results: { score: 70 } },
			{ hintsApplied: ["RESULTS NOTE: stale data"], results: { score: 80 } },
		];
		expect(analyzeHintFatigue(history)).toEqual([]);
	});

	it("does not flag SANITY hint when finding count decreased", () => {
		const history = [
			{ hintsApplied: ["SANITY: issues found"], sanity: { findingCount: 10 } },
			{ hintsApplied: ["SANITY: issues found"], sanity: { findingCount: 8 } },
			{ hintsApplied: ["SANITY: issues found"], sanity: { findingCount: 6 } },
			{ hintsApplied: ["SANITY: issues found"], sanity: { findingCount: 4 } },
			{ hintsApplied: ["SANITY: issues found"], sanity: { findingCount: 2 } },
		];
		// Lower findingCount = higher sanityScore, so metric improved
		expect(analyzeHintFatigue(history)).toEqual([]);
	});

	it("maps unknown hints to unknown metric key", () => {
		const history = Array(6).fill({
			hintsApplied: ["Some unmapped hint text that fires a lot"],
			editorial: { score: 80 },
		});
		const patterns = analyzeHintFatigue(history);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].hintKey).toBe("unknown");
	});

	it("handles entries without hintsApplied", () => {
		const history = Array(10).fill({ editorial: { score: 80 } });
		expect(analyzeHintFatigue(history)).toEqual([]);
	});

	it("uses only last 20 entries", () => {
		const old = Array(30).fill({
			hintsApplied: ["Old hint that fired many times"],
			editorial: { score: 80 },
		});
		// Recent entries have no hint firings
		const recent = Array(20).fill({
			hintsApplied: [],
			editorial: { score: 80 },
		});
		expect(analyzeHintFatigue([...old, ...recent])).toEqual([]);
	});
});

// --- Detector 5: Autopilot Failures ---

describe("analyzeAutopilotFailures", () => {
	it("returns empty for null input", () => {
		expect(analyzeAutopilotFailures(null)).toEqual([]);
	});

	it("returns empty for empty runs", () => {
		expect(analyzeAutopilotFailures({ runs: [] })).toEqual([]);
	});

	it("detects failure pattern at 30%+", () => {
		const log = {
			runs: [
				{ outcome: "completed", task: "A" },
				{ outcome: "failed", task: "B" },
				{ outcome: "completed", task: "C" },
				{ outcome: "failed", task: "B" },
				{ outcome: "completed", task: "D" },
				{ outcome: "failed", task: "B" },
				{ outcome: "completed", task: "E" },
			],
		};
		const patterns = analyzeAutopilotFailures(log);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].failureCount).toBe(3);
		expect(patterns[0].repeatedTasks).toContain("B");
	});

	it("does not flag below threshold", () => {
		const log = {
			runs: [
				{ outcome: "completed", task: "A" },
				{ outcome: "completed", task: "B" },
				{ outcome: "failed", task: "C" },
				{ outcome: "completed", task: "D" },
				{ outcome: "completed", task: "E" },
			],
		};
		expect(analyzeAutopilotFailures(log)).toEqual([]);
	});

	it("flags high severity at >= 5 failures", () => {
		const log = {
			runs: Array(10).fill({ outcome: "failed", task: "X" }),
		};
		const patterns = analyzeAutopilotFailures(log);
		expect(patterns[0].severity).toBe("high");
		expect(patterns[0].failureCount).toBe(10);
	});

	it("uses only last 10 runs", () => {
		const log = {
			runs: [
				...Array(20).fill({ outcome: "failed", task: "old" }),
				...Array(10).fill({ outcome: "completed", task: "new" }),
			],
		};
		expect(analyzeAutopilotFailures(log)).toEqual([]);
	});

	it("counts error outcome as failure", () => {
		const log = {
			runs: [
				{ outcome: "error", task: "A" },
				{ outcome: "error", task: "B" },
				{ outcome: "error", task: "C" },
			],
		};
		const patterns = analyzeAutopilotFailures(log);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].failureCount).toBe(3);
	});
});

// --- Orchestrator ---

describe("analyzePatterns", () => {
	let tmpDir;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "patterns-test-"));
	});

	it("produces valid report with empty data dir", () => {
		const report = analyzePatterns({ dataDir: tmpDir });
		expect(report.generatedAt).toBeDefined();
		expect(report.patternsDetected).toBe(0);
		expect(report.patterns).toEqual([]);
		expect(report.issueCodeHistory).toEqual({});
		expect(report.summary).toContain("0 patterns");
	});

	it("detects patterns from real-shaped data", () => {
		// Write quality history with hint fatigue
		const qualityHistory = Array(15).fill({
			timestamp: "2026-02-12T00:00:00Z",
			hintsApplied: ["CORRECTION: must-watch events missing"],
			editorial: { score: 65, mustWatchCoverage: 0 },
		});
		fs.writeFileSync(path.join(tmpDir, "quality-history.json"), JSON.stringify(qualityHistory));

		// Write stagnant autonomy trend
		const trend = Array(12).fill({
			timestamp: "2026-02-12T00:00:00Z",
			loopScores: { scheduleVerification: 0.33, featuredQuality: 1.0 },
		});
		fs.writeFileSync(path.join(tmpDir, "autonomy-trend.json"), JSON.stringify(trend));

		const report = analyzePatterns({ dataDir: tmpDir });
		expect(report.patternsDetected).toBeGreaterThan(0);

		const types = report.patterns.map((p) => p.type);
		expect(types).toContain("stagnant_loop");
		expect(types).toContain("hint_fatigue");
	});

	it("sorts patterns by severity (high first)", () => {
		const qualityHistory = Array(15).fill({
			hintsApplied: ["CORRECTION: must-watch events missing"],
			editorial: { score: 65, mustWatchCoverage: 0 },
		});
		fs.writeFileSync(path.join(tmpDir, "quality-history.json"), JSON.stringify(qualityHistory));

		const trend = Array(12).fill({
			loopScores: { scheduleVerification: 0.33 },
		});
		fs.writeFileSync(path.join(tmpDir, "autonomy-trend.json"), JSON.stringify(trend));

		const report = analyzePatterns({ dataDir: tmpDir });
		const severities = report.patterns.map((p) => p.severity);
		const highIdx = severities.indexOf("high");
		const medIdx = severities.indexOf("medium");
		if (highIdx >= 0 && medIdx >= 0) {
			expect(highIdx).toBeLessThan(medIdx);
		}
	});

	it("carries forward issueCodeHistory from previous report", () => {
		const previousReport = {
			issueCodeHistory: {
				stale_data: { count: 4, firstSeen: "2026-02-12T00:00:00Z", lastSeen: new Date().toISOString() },
			},
		};
		fs.writeFileSync(path.join(tmpDir, "pattern-report.json"), JSON.stringify(previousReport));

		const healthReport = { issues: [{ code: "stale_data", severity: "warning", message: "stale" }] };
		fs.writeFileSync(path.join(tmpDir, "health-report.json"), JSON.stringify(healthReport));

		const report = analyzePatterns({ dataDir: tmpDir });
		expect(report.issueCodeHistory.stale_data.count).toBe(5);
		expect(report.patternsDetected).toBeGreaterThanOrEqual(1);
	});

	it("generates meaningful summary", () => {
		const trend = Array(10).fill({
			loopScores: { myLoop: 0.5 },
		});
		fs.writeFileSync(path.join(tmpDir, "autonomy-trend.json"), JSON.stringify(trend));

		const report = analyzePatterns({ dataDir: tmpDir });
		expect(report.summary).toContain("patterns detected");
		if (report.patternsDetected > 0) {
			expect(report.summary).toContain("Top priority");
		}
	});

	it("handles bootstrapping with no prior pattern-report.json", () => {
		// No files at all — should not throw
		const report = analyzePatterns({ dataDir: tmpDir });
		expect(report.patternsDetected).toBe(0);
		expect(report.issueCodeHistory).toEqual({});
	});
});
