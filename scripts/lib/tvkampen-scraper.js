/**
 * tvkampen.com Scraper
 *
 * Fetches sport listings and match broadcaster data from tvkampen.com,
 * a Norwegian TV guide for live sports.
 *
 * URL patterns:
 *   Listings: https://www.tvkampen.com/fotball/date/YYYY-MM-DD
 *   Match:    https://www.tvkampen.com/kamp/{slug}-{id}
 *
 * Listing page structure (real HTML):
 *   <div id="NNNN"><div class="event-rt">
 *     <div class="event-rt-main-info">
 *       <a href="/kamp/{slug}-{id}">
 *         <div class="match-info-rt">
 *           <div class="match-info-rt__sport-time"><time>HH:MM</time>...</div>
 *     ...
 *     <div class="match-details-rt-participants">
 *       <a href="/kamp/..."><div>HomeTeam - AwayTeam</div></a>
 *     </div>
 *     <div class="match-details-rt__league">League Name</div>
 *     <div class="match-details-channels-rt">
 *       <div class="icons-channels-rt-XXXX icons-channels-{channel} ..."></div>
 *
 * Match detail page structure:
 *   <span class="rt-match-channel-list__channel-text">TV 2 Play</span>
 *
 * Rate limiting: 200ms between requests, max 3 concurrent, 10s timeout.
 */

import https from "https";

const BASE_URL = "https://www.tvkampen.com";
const REQUEST_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_CONCURRENT = 3;

const BETTING_SITES = new Set([
	"stake", "arcticbet", "ibet", "bet365", "unibet", "comeon",
	"betsson", "nordicbet", "coolbet", "rizk", "casumo",
]);

/**
 * Channel CSS class → broadcaster name mapping.
 * On listing pages, channels are encoded as CSS icon classes.
 * Data-driven — the autopilot can extend this.
 */
export const CHANNEL_CLASS_MAP = {
	"viaplay": "Viaplay",
	"tv2play": "TV 2 Play",
	"tv2sport1": "TV 2 Sport 1",
	"tv2sport2": "TV 2 Sport 2",
	"tv2sportpremium": "TV 2 Sport Premium",
	"dazn": "DAZN",
	"discovery": "Discovery+",
	"discoveryplus": "Discovery+",
	"eurosport": "Eurosport 1",
	"eurosportnorge": "Eurosport Norge",
	"nrk1": "NRK1",
	"nrk2": "NRK2",
	"max": "MAX",
	"paramount": "Paramount+",
	"paramountplus": "Paramount+",
};

function isBettingSite(name) {
	return BETTING_SITES.has(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/**
 * Fetch raw HTML from a URL via HTTPS.
 * @param {string} url
 * @param {number} [timeout]
 * @returns {Promise<string>}
 */
export function fetchHtml(url, timeout = REQUEST_TIMEOUT_MS) {
	return new Promise((resolve, reject) => {
		const req = https.get(url, { headers: { "User-Agent": "SportSync/2.0" } }, (res) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				const redirect = res.headers.location.startsWith("http")
					? res.headers.location
					: `${BASE_URL}${res.headers.location}`;
				fetchHtml(redirect, timeout).then(resolve, reject);
				return;
			}
			if (res.statusCode >= 400) {
				reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				return;
			}
			let body = "";
			res.on("data", (chunk) => (body += chunk));
			res.on("end", () => resolve(body));
		});
		req.on("error", reject);
		req.setTimeout(timeout, () => {
			req.destroy();
			reject(new Error(`Timeout after ${timeout}ms for ${url}`));
		});
	});
}

/**
 * Parse a tvkampen listing page HTML to extract match entries.
 *
 * Primary strategy: parse event blocks by <div id="NNNN"> boundaries.
 * Each block contains participants (team names), time, league, channel icons, and /kamp/ URL.
 *
 * Fallback strategies for different page versions:
 * - Anchor tags linking to /kamp/ with embedded team text
 * - Table rows with /kamp/ links
 *
 * @param {string} html - Raw HTML of a listing page
 * @returns {Array<{matchUrl: string, homeTeam: string, awayTeam: string, league: string, time: string, broadcasters: string[]}>}
 */
export function parseListingPage(html) {
	const matches = [];
	const seenUrls = new Set();

	// Strategy 1 (primary): Parse event blocks — <div id="NNNN"><div class="event-rt">
	const blockRegex = /<div id="(\d+)"><div class="event-rt">([\s\S]*?)(?=<div id="\d+"><div class="event-rt">|<\/main>|$)/gi;
	let blockMatch;
	while ((blockMatch = blockRegex.exec(html)) !== null) {
		const block = blockMatch[2];

		// Extract /kamp/ URL
		const urlMatch = block.match(/href="(\/kamp\/[^"]+)"/);
		if (!urlMatch) continue;
		const matchUrl = `${BASE_URL}${urlMatch[1]}`;
		if (seenUrls.has(matchUrl)) continue;

		// Extract team names from participants div
		const participantsMatch = block.match(
			/match-details-rt-participants[\s\S]*?<div>\s*(?:<!--[^>]*?-->\s*)*([^<]+?)(?:<!--[^>]*?-->\s*)*\s*-\s*(?:<!--[^>]*?-->\s*)*([^<]+?)\s*<\/div>/
		);
		if (!participantsMatch) continue;
		const homeTeam = participantsMatch[1].trim();
		const awayTeam = participantsMatch[2].trim();
		if (!homeTeam || !awayTeam) continue;

		// Extract time from <time> tag
		const timeMatch = block.match(/<time>(\d{2}:\d{2})<\/time>/);
		const time = timeMatch ? timeMatch[1] : "";

		// Extract league
		const leagueMatch = block.match(/match-details-rt__league">([^<]+)/);
		const league = leagueMatch ? leagueMatch[1].trim() : "";

		// Extract channel names from icon CSS classes, scoped to match channel section
		const channelSection = block.match(/match-details-channels-rt">([\s\S]*?)(?=<\/div>\s*<\/div>\s*<\/div>|$)/);
		const broadcasters = channelSection ? extractChannelsFromIcons(channelSection[1]) : [];

		seenUrls.add(matchUrl);
		matches.push({ matchUrl, homeTeam, awayTeam, league, time, broadcasters });
	}

	// If Strategy 1 found results, return them
	if (matches.length > 0) return matches;

	// Strategy 2 (fallback): Extract from anchor tags with team text
	const linkRegex = /<a[^>]*href="(\/kamp\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	let linkMatch;
	while ((linkMatch = linkRegex.exec(html)) !== null) {
		const matchPath = linkMatch[1];
		const innerHtml = linkMatch[2];
		const fullUrl = `${BASE_URL}${matchPath}`;
		if (seenUrls.has(fullUrl)) continue;

		// Try to extract teams from inner text
		const teamsFromText = parseTeamsFromText(innerHtml.replace(/<[^>]+>/g, " ").trim());
		if (!teamsFromText) continue;

		const timeMatch = innerHtml.match(/(\d{2}:\d{2})/);
		seenUrls.add(fullUrl);
		matches.push({
			matchUrl: fullUrl,
			homeTeam: teamsFromText.home,
			awayTeam: teamsFromText.away,
			league: "",
			time: timeMatch ? timeMatch[1] : "",
			broadcasters: [],
		});
	}

	return matches;
}

/**
 * Extract channel/broadcaster names from icon CSS classes in an HTML block.
 * Icon classes follow the pattern: icons-channels-{channelKey}
 * Filters out betting sites and numeric-only IDs.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function extractChannelsFromIcons(html) {
	const channels = new Set();

	const iconRegex = /icons-channels-(\w+)/g;
	let iconMatch;
	while ((iconMatch = iconRegex.exec(html)) !== null) {
		const key = iconMatch[1].toLowerCase();

		// Skip: numeric IDs, "rt" prefix tokens, "default"
		if (/^\d+$/.test(key) || key === "default" || key.startsWith("rt-")) continue;

		// Check known channel map
		const mapped = CHANNEL_CLASS_MAP[key];
		if (mapped) {
			channels.add(mapped);
			continue;
		}

		// Check if it's a betting site class
		const cleanKey = key.replace(/^rt-?/, "");
		if (isBettingSite(cleanKey)) continue;

		// Unknown channel — add capitalized for debugging
		if (cleanKey.length >= 2) {
			channels.add(cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1));
		}
	}

	return [...channels];
}

/**
 * Parse team names from text content.
 * Handles "Home - Away", "Home vs Away", "Home mot Away" formats.
 * @param {string} text
 * @returns {{home: string, away: string} | null}
 */
export function parseTeamsFromText(text) {
	if (!text) return null;
	const clean = text.replace(/<!--[^>]*-->/g, "").replace(/\s+/g, " ").trim();
	const parts = clean.split(/\s+(?:-|vs|mot)\s+/i);
	if (parts.length !== 2) return null;
	const home = parts[0].trim();
	const away = parts[1].trim();
	if (!home || !away || home.length < 2 || away.length < 2) return null;
	return { home, away };
}

/**
 * Parse team names from a tvkampen match URL slug (fallback).
 * Note: tvkampen URLs typically DON'T use -vs-, so this is only for edge cases.
 */
export function parseTeamsFromUrl(url) {
	const slug = url.split("/").pop().split("?")[0];
	const withoutId = slug.replace(/-\d+$/, "");
	const parts = withoutId.split(/-(?:vs|mot)-/i);
	if (parts.length !== 2) return null;
	const home = parts[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
	const away = parts[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
	if (!home || !away) return null;
	return { home, away };
}

/**
 * Parse a tvkampen match page to extract broadcaster names.
 * Looks for the "Vises på" (shown on) section with channel list items.
 *
 * @param {string} html - Raw HTML of a match page
 * @returns {string[]} Array of broadcaster names (betting sites filtered out)
 */
export function parseMatchPage(html) {
	const broadcasters = new Set();

	// Pattern 1 (primary): rt-match-channel-list__channel-text spans
	const channelTextRegex = /rt-match-channel-list__channel-text[^>]*>([^<]+)/g;
	let textMatch;
	while ((textMatch = channelTextRegex.exec(html)) !== null) {
		const name = textMatch[1].trim();
		if (name && !isBettingSite(name)) {
			broadcasters.add(name);
		}
	}

	// Pattern 2: aria-label on channel items (includes country code)
	const ariaRegex = /rt-match-channel-list__item[^"]*"\s+aria-label="([^"]+)"/g;
	let ariaMatch;
	while ((ariaMatch = ariaRegex.exec(html)) !== null) {
		const name = ariaMatch[1].replace(/\s*\([A-Z]{2}\)\s*$/, "").trim();
		if (name && !isBettingSite(name)) {
			broadcasters.add(name);
		}
	}

	// Pattern 3: Channel icon CSS classes, scoped to channel list section
	const channelListSection = html.match(/rt-match-channel-list">([\s\S]*?)(?=<\/div>\s*<\/div>|$)/);
	if (channelListSection) {
		const iconChannels = extractChannelsFromIcons(channelListSection[1]);
		for (const ch of iconChannels) {
			if (!isBettingSite(ch)) {
				broadcasters.add(ch);
			}
		}
	}

	// Pattern 4: Look for known Norwegian broadcaster names in text content
	const knownBroadcasters = [
		"TV 2 Play", "TV 2 Sport 1", "TV 2 Sport 2", "TV 2 Sport Premium",
		"TV 2 Direkte", "TV2 Play", "TV2 Sport",
		"Viaplay", "V Sport 1", "V Sport 2", "V Sport+", "V Sport Fotball",
		"Discovery+", "Eurosport 1", "Eurosport 2", "Eurosport Norge",
		"NRK1", "NRK2", "NRK Sport",
		"DAZN", "MAX", "Paramount+",
	];
	for (const name of knownBroadcasters) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`(?:>|\\s|^)${escaped}(?:<|\\s|,|$)`, "i").test(html)) {
			broadcasters.add(name);
		}
	}

	return [...broadcasters].filter((b) => !isBettingSite(b));
}

/**
 * Delay helper.
 */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch sport listings from tvkampen for a specific date.
 * @param {string} sport - Sport slug (e.g., "fotball")
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Function} [fetcher] - Optional HTML fetcher (for testing)
 * @returns {Promise<Array<{matchUrl: string, homeTeam: string, awayTeam: string, league: string, time: string, broadcasters: string[]}>>}
 */
export async function fetchSportListings(sport, date, fetcher = fetchHtml) {
	const url = `${BASE_URL}/${sport}/date/${date}`;
	try {
		const html = await fetcher(url);
		return parseListingPage(html);
	} catch (err) {
		console.warn(`tvkampen listing fetch failed for ${sport}/${date}: ${err.message}`);
		return [];
	}
}

/**
 * Fetch broadcasters for a specific match.
 * @param {string} matchUrl - Full match URL
 * @param {Function} [fetcher] - Optional HTML fetcher (for testing)
 * @returns {Promise<string[]>}
 */
export async function fetchMatchBroadcasters(matchUrl, fetcher = fetchHtml) {
	try {
		const html = await fetcher(matchUrl);
		return parseMatchPage(html);
	} catch (err) {
		console.warn(`tvkampen match fetch failed for ${matchUrl}: ${err.message}`);
		return [];
	}
}

/**
 * Fetch listings and broadcaster data for multiple dates with rate limiting.
 *
 * The listing page already contains channel icons, so we only fetch individual
 * match pages when a listing entry has no broadcasters from icon parsing.
 *
 * First date fetch propagates errors for reachability detection.
 *
 * @param {string} sport
 * @param {string[]} dates - Array of YYYY-MM-DD date strings
 * @param {Function} [fetcher] - Optional HTML fetcher (for testing)
 * @returns {Promise<Array<{matchUrl: string, homeTeam: string, awayTeam: string, league: string, time: string, broadcasters: string[]}>>}
 */
export async function fetchListingsWithBroadcasters(sport, dates, fetcher = fetchHtml) {
	const allListings = [];

	// Fetch listings for each date.
	// First date fetch propagates errors for reachability detection.
	for (let i = 0; i < dates.length; i++) {
		let listings;
		if (i === 0) {
			const url = `${BASE_URL}/${sport}/date/${dates[0]}`;
			const html = await fetcher(url);
			listings = parseListingPage(html);
		} else {
			listings = await fetchSportListings(sport, dates[i], fetcher);
		}
		// Tag each listing with its source date for per-date matching
		for (const l of listings) l.date = dates[i];
		allListings.push(...listings);
		if (i < dates.length - 1) await delay(REQUEST_DELAY_MS);
	}

	// Deduplicate by matchUrl
	const unique = [];
	const seen = new Set();
	for (const listing of allListings) {
		if (!seen.has(listing.matchUrl)) {
			seen.add(listing.matchUrl);
			unique.push(listing);
		}
	}

	// Only fetch match pages for entries that have no broadcasters from listing icons
	const needDetail = unique.filter((e) => !e.broadcasters || e.broadcasters.length === 0);
	if (needDetail.length > 0) {
		for (let i = 0; i < needDetail.length; i += MAX_CONCURRENT) {
			const batch = needDetail.slice(i, i + MAX_CONCURRENT);
			const results = await Promise.allSettled(
				batch.map((entry) => fetchMatchBroadcasters(entry.matchUrl, fetcher))
			);
			for (let j = 0; j < batch.length; j++) {
				batch[j].broadcasters = results[j].status === "fulfilled" ? results[j].value : [];
			}
			if (i + MAX_CONCURRENT < needDetail.length) await delay(REQUEST_DELAY_MS);
		}
	}

	return unique;
}
