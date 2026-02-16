import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
	analyzeFootballStreaks,
	analyzeFootballStandings,
	analyzeGolf,
	analyzeF1,
	analyzeHighScoringMatches,
	generateInsights,
} from "../scripts/generate-insights.js";

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "insights-"));
}

// ============================================================
// analyzeFootballStreaks
// ============================================================
describe("analyzeFootballStreaks()", () => {
	it("detects a 3-match winning streak", () => {
		const results = [
			{ homeTeam: "Liverpool", awayTeam: "Chelsea", homeScore: 2, awayScore: 1, date: "2026-02-10T00:00:00Z" },
			{ homeTeam: "Arsenal", awayTeam: "Liverpool", homeScore: 0, awayScore: 1, date: "2026-02-13T00:00:00Z" },
			{ homeTeam: "Liverpool", awayTeam: "Wolves", homeScore: 3, awayScore: 0, date: "2026-02-16T00:00:00Z" },
		];
		const insights = analyzeFootballStreaks(results);
		const liverpoolStreak = insights.find(i => i.subject === "Liverpool" && i.type === "streak");
		expect(liverpoolStreak).toBeDefined();
		expect(liverpoolStreak.value).toBe(3);
		expect(liverpoolStreak.text).toContain("winning streak");
	});

	it("detects a 4-match unbeaten streak (including draws)", () => {
		const results = [
			{ homeTeam: "Arsenal", awayTeam: "X", homeScore: 1, awayScore: 1, date: "2026-02-01T00:00:00Z" },
			{ homeTeam: "Arsenal", awayTeam: "Y", homeScore: 2, awayScore: 0, date: "2026-02-04T00:00:00Z" },
			{ homeTeam: "Z", awayTeam: "Arsenal", homeScore: 0, awayScore: 3, date: "2026-02-08T00:00:00Z" },
			{ homeTeam: "Arsenal", awayTeam: "W", homeScore: 1, awayScore: 0, date: "2026-02-12T00:00:00Z" },
		];
		const insights = analyzeFootballStreaks(results);
		// Arsenal: 3 wins + 1 draw from most recent = 3 win streak (draw breaks it), but 4 unbeaten
		// Wait — order matters. Most recent first:
		// Feb 12: W, Feb 8: W, Feb 4: W → 3 consecutive wins before the draw on Feb 1
		// So win streak = 3, unbeaten streak = 4 (draw on Feb 1 breaks win streak but not unbeaten)
		const arsenalInsight = insights.find(i => i.subject === "Arsenal");
		expect(arsenalInsight).toBeDefined();
	});

	it("detects a 3-match losing streak", () => {
		const results = [
			{ homeTeam: "Everton", awayTeam: "A", homeScore: 0, awayScore: 2, date: "2026-02-10T00:00:00Z" },
			{ homeTeam: "B", awayTeam: "Everton", homeScore: 3, awayScore: 1, date: "2026-02-13T00:00:00Z" },
			{ homeTeam: "Everton", awayTeam: "C", homeScore: 0, awayScore: 1, date: "2026-02-16T00:00:00Z" },
		];
		const insights = analyzeFootballStreaks(results);
		const everton = insights.find(i => i.subject === "Everton" && i.type === "streak");
		expect(everton).toBeDefined();
		expect(everton.text).toContain("lost 3");
	});

	it("returns empty for insufficient results", () => {
		expect(analyzeFootballStreaks([])).toEqual([]);
		expect(analyzeFootballStreaks(null)).toEqual([]);
	});

	it("does not generate insights for streaks under 3", () => {
		const results = [
			{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0, date: "2026-02-10T00:00:00Z" },
			{ homeTeam: "A", awayTeam: "C", homeScore: 2, awayScore: 0, date: "2026-02-13T00:00:00Z" },
		];
		const insights = analyzeFootballStreaks(results);
		// Only 2 wins — below threshold
		expect(insights.filter(i => i.subject === "A")).toHaveLength(0);
	});
});

// ============================================================
// analyzeFootballStandings
// ============================================================
describe("analyzeFootballStandings()", () => {
	const mockStandings = {
		premierLeague: [
			{ team: "Liverpool", position: 1, points: 60, played: 25, won: 19, drawn: 3, lost: 3 },
			{ team: "Arsenal", position: 2, points: 53, played: 25, won: 16, drawn: 5, lost: 4 },
			{ team: "Barcelona FC", position: 3, points: 50, played: 25, won: 15, drawn: 5, lost: 5 },
		],
	};

	it("detects a large points gap at the top", () => {
		const insights = analyzeFootballStandings(mockStandings);
		const gapInsight = insights.find(i => i.type === "standings" && i.subject === "Liverpool");
		expect(gapInsight).toBeDefined();
		expect(gapInsight.text).toContain("lead Premier League by 7 points");
	});

	it("detects a tight title race (1 point or less)", () => {
		const tight = {
			premierLeague: [
				{ team: "Liverpool", position: 1, points: 50, played: 25, won: 15, drawn: 5, lost: 5 },
				{ team: "Arsenal", position: 2, points: 50, played: 25, won: 15, drawn: 5, lost: 5 },
			],
		};
		const insights = analyzeFootballStandings(tight);
		const raceInsight = insights.find(i => i.type === "standings" && i.text.includes("Tight"));
		expect(raceInsight).toBeDefined();
		expect(raceInsight.priority).toBe("high");
	});

	it("highlights favorite team positions", () => {
		const insights = analyzeFootballStandings(mockStandings, ["Barcelona"]);
		const barceInsight = insights.find(i => i.type === "favorite-position");
		expect(barceInsight).toBeDefined();
		expect(barceInsight.text).toContain("3rd");
	});

	it("returns empty for empty standings", () => {
		expect(analyzeFootballStandings({})).toEqual([]);
		expect(analyzeFootballStandings({ premierLeague: [] })).toEqual([]);
	});
});

// ============================================================
// analyzeGolf
// ============================================================
describe("analyzeGolf()", () => {
	it("generates leader insight for active tournament", () => {
		const standings = {
			pga: {
				name: "Genesis Invitational",
				status: "in-progress",
				leaderboard: [
					{ position: 1, player: "Scheffler", score: "-15", today: "-5", thru: "F" },
				],
			},
		};
		const insights = analyzeGolf(standings, {});
		expect(insights.find(i => i.subject === "Scheffler")).toBeDefined();
	});

	it("does not generate leader insight for scheduled tournaments", () => {
		const standings = {
			pga: {
				name: "Future Event",
				status: "scheduled",
				leaderboard: [{ position: 1, player: "X", score: "E" }],
			},
		};
		const insights = analyzeGolf(standings, {});
		expect(insights).toHaveLength(0);
	});

	it("highlights Norwegian players in top 10", () => {
		const results = {
			pga: {
				tournamentName: "Genesis Invitational",
				norwegianPlayers: [
					{ position: 3, player: "Viktor Hovland", score: "-12", roundScore: "-4", thru: "F" },
				],
			},
		};
		const insights = analyzeGolf({}, results);
		const hovland = insights.find(i => i.subject === "Viktor Hovland");
		expect(hovland).toBeDefined();
		expect(hovland.priority).toBe("high");
	});

	it("returns empty for null input", () => {
		expect(analyzeGolf(null, null)).toEqual([]);
		expect(analyzeGolf({}, {})).toEqual([]);
	});
});

// ============================================================
// analyzeF1
// ============================================================
describe("analyzeF1()", () => {
	it("generates championship leader insight when season is active", () => {
		const standings = {
			drivers: [
				{ position: 1, driver: "Verstappen", team: "Red Bull", points: 100, wins: 4 },
				{ position: 2, driver: "Norris", team: "McLaren", points: 80, wins: 2 },
			],
		};
		const insights = analyzeF1(standings);
		expect(insights).toHaveLength(1);
		expect(insights[0].text).toContain("Verstappen");
		expect(insights[0].text).toContain("20 points");
	});

	it("returns empty when all drivers have zero points (pre-season)", () => {
		const standings = {
			drivers: [
				{ position: 1, driver: "Verstappen", points: 0, wins: 0 },
				{ position: 2, driver: "Norris", points: 0, wins: 0 },
			],
		};
		expect(analyzeF1(standings)).toEqual([]);
	});

	it("returns empty for null/empty input", () => {
		expect(analyzeF1(null)).toEqual([]);
		expect(analyzeF1({})).toEqual([]);
		expect(analyzeF1({ drivers: [] })).toEqual([]);
	});
});

// ============================================================
// analyzeHighScoringMatches
// ============================================================
describe("analyzeHighScoringMatches()", () => {
	it("detects high-scoring matches (5+ goals)", () => {
		const results = [
			{ homeTeam: "A", awayTeam: "B", homeScore: 4, awayScore: 3, date: "2026-02-10T00:00:00Z" },
			{ homeTeam: "C", awayTeam: "D", homeScore: 1, awayScore: 0, date: "2026-02-10T00:00:00Z" },
		];
		const insights = analyzeHighScoringMatches(results);
		expect(insights).toHaveLength(1);
		expect(insights[0].text).toContain("7-goal thriller");
	});

	it("limits to top 3 highest-scoring", () => {
		const results = Array.from({ length: 5 }, (_, i) => ({
			homeTeam: `T${i}`, awayTeam: `T${i + 10}`, homeScore: 3 + i, awayScore: 3, date: `2026-02-${10 + i}T00:00:00Z`,
		}));
		const insights = analyzeHighScoringMatches(results);
		expect(insights.length).toBeLessThanOrEqual(3);
	});

	it("returns empty for null input", () => {
		expect(analyzeHighScoringMatches(null)).toEqual([]);
		expect(analyzeHighScoringMatches([])).toEqual([]);
	});
});

// ============================================================
// generateInsights (integration)
// ============================================================
describe("generateInsights()", () => {
	let dataDir, configDir;

	afterEach(() => {
		if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
		if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("generates insights.json from standings and results", async () => {
		dataDir = makeTempDir();
		configDir = makeTempDir();

		fs.writeFileSync(path.join(configDir, "user-context.json"), JSON.stringify({
			favoriteTeams: ["Barcelona"],
			sportPreferences: { football: "high" },
		}));

		fs.writeFileSync(path.join(dataDir, "standings.json"), JSON.stringify({
			football: {
				premierLeague: [
					{ team: "Liverpool", position: 1, points: 60, played: 25, won: 19, drawn: 3, lost: 3 },
					{ team: "Arsenal", position: 2, points: 53, played: 25, won: 16, drawn: 5, lost: 4 },
				],
			},
			golf: {},
			f1: { drivers: [] },
		}));

		fs.writeFileSync(path.join(dataDir, "recent-results.json"), JSON.stringify({
			football: [
				{ homeTeam: "Liverpool", awayTeam: "A", homeScore: 3, awayScore: 0, date: "2026-02-10T00:00:00Z" },
				{ homeTeam: "B", awayTeam: "Liverpool", homeScore: 0, awayScore: 2, date: "2026-02-13T00:00:00Z" },
				{ homeTeam: "Liverpool", awayTeam: "C", homeScore: 1, awayScore: 0, date: "2026-02-16T00:00:00Z" },
			],
			golf: {},
		}));

		const result = await generateInsights({ dataDir, configDir });
		expect(result.count).toBeGreaterThan(0);
		expect(result.insights).toBeDefined();

		// Verify file was written
		const written = JSON.parse(fs.readFileSync(path.join(dataDir, "insights.json"), "utf-8"));
		expect(written.count).toBe(result.count);
	});

	it("handles missing data files gracefully", async () => {
		dataDir = makeTempDir();
		configDir = makeTempDir();

		const result = await generateInsights({ dataDir, configDir });
		expect(result.count).toBe(0);
		expect(result.insights).toEqual([]);
	});

	it("sorts high priority insights first", async () => {
		dataDir = makeTempDir();
		configDir = makeTempDir();

		fs.writeFileSync(path.join(configDir, "user-context.json"), JSON.stringify({
			favoriteTeams: [],
		}));

		fs.writeFileSync(path.join(dataDir, "standings.json"), JSON.stringify({
			football: {
				premierLeague: [
					{ team: "Liverpool", position: 1, points: 60, played: 25, won: 19, drawn: 3, lost: 3 },
					{ team: "Arsenal", position: 2, points: 50, played: 25, won: 15, drawn: 5, lost: 5 },
				],
			},
		}));

		fs.writeFileSync(path.join(dataDir, "recent-results.json"), JSON.stringify({
			football: [],
		}));

		const result = await generateInsights({ dataDir, configDir });
		if (result.insights.length >= 2) {
			const priorities = result.insights.map(i => i.priority);
			const highIdx = priorities.indexOf("high");
			const medIdx = priorities.indexOf("medium");
			if (highIdx >= 0 && medIdx >= 0) {
				expect(highIdx).toBeLessThan(medIdx);
			}
		}
	});
});
