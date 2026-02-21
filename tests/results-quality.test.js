import { describe, it, expect } from "vitest";
import {
	validateFootballResult,
	validateGolfResult,
	validateResults,
} from "../scripts/fetch-results.js";
import {
	evaluateResultsQuality,
	buildResultsHints,
} from "../scripts/lib/ai-quality-gates.js";

// --- validateFootballResult ---

describe("validateFootballResult()", () => {
	const validResult = {
		homeTeam: "Arsenal",
		awayTeam: "Liverpool",
		homeScore: 2,
		awayScore: 1,
		date: "2026-02-12T20:00:00Z",
		goalScorers: [
			{ player: "Saka", team: "Arsenal", minute: "23'" },
			{ player: "Salah", team: "Liverpool", minute: "55'" },
			{ player: "Havertz", team: "Arsenal", minute: "78'" },
		],
	};

	it("accepts a valid result", () => {
		const v = validateFootballResult(validResult);
		expect(v.valid).toBe(true);
		expect(v.issues).toHaveLength(0);
	});

	it("rejects missing team names", () => {
		const v = validateFootballResult({ ...validResult, homeTeam: "" });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("homeTeam"))).toBe(true);
	});

	it("rejects out-of-range scores", () => {
		const v = validateFootballResult({ ...validResult, homeScore: 25 });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("homeScore"))).toBe(true);
	});

	it("rejects negative scores", () => {
		const v = validateFootballResult({ ...validResult, awayScore: -1 });
		expect(v.valid).toBe(false);
	});

	it("rejects future dates", () => {
		const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
		const v = validateFootballResult({ ...validResult, date: futureDate });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("future"))).toBe(true);
	});

	it("rejects excessive goal scorers", () => {
		const scorers = Array.from({ length: 10 }, (_, i) => ({ player: `P${i}`, team: "A", minute: `${i}'` }));
		const v = validateFootballResult({ ...validResult, homeScore: 1, awayScore: 1, goalScorers: scorers });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("goalScorers"))).toBe(true);
	});

	it("rejects duplicate teams", () => {
		const v = validateFootballResult({ ...validResult, awayTeam: "Arsenal" });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("equals"))).toBe(true);
	});
});

// --- validateGolfResult ---

describe("validateGolfResult()", () => {
	const validFinal = {
		tournamentName: "Pebble Beach Pro-Am",
		status: "final",
		completedRound: 4,
		topPlayers: [
			{ position: 1, player: "Scheffler", score: "-16" },
			{ position: 2, player: "McIlroy", score: "-14" },
		],
	};

	it("accepts a valid final tournament", () => {
		const v = validateGolfResult(validFinal);
		expect(v.valid).toBe(true);
		expect(v.issues).toHaveLength(0);
	});

	it("accepts null tour (no tournament)", () => {
		const v = validateGolfResult(null);
		expect(v.valid).toBe(true);
	});

	it("rejects final with no topPlayers", () => {
		const v = validateGolfResult({ ...validFinal, topPlayers: [] });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("topPlayers"))).toBe(true);
	});

	it("rejects final with insufficient rounds", () => {
		const v = validateGolfResult({ ...validFinal, completedRound: 2 });
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("rounds"))).toBe(true);
	});

	it("rejects non-ascending positions", () => {
		const v = validateGolfResult({
			...validFinal,
			topPlayers: [
				{ position: 3, player: "A", score: "-10" },
				{ position: 1, player: "B", score: "-12" },
			],
		});
		expect(v.valid).toBe(false);
		expect(v.issues.some(i => i.includes("ascending"))).toBe(true);
	});
});

// --- validateResults ---

describe("validateResults()", () => {
	it("validates mixed football and golf", () => {
		const output = {
			football: [
				{ homeTeam: "Arsenal", awayTeam: "Liverpool", homeScore: 2, awayScore: 1, date: "2026-02-12T20:00Z", goalScorers: [] },
			],
			golf: {
				pga: { tournamentName: "Open", status: "in_progress", completedRound: 2, topPlayers: [{ position: 1, player: "A", score: "-5" }] },
				dpWorld: null,
			},
		};
		const v = validateResults(output);
		expect(v.totalResults).toBe(2); // 1 football + 1 golf (null skipped)
		expect(v.validResults).toBe(2);
		expect(v.issues).toHaveLength(0);
	});

	it("handles empty results", () => {
		const v = validateResults({ football: [], golf: { pga: null, dpWorld: null } });
		expect(v.totalResults).toBe(0);
		expect(v.validResults).toBe(0);
		expect(v.issues).toHaveLength(0);
	});
});

// --- evaluateResultsQuality ---

describe("evaluateResultsQuality()", () => {
	const userContext = { favoriteTeams: ["Arsenal", "Barcelona"] };

	it("scores complete data highly", () => {
		const results = {
			lastUpdated: new Date().toISOString(),
			football: [
				{ homeTeam: "Arsenal", awayTeam: "Liverpool", homeScore: 2, awayScore: 1, goalScorers: [{ player: "Saka" }], recapHeadline: "Arsenal win", isFavorite: true },
				{ homeTeam: "Barcelona", awayTeam: "Madrid", homeScore: 3, awayScore: 0, goalScorers: [{ player: "Yamal" }], recapHeadline: "Barca cruise", isFavorite: true },
			],
			golf: { pga: { tournamentName: "Open" }, dpWorld: null },
			validationMetrics: { totalResults: 3, validResults: 3, issueCount: 0 },
		};
		const r = evaluateResultsQuality(results, [], null, userContext);
		expect(r.score).toBeGreaterThanOrEqual(70);
		expect(r.metrics.integrityRate).toBe(1);
		expect(r.metrics.recapHeadlineRate).toBe(1);
	});

	it("penalizes low recap rate", () => {
		const results = {
			lastUpdated: new Date().toISOString(),
			football: [
				{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0, goalScorers: [{ player: "X" }], recapHeadline: null },
				{ homeTeam: "C", awayTeam: "D", homeScore: 2, awayScore: 2, goalScorers: [{ player: "Y" }], recapHeadline: null },
			],
			golf: { pga: null, dpWorld: null },
		};
		const r = evaluateResultsQuality(results, [], null, {});
		expect(r.metrics.recapHeadlineRate).toBe(0);
	});

	it("penalizes missing goal scorers", () => {
		const results = {
			lastUpdated: new Date().toISOString(),
			football: [
				{ homeTeam: "A", awayTeam: "B", homeScore: 2, awayScore: 1, goalScorers: [], recapHeadline: null },
			],
			golf: { pga: null, dpWorld: null },
		};
		const r = evaluateResultsQuality(results, [], null, {});
		expect(r.metrics.goalScorerCoverage).toBe(0);
	});

	it("returns zero score for null results", () => {
		const r = evaluateResultsQuality(null, [], null, {});
		expect(r.score).toBe(0);
		expect(r.issues).toHaveLength(1);
	});
});

// --- buildResultsHints ---

describe("buildResultsHints()", () => {
	function makeResultsEntry(overrides = {}) {
		return {
			results: {
				score: 80,
				recapHeadlineRate: 0.8,
				goalScorerCoverage: 0.9,
				favoriteCoverage: 0.8,
				freshnessScore: 1.0,
				...overrides,
			},
		};
	}

	it("returns empty with insufficient history", () => {
		const r = buildResultsHints([makeResultsEntry(), makeResultsEntry()]);
		expect(r.hints).toEqual([]);
	});

	it("suppresses recap hint when recapHeadlineRate is the only low metric", () => {
		// When recapHeadlineRate is low but all other metrics are fine, the hint is
		// suppressed because 0% headline rate reflects RSS feed content (a data artifact),
		// not an LLM problem the hint can fix.
		const history = Array.from({ length: 5 }, () =>
			makeResultsEntry({ recapHeadlineRate: 0.1 })
		);
		const r = buildResultsHints(history);
		expect(r.hints.some(h => h.includes("recap"))).toBe(false);
	});

	it("emits recap hint when recapHeadlineRate is low alongside another low metric", () => {
		const history = Array.from({ length: 5 }, () =>
			makeResultsEntry({ recapHeadlineRate: 0.1, goalScorerCoverage: 0.2 })
		);
		const r = buildResultsHints(history);
		expect(r.hints.some(h => h.includes("recap"))).toBe(true);
	});

	it("returns no hints when all metrics are good", () => {
		const history = Array.from({ length: 5 }, () => makeResultsEntry());
		const r = buildResultsHints(history);
		expect(r.hints).toEqual([]);
	});
});
