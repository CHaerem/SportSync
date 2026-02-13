import { describe, it, expect } from "vitest";
import { calculateDelta, pruneOldRuns, calculateShare, shouldGate } from "../scripts/track-usage.js";

describe("calculateDelta", () => {
	it("computes deltas between before/after snapshots", () => {
		const before = { five_hour: { utilization: 10 }, seven_day: { utilization: 40 } };
		const after = { five_hour: { utilization: 13.5 }, seven_day: { utilization: 41.2 } };
		const d = calculateDelta(before, after);
		expect(d.delta5h).toBe(3.5);
		expect(d.delta7d).toBe(1.2);
	});

	it("returns zeros when before is null", () => {
		const d = calculateDelta(null, { five_hour: { utilization: 10 }, seven_day: { utilization: 50 } });
		expect(d.delta5h).toBe(0);
		expect(d.delta7d).toBe(0);
	});

	it("returns zeros when after is null", () => {
		const d = calculateDelta({ five_hour: { utilization: 10 }, seven_day: { utilization: 50 } }, null);
		expect(d.delta5h).toBe(0);
		expect(d.delta7d).toBe(0);
	});

	it("handles missing nested fields gracefully", () => {
		const d = calculateDelta({}, {});
		expect(d.delta5h).toBe(0);
		expect(d.delta7d).toBe(0);
	});
});

describe("pruneOldRuns", () => {
	const MS_PER_7D = 7 * 86_400_000;

	it("removes runs older than 7 days", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - MS_PER_7D - 1000).toISOString(), context: "pipeline", delta7d: 1 },
			{ timestamp: new Date(now - 1000).toISOString(), context: "pipeline", delta7d: 2 },
		];
		const result = pruneOldRuns(runs, now);
		expect(result).toHaveLength(1);
		expect(result[0].delta7d).toBe(2);
	});

	it("returns empty array for null input", () => {
		expect(pruneOldRuns(null)).toEqual([]);
	});

	it("keeps all recent runs", () => {
		const now = Date.now();
		const runs = [
			{ timestamp: new Date(now - 3600000).toISOString(), delta7d: 1 },
			{ timestamp: new Date(now - 7200000).toISOString(), delta7d: 2 },
		];
		expect(pruneOldRuns(runs, now)).toHaveLength(2);
	});
});

describe("calculateShare", () => {
	it("sums delta7d and counts contexts", () => {
		const runs = [
			{ context: "pipeline", delta7d: 1.5 },
			{ context: "pipeline", delta7d: 2.0 },
			{ context: "autopilot", delta7d: 3.0 },
		];
		const share = calculateShare(runs);
		expect(share.sevenDay).toBe(6.5);
		expect(share.pipelineRuns).toBe(2);
		expect(share.autopilotRuns).toBe(1);
	});

	it("returns zeros for empty array", () => {
		const share = calculateShare([]);
		expect(share.sevenDay).toBe(0);
		expect(share.pipelineRuns).toBe(0);
		expect(share.autopilotRuns).toBe(0);
	});

	it("handles null input", () => {
		const share = calculateShare(null);
		expect(share.sevenDay).toBe(0);
	});
});

describe("shouldGate", () => {
	it("gates when utilization exceeds threshold", () => {
		expect(shouldGate(85, 80)).toBe(true);
	});

	it("passes when utilization is at threshold", () => {
		expect(shouldGate(80, 80)).toBe(false);
	});

	it("passes when utilization is below threshold", () => {
		expect(shouldGate(50, 80)).toBe(false);
	});

	it("passes for null utilization", () => {
		expect(shouldGate(null, 80)).toBe(false);
	});

	it("passes for undefined utilization", () => {
		expect(shouldGate(undefined, 80)).toBe(false);
	});
});
