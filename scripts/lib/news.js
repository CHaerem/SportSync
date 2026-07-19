#!/usr/bin/env node
/**
 * WP-103 · Nyhets-server. Turns the RSS digest (docs/data/rss-digest.json) into
 * docs/data/news.json — a set of *lens-ready news pointers*, never article text
 * or an AI summary (DSM art. 15; see design/specs/assistent-nyheter-v0.md). Each
 * item is { id, title, link, source, sport, entityIds, publishedAt }; the client
 * lens-filters on entityIds/sport per profile — the server never sees the profile
 * (the two-layer architecture).
 *
 * Pure + injectable (mirrors scripts/lib/app-version.js): buildNews() reads
 * nothing from disk, takes the digest + entity index as arguments, and is called
 * from build-events.js (which does the read/write) before writeManifest so the
 * manifest covers news.json.
 *
 * Entity matching REUSES the exact word-boundary name-matching build-events uses
 * to stamp entityId onto events (helpers.matchesEntity → containsName), so the
 * Brooklyn/Lyn substring trap is avoided identically: an article about
 * "Brooklyn FC" does NOT match the tracked club "Lyn" (see
 * tests/fixtures/feed-vectors/DIVERGENCES.md §2 and the negative test in
 * tests/news.test.js). No new matching logic is introduced here.
 *
 * Byte-idempotent on unchanged input (the manifest sync contract): the output
 * carries NO run-timestamp, only the parsed publishedAt of each item, so two
 * builds over the same digest emit identical bytes.
 */

import crypto from "crypto";
import { matchesEntity } from "./helpers.js";

export const NEWS_MAX_ITEMS = 100;
export const NEWS_MAX_AGE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

// Which entity types become news pointers. Mirrors build-events.js's enrichment
// pools (athlete / team / league) plus tournaments — a news reader follows
// "Tour de France" or "Wimbledon" as readily as a club. The server-inert
// "sport" / "category" umbrella entities (WP-64) are deliberately EXCLUDED: they
// would match nearly every article, and per-sport filtering is the item.sport
// field's job (the client's declared fallback filter), not an entityId.
const NEWS_ENTITY_TYPES = new Set(["athlete", "team", "league", "tournament"]);

/** Stable id for an item = sha1 of its canonical link (the dedupe key). */
function hashLink(link) {
	return crypto.createHash("sha1").update(link).digest("hex");
}

/** The entity pool a news item is matched against (concrete, followable types). */
export function newsEntityPool(entities) {
	return (entities || []).filter((e) => e && NEWS_ENTITY_TYPES.has(e.type));
}

/**
 * Which entity ids does `text` mention (word-boundary, accent-insensitive)?
 * Order-preserving + de-duplicated. Uses helpers.matchesEntity — the same
 * containsName word-boundary check build-events uses on events, so a substring
 * like "lyn" inside "Brooklyn" never matches the club "Lyn".
 */
export function matchEntityIds(text, pool) {
	const ids = [];
	for (const e of pool) {
		if (e && e.id && matchesEntity(text, e) && !ids.includes(e.id)) ids.push(e.id);
	}
	return ids;
}

/**
 * Build the news.json object from an RSS digest and the entity index.
 *
 * @param {object}  opts
 * @param {object}  opts.digest      parsed rss-digest.json ({ items: [...] })
 * @param {Array}   opts.entities    the entities.json index ({ id, name, aliases, sport, type })
 * @param {number} [opts.now]        clock (injectable for deterministic tests)
 * @param {number} [opts.maxItems]   cap (default 100)
 * @param {number} [opts.maxAgeDays] freshness window in days (default 7)
 * @returns {{ items: Array }}       never throws on empty/missing input
 */
export function buildNews({
	digest,
	entities,
	now = Date.now(),
	maxItems = NEWS_MAX_ITEMS,
	maxAgeDays = NEWS_MAX_AGE_DAYS,
} = {}) {
	const rssItems = Array.isArray(digest?.items) ? digest.items : [];
	const pool = newsEntityPool(entities);
	const cutoff = now - maxAgeDays * MS_PER_DAY;
	const seen = new Set();
	const out = [];

	for (const it of rssItems) {
		const link = it && typeof it.link === "string" ? it.link : null;
		if (!link) continue; // no stable id without a link
		if (seen.has(link)) continue; // dedupe on link (first occurrence wins)
		// RFC 822 ("Sun, 19 Jul 2026 04:01:57 GMT") → epoch. An unparseable date is
		// dropped rather than guessed — honest over a fabricated timestamp.
		const ts = Date.parse(it.pubDate);
		if (!Number.isFinite(ts)) continue;
		if (ts < cutoff) continue; // older than the freshness window
		seen.add(link);
		const haystack = [it.title, it.description].filter(Boolean).join(" ");
		out.push({
			id: hashLink(link),
			title: typeof it.title === "string" ? it.title : "",
			link,
			source: it.source || null,
			sport: it.sport || null,
			entityIds: matchEntityIds(haystack, pool),
			publishedAt: new Date(ts).toISOString(), // normalized ISO (UTC)
			_ts: ts,
		});
	}

	// Newest first. Array.sort is stable in Node, so equal timestamps keep input
	// order — part of the byte-idempotency guarantee.
	out.sort((a, b) => b._ts - a._ts);
	const items = out.slice(0, maxItems).map(({ _ts, ...rest }) => rest);
	return { items };
}
