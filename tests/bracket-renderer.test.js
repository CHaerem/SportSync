import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Set up global environment
globalThis.window = globalThis;

// Load shared-constants first (provides escapeHtml, SS_CONSTANTS)
eval(readFileSync(join(import.meta.dirname, "../docs/js/shared-constants.js"), "utf-8"));

// Mock asset-map globals
window.getTeamLogo = vi.fn((name) => name ? `https://logo/${encodeURIComponent(name)}.png` : null);

// Load bracket renderer
eval(readFileSync(join(import.meta.dirname, "../docs/js/bracket-renderer.js"), "utf-8"));

const BR = window.BracketRenderer;

/** Build a minimal bracket context */
function makeCtx(overrides = {}) {
	return {
		esc: escapeHtml,
		_isSameDay: (a, b) => new Date(a).toDateString() === new Date(b).toDateString(),
		...overrides,
	};
}

describe("findBracketForEvent", () => {
	it("returns null when no brackets", () => {
		expect(BR.findBracketForEvent({}, null)).toBeNull();
	});

	it("returns null when no matching bracket", () => {
		const brackets = { "abc": { name: "DraculaN Season 5" } };
		expect(BR.findBracketForEvent({ title: "Unrelated Event" }, brackets)).toBeNull();
	});

	it("matches by _bracketId", () => {
		const data = { name: "DraculaN", playoffs: {} };
		const brackets = { "draculan-s5": data };
		const event = { _bracketId: "draculan-s5" };
		expect(BR.findBracketForEvent(event, brackets)).toBe(data);
	});

	it("matches by bracket name in title", () => {
		const data = { name: "DraculaN Season 5" };
		const brackets = { "draculan-s5": data };
		const event = { title: "CS2: DraculaN Season 5 - Semifinal" };
		expect(BR.findBracketForEvent(event, brackets)).toBe(data);
	});

	it("matches by first word of bracket name", () => {
		const data = { name: "DraculaN Season 5" };
		const brackets = { "draculan-s5": data };
		const event = { title: "DraculaN Match Day 3" };
		expect(BR.findBracketForEvent(event, brackets)).toBe(data);
	});

	it("matches by tournament field", () => {
		const data = { name: "Champions League" };
		const brackets = { "cl-2026": data };
		const event = { title: "Semifinal", tournament: "Champions League 2025/26" };
		expect(BR.findBracketForEvent(event, brackets)).toBe(data);
	});

	it("matches by stage field", () => {
		const data = { name: "PGL Major" };
		const brackets = { "pgl-major": data };
		const event = { title: "Match", stage: "PGL Major Copenhagen" };
		expect(BR.findBracketForEvent(event, brackets)).toBe(data);
	});

	it("skips brackets without name", () => {
		const brackets = { "no-name": { playoffs: {} } };
		expect(BR.findBracketForEvent({ title: "Anything" }, brackets)).toBeNull();
	});
});

describe("bracketMatchInvolves", () => {
	it("returns false when no teamName", () => {
		expect(BR.bracketMatchInvolves({ team1: "A", team2: "B" }, null)).toBe(false);
		expect(BR.bracketMatchInvolves({ team1: "A", team2: "B" }, "")).toBe(false);
	});

	it("returns true when team1 matches", () => {
		expect(BR.bracketMatchInvolves({ team1: "HEROIC", team2: "NAVI" }, "HEROIC")).toBe(true);
	});

	it("returns true when team2 matches", () => {
		expect(BR.bracketMatchInvolves({ team1: "HEROIC", team2: "NAVI" }, "NAVI")).toBe(true);
	});

	it("matches case-insensitively", () => {
		expect(BR.bracketMatchInvolves({ team1: "heroic", team2: "navi" }, "HEROIC")).toBe(true);
	});

	it("matches partial names (includes)", () => {
		expect(BR.bracketMatchInvolves({ team1: "Team Spirit", team2: "NAVI" }, "spirit")).toBe(true);
	});

	it("returns false when no match", () => {
		expect(BR.bracketMatchInvolves({ team1: "HEROIC", team2: "NAVI" }, "FaZe")).toBe(false);
	});

	it("handles null team fields", () => {
		expect(BR.bracketMatchInvolves({ team1: null, team2: null }, "HEROIC")).toBe(false);
	});
});

describe("bracketPotLabel", () => {
	it("returns team1/team2 when both present", () => {
		expect(BR.bracketPotLabel({ team1: "HEROIC", team2: "NAVI" })).toBe("HEROIC/NAVI");
	});

	it("returns TBD when both teams missing", () => {
		expect(BR.bracketPotLabel({ team1: "TBD", team2: "TBD" })).toBe("TBD");
	});

	it("returns TBD when both teams null", () => {
		expect(BR.bracketPotLabel({})).toBe("TBD");
	});

	it("returns partial when one team present", () => {
		expect(BR.bracketPotLabel({ team1: "HEROIC" })).toBe("HEROIC/TBD");
		expect(BR.bracketPotLabel({ team2: "NAVI" })).toBe("TBD/NAVI");
	});
});

describe("bracketShortRoundName", () => {
	it("returns empty for null/undefined", () => {
		expect(BR.bracketShortRoundName(null)).toBe("");
		expect(BR.bracketShortRoundName(undefined)).toBe("");
	});

	it("abbreviates Grand Final", () => {
		expect(BR.bracketShortRoundName("Grand Final")).toBe("GF");
	});

	it("abbreviates Final", () => {
		expect(BR.bracketShortRoundName("Final")).toBe("Final");
	});

	it("abbreviates Semi-Final", () => {
		expect(BR.bracketShortRoundName("Semi-Final")).toBe("SF");
		expect(BR.bracketShortRoundName("Semifinals")).toBe("SF");
	});

	it("abbreviates Quarter-Final", () => {
		expect(BR.bracketShortRoundName("Quarter-Final")).toBe("QF");
		expect(BR.bracketShortRoundName("Quarterfinals")).toBe("QF");
	});

	it("abbreviates Round of N", () => {
		expect(BR.bracketShortRoundName("Round of 16")).toBe("R16");
		expect(BR.bracketShortRoundName("Round of 8")).toBe("R8");
	});

	it("abbreviates Round N", () => {
		expect(BR.bracketShortRoundName("Round 1")).toBe("R1");
		expect(BR.bracketShortRoundName("round 3")).toBe("R3");
	});

	it("does not match 'Quarter-Final' as 'Final'", () => {
		expect(BR.bracketShortRoundName("Quarter-Final")).toBe("QF");
	});

	it("does not match 'Semi-Final' as 'Final'", () => {
		expect(BR.bracketShortRoundName("Semi-Final")).toBe("SF");
	});
});

describe("renderBracketCard", () => {
	const ctx = makeCtx();

	it("renders basic match card with two teams", () => {
		const m = { team1: "HEROIC", team2: "NAVI", score: "2-1", winner: "HEROIC" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain("bk-m");
		expect(html).toContain("HEROIC");
		expect(html).toContain("NAVI");
		expect(html).toContain("2");
		expect(html).toContain("1");
	});

	it("highlights focus team", () => {
		const m = { team1: "HEROIC", team2: "NAVI" };
		const html = BR.renderBracketCard(m, "HEROIC", ctx);
		expect(html).toContain("focus");
		expect(html).toContain("ft");
	});

	it("marks winner and loser", () => {
		const m = { team1: "HEROIC", team2: "NAVI", winner: "HEROIC", score: "2-0" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain(" w\""); // winner class
		expect(html).toContain(" l\""); // loser class
	});

	it("handles TBD teams", () => {
		const m = { team1: "TBD", team2: "TBD" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain("tbd");
		expect(html).toContain("TBD");
	});

	it("renders potential teams for TBD slots", () => {
		const m = { team1: "TBD", team2: "TBD", _pot1: "HEROIC/NAVI", _pot2: "FaZe/G2" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain("W: HEROIC/NAVI");
		expect(html).toContain("W: FaZe/G2");
		expect(html).toContain("pot");
	});

	it("handles forfeit (FF) score", () => {
		const m = { team1: "HEROIC", team2: "NAVI", score: "FF", winner: "HEROIC" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain("W");
		expect(html).toContain("-");
	});

	it("marks live matches", () => {
		const m = { team1: "HEROIC", team2: "NAVI", status: "live" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain("live");
	});

	it("includes team logos", () => {
		const m = { team1: "HEROIC", team2: "NAVI" };
		BR.renderBracketCard(m, "", ctx);
		expect(getTeamLogo).toHaveBeenCalledWith("HEROIC");
		expect(getTeamLogo).toHaveBeenCalledWith("NAVI");
	});

	it("escapes HTML in team names", () => {
		const m = { team1: "A<B>", team2: "C&D" };
		const html = BR.renderBracketCard(m, "", ctx);
		expect(html).toContain("A&lt;B&gt;");
		expect(html).toContain("C&amp;D");
	});
});

describe("renderBracketTree", () => {
	const ctx = makeCtx();

	it("returns empty string for empty rounds", () => {
		expect(BR.renderBracketTree([], "", ctx)).toBe("");
	});

	it("renders single round with matches", () => {
		const rounds = [{
			round: "Final",
			matches: [
				{ team1: "HEROIC", team2: "NAVI", score: "2-1", winner: "HEROIC" },
			],
		}];
		const html = BR.renderBracketTree(rounds, "", ctx);
		expect(html).toContain("bk-tree");
		expect(html).toContain("bk-round");
		expect(html).toContain("Final");
		expect(html).toContain("HEROIC");
	});

	it("renders connector lines between rounds", () => {
		const rounds = [
			{
				round: "Semi-Final",
				matches: [
					{ team1: "A", team2: "B", winner: "A" },
					{ team1: "C", team2: "D", winner: "C" },
				],
			},
			{
				round: "Final",
				matches: [
					{ team1: "A", team2: "C" },
				],
			},
		];
		const html = BR.renderBracketTree(rounds, "", ctx);
		expect(html).toContain("bk-conn");
		expect(html).toContain("bk-cp");
	});

	it("uses bracketShortRoundName for headers", () => {
		const rounds = [{ round: "Quarter-Final", matches: [{ team1: "A", team2: "B" }] }];
		const html = BR.renderBracketTree(rounds, "", ctx);
		expect(html).toContain("QF");
	});

	it("propagates potential teams to TBD matches", () => {
		const rounds = [
			{
				round: "Semi-Final",
				matches: [
					{ team1: "A", team2: "B" },
					{ team1: "C", team2: "D" },
				],
			},
			{
				round: "Final",
				matches: [
					{ team1: "TBD", team2: "TBD" },
				],
			},
		];
		const html = BR.renderBracketTree(rounds, "", ctx);
		// Should derive potential teams from previous round
		expect(html).toContain("W:");
	});
});

describe("renderBracketGrid", () => {
	const ctx = makeCtx();

	it("renders single elimination bracket", () => {
		const playoffs = {
			rounds: [
				{ round: "Semi-Final", matches: [{ team1: "A", team2: "B" }, { team1: "C", team2: "D" }] },
				{ round: "Final", matches: [{ team1: "TBD", team2: "TBD" }] },
			],
		};
		const html = BR.renderBracketGrid(playoffs, "", ctx);
		expect(html).toContain("bk-grid");
		expect(html).toContain("SF");
	});

	it("renders double elimination with UB/LB labels", () => {
		const playoffs = {
			upperBracket: [{ round: "UB Final", matches: [{ team1: "A", team2: "B" }] }],
			lowerBracket: [{ round: "LB Final", matches: [{ team1: "C", team2: "D" }] }],
		};
		const html = BR.renderBracketGrid(playoffs, "", ctx);
		expect(html).toContain("Upper Bracket");
		expect(html).toContain("Lower Bracket");
	});

	it("renders grand final section", () => {
		const playoffs = {
			upperBracket: [{ round: "UB Final", matches: [{ team1: "A", team2: "B" }] }],
			lowerBracket: [{ round: "LB Final", matches: [{ team1: "C", team2: "D" }] }],
			grandFinal: { matches: [{ team1: "A", team2: "D" }] },
		};
		const html = BR.renderBracketGrid(playoffs, "", ctx);
		expect(html).toContain("Grand Final");
	});
});

describe("renderTournamentBracket", () => {
	const ctx = makeCtx();

	it("returns empty string when no playoffs", () => {
		expect(BR.renderTournamentBracket({ bracket: {} }, {}, ctx)).toBe("");
		expect(BR.renderTournamentBracket({ bracket: { playoffs: null } }, {}, ctx)).toBe("");
	});

	it("renders tournament header", () => {
		const bracketData = {
			name: "DraculaN Season 5",
			tier: "S-Tier",
			prizePool: "$100,000",
			bracket: {
				playoffs: {
					rounds: [{ round: "Final", matches: [{ team1: "A", team2: "B" }] }],
				},
			},
		};
		const html = BR.renderTournamentBracket(bracketData, {}, ctx);
		expect(html).toContain("exp-bracket");
		expect(html).toContain("DraculaN Season 5");
		expect(html).toContain("S-Tier");
		expect(html).toContain("$100,000");
	});

	it("shows staleness indicator when bracket is old", () => {
		const hoursAgo = 6;
		const bracketData = {
			name: "Test",
			_lastUpdated: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
			bracket: {
				playoffs: {
					rounds: [{ round: "Final", matches: [{ team1: "A", team2: "B" }] }],
				},
			},
		};
		const html = BR.renderTournamentBracket(bracketData, {}, ctx);
		expect(html).toContain("exp-bracket-stale");
		expect(html).toContain("h ago");
	});

	it("does not show staleness for recent brackets", () => {
		const bracketData = {
			name: "Test",
			_lastUpdated: new Date().toISOString(),
			bracket: {
				playoffs: {
					rounds: [{ round: "Final", matches: [{ team1: "A", team2: "B" }] }],
				},
			},
		};
		const html = BR.renderTournamentBracket(bracketData, {}, ctx);
		expect(html).not.toContain("exp-bracket-stale");
	});

	it("uses focusTeam for highlighting", () => {
		const bracketData = {
			name: "Test",
			focusTeam: "HEROIC",
			bracket: {
				playoffs: {
					rounds: [{ round: "Final", matches: [{ team1: "HEROIC", team2: "NAVI" }] }],
				},
			},
		};
		const html = BR.renderTournamentBracket(bracketData, {}, ctx);
		expect(html).toContain("focus");
	});
});

describe("renderBracketPath", () => {
	const ctx = makeCtx();

	it("returns empty string when no playoffs", () => {
		expect(BR.renderBracketPath({}, "HEROIC", ctx)).toBe("");
		expect(BR.renderBracketPath({ playoffs: null }, "HEROIC", ctx)).toBe("");
	});

	it("returns empty string when no matches found", () => {
		const b = {
			playoffs: {
				rounds: [{ round: "Final", matches: [{ team1: "A", team2: "B" }] }],
			},
		};
		expect(BR.renderBracketPath(b, "HEROIC", ctx)).toBe("");
	});

	it("renders completed results", () => {
		const b = {
			playoffs: {
				rounds: [
					{
						round: "Semi-Final",
						matches: [{ team1: "HEROIC", team2: "NAVI", winner: "HEROIC", score: "2-0" }],
					},
				],
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("lead-bracket-path");
		expect(html).toContain("bpath-completed");
		expect(html).toContain("bpath-win");
		expect(html).toContain("NAVI");
		expect(html).toContain("2-0");
	});

	it("renders loss badge correctly", () => {
		const b = {
			playoffs: {
				rounds: [
					{
						round: "Semi-Final",
						matches: [{ team1: "HEROIC", team2: "NAVI", winner: "NAVI", score: "0-2" }],
					},
				],
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("bpath-loss");
	});

	it("renders next match highlighted", () => {
		const b = {
			playoffs: {
				rounds: [
					{
						round: "Final",
						matches: [{ team1: "HEROIC", team2: "NAVI", status: "upcoming" }],
					},
				],
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("bpath-next");
		expect(html).toContain("vs");
		expect(html).toContain("NAVI");
	});

	it("renders elimination info from focusTeamPath", () => {
		const b = {
			playoffs: {
				rounds: [
					{
						round: "Semi-Final",
						matches: [{ team1: "HEROIC", team2: "NAVI", winner: "HEROIC", score: "2-1" }],
					},
				],
			},
			focusTeamPath: {
				ifLose: "Drops to Lower Bracket Round 2",
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("bpath-elim");
		expect(html).toContain("Drops to Lower Bracket Round 2");
	});

	it("prefixes UB/LB for double elimination", () => {
		const b = {
			playoffs: {
				upperBracket: [
					{
						round: "Final",
						matches: [{ team1: "HEROIC", team2: "NAVI", winner: "HEROIC", score: "2-0" }],
					},
				],
				lowerBracket: [
					{
						round: "Round 1",
						matches: [{ team1: "FaZe", team2: "G2" }],
					},
				],
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("UB Final");
	});

	it("merges focusTeamPath.completed for group stage matches", () => {
		const b = {
			playoffs: {
				rounds: [],
			},
			focusTeamPath: {
				completed: [
					{ stage: "Group Stage", opponent: "NAVI", result: "W 2-0" },
					{ stage: "Group Stage", opponent: "FaZe", result: "L 0-2" },
				],
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("NAVI");
		expect(html).toContain("FaZe");
		expect(html).toContain("bpath-win");
		expect(html).toContain("bpath-loss");
	});

	it("uses focusTeamPath.current as nextMatch fallback", () => {
		const b = {
			playoffs: {
				rounds: [],
			},
			focusTeamPath: {
				completed: [
					{ stage: "Group Stage", opponent: "NAVI", result: "W 2-0" },
				],
				current: {
					stage: "Semi-Final",
					opponent: "FaZe",
					format: "Bo3",
				},
			},
		};
		const html = BR.renderBracketPath(b, "HEROIC", ctx);
		expect(html).toContain("bpath-next");
		expect(html).toContain("FaZe");
	});
});
