import { describe, it, expect } from "vitest";
import { computeTrend } from "../scripts/lib/ux-heuristics.js";

describe("computeTrend()", () => {
	it("returns 'insufficient' with fewer than 3 entries", () => {
		expect(computeTrend([])).toBe("insufficient");
		expect(computeTrend([{ score: 80 }])).toBe("insufficient");
		expect(computeTrend([{ score: 80 }, { score: 85 }])).toBe("insufficient");
	});

	it("returns 'improving' when scores are strictly rising", () => {
		const history = [
			{ score: 60, generatedAt: "2026-01-01T00:00:00Z" },
			{ score: 70, generatedAt: "2026-01-02T00:00:00Z" },
			{ score: 80, generatedAt: "2026-01-03T00:00:00Z" },
		];
		expect(computeTrend(history)).toBe("improving");
	});

	it("returns 'declining' when scores are strictly falling", () => {
		const history = [
			{ score: 90, generatedAt: "2026-01-01T00:00:00Z" },
			{ score: 80, generatedAt: "2026-01-02T00:00:00Z" },
			{ score: 70, generatedAt: "2026-01-03T00:00:00Z" },
		];
		expect(computeTrend(history)).toBe("declining");
	});

	it("returns 'stable' when scores are flat", () => {
		const history = [
			{ score: 80, generatedAt: "2026-01-01T00:00:00Z" },
			{ score: 80, generatedAt: "2026-01-02T00:00:00Z" },
			{ score: 80, generatedAt: "2026-01-03T00:00:00Z" },
		];
		expect(computeTrend(history)).toBe("stable");
	});

	it("returns 'stable' when scores fluctuate", () => {
		const history = [
			{ score: 80, generatedAt: "2026-01-01T00:00:00Z" },
			{ score: 70, generatedAt: "2026-01-02T00:00:00Z" },
			{ score: 85, generatedAt: "2026-01-03T00:00:00Z" },
		];
		expect(computeTrend(history)).toBe("stable");
	});

	it("only considers last 3 entries for trend", () => {
		const history = [
			{ score: 90, generatedAt: "2026-01-01T00:00:00Z" },
			{ score: 50, generatedAt: "2026-01-02T00:00:00Z" },
			{ score: 60, generatedAt: "2026-01-03T00:00:00Z" },
			{ score: 70, generatedAt: "2026-01-04T00:00:00Z" },
			{ score: 80, generatedAt: "2026-01-05T00:00:00Z" },
		];
		expect(computeTrend(history)).toBe("improving");
	});

	it("handles null/undefined input", () => {
		expect(computeTrend(null)).toBe("insufficient");
		expect(computeTrend(undefined)).toBe("insufficient");
	});
});
