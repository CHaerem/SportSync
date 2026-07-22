/**
 * WP-161: shared plumbing for the registry seed scripts (scripts/seed-registry/).
 *
 * The world registry (scripts/config/registry/*.json) is a CHECKED-IN,
 * deterministic artifact: entities sorted by id, stable key order, tab
 * indentation, trailing newline — so a re-seed produces a clean, reviewable
 * diff. This module owns that serialization plus the re-seed MERGE contract:
 *
 *   - ids are stable kebab-slugs (same slugify as build-entities.js) and are
 *     the primary key. A re-seed NEVER changes an existing id.
 *   - fresh entities are matched to existing ones by `external` id first
 *     (wikidata QID / espnId / fideId / liquipedia page), then by slug. On a
 *     match the existing id is kept; a renamed entity gets the fresh name and
 *     its old name folded into aliases (so old follows keep matching).
 *   - existing entities NOT present in the fresh seed are KEPT (the registry
 *     is durable — a relegated club stays followable; pruning is the weekly
 *     AI-maintenance job, not the seeder's).
 *   - slugs are globally unique across ALL registry files: the orchestrator
 *     passes the other files' ids as `reservedSlugs`, and a collision gets a
 *     deterministic `-2`/`-3` suffix.
 *
 * Everything here is pure/injectable so tests run network-free.
 */

import { slugify } from "../build-entities.js";
import { normalizeText } from "../lib/helpers.js";
import { toIsoCountry } from "../lib/country.js";

export { slugify };

/** Stable entity key order for serialization. */
const ENTITY_KEYS = ["id", "name", "aliases", "sport", "type", "country", "national", "colors", "logo", "external", "notes"];
const EXTERNAL_KEYS = ["wikidata", "espnId", "fideId", "liquipedia"];
/** WP-186: the licence provenance travels WITH the asset, in a fixed key order
 *  so a re-seed of the logos yields a clean diff like every other registry field. */
const LOGO_KEYS = ["file", "source", "basis", "license", "licenseId", "licenseUrl", "attribution", "sourceUrl", "trademarked"];

/**
 * WP-185: a raw colour (ESPN's bare "e20520", a "#RRGGBB", a 3-digit shorthand)
 * → the canonical lowercase `#rrggbb`, or null when it isn't a hex colour. The
 * registry stores ONE canonical form so a client can hand it straight to CSS /
 * `Color(hex:)` without re-parsing dialects.
 */
export function normalizeHexColor(raw) {
	const s = String(raw || "").trim().replace(/^#/, "").toLowerCase();
	if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
	if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
	return null;
}

/**
 * WP-185: `{primary, secondary}` normalised to canonical hex. A missing/invalid
 * primary drops the whole object (a secondary alone can't anchor a monogram);
 * a secondary equal to the primary is dropped (the client then draws a flat
 * fill instead of a pointless gradient).
 */
export function normalizeColors(raw) {
	const primary = normalizeHexColor(raw?.primary);
	if (!primary) return null;
	const secondary = normalizeHexColor(raw?.secondary);
	return secondary && secondary !== primary ? { primary, secondary } : { primary };
}

/**
 * WP-185: fold an entity's identity metadata into its canonical form —
 * `country` to ISO 3166-1 alpha-2 (see lib/country.js; unmappable values, e.g.
 * historical states, are DROPPED rather than guessed) and `colors` to canonical
 * hex. Applied to fresh AND existing entities on every merge, so a re-seed
 * converges the whole file instead of only the rows the source touched.
 * Returns a new object; never mutates.
 */
export function normalizeIdentity(entity) {
	const out = { ...entity };
	const iso = toIsoCountry(out.country);
	if (iso) out.country = iso;
	else delete out.country;
	const colors = normalizeColors(out.colors);
	if (colors) out.colors = colors;
	else delete out.colors;
	return out;
}

function orderedEntity(e) {
	const out = {};
	for (const k of ENTITY_KEYS) {
		if (e[k] === undefined || e[k] === null) continue;
		if (k === "external") {
			const ext = {};
			for (const ek of EXTERNAL_KEYS) if (e.external[ek] !== undefined && e.external[ek] !== null) ext[ek] = String(e.external[ek]);
			out.external = ext;
		} else if (k === "aliases") {
			out.aliases = [...e.aliases];
		} else if (k === "logo") {
			const logo = {};
			for (const lk of LOGO_KEYS) if (e.logo[lk] !== undefined && e.logo[lk] !== null) logo[lk] = e.logo[lk];
			out.logo = logo;
		} else if (k === "colors") {
			out.colors = e.colors.secondary ? { primary: e.colors.primary, secondary: e.colors.secondary } : { primary: e.colors.primary };
		} else {
			out[k] = e[k];
		}
	}
	if (!out.aliases) out.aliases = [];
	if (!out.external) out.external = {};
	return out;
}

/**
 * Serialize a registry file deterministically: entities sorted by id, stable
 * key order, tab indent, trailing newline. `meta` carries the informational
 * top-level fields ($schema note, source, notes).
 */
export function serializeRegistry(meta, entities) {
	const sorted = [...entities].map(orderedEntity).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const file = {};
	if (meta.$schema) file.$schema = meta.$schema;
	if (meta.source) file.source = meta.source;
	if (meta.notes) file.notes = meta.notes;
	file.entities = sorted;
	return JSON.stringify(file, null, "\t") + "\n";
}

/** Do two `external` objects share at least one identical source id? */
function externalMatches(a = {}, b = {}) {
	for (const k of EXTERNAL_KEYS) {
		if (a[k] != null && b[k] != null && String(a[k]) === String(b[k])) return true;
	}
	return false;
}

function unionAliases(name, ...aliasLists) {
	const seen = new Set([normalizeText(name).trim()]);
	const out = [];
	for (const list of aliasLists) {
		for (const alias of list || []) {
			const norm = normalizeText(alias).trim();
			if (!norm || seen.has(norm)) continue;
			seen.add(norm);
			out.push(alias);
		}
	}
	return out;
}

/**
 * Merge a fresh seed (entities WITHOUT ids: {name, aliases?, sport, type,
 * country?, colors?, external}) into the existing registry file's entities.
 * WP-185: every entity — fresh AND existing — passes through
 * `normalizeIdentity` (ISO country, canonical hex colours) on the way in.
 * Returns the merged, id-stable entity list (unsorted — serializeRegistry
 * sorts). Deterministic: fresh entities are processed in slug/name order.
 */
export function mergeRegistry(existingEntities = [], freshEntities = [], reservedSlugs = new Set()) {
	// WP-185: normalise identity on the EXISTING rows too — a re-seed converges
	// the whole file to ISO country / canonical hex, not just the rows the
	// source happened to return this run.
	const merged = existingEntities.map((e) => normalizeIdentity({ ...e, aliases: [...(e.aliases || [])], external: { ...(e.external || {}) } }));
	const bySlug = new Map(merged.map((e) => [e.id, e]));
	const used = new Set([...reservedSlugs, ...merged.map((e) => e.id)]);

	const fresh = [...freshEntities]
		.filter((f) => f?.name)
		.sort((a, b) => {
			const sa = slugify(a.name), sb = slugify(b.name);
			if (sa !== sb) return sa < sb ? -1 : 1;
			return String(a.name).localeCompare(String(b.name));
		});

	for (const raw of fresh) {
		const f = normalizeIdentity(raw);
		const existing =
			merged.find((e) => externalMatches(e.external, f.external)) ||
			bySlug.get(slugify(f.name));
		if (existing) {
			// Stable id; world may have renamed — new name wins, old name → alias.
			const oldName = existing.name;
			existing.name = f.name;
			existing.aliases = unionAliases(f.name, existing.aliases, f.aliases, oldName !== f.name ? [oldName] : []);
			existing.sport = f.sport || existing.sport;
			existing.type = f.type || existing.type;
			if (f.country) existing.country = f.country;
			if (f.national) existing.national = true;
			if (f.colors) existing.colors = f.colors;
			existing.external = { ...existing.external, ...f.external };
			continue;
		}
		let slug = slugify(f.name) || "entity";
		if (used.has(slug)) {
			let n = 2;
			while (used.has(`${slug}-${n}`)) n++;
			slug = `${slug}-${n}`;
		}
		used.add(slug);
		const entity = { id: slug, name: f.name, aliases: unionAliases(f.name, f.aliases), sport: f.sport, type: f.type, external: { ...f.external } };
		if (f.country) entity.country = f.country;
		if (f.national) entity.national = true;
		if (f.colors) entity.colors = f.colors;
		merged.push(entity);
		bySlug.set(slug, entity);
	}
	return merged;
}

/** The standard free-text $schema note stamped on every seeded registry file. */
export function schemaNote(what) {
	return `WP-161 verdensregister — ${what}. OPPSLAG, ikke dekningsløfte (catalog.json styrer dekning/kost). Deterministisk artefakt: sortert på id, stabil serialisering — re-seed (npm run seed:registry) gir rene diffs. Id-er er varige kebab-slugs; external-id-ene (wikidata/espnId/fideId/liquipedia) er re-seed-nøklene. Vedlikeholdes ukentlig av research/improve-agentene (opprykk/nedrykk, overganger, navnebytter, nye orgs) — se registry.schema.json.`;
}
