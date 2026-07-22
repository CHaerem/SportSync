// WP-170: the entity page's pure composition helpers (docs/js/entity-page.js) —
// the web twin of ios/Sportivista/Profile/EntityPage.swift. These pin the two
// things composition can get wrong: does a section carry the RIGHT entity's
// content, and does it degrade HONESTLY (omitted / no wrong table / no guessed
// link) when the data isn't there. The DOM wiring (entityPageHtml / openEntityPage)
// is exercised in dashboard-cards.test.js; here we test the pure functions
// network-free, like news-web.test.js.
import { describe, it, expect } from "vitest";
import {
	ssEntityUpcoming,
	ssEntityResults,
	ssEntityNews,
	ssEntityStandingsTable,
	ssSpecialistLink,
} from "../docs/js/entity-page.js";

// entity-page.js references shared-constants helpers (ssContainsTerm, trackedTerms,
// ssNextEventForEntity …) as globals; load them onto globalThis for the pure fns.
import { createClientSandbox, loadClientScript } from "./helpers/load-client.js";
const sb = createClientSandbox();
loadClientScript(sb, "shared-constants.js");
for (const k of ["ssContainsTerm", "trackedTerms", "ssNormalize", "ssEntityName", "ssNextEventForEntity"]) {
	globalThis[k] = sb.window[k];
}

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

describe("KOMMENDE — the entity's own next events, nearest first", () => {
	it("returns up to N upcoming events for the entity, sport-scoped", () => {
		const events = [
			{ sport: "tennis", title: "Wimbledon (Casper Ruud)", time: inDays(40) },
			{ sport: "tennis", title: "Gstaad (Casper Ruud)", time: inDays(6) },
			{ sport: "cycling", title: "Etappe: Barcelona", time: inDays(1) }, // name collision, wrong sport
		];
		const rows = ssEntityUpcoming(events, { name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis" });
		expect(rows.map((e) => e.title)).toEqual(["Gstaad (Casper Ruud)", "Wimbledon (Casper Ruud)"]);
	});

	it("is empty when the entity has nothing scheduled", () => {
		expect(ssEntityUpcoming([], { name: "Aryan Tari", sport: "chess" })).toEqual([]);
	});
});

describe("SISTE RESULTAT — filtered to the entity's participation", () => {
	const rows = [
		{ sport: "football", title: "France – England", names: ["France", "England"] },
		{ sport: "golf", title: "3M Open", names: ["Mackenzie Hughes"] },
	];
	it("keeps only rows the entity took part in", () => {
		expect(ssEntityResults(rows, { name: "England", sport: "football" }).map((r) => r.title)).toEqual(["France – England"]);
	});
	it("is empty for an entity absent from every result", () => {
		expect(ssEntityResults(rows, { name: "Lyn", sport: "football" })).toEqual([]);
	});
});

describe("SISTE NYTT — by stamped id, else by name; never the whole sport", () => {
	const news = [
		{ id: "n1", title: "England klar for finale", entityIds: ["england"], publishedAt: inDays(0) },
		{ id: "n2", title: "Annen fotballnyhet", entityIds: ["other"], publishedAt: inDays(0) },
		{ id: "n3", title: "Everton henter spiss", entityIds: [], publishedAt: inDays(-1) },
	];
	it("matches on a stamped entityId", () => {
		expect(ssEntityNews(news, { name: "England", sport: "football" }, "england").map((n) => n.id)).toEqual(["n1"]);
	});
	it("falls back to the name in the headline when no id", () => {
		expect(ssEntityNews(news, { name: "Everton", sport: "football" }).map((n) => n.id)).toEqual(["n3"]);
	});
});

describe("TABELL — only the table that is genuinely the entity's (WP-171 gate)", () => {
	const standings = {
		football: {
			premierLeague: [
				{ position: 1, team: "Liverpool", points: 30 },
				{ position: 2, team: "Arsenal", points: 28 },
				{ position: 3, team: "Manchester City", points: 27 },
				{ position: 4, team: "Chelsea", points: 25 },
				{ position: 5, team: "Newcastle", points: 24 },
				{ position: 14, team: "Everton", points: 13 },
			],
			laLiga: [{ position: 1, team: "Real Madrid", points: 20 }],
		},
		golf: { pga: { name: "3M Open", leaderboard: [{ position: 1, player: "Mackenzie Hughes", score: "-12" }], trackedPlayers: [] } },
		f1: { drivers: [{ position: 1, driver: "Kimi Antonelli", points: 204 }, { position: 2, driver: "Lewis Hamilton", points: 159 }] },
	};

	it("football: top 5 + the entity, marked, never cut away", () => {
		const table = ssEntityStandingsTable(standings, { name: "Everton", sport: "football" });
		expect(table.title).toBe("Premier League");
		expect(table.rows.map((r) => r.name)).toEqual(["Liverpool", "Arsenal", "Manchester City", "Chelsea", "Newcastle", "Everton"]);
		expect(table.rows.find((r) => r.name === "Everton").highlighted).toBe(true);
	});

	it("football: a club outside every published table gets NOTHING", () => {
		expect(ssEntityStandingsTable(standings, { name: "Lyn", sport: "football" })).toBe(null);
	});

	it("golf: the leaderboard when the entity is on it", () => {
		const table = ssEntityStandingsTable(standings, { name: "Mackenzie Hughes", sport: "golf" });
		expect(table.title).toBe("3M Open");
		expect(table.rows[0].highlighted).toBe(true);
	});

	it("f1: the championship with the driver marked", () => {
		const table = ssEntityStandingsTable(standings, { name: "Lewis Hamilton", sport: "f1" });
		expect(table.title).toBe("VM-stilling");
		expect(table.rows.find((r) => r.name === "Lewis Hamilton").highlighted).toBe(true);
	});

	it("no standings → null", () => {
		expect(ssEntityStandingsTable(null, { name: "Everton", sport: "football" })).toBe(null);
	});
});

describe("MER — linked, never guessed", () => {
	it("football → FotMob with an encoded name", () => {
		const link = ssSpecialistLink("football", "FK Lyn Oslo");
		expect(link.label).toBe("FotMob");
		expect(link.url).toBe("https://www.fotmob.com/search?term=FK%20Lyn%20Oslo");
	});
	it("encodes characters that would escape the query parameter", () => {
		expect(ssSpecialistLink("cycling", "A & B").url).not.toContain("&B");
	});
	it("an unmapped sport (or empty name) has no link", () => {
		expect(ssSpecialistLink("chess", "Magnus Carlsen")).toBe(null);
		expect(ssSpecialistLink("football", "  ")).toBe(null);
	});
});
