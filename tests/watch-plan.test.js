import { describe, it, expect } from "vitest";
import { buildWatchPlan, scoreEventForWatchPlan } from "../scripts/lib/watch-plan.js";

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
});
