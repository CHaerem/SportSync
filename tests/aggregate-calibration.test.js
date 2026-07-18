// aggregate-calibration.js: mechanical trust stats from the verify agent's ledger.
import { describe, it, expect } from "vitest";
import { aggregate, normalizeSource } from "../scripts/aggregate-calibration.js";

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

	it("normalizes full URLs to hostnames (review finding)", () => {
		expect(normalizeSource("https://www.pgatour.com/schedule/x")).toBe("pgatour.com");
		expect(normalizeSource("pgatour.com/schedule")).toBe("pgatour.com");
		const out = aggregate([rec(), rec({ source: "https://pgatour.com/leaderboard" })], NOW);
		expect(Object.keys(out.sources)).toEqual(["pgatour.com"]);
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

	describe("boardWasProvisional — a source correcting our estimate is not a strike", () => {
		// The cyclingstage.com case: every time the official TdF source fixed a provisional
		// stage time we had logged agreed:false, dragging reliability to 0.27. Marking the
		// board value as provisional flips that into a demonstration of the source's reliability.
		const cs = (over = {}) =>
			JSON.stringify({ checkedAt: "2026-07-01T06:00:00Z", sport: "cycling", source: "cyclingstage.com", field: "time", ...over });

		it("counts a correction of a provisional value as agreement, not disagreement", () => {
			const lines = [
				cs({ agreed: false, boardWasProvisional: true }),
				cs({ agreed: false, boardWasProvisional: true }),
				cs({ agreed: false, boardWasProvisional: true }),
				cs({ agreed: false, boardWasProvisional: true }),
				cs({ agreed: false, boardWasProvisional: true }),
			];
			const out = aggregate(lines, NOW);
			const s = out.sources["cyclingstage.com"];
			expect(s.agreed).toBe(5);
			expect(s.corrections).toBe(5);
			expect(s.reliability).toBe(1); // was 0 under the old counting
			expect(s.byField.time.agreed).toBe(5);
		});

		it("still penalises a genuine disagreement (source was wrong, board was solid)", () => {
			const lines = [
				cs({ agreed: false }), // no boardWasProvisional ⇒ the source really was wrong
				cs({ agreed: true }),
				cs({ agreed: true }),
				cs({ agreed: true }),
				cs({ agreed: true }),
			];
			const out = aggregate(lines, NOW);
			const s = out.sources["cyclingstage.com"];
			expect(s.agreed).toBe(4);
			expect(s.corrections).toBe(0);
			expect(s.reliability).toBe(0.8);
		});

		it("is backward-compatible: records without the field behave exactly as before", () => {
			const lines = [rec(), rec({ agreed: false })];
			const out = aggregate(lines, NOW);
			const s = out.sources["pgatour.com"];
			expect(s.agreed).toBe(1);
			expect(s.corrections).toBe(0);
		});
	});
});
