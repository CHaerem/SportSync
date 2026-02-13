import { describe, it, expect } from "vitest";
import { pruneOldRuns, calculateShare, shouldGate } from "../scripts/track-usage.js";

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
	it("blocks when too many autopilot runs in 7d", () => {
		const runs = Array.from({ length: 7 }, (_, i) => ({
			timestamp: new Date(Date.now() - i * 86_400_000).toISOString(),
			context: "autopilot",
		}));
		const result = shouldGate(runs);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("autopilot");
	});

	it("passes with few autopilot runs", () => {
		const runs = [
			{ timestamp: new Date().toISOString(), context: "autopilot" },
			{ timestamp: new Date().toISOString(), context: "pipeline" },
		];
		const result = shouldGate(runs, Date.now() + MS_PER_5H + 1000);
		expect(result.blocked).toBe(false);
	});

	it("blocks when too many runs in 5h burst window", () => {
		const now = Date.now();
		const runs = Array.from({ length: 4 }, (_, i) => ({
			timestamp: new Date(now - i * 60_000).toISOString(),
			context: "pipeline",
		}));
		const result = shouldGate(runs, now);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("5h");
	});

	it("passes for null input", () => {
		expect(shouldGate(null).blocked).toBe(false);
	});

	it("passes for empty runs", () => {
		expect(shouldGate([]).blocked).toBe(false);
	});
});
