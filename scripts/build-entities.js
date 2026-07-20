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
 * type ∈ "athlete" | "team" | "tournament" | "league" | "sport" | "category"
 *
 * WP-64: "sport" (one per followBroadly sport) and "category" (umbrella terms
 * like "Vintersport") entities are appended last. They make a broadly-followed
 * sport and an umbrella term groundable by the app-side assistant, and are
 * server-inert — NOT in build-events.js's athlete/team/league enrichment pools,
 * so they never stamp an entityId onto an event.
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
 * WP-125: dedup ALSO fires when one term is a nickname / initial-form of
 * another — the "100 Thieves" ⇄ "100T" class. sports-config lists both spellings
 * of the same team so its focus-team filter matches either; left un-folded they
 * became two entities (`100-thieves` + `100t`), so a fan following one never
 * matched events/news stamped with the other (a real lens-miss). `isNicknameForm`
 * (below) closes it: "100T" now folds in as an ALIAS of "100 Thieves", one id.
 *
 * Known, accepted limitation: dedup still needs a token overlap OR an
 * initial-form match. Purely alternate spellings with no shared token AND no
 * abbreviation relationship (e.g. "Norway" vs. "Norge") are NOT folded and end
 * up as separate entities. Fine for this WP — matching against event text still
 * works either way, just under two ids; true synonym-resolution is future work.
 *
 * NOTE ON TYPE ACCURACY: tracked.json files a few entries under its "leagues"
 * bucket that are really clubs (e.g. "fc-barcelona"), because tracked.json
 * has no separate "teams" bucket. This index labels them `type: "league"`
 * accordingly (a direct, defensible mirror of the source bucket) — but
 * build-events.js's homeTeam/awayTeam matching pool includes BOTH "team" and
 * "league" typed entities, so a literal `homeTeam: "FC Barcelona"` still
 * resolves correctly regardless of the label. Type-driven client behaviour is
 * out of scope for this WP.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { readJsonIfExists, rootDataPath, configDirPath, normalizeText, containsName } from "./lib/helpers.js";
import { sportsConfig as defaultSportsConfig } from "./config/sports-config.js";

/**
 * WP-64: the sports shown broadly on the board even without a specific tracked
 * entity. Read from interests.json's `followBroadly`, else this default — kept
 * deliberately in sync with build-events.js (both derive the same "broad
 * coverage" set the same way). Winter sports are the datahull this WP closes:
 * "all vintersport" was ungroundable because these sports had NO entity to
 * ground to.
 */
export const DEFAULT_FOLLOW_BROADLY = [
	"football", "golf", "f1", "cycling", "chess", "esports",
	"biathlon", "cross-country", "alpine", "nordic", "ski jumping",
];

/**
 * WP-64: Norwegian display name + aliases for each canonical sport tag. Used to
 * publish one sport-level entity per followBroadly sport so a bare "skiskyting"
 * / "mer langrenn" grounds to a real entity. Aliases carry the English tag and
 * common Norwegian variants so the app resolver matches either.
 */
const SPORT_LABELS = {
	football: { name: "Fotball", aliases: ["football", "soccer"] },
	golf: { name: "Golf", aliases: [] },
	tennis: { name: "Tennis", aliases: [] },
	f1: { name: "Formel 1", aliases: ["F1", "Formula 1", "Formula One"] },
	cycling: { name: "Sykkel", aliases: ["sykling", "landeveissykling", "cycling"] },
	chess: { name: "Sjakk", aliases: ["chess"] },
	esports: { name: "Esport", aliases: ["esports", "e-sport", "CS2"] },
	athletics: { name: "Friidrett", aliases: ["athletics"] },
	biathlon: { name: "Skiskyting", aliases: ["biathlon"] },
	"cross-country": { name: "Langrenn", aliases: ["langrennsski", "cross-country skiing"] },
	alpine: { name: "Alpint", aliases: ["utfor", "slalåm", "alpine skiing"] },
	nordic: { name: "Nordisk kombinert", aliases: ["kombinert", "nordic combined"] },
	"ski jumping": { name: "Hopp", aliases: ["skihopp", "ski jumping"] },
};

/**
 * WP-64: umbrella categories → the member sports they expand to. Publishing a
 * category entity ("Vintersport") makes the umbrella term itself groundable as
 * ONE broad-scope following; the member expansion (category → set of sports)
 * lives app-side in SportVocabulary (EntityIndex.swift). A category is only
 * published when at least one member is in followBroadly.
 */
const CATEGORIES = {
	"winter-sports": {
		name: "Vintersport",
		aliases: ["vinteridrett", "vinteridretter", "vintersporter", "winter sports"],
		members: ["biathlon", "cross-country", "nordic", "alpine", "ski jumping"],
	},
};

/**
 * Broad-coverage sport set (lowercased). WP-96: the compass is the catalog's
 * `tier1` ("what we cover wholesale"); falls back to interests.json's
 * `followBroadly` (owner reference), then the default — kept deliberately in
 * sync with build-events.js's `coveredBroadly`.
 */
function readFollowBroadly(configDir) {
	const catalog = readJsonIfExists(path.join(configDir, "catalog.json"));
	const interests = readJsonIfExists(path.join(configDir, "interests.json"));
	const list = (Array.isArray(catalog?.tier1) && catalog.tier1.length && catalog.tier1)
		|| (Array.isArray(interests?.followBroadly) && interests.followBroadly.length && interests.followBroadly)
		|| DEFAULT_FOLLOW_BROADLY;
	return list.map((s) => String(s).toLowerCase());
}

/**
 * WP-64: append one sport-level entity per followBroadly sport, plus each
 * umbrella category whose members intersect followBroadly. These carry type
 * "sport"/"category" — deliberately OUTSIDE build-events.js's athlete/team/
 * league enrichment pools, so they are server-inert (never stamp an entityId
 * onto an event) and exist purely for the app-side resolver to ground a broad
 * sport-/category-following through the normal diff/confirm flow.
 */
function addBroadCoverageEntities(builder, configDir) {
	const followBroadly = readFollowBroadly(configDir);
	const inScope = new Set(followBroadly);
	for (const sport of followBroadly) {
		const label = SPORT_LABELS[sport];
		if (!label) continue;
		builder.upsert({ id: `sport-${slugify(sport)}`, name: label.name, aliases: [...label.aliases], sport, type: "sport" });
	}
	for (const [key, cat] of Object.entries(CATEGORIES)) {
		if (!cat.members.some((m) => inScope.has(m))) continue;
		builder.upsert({ id: `category-${key}`, name: cat.name, aliases: [...cat.aliases], sport: "winter", type: "category" });
	}
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

/**
 * WP-16.2: a display name with its edition noise removed — the trailing
 * parenthetical annotation (already stripped from league names, but kept on
 * tournaments) AND any 4-digit year / "2026/27" season token — collapsed and
 * trimmed. "Tour de France 2026" → "Tour de France"; "The Open Championship
 * 2026 (Royal Birkdale)" → "The Open Championship"; "La Liga 2026/27" → "La
 * Liga". Returns "" when nothing meaningful remains. Used to derive the
 * year-strip alias and the initial-alias below (so a fan typing the bare,
 * yearless name — or its initials — still resolves in the app).
 */
function editionStrippedName(name) {
	return String(name || "")
		.replace(/\s*\([^)]*\)\s*$/g, " ")            // trailing "(…)" annotation
		.replace(/\b(?:19|20)\d{2}(?:\s*\/\s*\d{2})?\b/g, " ") // 2026 · 2026/27
		.replace(/\s{2,}/g, " ")
		.replace(/^[\s\p{Pd}–—-]+|[\s\p{Pd}–—-]+$/gu, "") // stray leading/trailing dashes
		.trim();
}

/**
 * WP-16.2: the initial-alias for a multi-word name ("Tour de France" → "TdF").
 * Only generated for names with 3+ letter-initial words (so it is a real,
 * memorable acronym, not a two-letter near-collision like "PL"). First letter
 * of each letter-initial word, ORIGINAL case preserved for a readable alias.
 * Returns null when there are fewer than three such words.
 *
 * IMPORTANT: this is written to entities.json's own `initials` field, NEVER to
 * `aliases` — server-side matching (build-events entityId enrichment, the
 * relevance/bell paths) reads only name+aliases via helpers.entityTerms, so a
 * 3-letter acronym can never leak into word-boundary haystack matching there.
 * The initials exist purely for the app-side fuzzy resolver (EntityIndex.swift).
 */
function initialAlias(name) {
	const words = editionStrippedName(name)
		.split(/\s+/)
		.filter((w) => /^\p{L}/u.test(w));
	if (words.length < 3) return null;
	return words.map((w) => Array.from(w)[0]).join("");
}

/** Every string an entity/candidate can be recognised by: name + aliases. */
function terms(e) {
	return [e?.name, ...(e?.aliases || [])].filter(Boolean);
}

/**
 * WP-125: the initial / nickname compaction of a MULTI-word name — each word
 * reduced to its leading run (the whole token when it starts with a digit, so
 * "100" stays "100"; else just its first letter). "100 thieves" → "100t";
 * "tour de france" → "tdf". Returns null for a single-word name (nothing to
 * abbreviate). Operates on already-normalizeText'd input.
 */
function initialForm(multiNorm) {
	const words = multiNorm.split(/\s+/).filter(Boolean);
	if (words.length < 2) return null;
	return words.map((w) => (/^\d/.test(w) ? w : Array.from(w)[0])).join("");
}

/**
 * WP-125: is one of these two terms a nickname / initial-form of the other —
 * the "100 Thieves" ⇄ "100T" class? True only when a MULTI-word name compacts
 * (initialForm) EXACTLY to the other, SINGLE-token name. Deliberately asymmetric
 * in shape (multi ⇄ single) so two distinct multi-word teams are never compared
 * this way ("Real Madrid" vs. "Real Mallorca" both survive) and a coincidental
 * single word can't swallow an unrelated multi-word club ("brooklyn fc" → "bf" ≠
 * "lyn"). Same-sport + same-type is already enforced by the caller (upsert).
 */
function isNicknameForm(a, b) {
	const na = normalizeText(a).trim();
	const nb = normalizeText(b).trim();
	if (!na || !nb) return false;
	if (!/\s/.test(nb) && initialForm(na) === nb) return true;
	if (!/\s/.test(na) && initialForm(nb) === na) return true;
	return false;
}

/** Do two term sets share a word-boundary or nickname/initial-form match? */
function termsOverlap(aTerms, bTerms) {
	for (const a of aTerms) {
		for (const b of bTerms) {
			if (normalizeText(a).trim() === normalizeText(b).trim()) return true;
			if (containsName(a, b) || containsName(b, a)) return true;
			if (isNicknameForm(a, b)) return true;
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
export function buildEntityIndex(configDir = configDirPath(), sportsConfigData = defaultSportsConfig) {
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

	// 4. WP-64 — sport-/category-level entities (broad-coverage grounding).
	addBroadCoverageEntities(builder, configDir);

	return decorateAliases(builder.entities).map((e) => {
		const out = { id: e.id, name: e.name, aliases: e.aliases, sport: e.sport, type: e.type };
		if (e.initials && e.initials.length) out.initials = e.initials;
		return out;
	});
}

/**
 * WP-16.2: derive the app-resolver aliases from each entity's display name.
 *   (a) year-strip alias → appended to `aliases` (safe for server matching: a
 *       full, yearless name like "Tour de France" is a legitimate word-boundary
 *       term, so it improves recall without the acronym-collision risk).
 *   (b) initial-alias → a NEW `initials` field, kept OUT of `aliases` so
 *       short acronyms never reach containsName-based server matching. If two
 *       entities would share the same (case-insensitive) initials the acronym
 *       is ambiguous — dropped from BOTH, so the resolver never auto-picks one
 *       (it can still surface them as "mente du …?" candidates on the fly).
 * Mutates + returns the same entity objects (they are freshly built here).
 */
function decorateAliases(entities) {
	// (a) year-strip alias. SKIP leagues: a league's year-stripped form
	// ("Premier League", "OBOS-ligaen") is a backdrop/scope phrase ("… i
	// OBOS-ligaen"), not a follow-target, and as a first-class match alias it
	// would make an utterance's scope compete with its real target (the
	// Lyn/OBOS-ligaen case). Leagues stay fully resolvable regardless — the
	// app resolver strips the year on the fly (editionStripped), so no stored
	// alias is needed for "premier league" → "Premier League 2026/27".
	for (const e of entities) {
		if (e.type === "league") continue;
		const stripped = editionStrippedName(e.name);
		if (!stripped) continue;
		const norm = normalizeText(stripped).trim();
		if (!norm || norm === normalizeText(e.name).trim()) continue;
		if (e.aliases.some((a) => normalizeText(a).trim() === norm)) continue;
		e.aliases.push(stripped);
	}

	// (b) initial-alias, with cross-index collision drop
	const byInitials = new Map(); // normalized acronym → [entity, …]
	for (const e of entities) {
		const ini = initialAlias(e.name);
		if (!ini) continue;
		e.initials = [ini];
		const key = normalizeText(ini).trim();
		if (!byInitials.has(key)) byInitials.set(key, []);
		byInitials.get(key).push(e);
	}
	for (const group of byInitials.values()) {
		if (group.length > 1) for (const e of group) delete e.initials; // ambiguous → drop
	}

	return entities;
}

/** Build + write docs/data/entities.json. Returns the entity array. */
export function writeEntities(dataDir = rootDataPath(), configDir = configDirPath()) {
	const entities = buildEntityIndex(configDir);
	fs.writeFileSync(path.join(dataDir, "entities.json"), JSON.stringify(entities, null, 2));
	return entities;
}

function main() {
	const entities = writeEntities();
	console.log(`entities.json: ${entities.length} entit${entities.length === 1 ? "y" : "ies"}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	main();
}
