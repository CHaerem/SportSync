import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Set up global environment
globalThis.window = globalThis;

// Load shared-constants first (provides escapeHtml, SS_CONSTANTS)
eval(readFileSync(join(import.meta.dirname, "../docs/js/shared-constants.js"), "utf-8"));

// Mock asset-map globals
window.getGolferHeadshot = vi.fn((name) => name ? `https://headshot/${encodeURIComponent(name)}.png` : null);

// Load standings renderer
eval(readFileSync(join(import.meta.dirname, "../docs/js/standings-renderer.js"), "utf-8"));

const SR = window.StandingsRenderer;

describe("buildMiniTable", () => {
	it("returns empty string for empty rows", () => {
		expect(SR.buildMiniTable({
			title: "Test", columns: [{ label: "A" }], allRows: [],
			cellValues: () => [],
		})).toBe("");
	});

	it("renders basic table with title, columns, and rows", () => {
		const html = SR.buildMiniTable({
			title: "Premier League",
			columns: [{ label: "Team" }, { label: "Pts" }],
			allRows: [
				{ position: 1, team: "Liverpool", pts: 70 },
				{ position: 2, team: "Arsenal", pts: 65 },
			],
			cellValues: (r) => [r.team, r.pts],
		});
		expect(html).toContain("standings-table-group");
		expect(html).toContain("Premier League");
		expect(html).toContain("Liverpool");
		expect(html).toContain("70");
		expect(html).toContain("Arsenal");
	});

	it("respects topN limit", () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ position: i + 1, name: `Team ${i + 1}` }));
		const html = SR.buildMiniTable({
			title: "Test", columns: [{ label: "Name" }], allRows: rows,
			topN: 3, cellValues: (r) => [r.name],
		});
		expect(html).toContain("Team 1");
		expect(html).toContain("Team 3");
		expect(html).not.toContain("Team 4");
	});

	it("adds ellipsis row for position gaps", () => {
		const html = SR.buildMiniTable({
			title: "Test",
			columns: [{ label: "Name" }],
			allRows: [
				{ position: 1, name: "First" },
				{ position: 5, name: "Fifth" },
			],
			cellValues: (r) => [r.name],
			extraRows: (all) => [all[1]],
		});
		expect(html).toContain("\u2026"); // ellipsis
	});

	it("highlights rows matching isHighlight", () => {
		const html = SR.buildMiniTable({
			title: "Test",
			columns: [{ label: "Name" }],
			allRows: [
				{ position: 1, name: "Liverpool" },
				{ position: 2, name: "Arsenal" },
			],
			isHighlight: (r) => r.name === "Liverpool",
			cellValues: (r) => [r.name],
		});
		expect(html).toContain('class="highlight"');
	});

	it("includes extra rows sorted by position", () => {
		const allRows = [
			{ position: 1, name: "A" },
			{ position: 2, name: "B" },
			{ position: 10, name: "Favorite" },
		];
		const html = SR.buildMiniTable({
			title: "Test",
			columns: [{ label: "Name" }],
			allRows,
			topN: 2,
			cellValues: (r) => [r.name],
			extraRows: (all, top) => all.filter(r => r.name === "Favorite"),
		});
		expect(html).toContain("Favorite");
		expect(html).toContain("A");
	});

	it("uses custom getPosition function", () => {
		const html = SR.buildMiniTable({
			title: "Test",
			columns: [{ label: "Name" }],
			allRows: [{ rank: 3, name: "C" }, { rank: 1, name: "A" }],
			getPosition: (r) => r.rank,
			cellValues: (r) => [r.name],
		});
		// Should sort by rank
		expect(html).toContain("A");
		expect(html).toContain("C");
	});

	it("escapes HTML in title", () => {
		const html = SR.buildMiniTable({
			title: "A<B>C",
			columns: [{ label: "X" }],
			allRows: [{ position: 1 }],
			cellValues: () => ["val"],
		});
		expect(html).toContain("A&lt;B&gt;C");
	});
});

describe("buildFootballMiniTable", () => {
	const table = [
		{ position: 1, team: "Liverpool FC", teamShort: "LIV", points: 70, gd: 35 },
		{ position: 2, team: "Arsenal FC", teamShort: "ARS", points: 65, gd: 28 },
		{ position: 3, team: "Man City", teamShort: "MCI", points: 60, gd: 20 },
	];

	it("renders PL table with team names", () => {
		const html = SR.buildFootballMiniTable("Premier League", table, []);
		expect(html).toContain("Premier League");
		expect(html).toContain("LIV");
		expect(html).toContain("70");
		expect(html).toContain("+35");
	});

	it("highlights favorite teams", () => {
		const html = SR.buildFootballMiniTable("PL", table, ["Liverpool"]);
		expect(html).toContain('class="highlight"');
	});

	it("includes favorite teams beyond topN", () => {
		const bigTable = Array.from({ length: 20 }, (_, i) => ({
			position: i + 1, team: `Team ${i + 1}`, teamShort: `T${i + 1}`, points: 60 - i, gd: 10 - i,
		}));
		bigTable[14] = { position: 15, team: "Liverpool FC", teamShort: "LIV", points: 30, gd: -5 };
		const html = SR.buildFootballMiniTable("PL", bigTable, ["Liverpool"]);
		expect(html).toContain("LIV");
	});
});

describe("buildGolfMiniTable", () => {
	it("renders golf leaderboard with Norwegian highlight", () => {
		const pga = {
			name: "Arnold Palmer Invitational",
			leaderboard: [
				{ position: 1, player: "Scottie Scheffler", score: "-12", thru: "F" },
				{ position: 2, player: "Viktor Hovland", score: "-8", thru: "F" },
			],
		};
		const html = SR.buildGolfMiniTable(pga);
		expect(html).toContain("Arnold Palmer Invitational");
		expect(html).toContain("Scottie Scheffler");
		expect(html).toContain("Viktor Hovland");
		expect(html).toContain('class="highlight"'); // Hovland highlighted
	});
});

describe("buildF1MiniTable", () => {
	it("renders F1 standings", () => {
		const drivers = [
			{ position: 1, driver: "Max Verstappen", points: 200, wins: 8 },
			{ position: 2, driver: "Lewis Hamilton", points: 150, wins: 3 },
		];
		const html = SR.buildF1MiniTable(drivers);
		expect(html).toContain("F1 Standings");
		expect(html).toContain("Max Verstappen");
		expect(html).toContain("200");
	});
});

describe("buildTennisMiniTable", () => {
	it("renders ATP rankings with Ruud highlighted", () => {
		const atp = [
			{ position: 1, player: "Novak Djokovic", points: 11000 },
			{ position: 8, player: "Casper Ruud", points: 5000 },
		];
		const html = SR.buildTennisMiniTable(atp);
		expect(html).toContain("ATP Rankings");
		expect(html).toContain("Casper Ruud");
		expect(html).toContain('class="highlight"');
	});

	it("includes Ruud as extra row if beyond topN", () => {
		const atp = Array.from({ length: 10 }, (_, i) => ({
			position: i + 1, player: `Player ${i + 1}`, points: 10000 - i * 500,
		}));
		atp[7] = { position: 8, player: "Casper Ruud", points: 5000 };
		const html = SR.buildTennisMiniTable(atp);
		expect(html).toContain("Casper Ruud");
	});
});

describe("renderStandingsSection", () => {
	it("returns empty string when no standings data", () => {
		expect(SR.renderStandingsSection(null, null)).toBe("");
		expect(SR.renderStandingsSection({}, null)).toBe("");
	});

	it("renders all sport tables when data available", () => {
		const standings = {
			football: {
				premierLeague: [
					{ position: 1, team: "Liverpool", teamShort: "LIV", points: 70, gd: 35 },
				],
			},
			golf: {
				pga: {
					name: "Masters", status: "in_progress",
					leaderboard: [{ position: 1, player: "Scheffler", score: "-10", thru: "F" }],
				},
			},
			f1: {
				drivers: [{ position: 1, driver: "Verstappen", points: 200, wins: 8 }],
			},
			tennis: {
				atp: [{ position: 1, player: "Djokovic", points: 11000 }],
			},
		};
		const html = SR.renderStandingsSection(standings, null);
		expect(html).toContain("Standings");
		expect(html).toContain("LIV");
		expect(html).toContain("Scheffler");
		expect(html).toContain("Verstappen");
		expect(html).toContain("Djokovic");
	});

	it("skips F1 when all drivers have zero points", () => {
		const standings = {
			f1: {
				drivers: [{ position: 1, driver: "A", points: 0, wins: 0 }],
			},
		};
		const html = SR.renderStandingsSection(standings, null);
		expect(html).toBe("");
	});

	it("skips golf when status is scheduled", () => {
		const standings = {
			golf: {
				pga: {
					status: "scheduled",
					leaderboard: [{ position: 1, player: "A", score: "E" }],
				},
			},
		};
		const html = SR.renderStandingsSection(standings, null);
		expect(html).toBe("");
	});

	it("renders band-preview with sport icons + table names for discoverability", () => {
		const standings = {
			football: {
				premierLeague: [
					{ position: 1, team: "Liverpool", teamShort: "LIV", points: 70, gd: 35 },
				],
			},
			golf: {
				pga: {
					name: "Masters 2026", status: "in_progress",
					leaderboard: [{ position: 1, player: "Scheffler", score: "-10", thru: "F" }],
				},
			},
			f1: {
				drivers: [{ position: 1, driver: "Verstappen", points: 200, wins: 8 }],
			},
			chess: {
				candidates: {
					name: "FIDE Candidates Tournament 2026",
					standings: [{ position: 1, player: "Nepomniachtchi", wins: 4, draws: 5, losses: 1, points: 6.5 }],
				},
			},
		};
		const html = SR.renderStandingsSection(standings, null);
		expect(html).toContain('class="band-preview"');
		expect(html).toContain('data-band-preview="standings"');
		// Preview should tease what's inside — PL, Masters (cleaned of year), F1, Candidates
		expect(html).toContain("PL");
		expect(html).toContain("Masters");
		expect(html).toContain("F1");
		expect(html).toContain("Candidates");
	});

	it("omits band-preview when no tables render", () => {
		const html = SR.renderStandingsSection({}, null);
		expect(html).not.toContain('class="band-preview"');
	});
});

describe("renderFootballStandings", () => {
	const standings = {
		football: {
			premierLeague: [
				{ position: 1, team: "Liverpool FC", teamShort: "LIV", played: 30, won: 22, drawn: 5, lost: 3, gd: 35, points: 71 },
				{ position: 2, team: "Arsenal FC", teamShort: "ARS", played: 30, won: 20, drawn: 6, lost: 4, gd: 28, points: 66 },
				{ position: 3, team: "Man City", teamShort: "MCI", played: 30, won: 18, drawn: 7, lost: 5, gd: 20, points: 61 },
				{ position: 10, team: "Chelsea FC", teamShort: "CHE", played: 30, won: 12, drawn: 8, lost: 10, gd: 0, points: 44 },
			],
		},
	};

	it("returns empty when no standings data", () => {
		expect(SR.renderFootballStandings({ tournament: "Premier League" }, {})).toBe("");
		expect(SR.renderFootballStandings({ tournament: "Premier League" }, null)).toBe("");
	});

	it("renders detailed table with match team highlights", () => {
		const event = { tournament: "Premier League", homeTeam: "Chelsea", awayTeam: "Arsenal" };
		const html = SR.renderFootballStandings(event, standings);
		expect(html).toContain("exp-standings");
		expect(html).toContain("ARS");
		expect(html).toContain("CHE");
		expect(html).toContain('class="highlight"');
	});

	it("uses La Liga table for Spanish tournaments", () => {
		const laLigaStandings = {
			football: {
				laLiga: [
					{ position: 1, team: "Real Madrid", teamShort: "RMA", played: 30, won: 22, drawn: 4, lost: 4, gd: 40, points: 70 },
				],
			},
		};
		const event = { tournament: "La Liga", homeTeam: "Real Madrid", awayTeam: "Barcelona" };
		const html = SR.renderFootballStandings(event, laLigaStandings);
		expect(html).toContain("La Liga");
		expect(html).toContain("RMA");
	});

	it("includes ellipsis for position gaps", () => {
		const event = { tournament: "Premier League", homeTeam: "Chelsea", awayTeam: "Liverpool" };
		const html = SR.renderFootballStandings(event, standings);
		// Chelsea is position 10, gap from position 3
		expect(html).toContain("\u2026");
	});
});

describe("renderGolfLeaderboard", () => {
	const standings = {
		golf: {
			pga: {
				name: "Arnold Palmer Invitational",
				leaderboard: [
					{ position: "1", player: "Scottie Scheffler", score: "-12", today: "-4", thru: "F" },
					{ position: "2", player: "Rory McIlroy", score: "-10", today: "-3", thru: "F" },
					{ position: "3", player: "Jon Rahm", score: "-9", today: "-2", thru: "F" },
					{ position: "T4", player: "Collin Morikawa", score: "-8", today: "-1", thru: "F" },
					{ position: "T4", player: "Justin Thomas", score: "-8", today: "E", thru: "F" },
					{ position: "T6", player: "Viktor Hovland", score: "-7", today: "-2", thru: "F" },
				],
			},
		},
	};

	it("returns empty when no leaderboard", () => {
		expect(SR.renderGolfLeaderboard({}, {})).toBe("");
		expect(SR.renderGolfLeaderboard({}, { golf: {} })).toBe("");
	});

	it("renders top 5 players", () => {
		const html = SR.renderGolfLeaderboard({}, standings);
		expect(html).toContain("Arnold Palmer Invitational");
		expect(html).toContain("Scottie Scheffler");
		expect(html).toContain("-12");
		expect(html).toContain("Justin Thomas");
	});

	it("highlights Norwegian players beyond top 5", () => {
		const event = {
			norwegianPlayers: [{ name: "Viktor Hovland" }],
		};
		const html = SR.renderGolfLeaderboard(event, standings);
		expect(html).toContain("Viktor Hovland");
		expect(html).toContain('class="highlight"');
	});

	it("includes golfer headshot images", () => {
		SR.renderGolfLeaderboard({}, standings);
		expect(getGolferHeadshot).toHaveBeenCalled();
	});

	it("uses DP World tour when specified", () => {
		const dpStandings = {
			golf: {
				dpWorld: {
					name: "DP World Tour Championship",
					leaderboard: [{ position: "1", player: "A", score: "-5", today: "-2", thru: "F" }],
				},
			},
		};
		const event = { tournament: "DP World Tour" };
		const html = SR.renderGolfLeaderboard(event, dpStandings);
		expect(html).toContain("DP World Tour Championship");
	});
});

describe("renderF1StandingsTable", () => {
	it("returns empty when no F1 data", () => {
		expect(SR.renderF1StandingsTable({})).toBe("");
		expect(SR.renderF1StandingsTable(null)).toBe("");
	});

	it("returns empty when all zero points", () => {
		const standings = {
			f1: { drivers: [{ position: 1, driver: "A", team: "B", points: 0 }] },
		};
		expect(SR.renderF1StandingsTable(standings)).toBe("");
	});

	it("renders driver standings", () => {
		const standings = {
			f1: {
				drivers: [
					{ position: 1, driver: "Max Verstappen", team: "Red Bull", points: 200 },
					{ position: 2, driver: "Lewis Hamilton", team: "Ferrari", points: 150 },
				],
			},
		};
		const html = SR.renderF1StandingsTable(standings);
		expect(html).toContain("Driver Standings");
		expect(html).toContain("Max Verstappen");
		expect(html).toContain("Red Bull");
		expect(html).toContain("200");
	});
});

describe("renderStandingsLeaderboard", () => {
	const standings = {
		golf: {
			pga: {
				name: "The Masters",
				status: "in_progress",
				leaderboard: [
					{ position: "1", positionDisplay: "1", player: "Scheffler", score: "-15", tracked: false },
					{ position: "2", positionDisplay: "2", player: "McIlroy", score: "-12", tracked: false },
					{ position: "3", positionDisplay: "3", player: "Rahm", score: "-10", tracked: false },
					{ position: "T10", positionDisplay: "T10", player: "Hovland", score: "-5", tracked: true },
				],
				trackedPlayers: [],
			},
		},
	};

	it("returns empty when no golf data", () => {
		expect(SR.renderStandingsLeaderboard("pga", {})).toBe("");
		expect(SR.renderStandingsLeaderboard("pga", null)).toBe("");
	});

	it("renders leaderboard with status badge", () => {
		const html = SR.renderStandingsLeaderboard("pga", standings);
		expect(html).toContain("lead-lb");
		expect(html).toContain("Leaderboard");
		expect(html).toContain("In Progress");
	});

	it("shows top 3 players", () => {
		const html = SR.renderStandingsLeaderboard("pga", standings);
		expect(html).toContain("Scheffler");
		expect(html).toContain("McIlroy");
		expect(html).toContain("Rahm");
	});

	it("shows tracked Norwegian player with flag", () => {
		const html = SR.renderStandingsLeaderboard("pga", standings);
		expect(html).toContain("Hovland");
		expect(html).toContain("is-you");
		expect(html).toContain("\ud83c\uddf3\ud83c\uddf4"); // Norwegian flag
	});

	it("shows under-par styling for negative scores", () => {
		const html = SR.renderStandingsLeaderboard("pga", standings);
		expect(html).toContain("under-par");
	});

	it("includes headshot images", () => {
		SR.renderStandingsLeaderboard("pga", standings);
		expect(getGolferHeadshot).toHaveBeenCalled();
	});

	it("uses DP World tour when specified", () => {
		const dpStandings = {
			golf: {
				dpWorld: {
					name: "DP World Championship",
					leaderboard: [{ position: "1", positionDisplay: "1", player: "Rory McIlroy", score: "-5" }],
				},
			},
		};
		const html = SR.renderStandingsLeaderboard("dp world", dpStandings);
		expect(html).toContain("Rory McIlroy");
		expect(html).toContain("-5");
	});
});
