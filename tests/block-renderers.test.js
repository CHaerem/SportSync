import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Set up global environment
globalThis.window = globalThis;

// Load shared-constants first (provides escapeHtml, ssShortName, isEventInWindow, SS_CONSTANTS)
eval(readFileSync(join(import.meta.dirname, "../docs/js/shared-constants.js"), "utf-8"));

// Mock asset-map globals
window.getTeamLogo = vi.fn((name) => name ? `https://logo/${encodeURIComponent(name)}.png` : null);
window.getGolferHeadshot = vi.fn((name) => name ? `https://headshot/${encodeURIComponent(name)}.png` : null);

// Load block renderers
eval(readFileSync(join(import.meta.dirname, "../docs/js/block-renderers.js"), "utf-8"));

/** Build a minimal renderer context with overrides */
function makeCtx(overrides = {}) {
	return {
		allEvents: [],
		recentResults: null,
		standings: null,
		liveScores: {},
		liveLeaderboard: null,
		renderBriefLine: (line) => escapeHtml(line),
		relativeTime: () => null,
		_isSameDay: (a, b) => new Date(a).toDateString() === new Date(b).toDateString(),
		_getTrackedGolferNames: () => new Set(),
		...overrides,
	};
}

describe("renderMatchResult", () => {
	const render = window.BLOCK_RENDERERS['match-result'];

	it("returns null when no recent results", () => {
		const ctx = makeCtx({ recentResults: null });
		expect(render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx)).toBeNull();
	});

	it("returns null when football results empty", () => {
		const ctx = makeCtx({ recentResults: { football: [] } });
		expect(render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx)).toBeNull();
	});

	it("returns null when homeTeam missing", () => {
		const ctx = makeCtx({ recentResults: { football: [{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0 }] } });
		expect(render({ awayTeam: "B" }, ctx)).toBeNull();
	});

	it("returns null when match not found in results", () => {
		const ctx = makeCtx({
			recentResults: { football: [{ homeTeam: "Chelsea", awayTeam: "Spurs", homeScore: 2, awayScore: 1 }] },
		});
		expect(render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx)).toBeNull();
	});

	it("renders score card with team names", () => {
		const ctx = makeCtx({
			recentResults: {
				football: [{ homeTeam: "Liverpool FC", awayTeam: "Arsenal FC", homeScore: 3, awayScore: 1, league: "Premier League" }],
			},
		});
		const html = render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx);
		expect(html).not.toBeNull();
		expect(html).toContain("block-match-result");
		expect(html).toContain("3 - 1");
		expect(html).toContain("Liverpool"); // shortName strips FC
		expect(html).toContain("Arsenal");
		expect(html).toContain("Premier League");
	});

	it("renders goal scorers (max 3)", () => {
		const ctx = makeCtx({
			recentResults: {
				football: [{
					homeTeam: "Liverpool", awayTeam: "Arsenal", homeScore: 2, awayScore: 0,
					goalScorers: [
						{ player: "Salah", minute: "23'" },
						{ player: "Diaz", minute: "67'" },
						{ player: "Jota", minute: "89'" },
						{ player: "Extra", minute: "90+3'" },
					],
				}],
			},
		});
		const html = render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx);
		expect(html).toContain("Salah 23&#039;");
		expect(html).toContain("Diaz 67&#039;");
		expect(html).toContain("Jota 89&#039;");
		expect(html).not.toContain("Extra"); // Max 3 scorers
	});

	it("includes team logos", () => {
		const ctx = makeCtx({
			recentResults: { football: [{ homeTeam: "Liverpool", awayTeam: "Arsenal", homeScore: 1, awayScore: 0 }] },
		});
		const html = render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx);
		expect(html).toContain("result-card-logo");
		expect(getTeamLogo).toHaveBeenCalledWith("Liverpool");
		expect(getTeamLogo).toHaveBeenCalledWith("Arsenal");
	});

	it("escapes HTML in team names", () => {
		const ctx = makeCtx({
			recentResults: { football: [{ homeTeam: "A<B>", awayTeam: "C&D", homeScore: 1, awayScore: 0 }] },
		});
		const html = render({ homeTeam: "A<B>", awayTeam: "C&D" }, ctx);
		expect(html).toContain("A&lt;B&gt;");
		expect(html).toContain("C&amp;D");
	});
});

describe("renderMatchPreview", () => {
	const render = window.BLOCK_RENDERERS['match-preview'];

	it("returns null when homeTeam missing", () => {
		expect(render({ awayTeam: "Arsenal" }, makeCtx())).toBeNull();
	});

	it("returns null when awayTeam missing", () => {
		expect(render({ homeTeam: "Liverpool" }, makeCtx())).toBeNull();
	});

	it("returns null when no matching event", () => {
		const ctx = makeCtx({
			allEvents: [{ sport: "football", homeTeam: "Chelsea", awayTeam: "Spurs", time: "2026-03-10T15:00:00Z" }],
		});
		expect(render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx)).toBeNull();
	});

	it("renders preview with time and team names", () => {
		const ctx = makeCtx({
			allEvents: [{
				sport: "football", homeTeam: "Liverpool FC", awayTeam: "Arsenal FC",
				time: "2026-03-10T15:00:00Z", tournament: "Premier League",
			}],
		});
		const html = render({ homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx);
		expect(html).not.toBeNull();
		expect(html).toContain("block-match-preview");
		expect(html).toContain("Liverpool");
		expect(html).toContain("Arsenal");
		expect(html).toContain("Premier League");
	});

	it("includes standings context when showStandings is true", () => {
		const ctx = makeCtx({
			allEvents: [{
				sport: "football", homeTeam: "Liverpool", awayTeam: "Arsenal",
				time: "2026-03-10T15:00:00Z", tournament: "Premier League",
			}],
			standings: {
				football: {
					premierLeague: [
						{ team: "Liverpool", teamShort: "LIV", position: 1 },
						{ team: "Arsenal", teamShort: "ARS", position: 2 },
					],
				},
			},
		});
		const html = render({ homeTeam: "Liverpool", awayTeam: "Arsenal", showStandings: true }, ctx);
		expect(html).toContain("block-standings-ctx");
		expect(html).toContain("LIV 1st");
		expect(html).toContain("ARS 2nd");
	});

	it("extracts editorial context from _fallbackText", () => {
		const ctx = makeCtx({
			allEvents: [{
				sport: "football", homeTeam: "Liverpool", awayTeam: "Arsenal",
				time: "2026-03-10T15:00:00Z",
			}],
		});
		const html = render({
			homeTeam: "Liverpool", awayTeam: "Arsenal",
			_fallbackText: "Liverpool v Arsenal, 16:00, PL — Top of the table clash with title implications for both sides",
		}, ctx);
		expect(html).toContain("preview-editorial");
		expect(html).toContain("Top of the table clash");
	});
});

describe("renderEventSchedule", () => {
	const render = window.BLOCK_RENDERERS['event-schedule'];

	it("returns null when no sport filter", () => {
		expect(render({ filter: {} }, makeCtx())).toBeNull();
		expect(render({}, makeCtx())).toBeNull();
	});

	it("returns null when no matching events in window", () => {
		const ctx = makeCtx({
			allEvents: [{ sport: "chess", time: "2099-12-31T00:00:00Z", title: "Future Chess" }],
		});
		expect(render({ filter: { sport: "chess" } }, ctx)).toBeNull();
	});

	it("renders matching events with label", () => {
		const now = new Date();
		const ctx = makeCtx({
			allEvents: [
				{ sport: "chess", time: now.toISOString(), title: "FIDE Candidates Round 1" },
				{ sport: "chess", time: now.toISOString(), title: "FIDE Candidates Round 2" },
			],
		});
		const html = render({ filter: { sport: "chess" }, label: "Chess This Week" }, ctx);
		expect(html).not.toBeNull();
		expect(html).toContain("block-event-schedule");
		expect(html).toContain("Chess This Week");
		expect(html).toContain("FIDE Candidates Round 1");
	});

	it("respects maxItems", () => {
		const now = new Date();
		const events = Array.from({ length: 10 }, (_, i) => ({
			sport: "chess", time: now.toISOString(), title: `Round ${i + 1}`,
		}));
		const ctx = makeCtx({ allEvents: events });
		const html = render({ filter: { sport: "chess" }, maxItems: 3 }, ctx);
		expect(html).toContain("Round 1");
		expect(html).toContain("Round 2");
		expect(html).toContain("Round 3");
		expect(html).not.toContain("Round 4");
		expect(html).toContain("+7 more");
	});

	it("shows Norwegian flag for norwegian events", () => {
		const now = new Date();
		const ctx = makeCtx({
			allEvents: [{ sport: "biathlon", time: now.toISOString(), title: "Sprint", norwegian: true }],
		});
		const html = render({ filter: { sport: "biathlon" } }, ctx);
		expect(html).toContain("\u{1F1F3}\u{1F1F4}"); // Norwegian flag emoji
	});

	it("applies highlight style", () => {
		const now = new Date();
		const ctx = makeCtx({
			allEvents: [{ sport: "f1", time: now.toISOString(), title: "Australian GP" }],
		});
		const html = render({ filter: { sport: "f1" }, style: "highlight" }, ctx);
		expect(html).toContain("highlight");
	});
});

describe("renderGolfStatus", () => {
	const render = window.BLOCK_RENDERERS['golf-status'];

	it("returns null when no golf standings", () => {
		expect(render({}, makeCtx())).toBeNull();
		expect(render({}, makeCtx({ standings: {} }))).toBeNull();
		expect(render({}, makeCtx({ standings: { golf: {} } }))).toBeNull();
	});

	it("returns null when leaderboard empty", () => {
		const ctx = makeCtx({ standings: { golf: { pga: { leaderboard: [] } } } });
		expect(render({}, ctx)).toBeNull();
	});

	it("renders tracked player when available", () => {
		const ctx = makeCtx({
			standings: {
				golf: {
					pga: {
						name: "Arnold Palmer Invitational",
						leaderboard: [
							{ player: "Scottie Scheffler", position: "1st", score: "-12", tracked: false },
							{ player: "Viktor Hovland", position: "T5", score: "-8", tracked: true },
						],
					},
				},
			},
		});
		const html = render({}, ctx);
		expect(html).not.toBeNull();
		expect(html).toContain("block-golf-card");
		expect(html).toContain("Viktor Hovland");
		expect(html).toContain("T5");
		expect(html).toContain("-8");
		expect(html).toContain("Arnold Palmer Invitational");
	});

	it("falls back to leader when no tracked player", () => {
		const ctx = makeCtx({
			standings: {
				golf: {
					pga: {
						name: "The Masters",
						leaderboard: [
							{ player: "Scottie Scheffler", position: "1st", score: "-15" },
						],
					},
				},
			},
		});
		const html = render({}, ctx);
		expect(html).toContain("Scottie Scheffler");
		expect(html).toContain("golf-card-name");
		expect(html).toContain("-15");
	});

	it("uses dpWorld tour when specified", () => {
		const ctx = makeCtx({
			standings: {
				golf: {
					dpWorld: {
						name: "DP World Tour Championship",
						leaderboard: [{ player: "Rory McIlroy", position: "1st", score: "-10" }],
					},
				},
			},
		});
		const html = render({ tournament: "dpWorld" }, ctx);
		expect(html).toContain("DP World Tour Championship");
	});

	it("includes headshot image", () => {
		const ctx = makeCtx({
			standings: {
				golf: {
					pga: {
						leaderboard: [{ player: "Viktor Hovland", position: "T3", score: "-9", tracked: true }],
					},
				},
			},
		});
		const html = render({}, ctx);
		expect(html).toContain("golf-card-img");
		expect(getGolferHeadshot).toHaveBeenCalledWith("Viktor Hovland");
	});
});
