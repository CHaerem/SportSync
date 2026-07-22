/**
 * WP-161: ESPN seeds — the mechanical club/driver/player universe from the
 * SAME host the pipeline's APIClient already uses (site.api.espn.com):
 *
 *   - football: the teams API for every league the football fetcher covers
 *     (sports-config: eng.1, esp.1, nor.1, nor.2, uefa.champions, fifa.world —
 *     fifa.world doubles as the national-team seed). esp.copa_del_rey is
 *     deliberately SKIPPED: its 126 entries reach deep into regional Spanish
 *     football (quality over raw count; esp.1 already covers La Liga).
 *   - f1: the standings API — the current drivers' + constructors' fields.
 *   - tennis: the atp/wta rankings API — top-100 per tour.
 *
 * Transforms are pure (JSON in → entity candidates out) so tests run
 * network-free with fixtures; only the seed* entry points fetch.
 */

import { normalizeColors } from "./seed-lib.js";

const HOST = "https://site.api.espn.com/apis/site/v2/sports";
const F1_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/racing/f1/standings";

/** The football leagues the fetcher covers (mirrors scripts/config/sports-config.js). */
export const FOOTBALL_LEAGUES = [
	{ code: "eng.1", name: "Premier League" },
	{ code: "esp.1", name: "La Liga" },
	{ code: "nor.1", name: "Eliteserien" },
	{ code: "nor.2", name: "OBOS-ligaen" },
	{ code: "uefa.champions", name: "Champions League" },
	{ code: "fifa.world", name: "FIFA World Cup" },
];

/** teams[] out of an ESPN teams-API response (defensive against shape drift). */
function espnTeams(json) {
	return (json?.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team).filter((t) => t?.displayName);
}

/**
 * One league's teams-API response → entity candidates. National-team leagues
 * (fifa.world) carry the country in the display name itself; club leagues get
 * no country (ESPN doesn't expose it). shortDisplayName becomes an alias only
 * when it differs and is a real word (never the 3-letter abbreviation — too
 * collision-prone for word-boundary server matching).
 */
export function footballEntitiesFromTeams(json, { national = false } = {}) {
	return espnTeams(json).map((t) => {
		const aliases = [];
		if (t.shortDisplayName && t.shortDisplayName !== t.displayName && t.shortDisplayName.length >= 4) {
			aliases.push(t.shortDisplayName);
		}
		const entity = {
			name: t.displayName,
			aliases,
			sport: "football",
			type: "team",
			external: { espnId: String(t.id) },
		};
		if (national) {
			entity.country = t.displayName;   // normalised to ISO by mergeRegistry
			entity.national = true;           // WP-185: a landslag flies the FLAG, a club wears the MONOGRAM
		}
		const colors = espnColors(t);
		if (colors) entity.colors = colors;
		return entity;
	});
}

/**
 * WP-185: ESPN's `color` / `alternateColor` (bare 6-digit hex, no "#") → the
 * registry's `colors` block, the source of the club MONOGRAM's two tints.
 * `normalizeColors` (seed-lib) canonicalises and drops a secondary identical to
 * the primary; a team with no usable colour simply gets no `colors` and the
 * client degrades to the sport glyph.
 */
export function espnColors(team) {
	return normalizeColors({ primary: team?.color, secondary: team?.alternateColor });
}

/** The F1 standings response → driver (athlete) + constructor (team) candidates. */
export function f1EntitiesFromStandings(json) {
	const out = [];
	for (const child of json?.children || []) {
		for (const entry of child?.standings?.entries || []) {
			if (entry.athlete?.displayName) {
				const e = {
					name: entry.athlete.displayName,
					aliases: [],
					sport: "f1",
					type: "athlete",
					external: { espnId: String(entry.athlete.id) },
				};
				if (entry.athlete.flag?.alt) e.country = entry.athlete.flag.alt;
				out.push(e);
			} else if (entry.team?.displayName) {
				const team = {
					name: entry.team.displayName,
					aliases: [],
					sport: "f1",
					type: "team",
					external: { espnId: String(entry.team.id) },
				};
				const colors = espnColors(entry.team);
				if (colors) team.colors = colors;
				out.push(team);
			}
		}
	}
	return out;
}

/**
 * A tennis rankings response → top-N athlete candidates. No aliases: the
 * "J. Sinner" shortname is app-side sugar the resolver derives itself, and a
 * bare surname is too collision-prone for word-boundary server matching.
 */
export function tennisEntitiesFromRankings(json, { top = 100 } = {}) {
	const ranks = json?.rankings?.[0]?.ranks || [];
	return ranks
		.filter((r) => r?.athlete?.displayName)
		.slice(0, top)
		.map((r) => {
			const e = {
				name: r.athlete.displayName,
				aliases: [],
				sport: "tennis",
				type: "athlete",
				external: { espnId: String(r.athlete.id) },
			};
			if (r.athlete.citizenshipCountry) e.country = r.athlete.citizenshipCountry;
			return e;
		});
}

/** Live seed: football (all covered leagues, deduped downstream by mergeRegistry). */
export async function seedFootball(fetchJson) {
	const out = [];
	for (const league of FOOTBALL_LEAGUES) {
		const json = await fetchJson(`${HOST}/soccer/${league.code}/teams?limit=400`);
		out.push(...footballEntitiesFromTeams(json, { national: league.code === "fifa.world" }));
	}
	return out;
}

/** Live seed: F1 drivers + constructors. */
export async function seedF1(fetchJson) {
	return f1EntitiesFromStandings(await fetchJson(F1_STANDINGS_URL));
}

/** Live seed: ATP + WTA top-100. */
export async function seedTennis(fetchJson) {
	const atp = tennisEntitiesFromRankings(await fetchJson(`${HOST}/tennis/atp/rankings`));
	const wta = tennisEntitiesFromRankings(await fetchJson(`${HOST}/tennis/wta/rankings`));
	return [...atp, ...wta];
}
