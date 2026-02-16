import { describe, it, expect } from "vitest";
import { buildWatchPlan, scoreEventForWatchPlan, computeFeedbackAdjustments } from "../scripts/lib/watch-plan.js";

describe("scoreEventForWatchPlan()", () => {
	it("boosts favorite team and near-term events", () => {
		const now = new Date("2026-02-10T18:00:00Z");
		const event = {
			sport: "football",
			title: "Liverpool vs Chelsea",
			time: "2026-02-10T18:20:00Z",
			homeTeam: "Liverpool",
			awayTeam: "Chelsea",
			importance: 4,
			norwegian: false,
			tags: ["must-watch"],
		};
		const score = scoreEventForWatchPlan(event, now, {
			favoriteTeams: ["Liverpool"],
			favoritePlayers: [],
			favoriteEsportsOrgs: [],
			sportPreferences: { football: "high" },
		});

		expect(score.score).toBeGreaterThan(70);
		expect(score.reasons).toContain("Favorite team");
	});
});

describe("buildWatchPlan()", () => {
	it("creates watch windows and ranked picks", () => {
		const now = new Date("2026-02-10T18:00:00Z");
		const events = [
			{
				sport: "football",
				title: "Liverpool vs Chelsea",
				tournament: "Premier League",
				time: "2026-02-10T18:20:00Z",
				homeTeam: "Liverpool",
				awayTeam: "Chelsea",
				importance: 4,
				norwegian: false,
				streaming: [{ platform: "Viaplay" }],
				tags: ["must-watch"],
			},
			{
				sport: "golf",
				title: "Hovland Round 2",
				tournament: "PGA Tour",
				time: "2026-02-10T19:10:00Z",
				importance: 5,
				norwegian: true,
				norwegianPlayers: [{ name: "Viktor Hovland" }],
				streaming: [{ platform: "Eurosport" }],
				tags: ["major"],
			},
		];

		const plan = buildWatchPlan(events, {
			now,
			userContext: {
				favoriteTeams: ["Liverpool"],
				favoritePlayers: ["Viktor Hovland"],
				favoriteEsportsOrgs: [],
				sportPreferences: { football: "high", golf: "high" },
			},
			featured: { blocks: [{ type: "headline", text: "Tonight has two high-stakes moments." }] },
		});

		expect(plan.summary).toContain("priority picks");
		expect(plan.windows).toHaveLength(3);
		expect(plan.windows[0].id).toBe("next-30");
		expect(plan.picks.length).toBeGreaterThan(0);
		expect(plan.picks[0].title).toBeTruthy();
		expect(plan.headline).toBe("Tonight has two high-stakes moments.");
	});

	it("returns empty picks when there are no upcoming events", () => {
		const plan = buildWatchPlan([], { now: new Date("2026-02-10T18:00:00Z") });
		expect(plan.picks).toEqual([]);
		expect(plan.windows.every((w) => w.items.length === 0)).toBe(true);
	});

	it("caps picks at 3 even with many events", () => {
		const now = new Date("2026-02-10T18:00:00Z");
		const events = Array.from({ length: 10 }, (_, i) => ({
			sport: "football",
			title: `Match ${i + 1}`,
			tournament: "Premier League",
			time: new Date(now.getTime() + (i + 1) * 3600000).toISOString(),
			homeTeam: `Home ${i}`,
			awayTeam: `Away ${i}`,
			importance: 3,
			norwegian: false,
			tags: [],
		}));
		const plan = buildWatchPlan(events, { now });
		expect(plan.picks).toHaveLength(3);
	});

});

describe("computeFeedbackAdjustments()", () => {
	it("returns empty object for null/undefined input", () => {
		expect(computeFeedbackAdjustments(null)).toEqual({});
		expect(computeFeedbackAdjustments(undefined)).toEqual({});
	});

	it("computes positive adjustment for sport with all thumbs-up", () => {
		const feedback = {
			"football-match-1-2026-02-10t18:00:00z": { value: "up", timestamp: "2026-02-10T20:00:00Z" },
			"football-match-2-2026-02-10t20:00:00z": { value: "up", timestamp: "2026-02-10T22:00:00Z" },
		};
		const adj = computeFeedbackAdjustments(feedback);
		expect(adj.football).toBe(10);
	});

	it("computes negative adjustment for sport with all thumbs-down", () => {
		const feedback = {
			"golf-hovland-round-1-2026-02-10t12:00:00z": { value: "down", timestamp: "2026-02-10T14:00:00Z" },
		};
		const adj = computeFeedbackAdjustments(feedback);
		expect(adj.golf).toBe(-10);
	});

	it("computes mixed adjustment correctly", () => {
		const feedback = {
			"football-match-a-2026-02-10t18:00:00z": { value: "up", timestamp: "2026-02-10T20:00:00Z" },
			"football-match-b-2026-02-10t20:00:00z": { value: "down", timestamp: "2026-02-10T22:00:00Z" },
			"football-match-c-2026-02-10t21:00:00z": { value: "up", timestamp: "2026-02-10T23:00:00Z" },
		};
		const adj = computeFeedbackAdjustments(feedback);
		// 2 up, 1 down => ratio = 1/3 => round(3.33) = 3
		expect(adj.football).toBe(3);
	});

	it("handles multiple sports independently", () => {
		const feedback = {
			"football-match-2026-02-10t18:00:00z": { value: "up", timestamp: "2026-02-10T20:00:00Z" },
			"golf-hovland-2026-02-10t12:00:00z": { value: "down", timestamp: "2026-02-10T14:00:00Z" },
		};
		const adj = computeFeedbackAdjustments(feedback);
		expect(adj.football).toBe(10);
		expect(adj.golf).toBe(-10);
	});

	it("skips entries with no value", () => {
		const feedback = {
			"football-match-2026-02-10t18:00:00z": { timestamp: "2026-02-10T20:00:00Z" },
		};
		const adj = computeFeedbackAdjustments(feedback);
		expect(adj).toEqual({});
	});
});

describe("scoreEventForWatchPlan() with feedback adjustments", () => {
	it("boosts score for sport with positive feedback", () => {
		const now = new Date("2026-02-10T18:00:00Z");
		const event = {
			sport: "football",
			title: "Test Match",
			time: "2026-02-10T18:20:00Z",
			homeTeam: "TeamA",
			awayTeam: "TeamB",
			importance: 3,
			tags: [],
		};
		const base = scoreEventForWatchPlan(event, now, {});
		const boosted = scoreEventForWatchPlan(event, now, {
			_feedbackAdjustments: { football: 10 },
		});
		expect(boosted.score).toBe(base.score + 10);
		expect(boosted.reasons).toContain("Liked sport");
	});

	it("penalizes score for sport with negative feedback", () => {
		const now = new Date("2026-02-10T18:00:00Z");
		const event = {
			sport: "golf",
			title: "PGA Event",
			time: "2026-02-10T18:20:00Z",
			importance: 3,
			tags: [],
		};
		const base = scoreEventForWatchPlan(event, now, {});
		const penalized = scoreEventForWatchPlan(event, now, {
			_feedbackAdjustments: { golf: -10 },
		});
		expect(penalized.score).toBe(base.score - 10);
		expect(penalized.reasons).not.toContain("Liked sport");
	});
});
