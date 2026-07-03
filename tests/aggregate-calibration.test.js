// aggregate-calibration.js: mechanical trust stats from the verify agent's ledger.
import { describe, it, expect } from "vitest";
import { aggregate } from "../scripts/aggregate-calibration.js";

const NOW = Date.parse("2026-07-03T12:00:00Z");
const rec = (over = {}) =>
	JSON.stringify({
		checkedAt: "2026-07-01T06:00:00Z",
		sport: "golf",
		source: "pgatour.com",
		field: "time",
		agreed: true,
		...over,
	});

describe("aggregate-calibration", () => {
	it("counts checks and agreement per source", () => {
		const lines = [rec(), rec(), rec({ agreed: false })];
		const out = aggregate(lines, NOW);
		expect(out.sources["pgatour.com"].checks).toBe(3);
		expect(out.sources["pgatour.com"].agreed).toBe(2);
	});

	it("withholds reliability below 5 checks (no overclaiming)", () => {
		const out = aggregate([rec(), rec()], NOW);
		expect(out.sources["pgatour.com"].reliability).toBeNull();
	});

	it("computes reliability with sufficient sample", () => {
		const lines = [rec(), rec(), rec(), rec(), rec({ agreed: false })];
		const out = aggregate(lines, NOW);
		expect(out.sources["pgatour.com"].reliability).toBe(0.8);
	});

	it("normalizes www. prefixes to one source key", () => {
		const out = aggregate([rec(), rec({ source: "www.pgatour.com" })], NOW);
		expect(Object.keys(out.sources)).toEqual(["pgatour.com"]);
		expect(out.sources["pgatour.com"].checks).toBe(2);
	});

	it("drops records outside the decay window and malformed lines", () => {
		const lines = [rec({ checkedAt: "2025-01-01T00:00:00Z" }), "not json", rec()];
		const out = aggregate(lines, NOW);
		expect(out.records.used).toBe(1);
		expect(out.records.skipped).toBe(2);
	});

	it("breaks down by sport and field", () => {
		const lines = [rec(), rec({ field: "streaming", agreed: false })];
		const out = aggregate(lines, NOW);
		const s = out.sources["pgatour.com"];
		expect(s.byField.time.agreed).toBe(1);
		expect(s.byField.streaming.agreed).toBe(0);
		expect(s.bySport.golf.checks).toBe(2);
	});
});
