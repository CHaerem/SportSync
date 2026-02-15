import { describe, it, expect } from "vitest";
import { buildWatchPlan, scoreEventForWatchPlan } from "../scripts/lib/watch-plan.js";

const NOW = new Date("2026-02-14T18:00:00Z");

function makeEvent(overrides = {}) {
	return {
		sport: "football",
		title: "Team A vs Team B",
		tournament: "Premier League",
		time: new Date(NOW.getTime() + 30 * 60000).toISOString(), // 30min from now
		homeTeam: "Team A",
		awayTeam: "Team B",
		importance: 3,
		norwegian: false,
		tags: [],
		streaming: [],
		...overrides,
	};
}

const USER_CONTEXT = {
	favoriteTeams: ["Liverpool", "Barcelona", "Lyn"],
	favoritePlayers: ["Viktor Hovland", "Casper Ruud"],
	favoriteEsportsOrgs: ["100 Thieves"],
	sportPreferences: { football: "high", golf: "high", f1: "medium", tennis: "medium", chess: "medium", esports: "low" },
};

describe("scoreEventForWatchPlan() — extended", () => {
	it("gives higher score to Norwegian events", () => {
		const norwegian = scoreEventForWatchPlan(makeEvent({ norwegian: true }), NOW, USER_CONTEXT);
		const nonNorwegian = scoreEventForWatchPlan(makeEvent({ norwegian: false }), NOW, USER_CONTEXT);
		expect(norwegian.score).toBeGreaterThan(nonNorwegian.score);
		expect(norwegian.reasons).toContain("Norwegian interest");
	});

	it("gives higher score to must-watch tagged events", () => {
		const mustWatch = scoreEventForWatchPlan(makeEvent({ tags: ["must-watch"] }), NOW, USER_CONTEXT);
		const normal = scoreEventForWatchPlan(makeEvent({ tags: [] }), NOW, USER_CONTEXT);
		expect(mustWatch.score).toBeGreaterThan(normal.score);
		expect(mustWatch.reasons).toContain("Must-watch");
	});

	it("boosts events starting soon (within 2h)", () => {
		const soon = scoreEventForWatchPlan(makeEvent({ time: new Date(NOW.getTime() + 15 * 60000).toISOString() }), NOW, USER_CONTEXT);
		const later = scoreEventForWatchPlan(makeEvent({ time: new Date(NOW.getTime() + 5 * 3600000).toISOString() }), NOW, USER_CONTEXT);
		expect(soon.score).toBeGreaterThan(later.score);
		expect(soon.reasons).toContain("Starting soon");
	});

	it("boosts favorite teams", () => {
		const fav = scoreEventForWatchPlan(makeEvent({ homeTeam: "Liverpool", awayTeam: "Arsenal" }), NOW, USER_CONTEXT);
		const nonFav = scoreEventForWatchPlan(makeEvent({ homeTeam: "Arsenal", awayTeam: "Chelsea" }), NOW, USER_CONTEXT);
		expect(fav.score).toBeGreaterThan(nonFav.score);
		expect(fav.reasons).toContain("Favorite team");
	});

	it("boosts favorite players in golf", () => {
		const fav = scoreEventForWatchPlan(
			makeEvent({ sport: "golf", norwegianPlayers: [{ name: "Viktor Hovland" }] }),
			NOW, USER_CONTEXT
		);
		expect(fav.reasons).toContain("Favorite player");
	});

	it("boosts favorite esports orgs", () => {
		const fav = scoreEventForWatchPlan(
			makeEvent({ sport: "esports", title: "100 Thieves vs Cloud9" }),
			NOW, USER_CONTEXT
		);
		expect(fav.reasons).toContain("Favorite org");
	});

	it("applies sport preference weights", () => {
		const highPref = scoreEventForWatchPlan(makeEvent({ sport: "football" }), NOW, USER_CONTEXT);
		const lowPref = scoreEventForWatchPlan(makeEvent({ sport: "esports" }), NOW, USER_CONTEXT);
		expect(highPref.score).toBeGreaterThan(lowPref.score);
	});

	it("handles importance 1-5 range", () => {
		const imp1 = scoreEventForWatchPlan(makeEvent({ importance: 1 }), NOW, USER_CONTEXT);
		const imp5 = scoreEventForWatchPlan(makeEvent({ importance: 5 }), NOW, USER_CONTEXT);
		expect(imp5.score).toBeGreaterThan(imp1.score);
	});

	it("clamps importance outside 1-5 range", () => {
		const imp10 = scoreEventForWatchPlan(makeEvent({ importance: 10 }), NOW, USER_CONTEXT);
		const imp5 = scoreEventForWatchPlan(makeEvent({ importance: 5 }), NOW, USER_CONTEXT);
		// importance 10 is clamped to 5
		expect(imp10.score).toBe(imp5.score);
	});

	it("handles missing importance gracefully", () => {
		const noImp = scoreEventForWatchPlan(makeEvent({ importance: undefined }), NOW, USER_CONTEXT);
		expect(noImp.score).toBeGreaterThan(0);
	});

	it("handles missing userContext gracefully", () => {
		const result = scoreEventForWatchPlan(makeEvent(), NOW);
		expect(result.score).toBeGreaterThan(0);
		expect(result.reasons).toBeDefined();
	});

	it("classifies live events correctly", () => {
		const live = scoreEventForWatchPlan(
			makeEvent({ time: new Date(NOW.getTime() - 5 * 60000).toISOString() }),
			NOW, USER_CONTEXT
		);
		expect(live.reasons).toContain("Starting soon"); // -5min is in the -30 to 120 range
	});

	it("does not boost events far in the past", () => {
		const past = scoreEventForWatchPlan(
			makeEvent({ time: new Date(NOW.getTime() - 120 * 60000).toISOString() }),
			NOW, USER_CONTEXT
		);
		expect(past.reasons).not.toContain("Starting soon");
	});
});

describe("buildWatchPlan() — extended", () => {
	it("creates three watch windows (30, 60, 120 min)", () => {
		const plan = buildWatchPlan([], { now: NOW });
		expect(plan.windows).toHaveLength(3);
		expect(plan.windows.map((w) => w.windowMinutes)).toEqual([30, 60, 120]);
	});

	it("places event in correct time window", () => {
		const event45min = makeEvent({ time: new Date(NOW.getTime() + 45 * 60000).toISOString() });
		const plan = buildWatchPlan([event45min], { now: NOW, userContext: USER_CONTEXT });

		// 45min event should NOT be in 30min window, but should be in 60min and 120min
		expect(plan.windows[0].items).toHaveLength(0); // next-30
		expect(plan.windows[1].items).toHaveLength(1); // next-60
		expect(plan.windows[2].items).toHaveLength(1); // next-120
	});

	it("caps window items at 3", () => {
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent({ title: `Match ${i}`, time: new Date(NOW.getTime() + (i + 1) * 60000).toISOString() })
		);
		const plan = buildWatchPlan(events, { now: NOW, userContext: USER_CONTEXT });
		expect(plan.windows[0].items.length).toBeLessThanOrEqual(3);
	});

	it("sorts picks by score descending", () => {
		const events = [
			makeEvent({ title: "Low", importance: 1, homeTeam: "X", awayTeam: "Y" }),
			makeEvent({ title: "High", importance: 5, homeTeam: "Liverpool", awayTeam: "Z", tags: ["must-watch"], norwegian: true }),
		];
		const plan = buildWatchPlan(events, { now: NOW, userContext: USER_CONTEXT });
		expect(plan.picks[0].title).toBe("High");
	});

	it("excludes events more than 24h away", () => {
		const farEvent = makeEvent({ time: new Date(NOW.getTime() + 25 * 3600000).toISOString() });
		const plan = buildWatchPlan([farEvent], { now: NOW });
		expect(plan.picks).toHaveLength(0);
	});

	it("excludes events more than 90min in the past", () => {
		const pastEvent = makeEvent({ time: new Date(NOW.getTime() - 100 * 60000).toISOString() });
		const plan = buildWatchPlan([pastEvent], { now: NOW });
		expect(plan.picks).toHaveLength(0);
	});

	it("generates correct summary text", () => {
		const events = [makeEvent()];
		const plan = buildWatchPlan(events, { now: NOW, userContext: USER_CONTEXT });
		expect(plan.summary).toContain("1 priority picks");
	});

	it("generates empty summary when no events", () => {
		const plan = buildWatchPlan([], { now: NOW });
		expect(plan.summary).toContain("No high-priority events");
	});

	it("uses featured headline when available", () => {
		const plan = buildWatchPlan([], {
			now: NOW,
			featured: { blocks: [{ type: "headline", text: "Big day!" }] },
		});
		expect(plan.headline).toBe("Big day!");
	});

	it("falls back to event-line when no headline block", () => {
		const plan = buildWatchPlan([], {
			now: NOW,
			featured: { blocks: [{ type: "event-line", text: "Match at 21:00" }] },
		});
		expect(plan.headline).toBe("Match at 21:00");
	});

	it("uses default headline when no featured data", () => {
		const plan = buildWatchPlan([], { now: NOW });
		expect(plan.headline).toBe("Your AI-ranked watch plan");
	});

	it("plan items have correct structure", () => {
		const events = [makeEvent({ streaming: [{ platform: "Viaplay" }] })];
		const plan = buildWatchPlan(events, { now: NOW, userContext: USER_CONTEXT });
		const pick = plan.picks[0];

		expect(pick.id).toBeTruthy();
		expect(pick.title).toBe("Team A vs Team B");
		expect(pick.sport).toBe("football");
		expect(pick.tournament).toBe("Premier League");
		expect(pick.time).toBeTruthy();
		expect(pick.timeLabel).toBeTruthy();
		expect(pick.relativeStart).toBeTruthy();
		expect(typeof pick.importance).toBe("number");
		expect(typeof pick.norwegian).toBe("boolean");
		expect(Array.isArray(pick.streaming)).toBe(true);
		expect(typeof pick.score).toBe("number");
		expect(Array.isArray(pick.reasons)).toBe(true);
	});

	it("handles invalid event times gracefully", () => {
		const events = [
			makeEvent({ time: "not-a-date" }),
			makeEvent({ time: null }),
			makeEvent(), // valid
		];
		const plan = buildWatchPlan(events, { now: NOW, userContext: USER_CONTEXT });
		expect(plan.picks).toHaveLength(1); // only the valid one
	});

	it("handles non-array input gracefully", () => {
		const plan = buildWatchPlan(null, { now: NOW });
		expect(plan.picks).toEqual([]);
		expect(plan.windows).toHaveLength(3);
	});

	it("includes generatedAt and timezone", () => {
		const plan = buildWatchPlan([], { now: NOW });
		expect(plan.generatedAt).toBe(NOW.toISOString());
		expect(plan.timezone).toBe("Europe/Oslo");
	});
});
