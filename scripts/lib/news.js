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
 * to stamp entityId onto events (helpers.entityTerms → containsName), so the
 * Brooklyn/Lyn substring trap is avoided identically: an article about
 * "Brooklyn FC" does NOT match the tracked club "Lyn" (see
 * tests/fixtures/feed-vectors/DIVERGENCES.md §2 and the negative test in
 * tests/news.test.js). The ONE news-specific addition (WP-161) is a minimum
 * term length: headlines have no sport context to gate on, so a ≤2-letter
 * entity name (the CS2 org "OG" vs. the Norwegian word "og") never claims news.
 *
 * Byte-idempotent on unchanged input (the manifest sync contract): the output
 * carries NO run-timestamp, only the parsed publishedAt of each item, so two
 * builds over the same digest emit identical bytes.
 */

import crypto from "crypto";
import { entityTerms, containsName, normalizeText } from "./helpers.js";

export const NEWS_MAX_ITEMS = 100;
export const NEWS_MAX_AGE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * WP-161: minimum normalized length for a term to count in NEWS matching. The
 * world registry legitimately contains entities whose names are everyday words
 * at scale — the CS2 org "OG" word-boundary-matches the Norwegian conjunction
 * "og" in nearly every headline, which would stamp its entityId across the
 * whole feed. Headlines carry no sport context to gate on (unlike
 * build-events, whose enrichment is sport-scoped), so ultra-short terms are
 * simply excluded HERE — the entity stays fully searchable/followable and
 * still matches events; it just can't claim news by a ≤2-letter name.
 */
const NEWS_MIN_TERM_LENGTH = 3;

/**
 * WP-175: conservative, rule-based TYPE classification for a news pointer. The
 * row-DNA (web + iOS NewsRow) carries a small quiet slot for what KIND of story a
 * pointer is; this fills it — but only when a high-confidence pattern matches, and
 * NEVER by a guess (an uncertain headline gets no `type` at all, so the field is
 * simply absent — additive and forward-compatible: a client that doesn't know the
 * field is untouched, and an untyped item is byte-identical to the pre-WP-175
 * output, preserving the manifest sync contract).
 *
 * The classifier keys off title + URL patterns ONLY (never article text — the DSM
 * art. 15 position holds). Patterns are matched against the ACCENT-STRIPPED,
 * lowercased title (helpers.normalizeText), so they are written accent-free
 * ("korsband", not "korsbånd") to match what normalizeText produces.
 *
 * Precision over recall — on a 168-item real-feed sample it typed ~12 % of items
 * at 100 % precision. The two failure modes it deliberately excludes: club
 * OWNERSHIP takeovers and contract RENEWALS are not player transfers
 * (NOT_TRANSFER), and the Norwegian quote-dash "– …" headline is a QUOTE, not
 * necessarily an interview, so it is NOT treated as `intervju` (that heuristic
 * over-fired on human-interest/political quotes — a guess, which the contract bans).
 */
export const NEWS_TYPES = ["kamprapport", "overgang", "skade", "intervju"];

// One en/em-dash scoreline ("3–0"). A plain hyphen is deliberately EXCLUDED — it
// collides with dates ("2026-07") and compound words ("four-year"); the verb
// patterns below catch hyphen-scoreline match reports instead.
const NEWS_SCORELINE = /(?:^|[^\d.])\d{1,2}\s*[–—]\s*\d{1,2}(?:$|[^\d.])/;

// Club takeovers/ownership and contract renewals are NOT player transfers. A title
// matching this is never classified `overgang` (the only two overgang false
// positives on real data: "Bezos in talks to join consortium" and "Foden signs new
// contract"). Accent-free, matched against normalizeText output.
const NEWS_NOT_TRANSFER = /\b(consortium|takeover|take over|stake|equity|ownership|buy-?out|new contract|new deal|contract extension)\b|signs? new|ny kontrakt|kontraktsforlengelse|forlenger/;

// Ordered high-confidence patterns per type (accent-free, word-boundary where a
// bare token would over-match). First hit wins; order puts the most specific
// signals first. Anything unmatched → null (omit the field).
const NEWS_TYPE_RULES = [
	["overgang", [
		/\bovergang(?:er|en|s)?\b/, /\bsignerer\b/, /\bhenter\b/, /\bhentet\b/, /\bbud\b/, /\bmonsterbud\b/,
		/\bsalg av\b/, /\bselger\b/, /\butlan\b/, /\btransfervindu\b/,
		/\bsigns?\b/, /\bsigning\b/, /\btransfer(?:s|red)?\b/, /\bon loan\b/, /\bjoins?\b/, /deal to sign/, /agrees? (?:a )?deal/, /set to (?:join|sign)/,
	]],
	["skade", [
		/\bskade(?:r|t|n|ne)?\b/, /\bkorsband\b/, /\bstrekk\b/, /\boperert\b/, /\boperasjon\b/, /\bmenisk/,
		/\binjur(?:y|ies|ed)\b/, /\bsidelined\b/, /\bhamstring\b/, /\bacl\b/, /\bligament\b/, /\btorn\b/, /\bsurgery\b/, /ruled out/,
	]],
	["kamprapport", [
		NEWS_SCORELINE, /\bknuste\b/, /\bvalset\b/, /\bherjet\b/, /\bnedsablet\b/, /\bydmyket\b/, /\buavgjort\b/,
		/\bthrash(?:ed)?\b/, /\bhammered\b/, /\bheld to\b/, /player ratings/, /\bfull-time\b/, /\bhat-?trick\b/,
	]],
	["intervju", [/\bintervju\b/, /\binterview\b/, /snakker ut/, /apner opp om/]],
];

/**
 * The story-kind of a news pointer, or null when no high-confidence pattern
 * matches (the honest default — never a guessed type).
 * @param {{title?:string, link?:string}} item
 * @returns {"kamprapport"|"overgang"|"skade"|"intervju"|null}
 */
export function classifyNewsType(item) {
	const title = normalizeText((item && item.title) || "");
	if (!title.trim()) return null;
	const url = String((item && item.link) || "").toLowerCase();
	// Unambiguous URL section slugs (the Guardian/BBC tag their own paths) win.
	if (/match-report/.test(url)) return "kamprapport";
	if (/\/transfer/.test(url) && !NEWS_NOT_TRANSFER.test(title)) return "overgang";
	for (const [type, pats] of NEWS_TYPE_RULES) {
		if (type === "overgang" && NEWS_NOT_TRANSFER.test(title)) continue;
		if (pats.some((p) => p.test(title))) return type;
	}
	return null;
}

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
 * Order-preserving + de-duplicated. Same containsName word-boundary check
 * build-events uses on events (via helpers.entityTerms), so a substring like
 * "lyn" inside "Brooklyn" never matches the club "Lyn" — with one extra news
 * guard: terms shorter than NEWS_MIN_TERM_LENGTH are skipped (the "OG"
 * common-word trap above).
 */
export function matchEntityIds(text, pool) {
	const ids = [];
	for (const e of pool) {
		if (!e || !e.id || ids.includes(e.id)) continue;
		const hit = entityTerms(e).some(
			(term) => normalizeText(term).trim().length >= NEWS_MIN_TERM_LENGTH && containsName(text, term)
		);
		if (hit) ids.push(e.id);
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
		const title = typeof it.title === "string" ? it.title : "";
		// Additive: only carry `type` when the classifier is confident — an
		// unclassified item keeps its exact pre-WP-175 shape (no key), so untyped
		// pointers stay byte-identical (the manifest sync contract).
		const type = classifyNewsType({ title, link });
		out.push({
			id: hashLink(link),
			title,
			link,
			source: it.source || null,
			sport: it.sport || null,
			...(type ? { type } : {}),
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
