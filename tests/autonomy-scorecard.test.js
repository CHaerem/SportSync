import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
	evaluateFeaturedQuality,
	evaluateEnrichmentQuality,
	evaluateCoverageGaps,
	evaluatePipelineHealth,
	evaluateWatchPlan,
	evaluateCodeHealth,
	evaluateEventDiscovery,
	evaluateScheduleVerification,
	evaluateAutonomy,
} from "../scripts/autonomy-scorecard.js";

let tmpDir;
let dataDir;
let scriptsDir;
let rootDir;

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "autonomy-test-"));
	rootDir = tmpDir;
	dataDir = path.join(tmpDir, "docs", "data");
	scriptsDir = path.join(tmpDir, "scripts");
	fs.mkdirSync(dataDir, { recursive: true });
	fs.mkdirSync(path.join(scriptsDir, "config"), { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- Loop 1: Featured Quality ---

describe("evaluateFeaturedQuality()", () => {
	it("scores 0 when quality-history.json is missing", () => {
		const result = evaluateFeaturedQuality(dataDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
		expect(result.details).toContain("No quality history");
	});

	it("scores 0 when history has fewer than 3 entries", () => {
		writeJson(path.join(dataDir, "quality-history.json"), [
			{ timestamp: "2026-01-01T00:00:00Z", hintsApplied: [] },
			{ timestamp: "2026-01-02T00:00:00Z", hintsApplied: [] },
		]);
		const result = evaluateFeaturedQuality(dataDir);
		expect(result.score).toBe(0);
		expect(result.details).toContain("2 history entries");
	});

	it("scores 1.0 when hints pipeline is wired (hintsApplied field exists) even if never fired", () => {
		writeJson(path.join(dataDir, "quality-history.json"), [
			{ timestamp: "2026-01-01T00:00:00Z", hintsApplied: [] },
			{ timestamp: "2026-01-02T00:00:00Z", hintsApplied: [] },
			{ timestamp: "2026-01-03T00:00:00Z", hintsApplied: [] },
		]);
		const result = evaluateFeaturedQuality(dataDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("wired and ready");
	});

	it("scores 1.0 when hints have fired at least once", () => {
		writeJson(path.join(dataDir, "quality-history.json"), [
			{ timestamp: "2026-01-01T00:00:00Z", hintsApplied: ["boost_diversity"] },
			{ timestamp: "2026-01-02T00:00:00Z", hintsApplied: [] },
			{ timestamp: "2026-01-03T00:00:00Z", hintsApplied: ["boost_diversity"] },
		]);
		const result = evaluateFeaturedQuality(dataDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("hints fired 2 times");
	});

	it("scores 0.5 when history >= 3 but hintsApplied field not present (old format)", () => {
		writeJson(path.join(dataDir, "quality-history.json"), [
			{ timestamp: "2026-01-01T00:00:00Z" },
			{ timestamp: "2026-01-02T00:00:00Z" },
			{ timestamp: "2026-01-03T00:00:00Z" },
		]);
		const result = evaluateFeaturedQuality(dataDir);
		expect(result.score).toBe(0.5);
		expect(result.status).toBe("partial");
	});
});

// --- Loop 2: Enrichment Quality ---

describe("evaluateEnrichmentQuality()", () => {
	it("scores 0 when ai-quality.json is missing", () => {
		const result = evaluateEnrichmentQuality(dataDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 0 when enrichment section is missing", () => {
		writeJson(path.join(dataDir, "ai-quality.json"), { featured: { score: 100 } });
		const result = evaluateEnrichmentQuality(dataDir);
		expect(result.score).toBe(0);
	});

	it("scores 0.5 when enrichment exists but has no hintsApplied field", () => {
		writeJson(path.join(dataDir, "ai-quality.json"), {
			enrichment: { score: 90, totalEvents: 30 },
		});
		const result = evaluateEnrichmentQuality(dataDir);
		expect(result.score).toBe(0.5);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("hints not yet tracked");
	});

	it("scores 1.0 when hintsApplied field exists", () => {
		writeJson(path.join(dataDir, "ai-quality.json"), {
			enrichment: { score: 90, hintsApplied: ["fix_coverage"] },
		});
		const result = evaluateEnrichmentQuality(dataDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
	});

	it("scores 1.0 when hintsApplied is empty array (field exists)", () => {
		writeJson(path.join(dataDir, "ai-quality.json"), {
			enrichment: { score: 90, hintsApplied: [] },
		});
		const result = evaluateEnrichmentQuality(dataDir);
		expect(result.score).toBe(1.0);
	});
});

// --- Loop 3: Coverage Gaps ---

describe("evaluateCoverageGaps()", () => {
	it("scores 0 when all data is missing", () => {
		const result = evaluateCoverageGaps(dataDir, scriptsDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 0.33 when only fresh gap data exists", () => {
		writeJson(path.join(dataDir, "coverage-gaps.json"), {
			generatedAt: new Date().toISOString(),
			gaps: [],
		});
		const result = evaluateCoverageGaps(dataDir, scriptsDir);
		expect(result.score).toBe(0.33);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("Gap detection works");
	});

	it("scores 1.0 when gap data + resolver exist and zero gaps detected", () => {
		writeJson(path.join(dataDir, "coverage-gaps.json"), {
			generatedAt: new Date().toISOString(),
			gaps: [],
		});
		fs.writeFileSync(path.join(scriptsDir, "resolve-coverage-gaps.js"), "// resolver");
		const result = evaluateCoverageGaps(dataDir, scriptsDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("no gaps to resolve");
	});

	it("scores 1.0 when gap data, resolver, and auto-configs all exist", () => {
		writeJson(path.join(dataDir, "coverage-gaps.json"), {
			generatedAt: new Date().toISOString(),
			gaps: [],
		});
		fs.writeFileSync(path.join(scriptsDir, "resolve-coverage-gaps.js"), "// resolver");
		writeJson(path.join(scriptsDir, "config", "auto-event.json"), {
			name: "Auto Event",
			autoGenerated: true,
		});
		const result = evaluateCoverageGaps(dataDir, scriptsDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("auto-generated configs exist");
	});

	it("scores 0.66 when gap data + resolver exist but unresolved gaps remain", () => {
		writeJson(path.join(dataDir, "coverage-gaps.json"), {
			generatedAt: new Date().toISOString(),
			gaps: [{ headline: "Unresolved gap", confidence: "high" }],
			summary: { totalGapsDetected: 1 },
		});
		fs.writeFileSync(path.join(scriptsDir, "resolve-coverage-gaps.js"), "// resolver");
		const result = evaluateCoverageGaps(dataDir, scriptsDir);
		expect(result.score).toBe(0.66);
		expect(result.details).toContain("1 unresolved gaps");
	});
});

// --- Loop 4: Pipeline Health ---

describe("evaluatePipelineHealth()", () => {
	it("scores 0 when health-report.json is missing", () => {
		const result = evaluatePipelineHealth(dataDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 1.0 when health report is fresh (< 6h)", () => {
		writeJson(path.join(dataDir, "health-report.json"), {
			generatedAt: new Date().toISOString(),
			status: "ok",
		});
		const result = evaluatePipelineHealth(dataDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("fresh");
	});

	it("scores 0.5 when health report exists but is stale (> 6h)", () => {
		const reportPath = path.join(dataDir, "health-report.json");
		writeJson(reportPath, { generatedAt: "2026-01-01T00:00:00Z", status: "ok" });
		// Set mtime to 7 hours ago
		const sevenHoursAgo = new Date(Date.now() - 7 * 3600 * 1000);
		fs.utimesSync(reportPath, sevenHoursAgo, sevenHoursAgo);
		const result = evaluatePipelineHealth(dataDir);
		expect(result.score).toBe(0.5);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("stale");
	});
});

// --- Loop 5: Watch Plan ---

describe("evaluateWatchPlan()", () => {
	it("scores 0 when watch-plan.json is missing", () => {
		const result = evaluateWatchPlan(dataDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 0 when picks array is empty", () => {
		writeJson(path.join(dataDir, "watch-plan.json"), { picks: [] });
		const result = evaluateWatchPlan(dataDir);
		expect(result.score).toBe(0);
	});

	it("scores 1.0 when picks have reasons even without streaming", () => {
		writeJson(path.join(dataDir, "watch-plan.json"), {
			picks: [
				{ title: "Match", reasons: ["Favorite team"], streaming: [] },
			],
		});
		const result = evaluateWatchPlan(dataDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("1 picks with reasons");
	});

	it("scores 0.5 when picks exist but lack reasons", () => {
		writeJson(path.join(dataDir, "watch-plan.json"), {
			picks: [
				{ title: "Match", reasons: [], streaming: [{ platform: "NRK" }] },
			],
		});
		const result = evaluateWatchPlan(dataDir);
		expect(result.score).toBe(0.5);
		expect(result.details).toContain("reasons");
	});

	it("scores 1.0 when picks have both reasons and streaming", () => {
		writeJson(path.join(dataDir, "watch-plan.json"), {
			picks: [
				{ title: "Match A", reasons: ["Norwegian interest"], streaming: [{ platform: "NRK" }] },
				{ title: "Match B", reasons: ["Favorite team"], streaming: [{ platform: "Viaplay" }] },
				{ title: "Match C", reasons: ["Starting soon"], streaming: [{ platform: "Eurosport" }] },
			],
		});
		const result = evaluateWatchPlan(dataDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("3 picks");
	});
});

// --- Loop 6: Code Health ---

describe("evaluateCodeHealth()", () => {
	it("scores 0 when roadmap is missing", () => {
		const result = evaluateCodeHealth(rootDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 0.5 when roadmap exists but no completed tasks in log", () => {
		fs.writeFileSync(path.join(rootDir, "AUTOPILOT_ROADMAP.md"), "# Roadmap\n");
		const result = evaluateCodeHealth(rootDir);
		expect(result.score).toBe(0.5);
		expect(result.status).toBe("partial");
	});

	it("scores 0.5 when roadmap and log exist but no completed runs", () => {
		fs.writeFileSync(path.join(rootDir, "AUTOPILOT_ROADMAP.md"), "# Roadmap\n");
		writeJson(path.join(rootDir, "docs", "data", "autopilot-log.json"), {
			runs: [{ outcome: "skipped", task: "Something" }],
		});
		const result = evaluateCodeHealth(rootDir);
		expect(result.score).toBe(0.5);
	});

	it("scores 1.0 when roadmap exists and log has completed tasks", () => {
		fs.writeFileSync(path.join(rootDir, "AUTOPILOT_ROADMAP.md"), "# Roadmap\n");
		writeJson(path.join(rootDir, "docs", "data", "autopilot-log.json"), {
			runs: [
				{ outcome: "completed", task: "Task A", pr: 1 },
				{ outcome: "completed", task: "Task B", pr: 2 },
			],
		});
		const result = evaluateCodeHealth(rootDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("2 completed tasks");
	});
});

// --- Loop 7: Event Discovery ---

describe("evaluateEventDiscovery()", () => {
	it("scores 0 when all data is missing", () => {
		const result = evaluateEventDiscovery(dataDir, scriptsDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 0.33 when only discovery log exists", () => {
		writeJson(path.join(dataDir, "discovery-log.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", tasks: [] }],
		});
		const result = evaluateEventDiscovery(dataDir, scriptsDir);
		expect(result.score).toBe(0.33);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("discovery log exists");
	});

	it("scores 0.66 when discovery log + sync-configs exist", () => {
		writeJson(path.join(dataDir, "discovery-log.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", tasks: [] }],
		});
		fs.writeFileSync(path.join(scriptsDir, "sync-configs.js"), "// sync");
		const result = evaluateEventDiscovery(dataDir, scriptsDir);
		expect(result.score).toBe(0.66);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("sync-configs exists");
	});

	it("scores 1.0 when log + sync + researched configs all exist", () => {
		writeJson(path.join(dataDir, "discovery-log.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", tasks: [] }],
		});
		fs.writeFileSync(path.join(scriptsDir, "sync-configs.js"), "// sync");
		writeJson(path.join(scriptsDir, "config", "event.json"), {
			name: "Event",
			lastResearched: "2026-02-12T00:00:00Z",
		});
		const result = evaluateEventDiscovery(dataDir, scriptsDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("configs have been researched");
	});
});

// --- Loop 8: Schedule Verification ---

describe("evaluateScheduleVerification()", () => {
	it("scores 0 when all data is missing", () => {
		const result = evaluateScheduleVerification(dataDir, scriptsDir);
		expect(result.score).toBe(0);
		expect(result.status).toBe("open");
	});

	it("scores 0.33 when only fresh verification history exists", () => {
		writeJson(path.join(dataDir, "verification-history.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", results: [] }],
		});
		const result = evaluateScheduleVerification(dataDir, scriptsDir);
		expect(result.score).toBe(0.33);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("verification history exists");
	});

	it("scores 0.66 when history + verifier module exist", () => {
		writeJson(path.join(dataDir, "verification-history.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", results: [] }],
		});
		fs.mkdirSync(path.join(scriptsDir, "lib"), { recursive: true });
		fs.writeFileSync(path.join(scriptsDir, "lib", "schedule-verifier.js"), "// verifier");
		const result = evaluateScheduleVerification(dataDir, scriptsDir);
		expect(result.score).toBe(0.66);
		expect(result.status).toBe("partial");
		expect(result.details).toContain("schedule-verifier exists");
	});

	it("scores 1.0 when history + verifier + verified configs all exist", () => {
		writeJson(path.join(dataDir, "verification-history.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", results: [] }],
		});
		fs.mkdirSync(path.join(scriptsDir, "lib"), { recursive: true });
		fs.writeFileSync(path.join(scriptsDir, "lib", "schedule-verifier.js"), "// verifier");
		writeJson(path.join(scriptsDir, "config", "verified-event.json"), {
			name: "Verified Event",
			verificationSummary: { lastRun: "2026-02-12T00:00:00Z", verified: 5 },
		});
		const result = evaluateScheduleVerification(dataDir, scriptsDir);
		expect(result.score).toBe(1.0);
		expect(result.status).toBe("closed");
		expect(result.details).toContain("verification summaries");
	});

	it("does not count stale history as fresh", () => {
		const historyPath = path.join(dataDir, "verification-history.json");
		writeJson(historyPath, {
			runs: [{ timestamp: "2026-01-01T00:00:00Z", results: [] }],
		});
		// Set mtime to 2 days ago
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
		fs.utimesSync(historyPath, twoDaysAgo, twoDaysAgo);
		const result = evaluateScheduleVerification(dataDir, scriptsDir);
		expect(result.score).toBe(0);
		expect(result.details).toContain("stale");
	});
});

// --- Overall evaluation ---

describe("evaluateAutonomy()", () => {
	it("calculates overall score as average of all loop scores", () => {
		// Set up all loops as closed
		writeJson(path.join(dataDir, "quality-history.json"), [
			{ timestamp: "2026-01-01T00:00:00Z", hintsApplied: ["hint1"] },
			{ timestamp: "2026-01-02T00:00:00Z", hintsApplied: [] },
			{ timestamp: "2026-01-03T00:00:00Z", hintsApplied: [] },
		]);
		writeJson(path.join(dataDir, "ai-quality.json"), {
			enrichment: { score: 90, hintsApplied: [] },
		});
		writeJson(path.join(dataDir, "coverage-gaps.json"), { gaps: [] });
		fs.writeFileSync(path.join(scriptsDir, "resolve-coverage-gaps.js"), "// resolver");
		writeJson(path.join(scriptsDir, "config", "auto.json"), { autoGenerated: true });
		writeJson(path.join(dataDir, "health-report.json"), { status: "ok" });
		writeJson(path.join(dataDir, "watch-plan.json"), {
			picks: [{ title: "M", reasons: ["R"], streaming: [{ platform: "NRK" }] }],
		});
		fs.writeFileSync(path.join(rootDir, "AUTOPILOT_ROADMAP.md"), "# Roadmap\n");
		writeJson(path.join(rootDir, "docs", "data", "autopilot-log.json"), {
			runs: [{ outcome: "completed", task: "T", pr: 1 }],
		});
		// Loop 7: Event Discovery
		writeJson(path.join(dataDir, "discovery-log.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", tasks: [] }],
		});
		fs.writeFileSync(path.join(scriptsDir, "sync-configs.js"), "// sync");
		writeJson(path.join(scriptsDir, "config", "researched.json"), {
			name: "Researched",
			lastResearched: "2026-02-12T00:00:00Z",
		});
		// Loop 8: Schedule Verification
		writeJson(path.join(dataDir, "verification-history.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", results: [] }],
		});
		fs.mkdirSync(path.join(scriptsDir, "lib"), { recursive: true });
		fs.writeFileSync(path.join(scriptsDir, "lib", "schedule-verifier.js"), "// verifier");
		writeJson(path.join(scriptsDir, "config", "verified.json"), {
			name: "Verified",
			verificationSummary: { lastRun: "2026-02-12T00:00:00Z", verified: 5 },
		});

		const report = evaluateAutonomy({ dataDir, scriptsDir, rootDir });
		expect(report.overallScore).toBe(1.0);
		expect(report.loopsClosed).toBe(8);
		expect(report.loopsTotal).toBe(8);
		expect(report.nextActions).toHaveLength(0);
	});

	it("calculates partial score correctly", () => {
		// Only set up 2 loops as closed, rest open
		writeJson(path.join(dataDir, "ai-quality.json"), {
			enrichment: { score: 90, hintsApplied: [] },
		});
		writeJson(path.join(dataDir, "health-report.json"), { status: "ok" });

		const report = evaluateAutonomy({ dataDir, scriptsDir, rootDir });
		// enrichment=1.0, pipeline=1.0, rest=0 -> (1+1)/8 = 0.25
		expect(report.overallScore).toBeCloseTo(0.25, 1);
		expect(report.loopsClosed).toBe(2);
		expect(report.loopsTotal).toBe(8);
	});

	it("generates nextActions for open loops", () => {
		// Everything missing
		const report = evaluateAutonomy({ dataDir, scriptsDir, rootDir });
		expect(report.nextActions.length).toBeGreaterThan(0);
		// Should suggest actions for all 7 open loops
		expect(report.nextActions.length).toBeGreaterThanOrEqual(7);
	});

	it("generates no nextActions when all loops are closed", () => {
		writeJson(path.join(dataDir, "quality-history.json"), [
			{ timestamp: "2026-01-01T00:00:00Z", hintsApplied: ["h"] },
			{ timestamp: "2026-01-02T00:00:00Z", hintsApplied: [] },
			{ timestamp: "2026-01-03T00:00:00Z", hintsApplied: [] },
		]);
		writeJson(path.join(dataDir, "ai-quality.json"), {
			enrichment: { score: 90, hintsApplied: [] },
		});
		writeJson(path.join(dataDir, "coverage-gaps.json"), { gaps: [] });
		fs.writeFileSync(path.join(scriptsDir, "resolve-coverage-gaps.js"), "// resolver");
		writeJson(path.join(scriptsDir, "config", "auto.json"), { autoGenerated: true });
		writeJson(path.join(dataDir, "health-report.json"), { status: "ok" });
		writeJson(path.join(dataDir, "watch-plan.json"), {
			picks: [{ title: "M", reasons: ["R"], streaming: [{ platform: "NRK" }] }],
		});
		fs.writeFileSync(path.join(rootDir, "AUTOPILOT_ROADMAP.md"), "# Roadmap\n");
		writeJson(path.join(rootDir, "docs", "data", "autopilot-log.json"), {
			runs: [{ outcome: "completed", task: "T", pr: 1 }],
		});
		// Loop 7: Event Discovery
		writeJson(path.join(dataDir, "discovery-log.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", tasks: [] }],
		});
		fs.writeFileSync(path.join(scriptsDir, "sync-configs.js"), "// sync");
		writeJson(path.join(scriptsDir, "config", "researched.json"), {
			name: "Researched",
			lastResearched: "2026-02-12T00:00:00Z",
		});
		// Loop 8: Schedule Verification
		writeJson(path.join(dataDir, "verification-history.json"), {
			runs: [{ timestamp: "2026-02-12T00:00:00Z", results: [] }],
		});
		fs.mkdirSync(path.join(scriptsDir, "lib"), { recursive: true });
		fs.writeFileSync(path.join(scriptsDir, "lib", "schedule-verifier.js"), "// verifier");
		writeJson(path.join(scriptsDir, "config", "verified.json"), {
			name: "Verified",
			verificationSummary: { lastRun: "2026-02-12T00:00:00Z", verified: 5 },
		});

		const report = evaluateAutonomy({ dataDir, scriptsDir, rootDir });
		expect(report.nextActions).toHaveLength(0);
	});

	it("includes generatedAt timestamp in ISO format", () => {
		const report = evaluateAutonomy({ dataDir, scriptsDir, rootDir });
		expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("handles graceful degradation when all files are missing", () => {
		const emptyDir = path.join(tmpDir, "empty-data");
		const emptyScripts = path.join(tmpDir, "empty-scripts");
		fs.mkdirSync(emptyDir, { recursive: true });
		fs.mkdirSync(emptyScripts, { recursive: true });

		const report = evaluateAutonomy({
			dataDir: emptyDir,
			scriptsDir: emptyScripts,
			rootDir: tmpDir,
		});
		expect(report.overallScore).toBe(0);
		expect(report.loopsClosed).toBe(0);
		expect(report.loopsTotal).toBe(8);
		expect(report.loops.featuredQuality.status).toBe("open");
		expect(report.loops.enrichmentQuality.status).toBe("open");
		expect(report.loops.coverageGaps.status).toBe("open");
		expect(report.loops.pipelineHealth.status).toBe("open");
		expect(report.loops.watchPlan.status).toBe("open");
		expect(report.loops.codeHealth.status).toBe("open");
		expect(report.loops.eventDiscovery.status).toBe("open");
		expect(report.loops.scheduleVerification.status).toBe("open");
	});
});
