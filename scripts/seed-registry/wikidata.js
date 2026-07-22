/**
 * WP-161: Wikidata SPARQL seeds — athletes (QID + labels, nb preferred) and
 * cycling teams. Free endpoint (query.wikidata.org), used only by the manual
 * seed run, never the hourly pipeline.
 *
 * Quality-over-raw-count rules (the subjective long tails are deliberately
 * thinner in v0 — the weekly AI maintenance grows them):
 *   - cycling: UCI WorldTeams (current official name = the newest P1448
 *     statement, since Wikidata labels lag sponsor renames) + every rider with
 *     a CURRENT team membership (P54 with no end-time qualifier).
 *   - winter (biathlon/cross-country/alpine/ski jumping/nordic combined),
 *     athletics, handball: active-generation athletes (born after a cutoff, no
 *     death date) that are either Norwegian (low sitelink bar) or
 *     internationally notable (high sitelink bar — sitelink count is the one
 *     mechanical notability proxy Wikidata offers).
 *   - handball additionally seeds clubs and national teams via P31.
 */

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Sportivista/2.0 (https://github.com/CHaerem/Sportivista; sports dashboard registry seeder)";

/** Sport QID → Sportivista sport tag (winter file spans five sports). */
export const WINTER_SPORTS = {
	Q166788: "biathlon",
	Q179687: "cross-country",
	Q186222: "alpine",
	Q7718: "ski jumping",
	Q201965: "nordic",
};

/** Notability thresholds (sitelink counts) per seed. Tuned for signal, not volume. */
export const THRESHOLDS = {
	winter: { born: "1990-01-01", norwegianLinks: 4, worldLinks: 14 },
	athletics: { born: "1992-01-01", norwegianLinks: 3, worldLinks: 25 },
	handball: { born: "1990-01-01", norwegianLinks: 3, worldLinks: 15 },
};

export function qidOf(uri) {
	return String(uri || "").split("/").pop();
}

/** Fetch a SPARQL query as parsed JSON bindings (injectable for tests). */
export async function sparqlBindings(query, fetchJson) {
	const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
	const json = await fetchJson(url, {
		headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
	});
	return json?.results?.bindings || [];
}

// --- cycling ---

/** UCI WorldTeam (Q6154783, 2015–) + UCI Women's WorldTeam (Q80425135). */
const CYCLING_TEAM_CLASSES = "wd:Q6154783 wd:Q80425135";

export const CYCLING_TEAMS_QUERY = `
SELECT ?team ?teamLabel ?official ?start WHERE {
  VALUES ?class { ${CYCLING_TEAM_CLASSES} }
  ?team wdt:P31 ?class .
  FILTER NOT EXISTS { ?team wdt:P576 ?dissolved }
  OPTIONAL { ?team p:P1448 ?ns . ?ns ps:P1448 ?official . OPTIONAL { ?ns pq:P580 ?start } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,en". }
}`;

export const CYCLING_RIDERS_QUERY = `
SELECT DISTINCT ?rider ?riderLabel ?countryLabel WHERE {
  VALUES ?class { ${CYCLING_TEAM_CLASSES} }
  ?team wdt:P31 ?class .
  FILTER NOT EXISTS { ?team wdt:P576 ?dissolved }
  ?rider p:P54 ?stmt .
  ?stmt ps:P54 ?team .
  FILTER NOT EXISTS { ?stmt pq:P582 ?end }
  ?rider wdt:P31 wd:Q5 .
  OPTIONAL { ?rider wdt:P27 ?country }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,en". }
}`;

/**
 * WorldTeam bindings → team candidates. One row per official-name statement;
 * the NEWEST official name (latest P580 start) is the display name — Wikidata
 * labels lag sponsor renames — with the label kept as an alias when it differs.
 */
export function cyclingTeamEntities(bindings) {
	const byQid = new Map();
	for (const b of bindings) {
		const qid = qidOf(b.team?.value);
		if (!qid) continue;
		const t = byQid.get(qid) || { label: b.teamLabel?.value || qid, names: [] };
		if (b.official?.value) t.names.push({ name: b.official.value, start: b.start?.value || "" });
		byQid.set(qid, t);
	}
	return [...byQid.entries()].map(([qid, t]) => {
		const newest = [...t.names].sort((a, b) => b.start.localeCompare(a.start))[0];
		const name = newest?.name || t.label;
		const aliases = t.label && t.label !== name ? [t.label] : [];
		return { name, aliases, sport: "cycling", type: "team", external: { wikidata: qid } };
	});
}

/** Rider bindings → athlete candidates (deduped by QID). */
export function cyclingRiderEntities(bindings) {
	const byQid = new Map();
	for (const b of bindings) {
		const qid = qidOf(b.rider?.value);
		if (!qid || byQid.has(qid)) continue;
		const name = b.riderLabel?.value || "";
		if (!name || name === qid) continue; // label missing → item is junk for lookup
		const e = { name, aliases: [], sport: "cycling", type: "athlete", external: { wikidata: qid } };
		if (b.countryLabel?.value) e.country = b.countryLabel.value;
		byQid.set(qid, e);
	}
	return [...byQid.values()];
}

// --- notability-filtered athlete seeds (winter / athletics / handball) ---

function athleteQuery({ sportValues, born, norwegianLinks, worldLinks }) {
	return `
SELECT DISTINCT ?a ?aLabel ?sportQ ?countryLabel ?links WHERE {
  ?a wdt:P641 ?s ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?links ; wdt:P569 ?born .
  VALUES ?s { ${sportValues} }
  FILTER NOT EXISTS { ?a wdt:P570 ?died }
  FILTER (?born >= "${born}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?a wdt:P27 ?country }
  BIND(STRAFTER(STR(?s), "entity/") AS ?sportQ)
  FILTER ( (BOUND(?country) && ?country = wd:Q20 && ?links >= ${norwegianLinks}) || ?links >= ${worldLinks} )
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,en". }
}`;
}

export function winterQuery() {
	const t = THRESHOLDS.winter;
	return athleteQuery({
		sportValues: Object.keys(WINTER_SPORTS).map((q) => `wd:${q}`).join(" "),
		born: t.born, norwegianLinks: t.norwegianLinks, worldLinks: t.worldLinks,
	});
}

export function athleticsQuery() {
	const t = THRESHOLDS.athletics;
	return athleteQuery({ sportValues: "wd:Q542", born: t.born, norwegianLinks: t.norwegianLinks, worldLinks: t.worldLinks });
}

export function handballAthleteQuery() {
	const t = THRESHOLDS.handball;
	return athleteQuery({ sportValues: "wd:Q8418", born: t.born, norwegianLinks: t.norwegianLinks, worldLinks: t.worldLinks });
}

/**
 * Norwegian handball clubs (Q108320110, any sitelink presence) + national
 * handball teams worldwide (Q50808536, notable ones).
 */
export const HANDBALL_TEAMS_QUERY = `
SELECT DISTINCT ?t ?tLabel ?countryLabel ?links WHERE {
  { ?t wdt:P31/wdt:P279* wd:Q108320110 . ?t wdt:P17 wd:Q20 . ?t wikibase:sitelinks ?links . FILTER(?links >= 2) }
  UNION
  { ?t wdt:P31/wdt:P279* wd:Q50808536 . ?t wikibase:sitelinks ?links . FILTER(?links >= 8) }
  FILTER NOT EXISTS { ?t wdt:P576 ?dissolved }
  OPTIONAL { ?t wdt:P17 ?country }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,en". }
}`;

/**
 * Athlete bindings (winter/athletics/handball) → candidates. `sportOf` maps
 * the bound sport QID to the Sportivista tag; a fixed tag can be passed for
 * single-sport seeds. Deduped by QID (first row wins; rows arrive sorted by
 * the caller for determinism).
 */
export function athleteEntities(bindings, sportOf) {
	const byQid = new Map();
	const rows = [...bindings].sort((a, b) => qidOf(a.a?.value).localeCompare(qidOf(b.a?.value)) || String(a.sportQ?.value).localeCompare(String(b.sportQ?.value)));
	for (const b of rows) {
		const qid = qidOf(b.a?.value);
		if (!qid || byQid.has(qid)) continue;
		const name = b.aLabel?.value || "";
		if (!name || name === qid) continue;
		const sport = typeof sportOf === "function" ? sportOf(b.sportQ?.value) : sportOf;
		if (!sport) continue;
		const e = { name, aliases: [], sport, type: "athlete", external: { wikidata: qid } };
		if (b.countryLabel?.value) e.country = b.countryLabel.value;
		byQid.set(qid, e);
	}
	return [...byQid.values()];
}

/** Team bindings (handball) → candidates, deduped by QID. */
export function teamEntities(bindings, sport) {
	const byQid = new Map();
	for (const b of bindings) {
		const qid = qidOf(b.t?.value);
		if (!qid || byQid.has(qid)) continue;
		const name = b.tLabel?.value || "";
		if (!name || name === qid) continue;
		const e = { name, aliases: [], sport, type: "team", external: { wikidata: qid } };
		if (b.countryLabel?.value) e.country = b.countryLabel.value;
		byQid.set(qid, e);
	}
	return [...byQid.values()];
}

// --- live seeds ---

export async function seedCycling(fetchJson) {
	const teams = cyclingTeamEntities(await sparqlBindings(CYCLING_TEAMS_QUERY, fetchJson));
	const riders = cyclingRiderEntities(await sparqlBindings(CYCLING_RIDERS_QUERY, fetchJson));
	return [...teams, ...riders];
}

export async function seedWinter(fetchJson) {
	return athleteEntities(await sparqlBindings(winterQuery(), fetchJson), (q) => WINTER_SPORTS[q]);
}

export async function seedAthletics(fetchJson) {
	return athleteEntities(await sparqlBindings(athleticsQuery(), fetchJson), "athletics");
}

export async function seedHandball(fetchJson) {
	const athletes = athleteEntities(await sparqlBindings(handballAthleteQuery(), fetchJson), "handball");
	const teams = teamEntities(await sparqlBindings(HANDBALL_TEAMS_QUERY, fetchJson), "handball");
	return [...athletes, ...teams];
}
