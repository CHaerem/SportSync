import { describe, it, expect } from "vitest";
import {
	computeRefreshUrgency,
	buildRefreshTargets,
	computeAllUrgencies,
	urgencyToQuotaPriority,
	urgencyToRefreshInterval,
	urgencyToStalenessThreshold,
	extractBracketMatches,
} from "../scripts/lib/refresh-urgency.js";

const MS_PER_HOUR = 3_600_000;

function makeTarget(overrides = {}) {
	return {
		id: "config:test:t1",
		type: "config",
		sport: "esports",
		lastRefreshed: new Date().toISOString(),
		baseRefreshIntervalMs: 2 * MS_PER_HOUR,
		upcomingMatches: [],
		hasLiveMatches: false,
		hasFocusTeam: false,
		staleMatchCount: 0,
		consecutiveFailures: 0,
		lastRefreshProducedChanges: null,
		...overrides,
	};
}

// --- extractBracketMatches ---

describe("extractBracketMatches()", () => {
	it("returns empty for null/undefined bracket", () => {
		expect(extractBracketMatches(null)).toEqual([]);
		expect(extractBracketMatches(undefined)).toEqual([]);
	});

	it("extracts group matches", () => {
		const bracket = {
			groups: {
				A: { matches: [{ team1: "X", team2: "Y" }] },
				B: { matches: [{ team1: "W", team2: "Z" }] },
			},
		};
		expect(extractBracketMatches(bracket)).toHaveLength(2);
	});

	it("extracts playoff matches from upper and lower brackets", () => {
		const bracket = {
			playoffs: {
				upperBracket: [
					{ round: "R1", matches: [{ status: "completed" }, { status: "scheduled" }] },
				],
				lowerBracket: [
					{ round: "LR1", matches: [{ status: "pending" }] },
				],
			},
		};
		expect(extractBracketMatches(bracket)).toHaveLength(3);
	});

	it("extracts grand final matches", () => {
		const bracket = {
			playoffs: {
				grandFinal: { matches: [{ status: "scheduled" }] },
			},
		};
		expect(extractBracketMatches(bracket)).toHaveLength(1);
	});

	it("handles combined groups + playoffs", () => {
		const bracket = {
			groups: {
				A: { matches: [{ status: "completed" }] },
			},
			playoffs: {
				upperBracket: [{ round: "QF", matches: [{ status: "scheduled" }] }],
				lowerBracket: [],
				grandFinal: { matches: [{ status: "pending" }] },
			},
		};
		expect(extractBracketMatches(bracket)).toHaveLength(3);
	});
});

// --- computeRefreshUrgency ---

describe("computeRefreshUrgency()", () => {
	it("returns low score for freshly refreshed target with no activity", () => {
		const result = computeRefreshUrgency(makeTarget());
		expect(result.score).toBeLessThan(0.1);
		expect(result.suggestedQuotaPriority).toBe(3);
		expect(result.id).toBe("config:test:t1");
	});

	it("returns high urgency for live matches", () => {
		const result = computeRefreshUrgency(makeTarget({ hasLiveMatches: true }));
		expect(result.score).toBeGreaterThanOrEqual(0.35);
		expect(result.reasons).toContain("live matches active");
	});

	it("returns high urgency for live matches with focus team", () => {
		const result = computeRefreshUrgency(makeTarget({
			hasLiveMatches: true,
			hasFocusTeam: true,
		}));
		expect(result.score).toBeGreaterThanOrEqual(0.45);
		expect(result.suggestedQuotaPriority).toBeLessThanOrEqual(2);
	});

	it("boosts urgency for imminent matches", () => {
		const now = new Date();
		const result = computeRefreshUrgency(makeTarget({
			upcomingMatches: [
				{ scheduledTime: new Date(now.getTime() + 30 * 60_000).toISOString() },
			],
		}), now);
		expect(result.score).toBeGreaterThanOrEqual(0.2);
		expect(result.reasons.some(r => r.includes("within 2h"))).toBe(true);
	});

	it("does not count matches beyond 2h as imminent", () => {
		const now = new Date();
		const result = computeRefreshUrgency(makeTarget({
			upcomingMatches: [
				{ scheduledTime: new Date(now.getTime() + 3 * MS_PER_HOUR).toISOString() },
			],
		}), now);
		expect(result.reasons.some(r => r.includes("within 2h"))).toBe(false);
	});

	it("returns high urgency for stale matches + overdue refresh", () => {
		const now = new Date();
		const result = computeRefreshUrgency(makeTarget({
			lastRefreshed: new Date(now.getTime() - 8 * MS_PER_HOUR).toISOString(),
			staleMatchCount: 3,
		}), now);
		expect(result.score).toBeGreaterThanOrEqual(0.3);
	});

	it("penalizes no-change refreshes", () => {
		const base = makeTarget({
			lastRefreshed: new Date(Date.now() - MS_PER_HOUR).toISOString(),
		});
		const withChanges = computeRefreshUrgency({ ...base, lastRefreshProducedChanges: true });
		const withoutChanges = computeRefreshUrgency({ ...base, lastRefreshProducedChanges: false });
		expect(withoutChanges.score).toBeLessThan(withChanges.score);
	});

	it("does not penalize no-change when live matches are active", () => {
		const base = makeTarget({ hasLiveMatches: true });
		const withoutChanges = computeRefreshUrgency({ ...base, lastRefreshProducedChanges: false });
		// Live match factor (0.35) should dominate; no-change penalty not applied during live
		expect(withoutChanges.score).toBeGreaterThanOrEqual(0.35);
	});

	it("boosts urgency for broken recipes", () => {
		const result = computeRefreshUrgency(makeTarget({
			id: "recipe:broken",
			lastRefreshed: null,
			consecutiveFailures: 13,
		}));
		expect(result.score).toBeGreaterThanOrEqual(0.3);
		expect(result.reasons.some(r => r.includes("13 consecutive failures"))).toBe(true);
	});

	it("does not boost for fewer than 6 consecutive failures", () => {
		const low = computeRefreshUrgency(makeTarget({ consecutiveFailures: 5 }));
		const high = computeRefreshUrgency(makeTarget({ consecutiveFailures: 6 }));
		expect(high.score).toBeGreaterThan(low.score);
	});

	it("clamps score to [0, 1]", () => {
		const now = new Date();
		const result = computeRefreshUrgency(makeTarget({
			lastRefreshed: new Date(now.getTime() - 24 * MS_PER_HOUR).toISOString(),
			upcomingMatches: [{ scheduledTime: new Date(now.getTime() + 60_000).toISOString() }],
			hasLiveMatches: true,
			hasFocusTeam: true,
			staleMatchCount: 5,
			consecutiveFailures: 10,
		}), now);
		expect(result.score).toBeLessThanOrEqual(1.0);
		expect(result.score).toBeGreaterThanOrEqual(0);
	});

	it("returns all expected fields", () => {
		const result = computeRefreshUrgency(makeTarget());
		expect(result).toHaveProperty("id");
		expect(result).toHaveProperty("score");
		expect(result).toHaveProperty("reasons");
		expect(result).toHaveProperty("suggestedQuotaPriority");
		expect(result).toHaveProperty("suggestedRefreshIntervalMs");
		expect(result).toHaveProperty("suggestedStalenessThresholdMinutes");
		expect(Array.isArray(result.reasons)).toBe(true);
	});
});

// --- urgencyToQuotaPriority ---

describe("urgencyToQuotaPriority()", () => {
	it("maps high urgency to priority 1", () => {
		expect(urgencyToQuotaPriority(0.6)).toBe(1);
		expect(urgencyToQuotaPriority(0.9)).toBe(1);
		expect(urgencyToQuotaPriority(1.0)).toBe(1);
	});

	it("maps medium urgency to priority 2", () => {
		expect(urgencyToQuotaPriority(0.3)).toBe(2);
		expect(urgencyToQuotaPriority(0.5)).toBe(2);
	});

	it("maps low urgency to priority 3", () => {
		expect(urgencyToQuotaPriority(0)).toBe(3);
		expect(urgencyToQuotaPriority(0.1)).toBe(3);
		expect(urgencyToQuotaPriority(0.29)).toBe(3);
	});
});

// --- urgencyToRefreshInterval ---

describe("urgencyToRefreshInterval()", () => {
	it("returns 1h for high urgency", () => {
		expect(urgencyToRefreshInterval(0.6)).toBe(60 * 60_000);
		expect(urgencyToRefreshInterval(1.0)).toBe(60 * 60_000);
	});

	it("returns 2h for medium-high urgency", () => {
		expect(urgencyToRefreshInterval(0.4)).toBe(120 * 60_000);
		expect(urgencyToRefreshInterval(0.5)).toBe(120 * 60_000);
	});

	it("returns 6h for medium-low urgency", () => {
		expect(urgencyToRefreshInterval(0.2)).toBe(360 * 60_000);
		expect(urgencyToRefreshInterval(0.3)).toBe(360 * 60_000);
	});

	it("returns 12h for low urgency", () => {
		expect(urgencyToRefreshInterval(0)).toBe(720 * 60_000);
		expect(urgencyToRefreshInterval(0.1)).toBe(720 * 60_000);
	});
});

// --- urgencyToStalenessThreshold ---

describe("urgencyToStalenessThreshold()", () => {
	it("returns 60min for high urgency", () => {
		expect(urgencyToStalenessThreshold(0.6)).toBe(60);
	});

	it("returns 180min for medium urgency", () => {
		expect(urgencyToStalenessThreshold(0.3)).toBe(180);
	});

	it("returns 360min for low urgency", () => {
		expect(urgencyToStalenessThreshold(0)).toBe(360);
	});
});

// --- buildRefreshTargets ---

describe("buildRefreshTargets()", () => {
	it("returns empty for no inputs", () => {
		expect(buildRefreshTargets()).toEqual([]);
	});

	it("builds targets from configs with active tournaments", () => {
		const now = new Date("2026-02-26T12:00:00Z");
		const configs = [{
			filename: "esports-cs2-2026.json",
			config: {
				sport: "esports",
				name: "CS2",
				lastResearched: "2026-02-26T10:00:00Z",
				tournaments: [{
					id: "draculan-s5",
					startDate: "2026-02-24",
					endDate: "2026-02-28",
					focusTeam: "100 Thieves",
					bracket: {
						playoffs: {
							upperBracket: [{
								round: "R1",
								matches: [
									{ status: "completed", scheduledTime: "2026-02-25T10:00:00Z" },
									{ status: "scheduled", scheduledTime: "2026-02-26T14:00:00Z" },
								],
							}],
						},
					},
				}],
			},
		}];
		const targets = buildRefreshTargets({
			configs,
			userContext: { favoriteEsportsOrgs: ["100 Thieves"] },
			now,
		});
		expect(targets).toHaveLength(1);
		expect(targets[0].id).toBe("config:esports-cs2-2026.json:draculan-s5");
		expect(targets[0].hasFocusTeam).toBe(true);
		expect(targets[0].sport).toBe("esports");
		expect(targets[0].upcomingMatches).toHaveLength(1); // 14:00 is within 12h of 12:00
	});

	it("skips expired tournaments", () => {
		const now = new Date("2026-03-15T12:00:00Z");
		const configs = [{
			filename: "test.json",
			config: {
				sport: "esports",
				tournaments: [{
					id: "old",
					startDate: "2026-02-01",
					endDate: "2026-02-05",
					bracket: { playoffs: { upperBracket: [] } },
				}],
			},
		}];
		const targets = buildRefreshTargets({ configs, now });
		expect(targets).toHaveLength(0);
	});

	it("skips tournaments without bracket data", () => {
		const now = new Date("2026-02-26T12:00:00Z");
		const configs = [{
			filename: "test.json",
			config: {
				sport: "esports",
				tournaments: [{
					id: "no-bracket",
					startDate: "2026-02-24",
					endDate: "2026-02-28",
				}],
			},
		}];
		const targets = buildRefreshTargets({ configs, now });
		expect(targets).toHaveLength(0);
	});

	it("detects stale matches (scheduled but past)", () => {
		const now = new Date("2026-02-26T16:00:00Z");
		const configs = [{
			filename: "test.json",
			config: {
				sport: "esports",
				lastResearched: "2026-02-26T10:00:00Z",
				tournaments: [{
					id: "t1",
					startDate: "2026-02-24",
					endDate: "2026-02-28",
					bracket: {
						playoffs: {
							upperBracket: [{
								round: "R1",
								matches: [
									{ status: "scheduled", scheduledTime: "2026-02-26T11:00:00Z" }, // 5h ago
									{ status: "completed" },
								],
							}],
						},
					},
				}],
			},
		}];
		const targets = buildRefreshTargets({ configs, now });
		expect(targets[0].staleMatchCount).toBe(1);
	});

	it("builds targets from recipe registry", () => {
		const targets = buildRefreshTargets({
			recipeRegistry: {
				recipes: [
					{
						id: "liquipedia-cs2-matches",
						active: true,
						sport: "esports",
						lastRun: "2026-02-26T15:20:56Z",
						lastSuccess: null,
						consecutiveFailures: 13,
					},
					{
						id: "inactive-recipe",
						active: false,
						sport: "football",
					},
				],
			},
		});
		expect(targets).toHaveLength(1); // only active recipes
		expect(targets[0].id).toBe("recipe:liquipedia-cs2-matches");
		expect(targets[0].consecutiveFailures).toBe(13);
	});

	it("combines config and recipe targets", () => {
		const now = new Date("2026-02-26T12:00:00Z");
		const targets = buildRefreshTargets({
			configs: [{
				filename: "test.json",
				config: {
					sport: "esports",
					tournaments: [{
						id: "t1",
						startDate: "2026-02-24",
						endDate: "2026-02-28",
						bracket: { playoffs: { upperBracket: [] } },
					}],
				},
			}],
			recipeRegistry: {
				recipes: [{ id: "r1", active: true, sport: "esports" }],
			},
			now,
		});
		expect(targets).toHaveLength(2);
	});
});

// --- computeAllUrgencies ---

describe("computeAllUrgencies()", () => {
	it("returns sorted results highest urgency first", () => {
		const now = new Date();
		const targets = [
			makeTarget({ id: "low", lastRefreshed: now.toISOString() }),
			makeTarget({ id: "high", hasLiveMatches: true, hasFocusTeam: true }),
			makeTarget({ id: "medium", staleMatchCount: 2 }),
		];
		const results = computeAllUrgencies(targets, now);
		expect(results[0].id).toBe("high");
		expect(results[0].score).toBeGreaterThan(results[1].score);
		expect(results[results.length - 1].id).toBe("low");
	});

	it("returns empty for empty input", () => {
		expect(computeAllUrgencies([])).toEqual([]);
	});
});
