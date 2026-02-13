import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock helpers before importing the module
vi.mock("../scripts/lib/helpers.js", async () => {
	const actual = await vi.importActual("../scripts/lib/helpers.js");
	return {
		...actual,
		fetchJson: vi.fn(),
		readJsonIfExists: vi.fn().mockReturnValue(null),
	};
});

const { fetchJson, readJsonIfExists } = await import("../scripts/lib/helpers.js");
const {
	fetchFootballResults,
	fetchGolfResults,
	matchRssHeadline,
	mergeFootballResults,
} = await import("../scripts/fetch-results.js");

// Also test buildResultsContext from generate-featured
const { buildResultsContext } = await import("../scripts/generate-featured.js");

// --- Mock data ---

const mockCompletedMatch = {
	events: [{
		date: "2026-02-12T20:00Z",
		competitions: [{
			status: { type: { state: "post" } },
			competitors: [
				{
					homeAway: "home",
					team: { id: "1", displayName: "Arsenal" },
					score: "2",
				},
				{
					homeAway: "away",
					team: { id: "2", displayName: "Liverpool" },
					score: "1",
				},
			],
			details: [
				{
					type: { text: "Goal - Normal" },
					clock: { displayValue: "23'" },
					athletesInvolved: [{ displayName: "Saka" }],
					team: { id: "1" },
				},
				{
					type: { text: "Goal - Normal" },
					clock: { displayValue: "55'" },
					athletesInvolved: [{ displayName: "Salah" }],
					team: { id: "2" },
				},
				{
					type: { text: "Goal - Normal" },
					clock: { displayValue: "78'" },
					athletesInvolved: [{ displayName: "Havertz" }],
					team: { id: "1" },
				},
			],
			venue: { fullName: "Emirates Stadium" },
		}],
	}],
};

const mockPreMatch = {
	events: [{
		date: "2026-02-13T20:00Z",
		competitions: [{
			status: { type: { state: "pre" } },
			competitors: [
				{ homeAway: "home", team: { displayName: "Chelsea" }, score: "0" },
				{ homeAway: "away", team: { displayName: "Tottenham" }, score: "0" },
			],
		}],
	}],
};

const mockInProgressMatch = {
	events: [{
		date: "2026-02-13T20:00Z",
		competitions: [{
			status: { type: { state: "in" } },
			competitors: [
				{ homeAway: "home", team: { displayName: "Man City" }, score: "1" },
				{ homeAway: "away", team: { displayName: "Man United" }, score: "0" },
			],
		}],
	}],
};

const mockGolfFinal = {
	events: [{
		name: "AT&T Pebble Beach Pro-Am",
		date: "2026-02-12T00:00Z",
		status: { type: { name: "STATUS_FINAL" } },
		competitions: [{
			competitors: [
				{
					order: 1,
					athlete: { displayName: "Scottie Scheffler" },
					score: "-16",
					linescores: [{ displayValue: "65" }, { displayValue: "68" }, { displayValue: "66" }, { displayValue: "67" }],
					status: { position: { displayName: "1" } },
				},
				{
					order: 2,
					athlete: { displayName: "Rory McIlroy" },
					score: "-14",
					linescores: [{ displayValue: "67" }, { displayValue: "66" }, { displayValue: "69" }, { displayValue: "68" }],
					status: { position: { displayName: "2" } },
				},
				{
					order: 22,
					athlete: { displayName: "Viktor Hovland" },
					score: "-8",
					linescores: [{ displayValue: "70" }, { displayValue: "70" }, { displayValue: "69" }, { displayValue: "71" }],
					status: { position: { displayName: "22" } },
				},
			],
		}],
	}],
};

const mockGolfScheduled = {
	events: [{
		name: "Future Event",
		date: "2026-02-20T00:00Z",
		status: { type: { name: "STATUS_SCHEDULED" } },
		competitions: [{ competitors: [] }],
	}],
};

const mockUserContext = {
	favoriteTeams: ["Barcelona", "Lyn"],
	favoritePlayers: ["Viktor Hovland", "Casper Ruud"],
};

beforeEach(() => {
	vi.resetAllMocks();
	readJsonIfExists.mockReturnValue(null);
});

describe("fetchFootballResults()", () => {
	it("parses completed matches correctly", async () => {
		fetchJson.mockResolvedValue(mockCompletedMatch);
		const results = await fetchFootballResults({ daysBack: 1, userContext: {} });

		expect(results).toHaveLength(1);
		expect(results[0].homeTeam).toBe("Arsenal");
		expect(results[0].awayTeam).toBe("Liverpool");
		expect(results[0].homeScore).toBe(2);
		expect(results[0].awayScore).toBe(1);
		expect(results[0].venue).toBe("Emirates Stadium");
		expect(results[0].league).toBe("Premier League");
	});

	it("extracts goal scorers", async () => {
		fetchJson.mockResolvedValue(mockCompletedMatch);
		const results = await fetchFootballResults({ daysBack: 1, userContext: {} });

		expect(results[0].goalScorers).toHaveLength(3);
		expect(results[0].goalScorers[0]).toEqual({
			player: "Saka",
			team: "Arsenal",
			minute: "23'",
		});
		expect(results[0].goalScorers[2].player).toBe("Havertz");
	});

	it("skips pre-match and in-progress events", async () => {
		fetchJson
			.mockResolvedValueOnce(mockPreMatch)
			.mockResolvedValueOnce(mockInProgressMatch);
		const results = await fetchFootballResults({ daysBack: 1, userContext: {} });
		expect(results).toHaveLength(0);
	});

	it("returns empty array on error", async () => {
		fetchJson.mockRejectedValue(new Error("Network error"));
		const results = await fetchFootballResults({ daysBack: 1, userContext: {} });
		expect(results).toEqual([]);
	});

	it("deduplicates matches across date queries", async () => {
		// Same match returned for two different date queries
		fetchJson.mockResolvedValue(mockCompletedMatch);
		const results = await fetchFootballResults({ daysBack: 2, userContext: {} });

		// Despite 2 days × 2 leagues = 4 calls all returning same match, only 1 result
		const arsenalMatches = results.filter(r => r.homeTeam === "Arsenal");
		expect(arsenalMatches).toHaveLength(1);
	});

	it("marks favorite teams from user-context", async () => {
		const mockBarcaMatch = {
			events: [{
				date: "2026-02-12T21:00Z",
				competitions: [{
					status: { type: { state: "post" } },
					competitors: [
						{ homeAway: "home", team: { id: "3", displayName: "Barcelona" }, score: "3" },
						{ homeAway: "away", team: { id: "4", displayName: "Atlético Madrid" }, score: "1" },
					],
					details: [],
				}],
			}],
		};

		fetchJson
			.mockResolvedValueOnce(mockCompletedMatch) // PL
			.mockResolvedValueOnce(mockBarcaMatch) // La Liga
			.mockResolvedValueOnce({ events: [] })
			.mockResolvedValueOnce({ events: [] });

		const results = await fetchFootballResults({ daysBack: 1, userContext: mockUserContext });

		const barca = results.find(r => r.homeTeam === "Barcelona");
		expect(barca.isFavorite).toBe(true);

		const arsenal = results.find(r => r.homeTeam === "Arsenal");
		expect(arsenal.isFavorite).toBe(false);
	});

	it("sorts favorites first", async () => {
		const mockBarcaMatch = {
			events: [{
				date: "2026-02-12T21:00Z",
				competitions: [{
					status: { type: { state: "post" } },
					competitors: [
						{ homeAway: "home", team: { id: "3", displayName: "Barcelona" }, score: "3" },
						{ homeAway: "away", team: { id: "4", displayName: "Atlético Madrid" }, score: "1" },
					],
					details: [],
				}],
			}],
		};

		fetchJson
			.mockResolvedValueOnce(mockCompletedMatch)
			.mockResolvedValueOnce(mockBarcaMatch)
			.mockResolvedValueOnce({ events: [] })
			.mockResolvedValueOnce({ events: [] });

		const results = await fetchFootballResults({ daysBack: 1, userContext: mockUserContext });
		expect(results[0].homeTeam).toBe("Barcelona");
		expect(results[0].isFavorite).toBe(true);
	});
});

describe("fetchGolfResults()", () => {
	it("parses final tournament correctly", async () => {
		fetchJson.mockResolvedValue(mockGolfFinal);
		const result = await fetchGolfResults({ userContext: mockUserContext });

		expect(result.pga).toBeDefined();
		expect(result.pga.tournamentName).toBe("AT&T Pebble Beach Pro-Am");
		expect(result.pga.status).toBe("final");
		expect(result.pga.completedRound).toBe(4);
		expect(result.pga.topPlayers).toHaveLength(3); // only 3 competitors in mock
		expect(result.pga.topPlayers[0].player).toBe("Scottie Scheffler");
		expect(result.pga.topPlayers[0].score).toBe("-16");
	});

	it("finds Norwegian/favorite players", async () => {
		fetchJson.mockResolvedValue(mockGolfFinal);
		const result = await fetchGolfResults({ userContext: mockUserContext });

		expect(result.pga.norwegianPlayers).toHaveLength(1);
		expect(result.pga.norwegianPlayers[0].player).toBe("Viktor Hovland");
		expect(result.pga.norwegianPlayers[0].score).toBe("-8");
	});

	it("returns null for scheduled tournaments", async () => {
		fetchJson.mockResolvedValue(mockGolfScheduled);
		const result = await fetchGolfResults({ userContext: {} });

		expect(result.pga).toBeNull();
	});

	it("returns null when no events", async () => {
		fetchJson.mockResolvedValue({ events: [] });
		const result = await fetchGolfResults({ userContext: {} });

		expect(result.pga).toBeNull();
	});

	it("handles fetch errors gracefully", async () => {
		fetchJson.mockRejectedValue(new Error("Network error"));
		const result = await fetchGolfResults({ userContext: {} });

		expect(result.pga).toBeNull();
		expect(result.dpWorld).toBeNull();
	});
});

describe("matchRssHeadline()", () => {
	const rssItems = [
		{ title: "Arsenal edge past Liverpool in thrilling 2-1 win" },
		{ title: "Barcelona cruise to victory over Atlético Madrid" },
		{ title: "Golf roundup: Scheffler wins at Pebble Beach" },
	];

	it("matches both team names case-insensitively", () => {
		const result = matchRssHeadline("Arsenal", "Liverpool", rssItems);
		expect(result).toBe("Arsenal edge past Liverpool in thrilling 2-1 win");
	});

	it("matches Barcelona with different casing", () => {
		const result = matchRssHeadline("Barcelona", "Atlético Madrid", rssItems);
		expect(result).toBe("Barcelona cruise to victory over Atlético Madrid");
	});

	it("returns null when no match", () => {
		const result = matchRssHeadline("Chelsea", "Tottenham", rssItems);
		expect(result).toBeNull();
	});

	it("returns null for null inputs", () => {
		expect(matchRssHeadline(null, "Liverpool", rssItems)).toBeNull();
		expect(matchRssHeadline("Arsenal", null, rssItems)).toBeNull();
		expect(matchRssHeadline("Arsenal", "Liverpool", null)).toBeNull();
	});

	it("matches short names (strips FC suffix)", () => {
		const items = [{ title: "Arsenal beat Liverpool in PL clash" }];
		const result = matchRssHeadline("Arsenal FC", "Liverpool FC", items);
		expect(result).toBe("Arsenal beat Liverpool in PL clash");
	});
});

describe("mergeFootballResults()", () => {
	it("merges fresh results with existing", () => {
		const existing = [
			{ homeTeam: "Chelsea", awayTeam: "Spurs", date: new Date().toISOString(), homeScore: 1, awayScore: 0 },
		];
		const fresh = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", date: new Date().toISOString(), homeScore: 2, awayScore: 1 },
		];
		const merged = mergeFootballResults(existing, fresh);
		expect(merged).toHaveLength(2);
	});

	it("deduplicates by match key", () => {
		const date = new Date().toISOString();
		const existing = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", date, homeScore: 2, awayScore: 1 },
		];
		const fresh = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", date, homeScore: 2, awayScore: 1, goalScorers: ["Saka"] },
		];
		const merged = mergeFootballResults(existing, fresh);
		expect(merged).toHaveLength(1);
		// Fresh data should override
		expect(merged[0].goalScorers).toEqual(["Saka"]);
	});

	it("prunes results older than retainDays (default 7)", () => {
		const oldDate = new Date(Date.now() - 10 * 86400000).toISOString(); // 10 days ago
		const recentDate = new Date().toISOString();
		const existing = [
			{ homeTeam: "Chelsea", awayTeam: "Spurs", date: oldDate, homeScore: 1, awayScore: 0 },
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", date: recentDate, homeScore: 2, awayScore: 1 },
		];
		const merged = mergeFootballResults(existing, []);
		expect(merged).toHaveLength(1);
		expect(merged[0].homeTeam).toBe("Arsenal");
	});

	it("supports custom retainDays parameter", () => {
		const oldDate = new Date(Date.now() - 5 * 86400000).toISOString(); // 5 days ago
		const recentDate = new Date().toISOString();
		const existing = [
			{ homeTeam: "Chelsea", awayTeam: "Spurs", date: oldDate, homeScore: 1, awayScore: 0 },
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", date: recentDate, homeScore: 2, awayScore: 1 },
		];
		const merged = mergeFootballResults(existing, [], 3);
		expect(merged).toHaveLength(1);
		expect(merged[0].homeTeam).toBe("Arsenal");
	});

	it("handles null existing gracefully", () => {
		const fresh = [
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", date: new Date().toISOString(), homeScore: 2, awayScore: 1 },
		];
		const merged = mergeFootballResults(null, fresh);
		expect(merged).toHaveLength(1);
	});
});

describe("buildResultsContext()", () => {
	it("returns empty string for null results", () => {
		expect(buildResultsContext(null)).toBe("");
	});

	it("returns empty string for empty results", () => {
		expect(buildResultsContext({ football: [], golf: { pga: null, dpWorld: null } })).toBe("");
	});

	it("formats football results correctly", () => {
		const results = {
			football: [
				{
					homeTeam: "Arsenal",
					awayTeam: "Liverpool",
					homeScore: 2,
					awayScore: 1,
					date: "2026-02-12T20:00Z",
					league: "Premier League",
					recapHeadline: "Arsenal edge past Liverpool",
				},
			],
			golf: { pga: null, dpWorld: null },
		};
		const context = buildResultsContext(results);
		expect(context).toContain("Arsenal 2-1 Liverpool");
		expect(context).toContain("PL");
		expect(context).toContain("Arsenal edge past Liverpool");
	});

	it("formats golf results correctly", () => {
		const results = {
			football: [],
			golf: {
				pga: {
					tournamentName: "Pebble Beach",
					status: "final",
					completedRound: 4,
					topPlayers: [{ position: 1, player: "Scheffler", score: "-16" }],
					norwegianPlayers: [{ position: 22, player: "Hovland", score: "-8" }],
				},
				dpWorld: null,
			},
		};
		const context = buildResultsContext(results);
		expect(context).toContain("PGA");
		expect(context).toContain("Pebble Beach");
		expect(context).toContain("Scheffler");
		expect(context).toContain("Hovland");
	});
});
