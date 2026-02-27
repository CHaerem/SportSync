import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock helpers before importing the module
vi.mock("../scripts/lib/helpers.js", async () => {
	const actual = await vi.importActual("../scripts/lib/helpers.js");
	return {
		...actual,
		fetchJson: vi.fn(),
	};
});

const { fetchJson } = await import("../scripts/lib/helpers.js");
const {
	fetchFootballStandings,
	fetchGolfLeaderboard,
	fetchF1Standings,
	fetchTennisRankings,
} = await import("../scripts/fetch-standings.js");

// Also test buildStandingsContext from generate-featured
const { buildStandingsContext } = await import("../scripts/generate-featured.js");

// --- Mock data ---

const mockFootballResponse = {
	children: [{
		standings: {
			entries: [
				{
					team: { displayName: "Arsenal", abbreviation: "ARS" },
					stats: [
						{ name: "rank", value: 1 },
						{ name: "gamesPlayed", value: 25 },
						{ name: "wins", value: 18 },
						{ name: "ties", value: 4 },
						{ name: "losses", value: 3 },
						{ name: "pointDifferential", value: 32 },
						{ name: "points", value: 58 },
					],
				},
				{
					team: { displayName: "Liverpool", abbreviation: "LIV" },
					stats: [
						{ name: "rank", value: 2 },
						{ name: "gamesPlayed", value: 25 },
						{ name: "wins", value: 17 },
						{ name: "ties", value: 5 },
						{ name: "losses", value: 3 },
						{ name: "pointDifferential", value: 28 },
						{ name: "points", value: 56 },
					],
				},
			],
		},
	}],
};

const mockGolfResponse = {
	events: [{
		name: "AT&T Pebble Beach Pro-Am",
		status: { type: { name: "STATUS_IN_PROGRESS" } },
		competitions: [{
			competitors: [
				{
					id: "9780",
					order: 1,
					athlete: { displayName: "Scottie Scheffler" },
					score: "-12",
					linescores: [{ displayValue: "-4" }],
				},
				{
					id: "3470",
					order: 2,
					athlete: { displayName: "Rory McIlroy" },
					score: "-10",
					linescores: [{ displayValue: "-3" }],
				},
			],
		}],
	}],
};

const mockF1Response = {
	children: [{
		standings: {
			entries: [
				{
					athlete: { displayName: "Max Verstappen" },
					team: { displayName: "Red Bull Racing" },
					stats: [
						{ name: "rank", value: 1 },
						{ name: "championshipPts", value: 51 },
						{ name: "wins", value: 2 },
					],
				},
				{
					athlete: { displayName: "Lando Norris" },
					team: { displayName: "McLaren" },
					stats: [
						{ name: "rank", value: 2 },
						{ name: "championshipPts", value: 42 },
						{ name: "wins", value: 1 },
					],
				},
			],
		},
	}],
};

beforeEach(() => {
	vi.resetAllMocks();
});

describe("fetchFootballStandings()", () => {
	it("parses ESPN football standings correctly", async () => {
		fetchJson.mockResolvedValue(mockFootballResponse);
		const result = await fetchFootballStandings();

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			position: 1,
			team: "Arsenal",
			teamShort: "ARS",
			played: 25,
			won: 18,
			drawn: 4,
			lost: 3,
			gd: 32,
			points: 58,
		});
		expect(result[1].team).toBe("Liverpool");
	});

	it("returns empty array when data structure is missing", async () => {
		fetchJson.mockResolvedValue({});
		const result = await fetchFootballStandings();
		expect(result).toEqual([]);
	});

	it("sorts by position", async () => {
		const reversed = {
			children: [{
				standings: {
					entries: [
						mockFootballResponse.children[0].standings.entries[1],
						mockFootballResponse.children[0].standings.entries[0],
					],
				},
			}],
		};
		fetchJson.mockResolvedValue(reversed);
		const result = await fetchFootballStandings();
		expect(result[0].position).toBe(1);
		expect(result[1].position).toBe(2);
	});
});

describe("fetchGolfLeaderboard()", () => {
	it("parses ESPN golf scoreboard correctly", async () => {
		fetchJson.mockResolvedValue(mockGolfResponse);
		const result = await fetchGolfLeaderboard();

		expect(result.pga).toBeDefined();
		expect(result.pga.name).toBe("AT&T Pebble Beach Pro-Am");
		expect(result.pga.status).toBe("in_progress");
		expect(result.pga.leaderboard).toHaveLength(2);
		expect(result.pga.leaderboard[0]).toEqual({
			position: 1,
			positionDisplay: null,
			player: "Scottie Scheffler",
			score: "-12",
			today: "-4",
			thru: "-",
			headshot: "https://a.espncdn.com/i/headshots/golf/players/full/9780.png",
		});
		expect(result.pga.trackedPlayers).toEqual([]);
		expect(result.pga.headshots).toEqual({
			"Scottie Scheffler": "https://a.espncdn.com/i/headshots/golf/players/full/9780.png",
			"Rory McIlroy": "https://a.espncdn.com/i/headshots/golf/players/full/3470.png",
		});
	});

	it("handles missing event gracefully", async () => {
		fetchJson.mockResolvedValue({ events: [] });
		const result = await fetchGolfLeaderboard();
		expect(result.pga.status).toBe("no_event");
		expect(result.pga.leaderboard).toEqual([]);
		expect(result.pga.trackedPlayers).toEqual([]);
	});

	it("handles fetch errors gracefully", async () => {
		fetchJson.mockRejectedValue(new Error("Network error"));
		const result = await fetchGolfLeaderboard();
		expect(result.pga.status).toBe("error");
		expect(result.dpWorld.status).toBe("error");
	});

	it("includes tracked Norwegian players outside top 15", async () => {
		// Build a competitor list with a Norwegian player at position 25
		const competitors = [];
		for (let i = 1; i <= 25; i++) {
			const isVentura = i === 25;
			competitors.push({
				id: String(1000 + i),
				order: i,
				athlete: { displayName: isVentura ? "Kris Ventura" : `Player ${i}` },
				score: isVentura ? "E" : `-${25 - i}`,
				status: { position: { displayName: isVentura ? "T25" : String(i) } },
				linescores: [{ displayValue: "-" }],
			});
		}
		fetchJson.mockResolvedValue({
			events: [{
				name: "Test Tournament",
				status: { type: { name: "STATUS_IN_PROGRESS" } },
				competitions: [{ competitors }],
			}],
		});

		const result = await fetchGolfLeaderboard();

		// Top 15 should not include Ventura
		expect(result.pga.leaderboard).toHaveLength(15);
		expect(result.pga.leaderboard.find(p => p.player === "Kris Ventura")).toBeUndefined();

		// But trackedPlayers should include Ventura
		expect(result.pga.trackedPlayers.length).toBeGreaterThanOrEqual(1);
		const ventura = result.pga.trackedPlayers.find(p => p.player === "Kris Ventura");
		expect(ventura).toBeDefined();
		expect(ventura.tracked).toBe(true);
		expect(ventura.score).toBe("E");
		expect(ventura.positionDisplay).toBe("T25");
	});

	it("marks tracked players within top 15 with tracked flag", async () => {
		const competitors = [
			{
				id: "123",
				order: 1,
				athlete: { displayName: "Kristoffer Reitan" },
				score: "-4",
				status: { position: { displayName: "T3" } },
				linescores: [{ displayValue: "67" }],
			},
			{
				id: "456",
				order: 2,
				athlete: { displayName: "Some Player" },
				score: "-3",
				linescores: [{ displayValue: "68" }],
			},
		];
		fetchJson.mockResolvedValue({
			events: [{
				name: "Test Tournament",
				status: { type: { name: "STATUS_IN_PROGRESS" } },
				competitions: [{ competitors }],
			}],
		});

		const result = await fetchGolfLeaderboard();
		const reitan = result.pga.leaderboard.find(p => p.player === "Kristoffer Reitan");
		expect(reitan).toBeDefined();
		expect(reitan.tracked).toBe(true);
		expect(reitan.positionDisplay).toBe("T3");

		// Non-tracked player should not have tracked flag
		const other = result.pga.leaderboard.find(p => p.player === "Some Player");
		expect(other.tracked).toBeUndefined();
	});
});

describe("fetchF1Standings()", () => {
	it("parses ESPN F1 standings correctly", async () => {
		fetchJson.mockResolvedValue(mockF1Response);
		const result = await fetchF1Standings();

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			position: 1,
			driver: "Max Verstappen",
			team: "Red Bull Racing",
			points: 51,
			wins: 2,
		});
	});

	it("returns empty array when data structure is missing", async () => {
		fetchJson.mockResolvedValue({});
		const result = await fetchF1Standings();
		expect(result).toEqual([]);
	});
});

const mockTennisResponse = {
	children: [{
		standings: {
			entries: [
				{
					athlete: { displayName: "Jannik Sinner" },
					team: { displayName: "Jannik Sinner", abbreviation: "ITA" },
					stats: [
						{ name: "rank", value: 1 },
						{ name: "points", value: 11830 },
					],
				},
				{
					athlete: { displayName: "Alexander Zverev" },
					team: { displayName: "Alexander Zverev", abbreviation: "GER" },
					stats: [
						{ name: "rank", value: 2 },
						{ name: "points", value: 8135 },
					],
				},
				{
					athlete: { displayName: "Casper Ruud" },
					team: { displayName: "Casper Ruud", abbreviation: "NOR" },
					stats: [
						{ name: "rank", value: 6 },
						{ name: "points", value: 5050 },
					],
				},
			],
		},
	}],
};

describe("fetchTennisRankings()", () => {
	it("parses ESPN tennis rankings correctly", async () => {
		fetchJson.mockResolvedValue(mockTennisResponse);
		const result = await fetchTennisRankings();

		expect(result.atp).toBeDefined();
		expect(result.atp).toHaveLength(3);
		expect(result.atp[0]).toEqual({
			position: 1,
			player: "Jannik Sinner",
			country: "ITA",
			points: 11830,
		});
		expect(result.atp[2].player).toBe("Casper Ruud");
	});

	it("returns empty arrays when data structure is missing", async () => {
		fetchJson.mockResolvedValue({});
		const result = await fetchTennisRankings();
		expect(result.atp).toEqual([]);
	});

	it("sorts by position", async () => {
		const reversed = {
			children: [{
				standings: {
					entries: [
						mockTennisResponse.children[0].standings.entries[2],
						mockTennisResponse.children[0].standings.entries[0],
						mockTennisResponse.children[0].standings.entries[1],
					],
				},
			}],
		};
		fetchJson.mockResolvedValue(reversed);
		const result = await fetchTennisRankings();
		expect(result.atp[0].position).toBe(1);
		expect(result.atp[1].position).toBe(2);
		expect(result.atp[2].position).toBe(6);
	});

	it("handles fetch errors gracefully", async () => {
		fetchJson.mockRejectedValue(new Error("Network error"));
		const result = await fetchTennisRankings();
		expect(result.atp).toEqual([]);
		expect(result.wta).toEqual([]);
	});

	it("caps at 20 players", async () => {
		const manyEntries = {
			children: [{
				standings: {
					entries: Array.from({ length: 50 }, (_, i) => ({
						athlete: { displayName: `Player ${i + 1}` },
						team: { abbreviation: "TST" },
						stats: [
							{ name: "rank", value: i + 1 },
							{ name: "points", value: 10000 - i * 100 },
						],
					})),
				},
			}],
		};
		fetchJson.mockResolvedValue(manyEntries);
		const result = await fetchTennisRankings();
		expect(result.atp).toHaveLength(20);
	});
});

describe("standings.json output shape", () => {
	it("should have the expected top-level structure", async () => {
		fetchJson.mockResolvedValue(mockFootballResponse);
		const football = await fetchFootballStandings();

		fetchJson.mockResolvedValue(mockGolfResponse);
		const golf = await fetchGolfLeaderboard();

		fetchJson.mockResolvedValue(mockF1Response);
		const f1 = await fetchF1Standings();

		const standings = {
			lastUpdated: new Date().toISOString(),
			football: { premierLeague: football },
			golf,
			f1: { drivers: f1 },
		};

		expect(standings).toHaveProperty("lastUpdated");
		expect(standings).toHaveProperty("football.premierLeague");
		expect(standings).toHaveProperty("golf.pga");
		expect(standings).toHaveProperty("golf.dpWorld");
		expect(standings).toHaveProperty("f1.drivers");
		expect(Array.isArray(standings.football.premierLeague)).toBe(true);
		expect(Array.isArray(standings.f1.drivers)).toBe(true);
	});
});

describe("buildStandingsContext()", () => {
	it("returns empty string for null standings", () => {
		expect(buildStandingsContext(null)).toBe("");
	});

	it("returns empty string for empty standings", () => {
		expect(buildStandingsContext({})).toBe("");
	});

	it("formats PL standings correctly", () => {
		const standings = {
			football: {
				premierLeague: [
					{ position: 1, team: "Arsenal", teamShort: "ARS", played: 25, won: 18, drawn: 4, lost: 3, gd: 32, points: 58 },
				],
			},
		};
		const result = buildStandingsContext(standings);
		expect(result).toContain("Premier League standings");
		expect(result).toContain("Arsenal");
		expect(result).toContain("58pts");
	});

	it("formats golf leaderboard correctly", () => {
		const standings = {
			golf: {
				pga: {
					name: "Pebble Beach",
					status: "in_progress",
					leaderboard: [
						{ position: 1, player: "Scheffler", score: "-12" },
					],
				},
			},
		};
		const result = buildStandingsContext(standings);
		expect(result).toContain("PGA Tour");
		expect(result).toContain("Scheffler");
	});

	it("formats F1 standings correctly", () => {
		const standings = {
			f1: {
				drivers: [
					{ position: 1, driver: "Verstappen", team: "Red Bull", points: 51, wins: 2 },
				],
			},
		};
		const result = buildStandingsContext(standings);
		expect(result).toContain("F1 Driver Standings");
		expect(result).toContain("Verstappen");
	});

	it("formats tennis ATP rankings correctly", () => {
		const standings = {
			tennis: {
				atp: [
					{ position: 1, player: "Jannik Sinner", country: "ITA", points: 11830 },
					{ position: 6, player: "Casper Ruud", country: "NOR", points: 5050 },
				],
			},
		};
		const result = buildStandingsContext(standings);
		expect(result).toContain("ATP Rankings");
		expect(result).toContain("Jannik Sinner");
		expect(result).toContain("Casper Ruud");
		expect(result).toContain("11830pts");
	});
});
