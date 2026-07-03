// docs/js/block-renderers.js: every block type renders without crashing on empty/partial data.
import { describe, it, expect, beforeAll } from "vitest";
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";

let renderers, ctx;

beforeAll(() => {
	const sandbox = createClientSandbox();
	loadClientScript(sandbox, "shared-constants.js");
	loadClientScript(sandbox, "asset-maps.js");
	loadClientScript(sandbox, "block-renderers.js");
	renderers = sandbox.window.BLOCK_RENDERERS;
	ctx = {
		allEvents: [
			{
				sport: "football", tournament: "Premier League",
				homeTeam: "Liverpool FC", awayTeam: "Arsenal FC",
				title: "Liverpool vs Arsenal",
				time: new Date(Date.now() + 3600000).toISOString(),
			},
		],
		recentResults: {
			football: [{ homeTeam: "Liverpool", awayTeam: "Arsenal", homeScore: 2, awayScore: 1, league: "Premier League", goalScorers: [] }],
		},
		standings: { football: { premierLeague: [{ team: "Liverpool", teamShort: "LIV", position: 1 }] }, golf: { pga: { name: "PGA", leaderboard: [{ player: "Viktor Hovland", position: "T3", score: "-8", tracked: true }] } } },
		liveScores: {},
		liveLeaderboard: null,
		renderBriefLine: (t) => t,
		relativeTime: () => "om 1 t",
		_isSameDay: () => true,
		_getTrackedGolferNames: () => new Set(["Viktor Hovland"]),
	};
});

describe("block renderers", () => {
	it("exposes the expected block types", () => {
		expect(Object.keys(renderers)).toEqual(
			expect.arrayContaining(["match-result", "match-preview", "event-schedule", "golf-status"])
		);
	});

	it("match-result renders a completed match", () => {
		const html = renderers["match-result"]({ type: "match-result", homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx);
		expect(html).toContain("2 - 1");
	});

	it("match-preview renders an upcoming match", () => {
		const html = renderers["match-preview"]({ type: "match-preview", homeTeam: "Liverpool", awayTeam: "Arsenal" }, ctx);
		expect(html).toContain("Liverpool");
	});

	it("golf-status renders the tracked player", () => {
		const html = renderers["golf-status"]({ type: "golf-status", tournament: "pga" }, ctx);
		expect(html).toContain("Hovland");
	});

	it("every renderer returns null (not a crash) on empty context", () => {
		const emptyCtx = { allEvents: [], recentResults: null, standings: null, liveScores: {}, liveLeaderboard: null, relativeTime: () => "", _getTrackedGolferNames: () => new Set() };
		for (const [type, fn] of Object.entries(renderers)) {
			expect(() => fn({ type }, emptyCtx), type).not.toThrow();
		}
	});
});
