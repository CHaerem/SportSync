#!/usr/bin/env node
/**
 * Fetches sports RSS feeds and produces a compact digest for the AI editorial pipeline.
 * Output: docs/data/rss-digest.json — recent headlines filtered for Norwegian relevance.
 *
 * No external dependencies — uses built-in https + lightweight XML regex parsing.
 */

import https from "https";
import http from "http";
import path from "path";
import { iso, rootDataPath, writeJsonPretty } from "./lib/helpers.js";

const FEEDS = [
	{ id: "nrk-sport", sport: "general", url: "https://www.nrk.no/sport/toppsaker.rss", lang: "no" },
	{ id: "tv2-sport", sport: "general", url: "https://www.tv2.no/rss/sport", lang: "no" },
	{ id: "tv2-fotball", sport: "football", url: "https://www.tv2.no/rss/sport/fotball", lang: "no" },
	{ id: "bbc-football", sport: "football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", lang: "en" },
	{ id: "espn-golf", sport: "golf", url: "https://www.espn.com/espn/rss/golf/news", lang: "en" },
	{ id: "bbc-tennis", sport: "tennis", url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", lang: "en" },
	{ id: "autosport-f1", sport: "formula1", url: "https://www.autosport.com/rss/feed/f1", lang: "en" },
	{ id: "bbc-f1", sport: "formula1", url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml", lang: "en" },
	{ id: "chessbase", sport: "chess", url: "https://en.chessbase.com/feed", lang: "en" },
	{ id: "hltv", sport: "esports", url: "https://www.hltv.org/rss/news", lang: "en" },
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
 * Fetch a URL and return the response body as a string.
 * Follows one redirect. Timeout after 8 seconds.
 */
export function fetchText(url) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith("https") ? https : http;
		const req = client.get(url, { headers: { "User-Agent": "SportSync/1.0" }, timeout: 8000 }, (res) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				return fetchText(res.headers.location).then(resolve, reject);
			}
			if (res.statusCode >= 400) {
				return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
			}
			let body = "";
			res.on("data", (c) => (body += c));
			res.on("end", () => resolve(body));
		});
		req.on("error", reject);
		req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout for ${url}`)); });
	});
}

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
 * Fetch a single feed and return processed items.
 */
async function fetchFeed(feed) {
	try {
		const xml = await fetchText(feed.url);
		const items = parseRssItems(xml);
		const recent = filterRecent(items, 24);
		const relevant = recent.filter((item) => isNorwegianRelevant(item, feed.lang));
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

async function main() {
	const dataDir = rootDataPath();
	const outPath = path.join(dataDir, "rss-digest.json");

	console.log(`Fetching ${FEEDS.length} RSS feeds...`);
	const results = await Promise.all(FEEDS.map(fetchFeed));
	const allItems = results.flat();

	// Sort by pubDate descending, limit to 30 most recent
	allItems.sort((a, b) => {
		const da = new Date(a.pubDate || 0);
		const db = new Date(b.pubDate || 0);
		return db - da;
	});
	const digest = allItems.slice(0, 30);

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
if (process.argv[1]?.includes("fetch-rss")) {
	main().catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}
