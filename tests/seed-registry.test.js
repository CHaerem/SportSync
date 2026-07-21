// WP-161: the registry seed scripts (scripts/seed-registry/) — NETWORK-FREE.
// Every transform is pure (source payload in → entity candidates out) and is
// exercised here with fixture payloads shaped exactly like the live responses;
// the merge/serialization contract (stable ids across re-seeds, deterministic
// bytes) is what makes the checked-in registry files reviewable artifacts.
import { describe, it, expect } from "vitest";
import { mergeRegistry, serializeRegistry, slugify } from "../scripts/seed-registry/seed-lib.js";
import { footballEntitiesFromTeams, f1EntitiesFromStandings, tennisEntitiesFromRankings, FOOTBALL_LEAGUES } from "../scripts/seed-registry/espn.js";
import { chessEntitiesFromTopList, flipFideName } from "../scripts/seed-registry/fide.js";
import { esportsEntitiesFromPortalHtml, decodeHtmlEntities } from "../scripts/seed-registry/liquipedia.js";
import { cyclingTeamEntities, cyclingRiderEntities, athleteEntities, teamEntities, WINTER_SPORTS } from "../scripts/seed-registry/wikidata.js";

// --- fixtures (mirrors of the live response shapes) ---

const espnTeamsFixture = {
	sports: [{ leagues: [{ teams: [
		{ team: { id: "364", displayName: "Liverpool", shortDisplayName: "Liverpool", abbreviation: "LIV" } },
		{ team: { id: "349", displayName: "AFC Bournemouth", shortDisplayName: "Bournemouth", abbreviation: "BOU" } },
		{ team: { id: "0", abbreviation: "XXX" } }, // no displayName → dropped
	] }] }],
};

const espnRankingsFixture = {
	rankings: [{ name: "ATP", ranks: [
		{ current: 1, athlete: { id: "3623", displayName: "Jannik Sinner", shortname: "J. Sinner", citizenshipCountry: "ITA" } },
		{ current: 2, athlete: { id: "2989", displayName: "Casper Ruud", citizenshipCountry: "NOR" } },
		{ current: 3 }, // no athlete → dropped
	] }],
};

const espnF1Fixture = {
	children: [
		{ name: "Driver Standings", standings: { entries: [
			{ athlete: { id: "4665", displayName: "Max Verstappen", flag: { alt: "Netherlands" } } },
		] } },
		{ name: "Constructor Standings", standings: { entries: [
			{ team: { id: "106893", displayName: "Mercedes" } },
		] } },
	],
};

const fideHtmlFixture = `
<tr><td><span class="rank_span">1</span></td>
<td><a href=/profile/1503014>Carlsen, Magnus</a></td>
<td class="flag-wrapper"><img src="/images/flags/no.svg" height=20> NOR</td>
<td>2823</td><td>1990</td></tr>
<tr><td><span class="rank_span">2</span></td>
<td><a href=/profile/2020009>Nakamura, Hikaru</a></td>
<td class="flag-wrapper"><img src="/images/flags/us.svg" height=20> USA</td>
<td>2807</td><td>1987</td></tr>`;

const liquipediaHtmlFixture = `
<span class="team-template-text"><a href="/counterstrike/Natus_Vincere" title="Natus Vincere">Natus Vincere</a></span>
<span class="team-template-text"><a href="/counterstrike/Dobry%26Gaming" title="x">Dobry&amp;Gaming</a></span>
<span class="team-template-text"><a href="/counterstrike/Natus_Vincere" title="dup">Natus Vincere</a></span>
<span class="team-template-text"><a href="/counterstrike/index.php?title=Redlink&action=edit" title="x">Redlink</a></span>`;

const wd = (qid) => `http://www.wikidata.org/entity/${qid}`;

// --- transforms ---

describe("espn transforms", () => {
	it("covers exactly the leagues the football fetcher covers (sports-config mirror)", () => {
		expect(FOOTBALL_LEAGUES.map((l) => l.code)).toEqual(["eng.1", "esp.1", "nor.1", "nor.2", "uefa.champions", "fifa.world"]);
	});

	it("teams API → team candidates with espnId; shortDisplayName alias only when real (≥4 chars, different)", () => {
		const out = footballEntitiesFromTeams(espnTeamsFixture);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ name: "Liverpool", aliases: [], sport: "football", type: "team", external: { espnId: "364" } });
		expect(out[1].aliases).toEqual(["Bournemouth"]); // never the 3-letter abbreviation
	});

	it("national-team leagues (fifa.world) stamp the country", () => {
		const out = footballEntitiesFromTeams(espnTeamsFixture, { national: true });
		expect(out[0].country).toBe("Liverpool"); // display name IS the country for fifa.world payloads
	});

	it("F1 standings → drivers as athletes + constructors as teams", () => {
		const out = f1EntitiesFromStandings(espnF1Fixture);
		expect(out).toEqual([
			{ name: "Max Verstappen", aliases: [], sport: "f1", type: "athlete", country: "Netherlands", external: { espnId: "4665" } },
			{ name: "Mercedes", aliases: [], sport: "f1", type: "team", external: { espnId: "106893" } },
		]);
	});

	it("tennis rankings → top-N athletes, no surname/shortname aliases", () => {
		const out = tennisEntitiesFromRankings(espnRankingsFixture, { top: 1 });
		expect(out).toEqual([
			{ name: "Jannik Sinner", aliases: [], sport: "tennis", type: "athlete", country: "ITA", external: { espnId: "3623" } },
		]);
	});
});

describe("fide transforms", () => {
	it('flips "Lastname, Firstname" and keeps plain names as-is', () => {
		expect(flipFideName("Carlsen, Magnus")).toBe("Magnus Carlsen");
		expect(flipFideName("Praggnanandhaa R")).toBe("Praggnanandhaa R");
	});

	it("top-list HTML → athletes with fideId + federation, no surname aliases", () => {
		const out = chessEntitiesFromTopList(fideHtmlFixture);
		expect(out).toEqual([
			{ name: "Magnus Carlsen", aliases: [], sport: "chess", type: "athlete", country: "NOR", external: { fideId: "1503014" } },
			{ name: "Hikaru Nakamura", aliases: [], sport: "chess", type: "athlete", country: "USA", external: { fideId: "2020009" } },
		]);
	});
});

describe("liquipedia transforms", () => {
	it("Portal:Teams HTML → orgs deduped by page, redlinks skipped, HTML entities decoded", () => {
		const out = esportsEntitiesFromPortalHtml(liquipediaHtmlFixture);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ name: "Natus Vincere", aliases: [], sport: "esports", type: "team", external: { liquipedia: "Natus_Vincere" } });
		expect(out[1].name).toBe("Dobry&Gaming");
		expect(out[1].external.liquipedia).toBe("Dobry&Gaming");
	});

	it("decodes the MediaWiki entity set", () => {
		expect(decodeHtmlEntities("A&amp;B &#39;x&#039; &quot;q&quot;")).toBe("A&B 'x' \"q\"");
	});
});

describe("wikidata transforms", () => {
	it("WorldTeam bindings → newest official name wins, stale label kept as alias", () => {
		const bindings = [
			{ team: { value: wd("Q6233") }, teamLabel: { value: "Team Jumbo-Visma" }, official: { value: "Team Jumbo-Visma" }, start: { value: "2019-01-01" } },
			{ team: { value: wd("Q6233") }, teamLabel: { value: "Team Jumbo-Visma" }, official: { value: "Team Visma | Lease a Bike" }, start: { value: "2024-01-01" } },
		];
		expect(cyclingTeamEntities(bindings)).toEqual([
			{ name: "Team Visma | Lease a Bike", aliases: ["Team Jumbo-Visma"], sport: "cycling", type: "team", external: { wikidata: "Q6233" } },
		]);
	});

	it("rider bindings → athletes deduped by QID, label-less items dropped", () => {
		const bindings = [
			{ rider: { value: wd("Q26904312") }, riderLabel: { value: "Tadej Pogačar" }, countryLabel: { value: "Slovenia" } },
			{ rider: { value: wd("Q26904312") }, riderLabel: { value: "Tadej Pogačar" } },
			{ rider: { value: wd("Q999") }, riderLabel: { value: "Q999" } },
		];
		const out = cyclingRiderEntities(bindings);
		expect(out).toEqual([
			{ name: "Tadej Pogačar", aliases: [], sport: "cycling", type: "athlete", country: "Slovenia", external: { wikidata: "Q26904312" } },
		]);
	});

	it("winter athlete bindings map each sport QID to its Sportivista tag", () => {
		const bindings = [
			{ a: { value: wd("Q1334428") }, aLabel: { value: "Johannes Thingnes Bø" }, sportQ: { value: "Q166788" }, countryLabel: { value: "Norge" }, links: { value: "30" } },
		];
		const out = athleteEntities(bindings, (q) => WINTER_SPORTS[q]);
		expect(out).toEqual([
			{ name: "Johannes Thingnes Bø", aliases: [], sport: "biathlon", type: "athlete", country: "Norge", external: { wikidata: "Q1334428" } },
		]);
	});

	it("team bindings (handball) → teams with a fixed sport tag", () => {
		const bindings = [
			{ t: { value: wd("Q19377654") }, tLabel: { value: "Kolstad Håndball" }, countryLabel: { value: "Norge" } },
		];
		expect(teamEntities(bindings, "handball")).toEqual([
			{ name: "Kolstad Håndball", aliases: [], sport: "handball", type: "team", country: "Norge", external: { wikidata: "Q19377654" } },
		]);
	});
});

// --- merge + serialization (the re-seed contract) ---

describe("mergeRegistry", () => {
	const existing = [
		{ id: "team-jumbo-visma", name: "Team Jumbo-Visma", aliases: [], sport: "cycling", type: "team", external: { wikidata: "Q6233" } },
	];

	it("a rename keeps the id (external match) and folds the old name into aliases", () => {
		const fresh = [{ name: "Team Visma | Lease a Bike", aliases: [], sport: "cycling", type: "team", external: { wikidata: "Q6233" } }];
		const out = mergeRegistry(existing, fresh);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe("team-jumbo-visma"); // stable primary key
		expect(out[0].name).toBe("Team Visma | Lease a Bike");
		expect(out[0].aliases).toContain("Team Jumbo-Visma");
	});

	it("slug match works when the source has no overlapping external id yet", () => {
		const fresh = [{ name: "Team Jumbo-Visma", aliases: ["TJV"], sport: "cycling", type: "team", external: { espnId: "77" } }];
		const out = mergeRegistry(existing, fresh);
		expect(out).toHaveLength(1);
		expect(out[0].external).toEqual({ wikidata: "Q6233", espnId: "77" });
		expect(out[0].aliases).toContain("TJV");
	});

	it("entities missing from a fresh seed are KEPT (the registry is durable)", () => {
		const out = mergeRegistry(existing, []);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Team Jumbo-Visma");
	});

	it("a new entity colliding with a reserved slug (another file) gets a deterministic suffix", () => {
		const fresh = [{ name: "Norway", aliases: [], sport: "handball", type: "team", external: { wikidata: "Q1" } }];
		const out = mergeRegistry([], fresh, new Set(["norway"]));
		expect(out[0].id).toBe("norway-2");
	});
});

describe("serializeRegistry (deterministic artifact)", () => {
	const meta = { $schema: "note", source: "test" };
	const entities = [
		{ id: "b-team", name: "B", aliases: [], sport: "football", type: "team", external: { espnId: "2" } },
		{ id: "a-team", name: "A", aliases: [], sport: "football", type: "team", country: "Norge", external: { espnId: "1" } },
	];

	it("sorts by id, uses tabs, ends with a newline, and is byte-stable across runs", () => {
		const one = serializeRegistry(meta, entities);
		const two = serializeRegistry(meta, [...entities].reverse());
		expect(one).toBe(two); // input order never leaks into the artifact
		expect(one.startsWith('{\n\t"$schema"')).toBe(true);
		expect(one.endsWith("}\n")).toBe(true);
		const parsed = JSON.parse(one);
		expect(parsed.entities.map((e) => e.id)).toEqual(["a-team", "b-team"]);
		// stable key order per entity
		expect(Object.keys(parsed.entities[0])).toEqual(["id", "name", "aliases", "sport", "type", "country", "external"]);
	});

	it("slugify matches build-entities (one slug algorithm across seed + build)", () => {
		expect(slugify("Søren Wærenskjold")).toBe("soren-waerenskjold");
		expect(slugify("Team Visma | Lease a Bike")).toBe("team-visma-lease-a-bike");
	});
});
