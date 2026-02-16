import { describe, it, expect } from "vitest";
import { pruneOldRuns, calculateShare, shouldGate, aggregateInternalTokens, calculateBudget, trackApiStatus } from "../scripts/track-usage.js";

const MS_PER_5H = 5 * 3_600_000;
const MS_PER_7D = 7 * 86_400_000;

describe("pruneOldRuns", () => {
	it("removes runs older than 7 days", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - MS_PER_7D - 1000).toISOString(), context: "pipeline" },
			{ timestamp: new Date(now - 1000).toISOString(), context: "pipeline" },
		];
		const result = pruneOldRuns(runs, now);
		expect(result).toHaveLength(1);
	});

	it("returns empty array for null input", () => {
		expect(pruneOldRuns(null)).toEqual([]);
	});

	it("keeps all recent runs", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString() },
			{ timestamp: new Date(now - 7200000).toISOString() },
		];
		expect(pruneOldRuns(runs, now)).toHaveLength(2);
	});
});

describe("calculateShare", () => {
	it("counts contexts and sums duration", () => {
		const runs = [
			{ context: "pipeline", durationMs: 120000 },
			{ context: "pipeline", durationMs: 130000 },
			{ context: "autopilot", durationMs: 900000 },
		];
		const share = calculateShare(runs);
		expect(share.pipelineRuns).toBe(2);
		expect(share.autopilotRuns).toBe(1);
		expect(share.totalDurationMs).toBe(1150000);
	});

	it("returns zeros for empty array", () => {
		const share = calculateShare([]);
		expect(share.pipelineRuns).toBe(0);
		expect(share.autopilotRuns).toBe(0);
		expect(share.totalDurationMs).toBe(0);
	});

	it("handles null input", () => {
		const share = calculateShare(null);
		expect(share.pipelineRuns).toBe(0);
	});

	it("handles missing durationMs", () => {
		const runs = [{ context: "pipeline" }];
		expect(calculateShare(runs).totalDurationMs).toBe(0);
	});
});

describe("shouldGate", () => {
	it("blocks when 7d utilization exceeds threshold", () => {
		const result = shouldGate([], 85);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("utilization");
	});

	it("passes when utilization is at threshold", () => {
		const result = shouldGate([], 80);
		expect(result.blocked).toBe(false);
	});

	it("passes when utilization is null (API unavailable)", () => {
		const result = shouldGate([], null);
		expect(result.blocked).toBe(false);
	});

	it("blocks when too many autopilot runs in 7d", () => {
		const runs = Array.from({ length: 14 }, (_, i) => ({
			timestamp: new Date(Date.now() - i * 86_400_000 / 2).toISOString(),
			context: "autopilot",
		}));
		const result = shouldGate(runs, null);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("autopilot");
	});

	it("blocks when too many runs in 5h burst window", () => {
		const now = Date.now();
		const runs = Array.from({ length: 10 }, (_, i) => ({
			timestamp: new Date(now - i * 60_000).toISOString(),
			context: "pipeline",
		}));
		const result = shouldGate(runs, null, now);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("5h");
	});

	it("passes with few runs and no utilization data", () => {
		const runs = [
			{ timestamp: new Date().toISOString(), context: "autopilot" },
			{ timestamp: new Date().toISOString(), context: "pipeline" },
		];
		const result = shouldGate(runs, null, Date.now() + MS_PER_5H + 1000);
		expect(result.blocked).toBe(false);
	});

	it("passes for null runs", () => {
		expect(shouldGate(null, null).blocked).toBe(false);
	});

	it("passes for empty runs", () => {
		expect(shouldGate([], null).blocked).toBe(false);
	});

	it("utilization gate takes priority over run-count checks", () => {
		// Even with 0 runs, high utilization should block
		const result = shouldGate([], 95);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("utilization");
	});
});

describe("aggregateInternalTokens", () => {
	it("sums all operation token totals", () => {
		const quality = {
			enrichment: { tokenUsage: { input: 1000, output: 500, total: 1500 } },
			featured: { tokenUsage: { input: 2000, output: 800, total: 2800 } },
			discovery: { tokenUsage: { input: 300, output: 200, total: 500 } },
			multiDay: { tokenUsage: { input: 400, output: 300, total: 700 } },
		};
		const result = aggregateInternalTokens(quality);
		expect(result.enrichment).toBe(1500);
		expect(result.featured).toBe(2800);
		expect(result.discovery).toBe(500);
		expect(result.multiDay).toBe(700);
		expect(result.runTotal).toBe(5500);
	});

	it("returns null for null input", () => {
		expect(aggregateInternalTokens(null)).toBeNull();
	});

	it("returns null for non-object input", () => {
		expect(aggregateInternalTokens("string")).toBeNull();
	});

	it("handles missing operations gracefully", () => {
		const quality = {
			enrichment: { tokenUsage: { total: 1000 } },
		};
		const result = aggregateInternalTokens(quality);
		expect(result.enrichment).toBe(1000);
		expect(result.featured).toBe(0);
		expect(result.discovery).toBe(0);
		expect(result.multiDay).toBe(0);
		expect(result.runTotal).toBe(1000);
	});

	it("handles quality with no tokenUsage fields", () => {
		const quality = {
			enrichment: { score: 90 },
			featured: { provider: "claude-cli" },
		};
		const result = aggregateInternalTokens(quality);
		expect(result.runTotal).toBe(0);
	});
});

describe("calculateBudget", () => {
	it("calculates daily and weekly usage from runs", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString(), tokens: 50000 },
			{ timestamp: new Date(now - 7200000).toISOString(), tokens: 30000 },
		];
		const result = calculateBudget(runs, now);
		expect(result.dailyUsed).toBe(80000);
		expect(result.weeklyUsed).toBe(80000);
		expect(result.dailyBudget).toBe(5000000);
		expect(result.weeklyBudget).toBe(25000000);
		expect(result.dailyPct).toBe(2);
		expect(result.weeklyPct).toBe(0);
	});

	it("separates daily from weekly usage", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString(), tokens: 10000 },
			{ timestamp: new Date(now - 2 * 86_400_000).toISOString(), tokens: 20000 },
		];
		const result = calculateBudget(runs, now);
		expect(result.dailyUsed).toBe(10000);
		expect(result.weeklyUsed).toBe(30000);
	});

	it("returns zeros for empty runs", () => {
		const result = calculateBudget([]);
		expect(result.dailyUsed).toBe(0);
		expect(result.weeklyUsed).toBe(0);
		expect(result.dailyPct).toBe(0);
		expect(result.weeklyPct).toBe(0);
	});

	it("returns zeros for null runs", () => {
		const result = calculateBudget(null);
		expect(result.dailyUsed).toBe(0);
	});

	it("handles runs with missing tokens field", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString() },
		];
		const result = calculateBudget(runs, now);
		expect(result.dailyUsed).toBe(0);
	});

	it("includes sessionTokens in daily and weekly sums", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString(), tokens: 10000, sessionTokens: { total: 500000 } },
			{ timestamp: new Date(now - 2 * 86_400_000).toISOString(), tokens: 5000, sessionTokens: { total: 200000 } },
		];
		const result = calculateBudget(runs, now);
		expect(result.dailyUsed).toBe(510000);   // 10000 + 500000
		expect(result.weeklyUsed).toBe(715000);   // 510000 + 5000 + 200000
	});

	it("works with runs that have no sessionTokens (backward compatible)", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString(), tokens: 50000 },
			{ timestamp: new Date(now - 7200000).toISOString(), tokens: 30000, sessionTokens: { total: 100000 } },
		];
		const result = calculateBudget(runs, now);
		expect(result.dailyUsed).toBe(180000);  // 50000 + 30000 + 100000
	});
});

describe("trackApiStatus", () => {
	it("detects transition from unavailable to available", () => {
		const prev = { available: false, since: "2026-01-01T00:00:00Z" };
		const result = trackApiStatus(true, prev);
		expect(result.available).toBe(true);
		expect(result.transitioned).toBe(true);
		expect(result.previousState).toBe("unavailable");
	});

	it("detects transition from available to unavailable", () => {
		const prev = { available: true, since: "2026-01-01T00:00:00Z" };
		const result = trackApiStatus(false, prev);
		expect(result.available).toBe(false);
		expect(result.transitioned).toBe(true);
		expect(result.previousState).toBe("available");
	});

	it("no transition when state unchanged (still unavailable)", () => {
		const prev = { available: false, since: "2026-01-01T00:00:00Z" };
		const result = trackApiStatus(false, prev);
		expect(result.available).toBe(false);
		expect(result.transitioned).toBe(false);
		expect(result.since).toBe("2026-01-01T00:00:00Z");
	});

	it("no transition when state unchanged (still available)", () => {
		const prev = { available: true, since: "2026-02-01T00:00:00Z" };
		const result = trackApiStatus(true, prev);
		expect(result.available).toBe(true);
		expect(result.transitioned).toBe(false);
		expect(result.since).toBe("2026-02-01T00:00:00Z");
	});

	it("handles null previous status (first run)", () => {
		const result = trackApiStatus(false, null);
		expect(result.available).toBe(false);
		expect(result.transitioned).toBe(false);
		expect(result.previousState).toBeNull();
		expect(result.since).toBeTruthy(); // gets a new timestamp
	});

	it("preserves since timestamp when state unchanged", () => {
		const since = "2026-01-15T12:00:00Z";
		const result = trackApiStatus(true, { available: true, since });
		expect(result.since).toBe(since);
	});

	it("updates since timestamp on transition", () => {
		const result = trackApiStatus(true, { available: false, since: "2026-01-01T00:00:00Z" });
		expect(result.since).not.toBe("2026-01-01T00:00:00Z");
	});
});
