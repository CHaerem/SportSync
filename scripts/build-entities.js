#!/usr/bin/env node
/**
 * WP-05: publishes docs/data/entities.json — a stable-id index of the
 * athletes/teams/tournaments/leagues the pipeline knows about. This is the
 * lookup table build-events.js uses to stamp `entityId` /
 * `homeTeamEntityId` / `awayTeamEntityId` onto matched events (WP-05 item 2).
 *
 * Three sources, folded in this priority order:
 *   1. scripts/config/tracked.json — AI-managed and already carries stable
 *      slugs (e.g. "viktor-hovland"). Reused verbatim. This source wins any
 *      cross-source dedup: its id/name/type are never overwritten.
 *   2. scripts/config/norwegian-golfers.json — curated golfer name + aliases
 *      (golf only). Richer than sports-config's flat list, so it's folded in
 *      before sports-config to donate its aliases first.
 *   3. scripts/config/sports-config.js — free-text team/player lists the
 *      fetchers use for norwegian-relevance filtering. No existing ids here;
 *      a stable kebab-case slug is generated from the name.
 *
 * Entry shape: { id, name, aliases: [], sport, type }
 * type ∈ "athlete" | "team" | "tournament" | "league"
 *
 * Dedup rule: a candidate merges into an already-registered entity of the
 * SAME sport AND SAME type when any (name|alias) term of one word-boundary-
 * matches (containsName, scripts/lib/helpers.js) any term of the other, in
 * either direction — never naive substring (the Brooklyn/Lyn trap documented
 * in tests/fixtures/feed-vectors/DIVERGENCES.md: "Brooklyn FC" must not match
 * the tracked club "Lyn"). The type match guards against a coincidental
 * substring inside an unrelated entity's descriptive name — e.g. sports-config's
 * free-text team "Lyn" must not fold into tracked.json's league entry
 * "OBOS-ligaen 2026 (Lyn Oslo)" just because the substring "lyn" appears in its
 * display name; requiring type equality (team vs. league) keeps them separate.
 * On merge, only aliases are unioned — the first-registered entity keeps its
 * id/name/type/sport.
 *
 * Known, accepted limitation: dedup only fires when some (name|alias) pair
 * literally overlaps at a word boundary. Purely alternate spellings with no
 * shared token (e.g. "Norway" vs. "Norge", or "100 Thieves" vs. "100T") are
 * NOT folded together and end up as separate entities. Fine for this WP —
 * matching against event text still works either way, just under two ids
 * instead of one; true synonym-resolution is future work, not required here.
 *
 * NOTE ON TYPE ACCURACY: tracked.json files a few entries under its "leagues"
 * bucket that are really clubs (e.g. "fc-barcelona"), because tracked.json
 * has no separate "teams" bucket. This index labels them `type: "league"`
 * accordingly (a direct, defensible mirror of the source bucket) — but
 * build-events.js's homeTeam/awayTeam matching pool includes BOTH "team" and
 * "league" typed entities, so a literal `homeTeam: "FC Barcelona"` still
 * resolves correctly regardless of the label. Type-driven client behaviour is
 * out of scope for this WP (see CLAUDE.md's phase-1 note on asset-maps.js).
 */

import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, normalizeText, containsName } from "./lib/helpers.js";
import { sportsConfig as defaultSportsConfig } from "./config/sports-config.js";

function configDirDefault() {
	return process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
}

/**
 * Stable kebab-case slug. normalizeText (helpers.js) strips COMBINING marks
 * via NFD, which already folds "å"/"é" etc. to their base letter — but "æ"/
 * "ø" have no such decomposition (they're standalone letters), so they'd
 * otherwise collapse to a bare "-" and produce an ugly id (e.g. "Søren
 * Wærenskjold" → "s-ren-w-renskjold"). Transliterate those explicitly first
 * for a readable slug ("soren-waerenskjold").
 */
function slugify(name) {
	const translit = String(name || "")
		.replace(/[æÆ]/g, "ae")
		.replace(/[øØ]/g, "o");
	return normalizeText(translit)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * tracked.json's "leagues" bucket sometimes appends a human-readable
 * parenthetical explaining WHY it's tracked (e.g. "La Liga 2026/27
 * (Barcelona)", "OBOS-ligaen 2026 (Lyn Oslo)") — context for a human reading
 * tracked.json's reasoning, not part of the league's identity. Left in, that
 * annotation makes the LEAGUE's own name word-boundary-match the annotated
 * TEAM's name (e.g. a "Lyn" homeTeam would wrongly resolve to the league
 * entity "obos-ligaen-2026" instead of no match / the actual Lyn team
 * entity) — strip it before the name becomes an identity/match term.
 */
function stripTrailingAnnotation(name) {
	return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function uniqueSlug(base, used) {
	const root = base || "entity";
	let slug = root;
	let n = 2;
	while (used.has(slug)) slug = `${root}-${n++}`;
	return slug;
}

/** Every string an entity/candidate can be recognised by: name + aliases. */
function terms(e) {
	return [e?.name, ...(e?.aliases || [])].filter(Boolean);
}

/** Do two term sets share a word-boundary match in either direction? */
function termsOverlap(aTerms, bTerms) {
	for (const a of aTerms) {
		for (const b of bTerms) {
			if (normalizeText(a).trim() === normalizeText(b).trim()) return true;
			if (containsName(a, b) || containsName(b, a)) return true;
		}
	}
	return false;
}

class EntityIndexBuilder {
	constructor() {
		this.entities = []; // insertion order = source priority
		this.usedSlugs = new Set();
	}

	/** Register a candidate, or merge it (alias-union only) into a match. */
	upsert({ id, name, aliases = [], sport, type }) {
		if (!name) return null;
		const candidateTerms = [name, ...aliases].filter(Boolean);
		const existing = this.entities.find(
			(e) =>
				e.type === type &&
				(!e.sport || !sport || normalizeText(e.sport) === normalizeText(sport)) &&
				termsOverlap(candidateTerms, terms(e))
		);
		if (existing) {
			for (const t of candidateTerms) {
				const norm = normalizeText(t).trim();
				if (!norm) continue;
				if (normalizeText(existing.name).trim() === norm) continue;
				if (existing.aliases.some((a) => normalizeText(a).trim() === norm)) continue;
				existing.aliases.push(t);
			}
			return existing;
		}
		const slug = id || uniqueSlug(slugify(name), this.usedSlugs);
		this.usedSlugs.add(slug);
		const entity = { id: slug, name, aliases: [...aliases], sport: sport || null, type };
		this.entities.push(entity);
		return entity;
	}
}

/**
 * Build the entity index. `configDir` selects where tracked.json /
 * norwegian-golfers.json are read from (env-overridable for tests, like the
 * rest of the pipeline). `sportsConfigData` defaults to the real, production
 * scripts/config/sports-config.js but is injectable so tests can exercise
 * cross-source dedup deterministically without depending on that file's
 * content staying stable over time.
 */
export function buildEntityIndex(configDir = configDirDefault(), sportsConfigData = defaultSportsConfig) {
	const builder = new EntityIndexBuilder();

	// 1. tracked.json — ids reused verbatim; this source always wins dedup
	// because it's folded in first.
	const tracked = readJsonIfExists(path.join(configDir, "tracked.json"));
	if (tracked) {
		for (const entry of tracked.leagues || []) {
			builder.upsert({ id: entry.id, name: stripTrailingAnnotation(entry.name), sport: entry.sport, type: "league" });
		}
		for (const entry of tracked.athletes || []) {
			builder.upsert({ id: entry.id, name: entry.name, sport: entry.sport, type: "athlete" });
		}
		for (const entry of tracked.tournaments || []) {
			builder.upsert({ id: entry.id, name: entry.name, sport: entry.sport, type: "tournament" });
		}
	}

	// 2. norwegian-golfers.json — curated golfer name + aliases (golf only).
	const golfers = readJsonIfExists(path.join(configDir, "norwegian-golfers.json"));
	if (Array.isArray(golfers)) {
		for (const g of golfers) {
			if (!g?.name) continue;
			builder.upsert({ name: g.name, aliases: g.aliases || [], sport: "golf", type: "athlete" });
		}
	}

	// 3. sports-config.js — free-text team/player lists; slugified here.
	for (const [sportKey, cfg] of Object.entries(sportsConfigData || {})) {
		const sport = cfg.sport || sportKey;
		const nor = cfg.norwegian || {};
		for (const name of nor.teams || []) {
			builder.upsert({ name, sport, type: "team" });
		}
		for (const name of nor.players || []) {
			builder.upsert({ name, sport, type: "athlete" });
		}
	}

	return builder.entities.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, sport: e.sport, type: e.type }));
}

/** Build + write docs/data/entities.json. Returns the entity array. */
export function writeEntities(dataDir = rootDataPath(), configDir = configDirDefault()) {
	const entities = buildEntityIndex(configDir);
	fs.writeFileSync(path.join(dataDir, "entities.json"), JSON.stringify(entities, null, 2));
	return entities;
}

function main() {
	const entities = writeEntities();
	console.log(`entities.json: ${entities.length} entit${entities.length === 1 ? "y" : "ies"}.`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
	main();
}
