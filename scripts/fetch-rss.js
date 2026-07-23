#!/usr/bin/env node
/**
 * Fetches sports RSS feeds and produces a compact digest for the AI editorial pipeline.
 * Output: docs/data/rss-digest.json — recent headlines filtered for Norwegian relevance.
 *
 * No external dependencies — uses built-in https + lightweight XML regex parsing.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { iso, rootDataPath, writeJsonPretty, fetchText } from "./lib/helpers.js";
import { newsEntityPool, matchEntityIds } from "./lib/news.js";

// The feed list is a REDAKSJONELT KURATERT set — quality over quantity, ordered by
// the registry's most-followed sports (football first). A feed's `relevance` mode
// decides which of its items survive: the default (Norwegian) keeps lang-"no" feeds
// wholesale plus any English item mentioning a Norwegian keyword; `"entity"` also
// keeps an English item that word-boundary-matches a tracked registry entity, so a
// club feed's Liverpool/Arsenal/Uno-X items reach the news lens even when no
// Norwegian is involved (WP-175: a Liverpool follower's NYTT section was empty).
// Entity-mode uses the SAME matcher buildNews tags with, so every English item kept
// is guaranteed taggable (no orphan pointers). Feeds that don't serve clean RSS/Atom
// were dropped in review (see WP-175 notes) — e.g. skysports rss/12040 (mixed NBA),
// NRK section RSS (404), fotball.no NFF-feed (404), VG's sport category (non-sport leak).
const FEEDS = [
	{ id: "nrk-sport", sport: "general", url: "https://www.nrk.no/sport/toppsaker.rss", lang: "no" },
	{ id: "tv2-sport", sport: "general", url: "https://www.tv2.no/rss/sport", lang: "no" },
	{ id: "tv2-fotball", sport: "football", url: "https://www.tv2.no/rss/sport/fotball", lang: "no" },
	// WP-175: Norwegian daily-paper sport desk — rich in Eliteserien/registry clubs
	// (Rosenborg, Brann, Viking) and Norwegian angles on PL clubs; lang "no" ⇒ kept wholesale.
	{ id: "aftenposten-sport", sport: "general", url: "https://www.aftenposten.no/rss/sport", lang: "no" },
	{ id: "bbc-football", sport: "football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", lang: "en" },
	// WP-175: a clean international-football source (entity-mode) — the biggest
	// news-lens gap was PL/European clubs, which are well-covered by the registry.
	// (Sky Sports rss/11095 was evaluated and DROPPED: its pubDate carries the named
	// zone "BST", which Date.parse can't read, so filterRecent/buildNews would
	// silently drop every Sky item in summer — not cleanly consumable data.)
	{ id: "guardian-football", sport: "football", url: "https://www.theguardian.com/football/rss", lang: "en", relevance: "entity" },
	{ id: "espn-golf", sport: "golf", url: "https://www.espn.com/espn/rss/golf/news", lang: "en" },
	{ id: "bbc-tennis", sport: "tennis", url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", lang: "en" },
	{ id: "autosport-f1", sport: "formula1", url: "https://www.autosport.com/rss/feed/f1", lang: "en" },
	{ id: "bbc-f1", sport: "formula1", url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml", lang: "en" },
	{ id: "chessbase", sport: "chess", url: "https://en.chessbase.com/feed", lang: "en" },
	{ id: "hltv", sport: "esports", url: "https://www.hltv.org/rss/news", lang: "en" },
	// WP-175: fills a genuine ZERO-feed gap — cycling had no source at all, yet the
	// owner follows Uno-X/Tour de France and the registry carries 900+ cycling
	// entities (riders, races). Entity-mode keeps the followed ones.
	{ id: "cyclingnews", sport: "cycling", url: "https://www.cyclingnews.com/rss/", lang: "en", relevance: "entity" },
	{ id: "bbc-winter", sport: "olympics", url: "https://feeds.bbci.co.uk/sport/winter-sports/rss.xml", lang: "en" },
];

// Norwegian athletes and teams to match for relevance
const NORWEGIAN_KEYWORDS = [
	// Football
	"haaland", "odegaard", "ødegaard", "sorloth", "sørloth", "berge", "ajer",
	"norway", "norge", "norwegian",
	// Golf
	"hovland", "reitan", "ventura", "kofstad", "halvorsen",
	// Tennis
	"ruud", "casper ruud",
	// F1
	"norris", "verstappen", "red bull", // not Norwegian but high interest
	// Chess
	"carlsen", "magnus", "tari",
	// Esports
	"rain", "jkaem", "hallzerk",
	// Winter sports / Olympics
	"klaebo", "klæbo", "johaug", "boe", "bø", "roeiseland", "røiseland",
	"braathen", "kristoffersen", "birk ruud", "meldal",
	"biathlon", "cross-country", "langrenn", "skiskyting",
	// General
	"olympic", "olympi", "ol 2026", "cortina", "milano",
];

/**
 * Parse RSS XML into an array of items using regex.
 * Returns [{title, description, link, pubDate, categories}]
 */
export function parseRssItems(xml) {
	const items = [];
	const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
	let match;
	while ((match = itemRegex.exec(xml)) !== null) {
		const block = match[1];
		const title = extractTag(block, "title");
		const description = extractTag(block, "description");
		const link = extractTag(block, "link");
		const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date");
		const categories = extractAllTags(block, "category");
		if (title) {
			items.push({
				title: decodeEntities(title),
				description: decodeEntities(description || "").slice(0, 200),
				link: link || "",
				pubDate: pubDate || "",
				categories,
			});
		}
	}
	return items;
}

function extractTag(xml, tag) {
	// Handle CDATA
	const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i");
	const cdataMatch = xml.match(cdataRegex);
	if (cdataMatch) return cdataMatch[1].trim();

	const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
	const m = xml.match(regex);
	return m ? m[1].trim() : null;
}

function extractAllTags(xml, tag) {
	const results = [];
	const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "gi");
	let m;
	while ((m = regex.exec(xml)) !== null) {
		const val = m[1].trim();
		if (val) results.push(decodeEntities(val));
	}
	return results;
}

function decodeEntities(str) {
	if (!str) return "";
	return str
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/<[^>]+>/g, ""); // strip HTML tags from descriptions
}

/**
 * Check if an item is relevant to Norwegian sports fans.
 * Norwegian-language items are always relevant.
 */
export function isNorwegianRelevant(item, lang) {
	if (lang === "no") return true;
	const text = `${item.title} ${item.description} ${item.categories.join(" ")}`.toLowerCase();
	return NORWEGIAN_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * WP-175: does this item mention a tracked registry entity? Uses the SAME
 * word-boundary matcher + haystack (title + description) that buildNews stamps
 * entityIds with, so any English item this keeps is guaranteed to carry an
 * entityId in news.json — no orphan pointers. Inherits the WP-161 short-term
 * guard (a ≤2-letter entity name like the CS2 org "OG" never claims relevance).
 * `pool` is the pre-filtered newsEntityPool; an empty pool ⇒ never relevant
 * (fail-open: entity-mode simply adds nothing when the registry is missing).
 */
export function isEntityRelevant(item, pool) {
	if (!pool || !pool.length) return false;
	const hay = [item.title, item.description].filter(Boolean).join(" ");
	return matchEntityIds(hay, pool).length > 0;
}

/**
 * Load entities.json from the data dir into a newsEntityPool, fail-open. The
 * registry is written by build-events (build-entities) on the PREVIOUS run and
 * committed to docs/data/, so it is on disk when fetch-rss runs; a missing or
 * unreadable file just yields an empty pool (entity-mode feeds then contribute
 * only their Norwegian-relevant items — never a crash).
 */
export function loadEntityPool(dataDir) {
	try {
		const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "entities.json"), "utf8"));
		const list = Array.isArray(raw) ? raw : Array.isArray(raw && raw.entities) ? raw.entities : [];
		return newsEntityPool(list);
	} catch {
		return [];
	}
}

/**
 * Filter items to last N hours.
 */
export function filterRecent(items, hoursAgo = 24) {
	const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;
	return items.filter((item) => {
		if (!item.pubDate) return true; // keep items without dates
		const d = new Date(item.pubDate);
		return !isNaN(d.getTime()) && d.getTime() >= cutoff;
	});
}

/**
 * Fetch a single feed and return processed items. `entityPool` powers a feed's
 * `relevance: "entity"` mode (WP-175): an item survives when it is Norwegian-
 * relevant OR (entity-mode only) mentions a tracked registry entity.
 */
async function fetchFeed(feed, entityPool = []) {
	try {
		const xml = await fetchText(feed.url);
		const items = parseRssItems(xml);
		const recent = filterRecent(items, 24);
		const relevant = recent.filter(
			(item) =>
				isNorwegianRelevant(item, feed.lang) ||
				(feed.relevance === "entity" && isEntityRelevant(item, entityPool))
		);
		return relevant.map((item) => ({
			source: feed.id,
			sport: feed.sport,
			title: item.title,
			description: item.description,
			link: item.link,
			pubDate: item.pubDate,
		}));
	} catch (err) {
		console.warn(`RSS feed ${feed.id} failed:`, err.message);
		return [];
	}
}

/**
 * Apply a per-sport minimum retention cap to a sorted (newest-first) item list.
 * Guarantees at least minPerSport items per sport tag before filling remaining
 * slots with the newest items overall, up to cap total items.
 *
 * This prevents high-volume general-sport feeds from crowding out sport-specific
 * feeds like tv2-fotball and bbc-football when sorted purely by date.
 */
export function applyPerSportCap(items, cap = 40, minPerSport = 3) {
	const guaranteed = new Set();
	const sportCounts = {};
	for (const item of items) {
		const s = item.sport || "general";
		sportCounts[s] = (sportCounts[s] || 0) + 1;
		if (sportCounts[s] <= minPerSport) {
			guaranteed.add(item);
		}
	}
	// Fill remaining slots with newest items (excluding already-guaranteed)
	const remaining = items.filter(i => !guaranteed.has(i));
	const combined = [...guaranteed, ...remaining.slice(0, cap - guaranteed.size)];
	// Re-sort by date since guaranteed items may be older than the newest items
	combined.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
	return combined.slice(0, cap);
}

async function main() {
	const dataDir = rootDataPath();
	const outPath = path.join(dataDir, "rss-digest.json");

	console.log(`Fetching ${FEEDS.length} RSS feeds...`);
	const entityPool = loadEntityPool(dataDir); // WP-175: powers entity-mode feeds (fail-open)
	const results = await Promise.all(FEEDS.map((feed) => fetchFeed(feed, entityPool)));
	const allItems = results.flat();

	// Sort by pubDate descending
	allItems.sort((a, b) => {
		const da = new Date(a.pubDate || 0);
		const db = new Date(b.pubDate || 0);
		return db - da;
	});

	// Per-sport minimum retention: guarantee at least 3 items per sport tag
	// before applying the overall cap. This prevents general-sport feeds from
	// crowding out sport-specific feeds (e.g. tv2-fotball, bbc-football).
	// WP-175 raised the cap 40→55 so the added entity-mode football/cycling news
	// SUPPLEMENTS the digest instead of crowding out the Norwegian general backbone
	// (which also feeds the editorial agent): at cap 40 the new feeds pushed general
	// 32→20; at 55 general stays ~31 while news.json entity-coverage still rises.
	const CAP = 55;
	const MIN_PER_SPORT = 3;
	const digest = applyPerSportCap(allItems, CAP, MIN_PER_SPORT);

	// Summary by sport
	const bySport = {};
	for (const item of digest) {
		bySport[item.sport] = (bySport[item.sport] || 0) + 1;
	}
	const summary = Object.entries(bySport).map(([s, c]) => `${s}: ${c}`).join(", ");

	const output = {
		lastUpdated: iso(),
		itemCount: digest.length,
		items: digest,
	};

	writeJsonPretty(outPath, output);
	console.log(`RSS digest: ${digest.length} items (${summary})`);
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	main().catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}
