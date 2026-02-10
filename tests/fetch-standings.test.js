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
					order: 1,
					athlete: { displayName: "Scottie Scheffler" },
					score: "-12",
					linescores: [{ displayValue: "-4" }],
				},
				{
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
			player: "Scottie Scheffler",
			score: "-12",
			today: "-4",
			thru: "-",
		});
	});

	it("handles missing event gracefully", async () => {
		fetchJson.mockResolvedValue({ events: [] });
		const result = await fetchGolfLeaderboard();
		expect(result.pga.status).toBe("no_event");
		expect(result.pga.leaderboard).toEqual([]);
	});

	it("handles fetch errors gracefully", async () => {
		fetchJson.mockRejectedValue(new Error("Network error"));
		const result = await fetchGolfLeaderboard();
		expect(result.pga.status).toBe("error");
		expect(result.dpWorld.status).toBe("error");
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
});
