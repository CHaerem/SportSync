// news-web.test.js — the Nyheter board's pure lens helpers (app-parity, WP-154).
// Mirrors NewsLens.swift: entityId hit OR followed whole-sport; empty profile is
// catalog-wide. The DOM rendering (renderNyheter/bindRootTabs) is a thin Dashboard
// prototype extension covered by the client render tests; here we pin the lens.

import { describe, it, expect } from "vitest";
import { ssNewsRelevant, ssCanonicalNewsSport, ssResultRows, ssInterleaveBySport, SS_RESULT_CAP } from "../docs/js/news-web.js";

describe("ssCanonicalNewsSport", () => {
	it("folds aliases and lowercases", () => {
		expect(ssCanonicalNewsSport("formula1")).toBe("f1");
		expect(ssCanonicalNewsSport("motorsport")).toBe("f1");
		expect(ssCanonicalNewsSport("soccer")).toBe("football");
		expect(ssCanonicalNewsSport("Football")).toBe("football");
		expect(ssCanonicalNewsSport(" Golf ")).toBe("golf");
	});
	it("is empty-safe", () => {
		expect(ssCanonicalNewsSport("")).toBe("");
		expect(ssCanonicalNewsSport(null)).toBe("");
		expect(ssCanonicalNewsSport(undefined)).toBe("");
	});
});

describe("ssNewsRelevant", () => {
	const item = (over) => ({ sport: "football", entityIds: [], ...over });

	it("empty/catalog-wide lens shows everything", () => {
		expect(ssNewsRelevant(item(), { catalogWide: true })).toBe(true);
		expect(ssNewsRelevant(item(), null)).toBe(true);
	});

	it("matches on an entityId the profile follows", () => {
		const lens = { entityIds: new Set(["viktor-hovland"]), sports: new Set() };
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: ["viktor-hovland"] }), lens)).toBe(true);
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: ["someone-else"] }), lens)).toBe(false);
	});

	it("matches on a followed WHOLE-sport (alias-normalised)", () => {
		const lens = { entityIds: new Set(), sports: new Set(["f1"]) };
		expect(ssNewsRelevant(item({ sport: "formula1", entityIds: [] }), lens)).toBe(true);
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: [] }), lens)).toBe(false);
	});

	it("an athlete follow does NOT open the whole sport (id-scoped, mirrors NewsLens)", () => {
		// Following Hovland (an entity id, no sport rule) admits golf news that NAMES
		// him (stamped id), not every golf headline.
		const lens = { entityIds: new Set(["viktor-hovland"]), sports: new Set() };
		expect(ssNewsRelevant(item({ sport: "golf", entityIds: [] }), lens)).toBe(false);
	});
});

// ── RESULTAT (WP-171) — the shared per-sport row DNA ─────────────────────────
// The board used to read only recent-results.json's `.football` key while The
// Open's final leaderboard and the F1 podium sat unused in the same file. These
// pin the projection (every sport onto ONE row shape), the goal-scorer lines the
// fetcher has always paid for, and the interleave that keeps a golf/F1 result
// inside the capped section on a busy football weekend.

const RESULTS_FIXTURE = {
	football: [
		{
			homeTeam: "Molde", awayTeam: "SK Brann", homeScore: 1, awayScore: 2,
			date: "2026-07-18T16:00Z", league: "Eliteserien",
			goalScorers: [
				{ player: "Denzel De Roeve", team: "SK Brann", minute: "8'" },
				{ player: "Seydina Diop", team: "Molde", minute: "88'" },
			],
		},
		{ homeTeam: "Lyn", awayTeam: "Kongsvinger", homeScore: 3, awayScore: 0, date: "2026-07-17T16:00Z", league: "OBOS-ligaen" },
		{ homeTeam: "Rosenborg", awayTeam: "Viking", homeScore: 1, awayScore: 1, date: "2026-07-16T16:00Z", league: "Eliteserien" },
		{ homeTeam: "Bodø/Glimt", awayTeam: "Tromsø", homeScore: 2, awayScore: 0, date: "2026-07-15T16:00Z", league: "Eliteserien" },
		{ homeTeam: "Sarpsborg", awayTeam: "Odd", homeScore: 0, awayScore: 0, date: "2026-07-14T16:00Z", league: "Eliteserien" },
	],
	golf: {
		pga: {
			tournamentName: "The Open", status: "final", completedRound: 4,
			topPlayers: [
				{ position: 1, player: "Ryan Fox", score: "-10" },
				{ position: 2, player: "Cameron Young", score: "-9" },
				{ position: 3, player: "Sam Burns", score: "-8" },
				{ position: 4, player: "Scottie Scheffler", score: "-7" },
			],
			norwegianPlayers: [{ position: 121, player: "Viktor Hovland", score: "+4" }],
		},
		dpWorld: { tournamentName: "BMW International", status: "in-progress", topPlayers: [{ position: 1, player: "X", score: "-3" }], norwegianPlayers: [] },
	},
	f1: [{
		raceName: "Belgian Grand Prix", type: "Race", date: "2026-07-17T11:30Z", circuit: "Spa",
		topDrivers: [
			{ position: 1, driver: "Kimi Antonelli" },
			{ position: 2, driver: "Charles Leclerc" },
			{ position: 3, driver: "Max Verstappen" },
			{ position: 4, driver: "Lewis Hamilton" },
		],
	}],
	tennis: [{ winner: "Casper Ruud", loser: "Alexander Zverev", score: "6-4, 7-5", date: "2026-07-16T12:00Z", tournament: "ATP Hamburg", round: "Semifinale" }],
};

describe("ssResultRows — every sport, one row DNA", () => {
	const rows = ssResultRows(RESULTS_FIXTURE);
	const bySport = (s) => rows.filter((r) => r.sport === s);

	it("keeps football with the score AND renders goal scorers with minute", () => {
		const molde = bySport("football").find((r) => r.title.includes("Molde"));
		expect(molde.outcome).toBe("1–2");
		expect(molde.meta).toBe("Eliteserien");
		expect(molde.details).toEqual(["8' Denzel De Roeve (SK Brann)", "88' Seydina Diop (Molde)"]);
		expect(molde.names).toEqual(["Molde", "SK Brann"]);
	});

	it("projects a FINISHED golf tournament onto the same shape (winner + top-3 + Norwegians)", () => {
		const golf = bySport("golf");
		expect(golf).toHaveLength(1); // the in-progress tour is NOT a result
		expect(golf[0].title).toBe("The Open");
		expect(golf[0].outcome).toBe("Ryan Fox -10");
		expect(golf[0].meta).toBe("PGA Tour · sluttresultat");
		expect(golf[0].details).toEqual(["1. Ryan Fox -10", "2. Cameron Young -9", "3. Sam Burns -8", "121. Viktor Hovland +4"]);
		expect(golf[0].names).toContain("Viktor Hovland");
	});

	it("projects an F1 race: winner as the outcome, podium as the details", () => {
		const f1 = bySport("f1")[0];
		expect(f1.title).toBe("Belgian Grand Prix");
		expect(f1.outcome).toBe("Kimi Antonelli");
		expect(f1.details).toEqual(["1. Kimi Antonelli", "2. Charles Leclerc", "3. Max Verstappen"]);
	});

	it("keeps the tennis TITLE outcome-neutral (alphabetical), outcome carries the winner", () => {
		const t = bySport("tennis")[0];
		expect(t.title).toBe("Alexander Zverev – Casper Ruud");
		expect(t.outcome).toBe("Casper Ruud 6-4, 7-5");
		expect(t.meta).toBe("ATP Hamburg · Semifinale");
	});

	it("caps the detail lines so a 10-goal match is not a wall (ro)", () => {
		const scorers = Array.from({ length: 11 }, (_, i) => ({ player: `Spiller ${i}`, team: "England", minute: `${i + 1}'` }));
		const row = ssResultRows({ football: [{ homeTeam: "France", awayTeam: "England", homeScore: 4, awayScore: 6, date: "2026-07-18T16:00Z", goalScorers: scorers }] })[0];
		expect(row.details).toHaveLength(6); // 5 lines + the honest remainder
		expect(row.details.at(-1)).toBe("+6 til");
	});

	it("is empty-safe", () => {
		expect(ssResultRows(null)).toEqual([]);
		expect(ssResultRows({})).toEqual([]);
		expect(ssResultRows({ football: [{ homeTeam: "", awayTeam: "" }], golf: { pga: null } })).toEqual([]);
	});
});

describe("ssInterleaveBySport", () => {
	it("gives every sport an answer before any sport gets a second one", () => {
		const all = ssResultRows(RESULTS_FIXTURE);
		const ordered = ssInterleaveBySport(all);
		const sports = ordered.slice(0, SS_RESULT_CAP).map((r) => r.sport);
		// Golf/F1/tennis survive inside the cap despite five football rows.
		expect(new Set(sports)).toEqual(new Set(["football", "golf", "f1", "tennis"]));
		expect(sports.filter((s) => s === "football")).toHaveLength(2);
		expect(ordered).toHaveLength(all.length); // nothing dropped
	});

	it("orders within a sport newest first", () => {
		const football = ssInterleaveBySport(ssResultRows(RESULTS_FIXTURE)).filter((r) => r.sport === "football");
		expect(football[0].title).toContain("Molde");
		expect(football.at(-1).title).toContain("Sarpsborg");
	});
});
