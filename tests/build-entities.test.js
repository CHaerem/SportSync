// WP-05: docs/data/entities.json — a stable-id index of athletes/teams/
// tournaments/leagues, built from tracked.json + norwegian-golfers.json +
// sports-config.js, deduped across sources.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildEntityIndex, writeEntities } from "../scripts/build-entities.js";
import { entityTerms } from "../scripts/lib/helpers.js";

function tmpDir(prefix) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("buildEntityIndex", () => {
	it("builds entries from all three sources: tracked.json, norwegian-golfers.json, sports-config.js", () => {
		const configDir = tmpDir("ss-entities-sources-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({
				leagues: [{ id: "premier-league-2026-27", name: "Premier League 2026/27", sport: "football" }],
				athletes: [{ id: "viktor-hovland", name: "Viktor Hovland", sport: "golf" }],
				tournaments: [{ id: "the-open-2026", name: "The Open 2026", sport: "golf" }],
			})
		);
		fs.writeFileSync(
			path.join(configDir, "norwegian-golfers.json"),
			JSON.stringify([{ name: "Kris Ventura", tours: ["pga"], aliases: ["Ventura"] }])
		);
		const fakeSportsConfig = {
			football: { sport: "football", norwegian: { teams: ["FK Lyn Oslo", "Lyn"] } },
		};

		const entities = buildEntityIndex(configDir, fakeSportsConfig);

		expect(entities.find((e) => e.id === "premier-league-2026-27")).toMatchObject({ type: "league", sport: "football" });
		expect(entities.find((e) => e.id === "viktor-hovland")).toMatchObject({ type: "athlete", sport: "golf" });
		expect(entities.find((e) => e.id === "the-open-2026")).toMatchObject({ type: "tournament", sport: "golf" });
		expect(entities.find((e) => e.name === "Kris Ventura")).toMatchObject({ type: "athlete", sport: "golf", aliases: ["Ventura"] });
		// sports-config's free-text team list, deduped down to one entity (Lyn merges as an alias of FK Lyn Oslo).
		const lynTeam = entities.find((e) => e.name === "FK Lyn Oslo");
		expect(lynTeam).toMatchObject({ type: "team", sport: "football" });
		expect(lynTeam.aliases).toContain("Lyn");
		expect(entities.filter((e) => e.sport === "football" && e.type === "team")).toHaveLength(1);

		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("every entry has the {id, name, aliases, sport, type} shape", () => {
		const configDir = tmpDir("ss-entities-shape-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "magnus-carlsen", name: "Magnus Carlsen", sport: "chess" }] })
		);
		const entities = buildEntityIndex(configDir, {});
		expect(entities.length).toBeGreaterThan(0);
		for (const e of entities) {
			expect(typeof e.id).toBe("string");
			expect(typeof e.name).toBe("string");
			expect(Array.isArray(e.aliases)).toBe(true);
			expect(["athlete", "team", "tournament", "league", "sport", "category"]).toContain(e.type);
		}
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("dedups a tracked.json athlete against the same name in sports-config.js — tracked's id wins", () => {
		const configDir = tmpDir("ss-entities-dedup-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "casper-ruud", name: "Casper Ruud", sport: "tennis" }] })
		);
		const fakeSportsConfig = { tennis: { sport: "tennis", norwegian: { players: ["Casper Ruud"] } } };

		const entities = buildEntityIndex(configDir, fakeSportsConfig);

		const ruudEntities = entities.filter((e) => e.name === "Casper Ruud");
		expect(ruudEntities).toHaveLength(1); // not two separate entities for the same person
		expect(ruudEntities[0].id).toBe("casper-ruud"); // tracked.json's id wins
	});

	it("merges an alias-only match across sources (golfers.json alias vs. tracked.json full name)", () => {
		// Realistic case: tracked.json tracks "Kristoffer Ventura" (full name);
		// norwegian-golfers.json / sports-config use the short form "Kris Ventura"
		// with alias "Ventura". The shared alias "Ventura" word-boundary-matches
		// the tracked full name, so these fold into ONE entity under tracked's id.
		const configDir = tmpDir("ss-entities-alias-dedup-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "kristoffer-ventura", name: "Kristoffer Ventura", sport: "golf" }] })
		);
		fs.writeFileSync(
			path.join(configDir, "norwegian-golfers.json"),
			JSON.stringify([{ name: "Kris Ventura", aliases: ["Ventura"] }])
		);
		const entities = buildEntityIndex(configDir, {});
		const venturaEntities = entities.filter((e) => e.sport === "golf" && e.type === "athlete");
		expect(venturaEntities).toHaveLength(1);
		expect(venturaEntities[0].id).toBe("kristoffer-ventura");
		expect(venturaEntities[0].aliases).toEqual(expect.arrayContaining(["Kris Ventura", "Ventura"]));
	});

	it("does NOT fold a league's parenthetical annotation into a false team match (the Lyn/OBOS-ligaen trap)", () => {
		// Regression found while implementing WP-05: tracked.json names a league
		// "OBOS-ligaen 2026 (Lyn Oslo)" for human-readable context. Left in, that
		// parenthetical would make the LEAGUE entity word-boundary-match the club
		// name "Lyn" too — so a homeTeam "Lyn" would wrongly resolve to the league
		// instead of the actual club entity. The league's match-name must have the
		// annotation stripped.
		const configDir = tmpDir("ss-entities-annotation-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ leagues: [{ id: "obos-ligaen-2026", name: "OBOS-ligaen 2026 (Lyn Oslo)", sport: "football" }] })
		);
		const fakeSportsConfig = { football: { sport: "football", norwegian: { teams: ["FK Lyn Oslo", "Lyn"] } } };
		const entities = buildEntityIndex(configDir, fakeSportsConfig);

		const league = entities.find((e) => e.id === "obos-ligaen-2026");
		expect(league.name).toBe("OBOS-ligaen 2026"); // annotation stripped from the match/display name
		expect(league.aliases).not.toContain("Lyn");

		const team = entities.find((e) => e.name === "FK Lyn Oslo");
		expect(team.type).toBe("team");
		expect(team.aliases).toContain("Lyn"); // Lyn merged into the TEAM entity, not the league
	});

	// WP-125: nickname / initial-form consolidation (the 100T lens-miss class).
	it("consolidates a nickname/initial-form team duplicate into ONE entity (100T ⇒ alias of 100 Thieves)", () => {
		// The real source: sports-config lists BOTH spellings so the esports
		// focus-team filter matches either; un-folded they became `100-thieves` +
		// `100t`, so following one never matched events/news stamped with the other.
		const fakeSportsConfig = {
			esports: { sport: "esports", norwegian: { teams: ["100 Thieves", "100T"] } },
		};
		const entities = buildEntityIndex(tmpDir("ss-entities-nickname-"), fakeSportsConfig);
		const esTeams = entities.filter((e) => e.sport === "esports" && e.type === "team");
		expect(esTeams).toHaveLength(1); // one team, not two
		expect(esTeams[0].id).toBe("100-thieves"); // the full name wins the id (registered first)
		expect(esTeams[0].name).toBe("100 Thieves");
		expect(esTeams[0].aliases).toContain("100T"); // the nickname folds in as an alias
	});

	it("does NOT over-merge two distinct multi-word teams (Real Madrid vs. Real Mallorca stay separate)", () => {
		// Safety boundary: the initial-form rule compares a MULTI-word name against a
		// SINGLE-token nickname only — two multi-word clubs are never abbreviated
		// onto each other, so a shared leading word cannot collapse them.
		const fakeSportsConfig = {
			football: { sport: "football", norwegian: { teams: ["Real Madrid", "Real Mallorca"] } },
		};
		const entities = buildEntityIndex(tmpDir("ss-entities-no-overmerge-"), fakeSportsConfig);
		const teams = entities.filter((e) => e.sport === "football" && e.type === "team");
		expect(teams).toHaveLength(2);
		expect(teams.map((e) => e.name).sort()).toEqual(["Real Madrid", "Real Mallorca"]);
	});

	// WP-133: cross-language national-team consolidation (the Norway/Norge lens-miss class).
	it("consolidates a cross-language national-team duplicate into ONE entity (Norway ⇒ alias of Norge)", () => {
		// The real source: sports-config lists BOTH "Norge" and "Norway" so the
		// football relevance filter matches either spelling; un-folded they became
		// `norge` + `norway`, so following one never matched events stamped with the
		// other. The two share no token and are not initial-forms, so only the curated
		// known-alias table folds them. "Norge" is listed first → wins the id.
		const fakeSportsConfig = {
			football: { sport: "football", norwegian: { teams: ["Norge", "Norway"] } },
		};
		const entities = buildEntityIndex(tmpDir("ss-entities-national-"), fakeSportsConfig);
		const teams = entities.filter((e) => e.sport === "football" && e.type === "team");
		expect(teams).toHaveLength(1); // one national team, not two
		expect(teams[0].id).toBe("norge"); // Norwegian display name wins the id
		expect(teams[0].name).toBe("Norge");
		expect(teams[0].aliases).toContain("Norway"); // the other spelling folds in as an alias
	});

	it("known-alias folding is surgical — two unrelated single-word teams stay separate", () => {
		// The curated table only folds the exact listed spellings; a country NOT
		// grouped with another (e.g. "Norway" vs "Denmark") must remain two entities.
		const fakeSportsConfig = {
			football: { sport: "football", norwegian: { teams: ["Norway", "Denmark"] } },
		};
		const entities = buildEntityIndex(tmpDir("ss-entities-national-safe-"), fakeSportsConfig);
		const teams = entities.filter((e) => e.sport === "football" && e.type === "team");
		expect(teams).toHaveLength(2);
		expect(teams.map((e) => e.name).sort()).toEqual(["Denmark", "Norway"]);
	});

	it("folds the real sports-config Norway/Norge pair into a single `norge` entity (production guard)", () => {
		// Non-vacuous: build against the REAL default config (which lists both
		// spellings) and assert the pair is consolidated with no stray `norway`.
		const entities = buildEntityIndex();
		const national = entities.filter((e) => e.sport === "football" && (e.id === "norge" || e.id === "norway"));
		expect(national.map((e) => e.id)).toEqual(["norge"]);
		expect(entities.find((e) => e.id === "norge").aliases).toContain("Norway");
		expect(entities.find((e) => e.id === "norway")).toBeUndefined();
	});

	it("guards the built index against same-type nickname/initial-form duplicates (normalized comparison)", () => {
		// Independent (normalized) mirror of the relation the generator now folds,
		// so this is a genuine regression guard, not a tautology: within any
		// sport+type, no entity NAME may be the initial/nickname form of another's.
		const normalize = (s) => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
		const initialForm = (name) => {
			const words = normalize(name).split(/\s+/).filter(Boolean);
			if (words.length < 2) return null;
			return words.map((w) => (/^\d/.test(w) ? w : Array.from(w)[0])).join("");
		};
		const isNickname = (a, b) => {
			const na = normalize(a), nb = normalize(b);
			if (!na || !nb) return false;
			return (!/\s/.test(nb) && initialForm(na) === nb) || (!/\s/.test(na) && initialForm(nb) === na);
		};
		// Run over the REAL default config (docs/data/entities.json's source), so a
		// production regression — e.g. a new 100T-style pair the generator fails to
		// fold — trips this. The generator guarantees the invariant by construction.
		const entities = buildEntityIndex();
		const byGroup = new Map();
		for (const e of entities) {
			const key = `${normalize(e.sport)}|${e.type}`;
			if (!byGroup.has(key)) byGroup.set(key, []);
			byGroup.get(key).push(e);
		}
		const dupes = [];
		for (const group of byGroup.values()) {
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					if (isNickname(group[i].name, group[j].name)) {
						dupes.push(`${group[i].name} ⇄ ${group[j].name} (${group[i].sport}/${group[i].type})`);
					}
				}
			}
		}
		expect(dupes).toEqual([]);
		// Non-vacuous: the real esports team really is consolidated under one id.
		const hundred = entities.filter((e) => e.id === "100-thieves");
		expect(hundred).toHaveLength(1);
		expect(hundred[0].aliases).toContain("100T");
		expect(entities.find((e) => e.id === "100t")).toBeUndefined();
	});

	it("generates a stable, readable kebab-case slug for a free-text name with no existing id", () => {
		const fakeSportsConfig = { cycling: { sport: "cycling", norwegian: { players: ["Søren Wærenskjold"] } } };
		const entities = buildEntityIndex(tmpDir("ss-entities-slug-"), fakeSportsConfig);
		const entity = entities.find((e) => e.name === "Søren Wærenskjold");
		expect(entity.id).toBe("soren-waerenskjold");
	});

	// WP-16.2: app-resolver aliases (year-strip + initial acronym).
	it("generates a year-strip alias for a year-suffixed name (\"Tour de France 2026\" → \"Tour de France\")", () => {
		const configDir = tmpDir("ss-entities-yearstrip-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({
				tournaments: [
					{ id: "tour-de-france-2026", name: "Tour de France 2026", sport: "cycling" },
					{ id: "the-open-2026", name: "The Open Championship 2026 (Royal Birkdale)", sport: "golf" },
					{ id: "la-liga-2026-27", name: "La Liga 2026/27", sport: "football" },
				],
			})
		);
		const entities = buildEntityIndex(configDir, {});
		expect(entities.find((e) => e.id === "tour-de-france-2026").aliases).toContain("Tour de France");
		// Trailing parenthetical + year both stripped.
		expect(entities.find((e) => e.id === "the-open-2026").aliases).toContain("The Open Championship");
		// Season token "2026/27" stripped too.
		expect(entities.find((e) => e.id === "la-liga-2026-27").aliases).toContain("La Liga");
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("generates an initial-alias for a 3+-word name (\"Tour de France\" → \"TdF\"), in a separate `initials` field", () => {
		const configDir = tmpDir("ss-entities-initials-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({
				tournaments: [
					{ id: "tour-de-france-2026", name: "Tour de France 2026", sport: "cycling" },
					{ id: "the-open-2026", name: "The Open 2026", sport: "golf" }, // 2 words after strip → none
				],
			})
		);
		const entities = buildEntityIndex(configDir, {});
		const tdf = entities.find((e) => e.id === "tour-de-france-2026");
		expect(tdf.initials).toEqual(["TdF"]);
		// A 2-word name gets no acronym (would be too collision-prone).
		expect(entities.find((e) => e.id === "the-open-2026").initials).toBeUndefined();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("drops the initial-alias from BOTH entities when two share the same acronym (collision)", () => {
		const configDir = tmpDir("ss-entities-collision-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({
				tournaments: [
					{ id: "alpha-beta-gamma", name: "Alpha Beta Gamma", sport: "golf" },
					{ id: "apple-banana-grape", name: "Apple Banana Grape", sport: "tennis" },
				],
			})
		);
		const entities = buildEntityIndex(configDir, {});
		// Both would be "ABG" → ambiguous → neither carries a stored acronym.
		expect(entities.find((e) => e.id === "alpha-beta-gamma").initials).toBeUndefined();
		expect(entities.find((e) => e.id === "apple-banana-grape").initials).toBeUndefined();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("keeps the initial-alias OUT of server-side matching terms (initials never reach containsName/entityTerms)", () => {
		const configDir = tmpDir("ss-entities-server-safe-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ tournaments: [{ id: "tour-de-france-2026", name: "Tour de France 2026", sport: "cycling" }] })
		);
		const entities = buildEntityIndex(configDir, {});
		const tdf = entities.find((e) => e.id === "tour-de-france-2026");
		// The acronym exists as resolver data …
		expect(tdf.initials).toEqual(["TdF"]);
		// … but is NOT in `aliases`, and NOT in the terms server matching reads.
		expect(tdf.aliases).not.toContain("TdF");
		expect(entityTerms(tdf)).not.toContain("TdF");
		expect(entityTerms(tdf)).toEqual([tdf.name, ...tdf.aliases]);
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	// WP-64: sport-/category-level coverage entities (the winter-sport datahull).
	it("publishes one sport entity per followBroadly sport with a Norwegian name + aliases", () => {
		const configDir = tmpDir("ss-entities-broad-");
		// No interests.json → the default followBroadly set (incl. winter sports).
		const entities = buildEntityIndex(configDir, {});

		const biathlon = entities.find((e) => e.id === "sport-biathlon");
		expect(biathlon).toMatchObject({ name: "Skiskyting", sport: "biathlon", type: "sport" });
		expect(biathlon.aliases).toContain("biathlon");

		const langrenn = entities.find((e) => e.id === "sport-cross-country");
		expect(langrenn).toMatchObject({ name: "Langrenn", sport: "cross-country", type: "sport" });

		const alpint = entities.find((e) => e.id === "sport-alpine");
		expect(alpint).toMatchObject({ name: "Alpint", sport: "alpine", type: "sport" });

		const hopp = entities.find((e) => e.id === "sport-ski-jumping");
		expect(hopp).toMatchObject({ name: "Hopp", sport: "ski jumping", type: "sport" });

		// Non-winter followBroadly sports get a sport entity too (as a low-priority
		// fallback; existing tournaments/teams still win representativeEntity).
		expect(entities.find((e) => e.id === "sport-football")).toMatchObject({ name: "Fotball", type: "sport" });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("publishes a groundable «Vintersport» umbrella category covering the winter set", () => {
		const configDir = tmpDir("ss-entities-cat-");
		const entities = buildEntityIndex(configDir, {});
		const cat = entities.find((e) => e.id === "category-winter-sports");
		expect(cat).toMatchObject({ name: "Vintersport", type: "category" });
		expect(cat.aliases).toEqual(expect.arrayContaining(["vinteridrett", "vinteridretter"]));
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("honours interests.followBroadly — only listed sports get a sport entity, category dropped when no winter member", () => {
		const configDir = tmpDir("ss-entities-fb-");
		fs.writeFileSync(
			path.join(configDir, "interests.json"),
			JSON.stringify({ followBroadly: ["golf", "tennis"] })
		);
		const entities = buildEntityIndex(configDir, {});
		expect(entities.find((e) => e.id === "sport-golf")).toBeDefined();
		expect(entities.find((e) => e.id === "sport-tennis")).toBeDefined();
		expect(entities.find((e) => e.id === "sport-biathlon")).toBeUndefined();
		// No winter member in scope → no umbrella category.
		expect(entities.find((e) => e.id === "category-winter-sports")).toBeUndefined();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("sport/category entities are server-inert — never stamped onto an event by build-events", () => {
		// enrichEntityIds only pools athlete/team/league; assert no sport/category
		// entity is in those pools (so a "Golf"/"Vintersport" name can't false-match).
		const configDir = tmpDir("ss-entities-inert-");
		const entities = buildEntityIndex(configDir, {});
		const pooled = entities.filter((e) => ["athlete", "team", "league"].includes(e.type));
		expect(pooled.some((e) => e.type === "sport" || e.type === "category")).toBe(false);
		expect(entities.some((e) => e.type === "sport")).toBe(true);
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("is deterministic across two runs on the same input", () => {
		const configDir = tmpDir("ss-entities-determinism-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "viktor-hovland", name: "Viktor Hovland", sport: "golf" }] })
		);
		const first = buildEntityIndex(configDir, {});
		const second = buildEntityIndex(configDir, {});
		expect(second).toEqual(first);
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	// WP-160: catalog.json tier2 long-tail folds in as a fourth source.
	it("folds catalog.json tier2 teams → team and tournaments → tournament (with catalog aliases)", () => {
		const configDir = tmpDir("ss-entities-tier2-");
		fs.writeFileSync(
			path.join(configDir, "catalog.json"),
			JSON.stringify({
				tier1: ["football"],
				tier2: {
					teams: [{ name: "Liverpool", aliases: ["Liverpool FC"], sport: "football" }],
					tournaments: [{ name: "Premier League", aliases: ["EPL"], sport: "football" }],
					athletes: [{ name: "Casper Ruud", aliases: ["Ruud"], sport: "tennis" }],
				},
			})
		);
		const entities = buildEntityIndex(configDir, {});
		const liverpool = entities.find((e) => e.id === "liverpool");
		expect(liverpool).toMatchObject({ name: "Liverpool", type: "team", sport: "football" });
		expect(liverpool.aliases).toContain("Liverpool FC");
		const pl = entities.find((e) => e.id === "premier-league");
		expect(pl).toMatchObject({ name: "Premier League", type: "tournament", sport: "football" });
		expect(pl.aliases).toContain("EPL");
		// tier2.athletes are intentionally NOT folded (out of WP-160 scope: teams + tournaments only).
		expect(entities.find((e) => e.name === "Casper Ruud")).toBeUndefined();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("tracked.json still wins tier2 dedup for a same-type overlap (Tour de France folds under the tracked id)", () => {
		const configDir = tmpDir("ss-entities-tier2-dedup-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ tournaments: [{ id: "tour-de-france-2026", name: "Tour de France 2026", sport: "cycling" }] })
		);
		fs.writeFileSync(
			path.join(configDir, "catalog.json"),
			JSON.stringify({ tier2: { tournaments: [{ name: "Tour de France", aliases: ["TdF"], sport: "cycling" }] } })
		);
		const entities = buildEntityIndex(configDir, {});
		const tdf = entities.filter((e) => e.sport === "cycling" && e.type === "tournament");
		expect(tdf).toHaveLength(1); // one entity, not two
		expect(tdf[0].id).toBe("tour-de-france-2026"); // tracked's id wins (folded first)
		expect(tdf[0].aliases).toContain("TdF"); // the catalog alias folds in
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("keeps a tier2 team distinct from a tracked club MISFILED under a different type (Barcelona team vs. fc-barcelona league)", () => {
		// The NOTE ON TYPE ACCURACY case: tracked files clubs under "leagues", but
		// tier2 has precise team lists — so where the buckets disagree on type, the
		// tier2 type is authoritative and it registers as its own team entity.
		const configDir = tmpDir("ss-entities-tier2-type-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ leagues: [{ id: "fc-barcelona", name: "FC Barcelona", sport: "football" }] })
		);
		fs.writeFileSync(
			path.join(configDir, "catalog.json"),
			JSON.stringify({ tier2: { teams: [{ name: "Barcelona", aliases: ["FC Barcelona"], sport: "football" }] } })
		);
		const entities = buildEntityIndex(configDir, {});
		expect(entities.find((e) => e.id === "fc-barcelona").type).toBe("league");
		expect(entities.find((e) => e.id === "barcelona")).toMatchObject({ type: "team", sport: "football" });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	// WP-160: handball is now a groundable sport (the SPORT_LABELS hole, à la WP-64 for winter).
	it("publishes a groundable Håndball sport entity when handball is in tier1 (the WP-160 label hole)", () => {
		const configDir = tmpDir("ss-entities-handball-");
		fs.writeFileSync(
			path.join(configDir, "catalog.json"),
			JSON.stringify({ tier1: ["handball"] })
		);
		const entities = buildEntityIndex(configDir, {});
		const handball = entities.find((e) => e.id === "sport-handball");
		expect(handball).toMatchObject({ name: "Håndball", sport: "handball", type: "sport" });
		expect(handball.aliases).toContain("handball");
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	// WP-160: KNOWN_ALIAS_GROUPS generalised to scripts/config/entity-aliases.json.
	it("reads curated known-alias groups from entity-aliases.json (research/verify-maintainable)", () => {
		const configDir = tmpDir("ss-entities-aliasfile-");
		// A pair that shares no token and is not an initial-form — only a curated
		// group can fold it. Not in the seed, so it proves the FILE is read.
		fs.writeFileSync(
			path.join(configDir, "entity-aliases.json"),
			JSON.stringify({ groups: [["sweden", "sverige"]] })
		);
		const fakeSportsConfig = { football: { sport: "football", norwegian: { teams: ["Sverige", "Sweden"] } } };
		const entities = buildEntityIndex(configDir, fakeSportsConfig);
		const teams = entities.filter((e) => e.sport === "football" && e.type === "team");
		expect(teams).toHaveLength(1); // folded via the file's group
		expect(teams[0].aliases).toContain("Sweden");
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("falls back to the seed alias groups when entity-aliases.json is absent (Norway/Norge still folds)", () => {
		const configDir = tmpDir("ss-entities-aliasseed-");
		const fakeSportsConfig = { football: { sport: "football", norwegian: { teams: ["Norge", "Norway"] } } };
		const entities = buildEntityIndex(configDir, fakeSportsConfig); // no entity-aliases.json in this dir
		const teams = entities.filter((e) => e.sport === "football" && e.type === "team");
		expect(teams).toHaveLength(1);
		expect(teams[0].id).toBe("norge");
		expect(teams[0].aliases).toContain("Norway");
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});

describe("writeEntities", () => {
	it("writes entities.json to dataDir and returns the same array", () => {
		const dataDir = tmpDir("ss-entities-write-");
		const configDir = tmpDir("ss-entities-write-cfg-");
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "magnus-carlsen", name: "Magnus Carlsen", sport: "chess" }] })
		);
		const returned = writeEntities(dataDir, configDir);
		const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, "entities.json"), "utf-8"));
		expect(onDisk).toEqual(returned);
		expect(onDisk.some((e) => e.id === "magnus-carlsen")).toBe(true);
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("CLI entrypoint writes entities.json when run directly with node", () => {
		const dataDir = tmpDir("ss-entities-cli-");
		const configDir = tmpDir("ss-entities-cli-cfg-");
		execFileSync("node", ["scripts/build-entities.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		});
		expect(fs.existsSync(path.join(dataDir, "entities.json"))).toBe(true);
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});

// WP-05 acceptance: build-events.js enrichment (entityId / homeTeamEntityId /
// awayTeamEntityId), the Brooklyn/Lyn negative matching test, and manifest coverage.
describe("build-events.js integration (WP-05 entity enrichment)", () => {
	function freshDirs() {
		return {
			dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "ss-enrich-")),
			configDir: fs.mkdtempSync(path.join(os.tmpdir(), "ss-enrich-cfg-")),
		};
	}
	function runBuild(dataDir, configDir) {
		execFileSync("node", ["scripts/build-events.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		});
		return JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
	}
	const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

	it("acceptance: a tracked athlete appearing in norwegianPlayers gets entityId", () => {
		const { dataDir, configDir } = freshDirs();
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "viktor-hovland", name: "Viktor Hovland", sport: "golf" }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "golf.json"),
			JSON.stringify({
				tournaments: [{ name: "PGA Tour", events: [
					{ title: "The Open", time: future(2), norwegian: true, norwegianPlayers: [{ name: "Viktor Hovland" }] },
				] }],
			})
		);
		const events = runBuild(dataDir, configDir);
		const ev = events.find((e) => e.title === "The Open");
		expect(ev.norwegianPlayers[0].entityId).toBe("viktor-hovland");
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("acceptance: enrichment also applies to a preserved ai-research event (bypasses pushEvent)", () => {
		const { dataDir, configDir } = freshDirs();
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "magnus-carlsen", name: "Magnus Carlsen", sport: "chess" }] })
		);
		// WP-92/96: chess is entity-gated for coverage (which reads catalog.json, not
		// tracked.json) — cover Carlsen so the event stays on the board and we can
		// assert its entityId enrichment (built from tracked.json/entities.json).
		fs.writeFileSync(
			path.join(configDir, "catalog.json"),
			JSON.stringify({ tier2: { athletes: [{ name: "Magnus Carlsen", aliases: ["Carlsen"], sport: "chess" }] } })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "chess", title: "EWC Chess Final", time: future(5), source: "ai-research", confidence: "high",
				  evidence: ["a", "b"], norwegianPlayers: [{ name: "Magnus Carlsen" }] },
			])
		);
		const events = runBuild(dataDir, configDir);
		const ev = events.find((e) => e.title === "EWC Chess Final");
		expect(ev.norwegianPlayers[0].entityId).toBe("magnus-carlsen");
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("negative test: 'Brooklyn FC' as homeTeam must NOT match the tracked club 'Lyn' (word-boundary, not substring)", () => {
		const { dataDir, configDir } = freshDirs();
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ leagues: [{ id: "obos-ligaen-2026", name: "OBOS-ligaen 2026 (Lyn Oslo)", sport: "football" }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({
				tournaments: [{ name: "Some Cup", events: [
					// Trap: naive substring matching would find "lyn" inside "brooklyn".
					{ title: "Brooklyn FC friendly", time: future(2), homeTeam: "Brooklyn FC", awayTeam: "Some Team" },
					// Control: a real Lyn fixture must still match.
					{ title: "Vålerenga vs Lyn", time: future(3), homeTeam: "Vålerenga", awayTeam: "Lyn" },
				] }],
			})
		);
		const events = runBuild(dataDir, configDir);
		const brooklyn = events.find((e) => e.title === "Brooklyn FC friendly");
		expect(brooklyn.homeTeamEntityId).toBeUndefined();

		const derby = events.find((e) => e.title === "Vålerenga vs Lyn");
		expect(derby.awayTeamEntityId).toBe("fk-lyn-oslo");
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("entities.json is published to dataDir and covered by manifest.json", () => {
		const { dataDir, configDir } = freshDirs();
		fs.writeFileSync(
			path.join(configDir, "tracked.json"),
			JSON.stringify({ athletes: [{ id: "viktor-hovland", name: "Viktor Hovland", sport: "golf" }] })
		);
		runBuild(dataDir, configDir);
		expect(fs.existsSync(path.join(dataDir, "entities.json"))).toBe(true);
		const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "manifest.json"), "utf-8"));
		expect(manifest.files).toHaveProperty("entities.json");
		const entitiesBuf = fs.readFileSync(path.join(dataDir, "entities.json"));
		expect(manifest.files["entities.json"].bytes).toBe(entitiesBuf.length);
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});
