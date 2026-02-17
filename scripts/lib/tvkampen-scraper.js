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
 * tvkampen uses Next.js RSC — data is embedded in self.__next_f.push() payloads
 * or in standard HTML tables/divs depending on the page version.
 *
 * @param {string} html - Raw HTML of a listing page
 * @returns {Array<{matchUrl: string, homeTeam: string, awayTeam: string, league: string, time: string}>}
 */
export function parseListingPage(html) {
	const matches = [];

	// Strategy 1: Extract from anchor tags linking to /kamp/ pages
	// Pattern: <a href="/kamp/team1-vs-team2-12345">
	const linkRegex = /<a[^>]*href="(\/kamp\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	let linkMatch;
	while ((linkMatch = linkRegex.exec(html)) !== null) {
		const matchPath = linkMatch[1];
		const innerHtml = linkMatch[2];

		// Extract teams from the link text or surrounding context
		const teamsFromUrl = parseTeamsFromUrl(matchPath);
		if (!teamsFromUrl) continue;

		// Extract time — look for HH:MM pattern near the link
		const timeMatch = innerHtml.match(/(\d{2}:\d{2})/);
		const time = timeMatch ? timeMatch[1] : "";

		const fullUrl = `${BASE_URL}${matchPath}`;

		// Skip duplicates (same URL)
		if (matches.some((m) => m.matchUrl === fullUrl)) continue;

		matches.push({
			matchUrl: fullUrl,
			homeTeam: teamsFromUrl.home,
			awayTeam: teamsFromUrl.away,
			league: "",
			time,
		});
	}

	// Strategy 2: Parse Next.js RSC payloads for structured data
	const rscRegex = /self\.__next_f\.push\(\[[\d,]*"([\s\S]*?)"\]\)/g;
	let rscMatch;
	while ((rscMatch = rscRegex.exec(html)) !== null) {
		try {
			// Unescape the JSON string content
			const payload = rscMatch[1]
				.replace(/\\n/g, "\n")
				.replace(/\\"/g, '"')
				.replace(/\\\\/g, "\\");

			// Look for match-like objects with teams and URLs
			const matchDataRegex = /"homeTeam"\s*:\s*"([^"]+)"[\s\S]*?"awayTeam"\s*:\s*"([^"]+)"[\s\S]*?"(?:url|slug|href)"\s*:\s*"([^"]+)"/g;
			let dataMatch;
			while ((dataMatch = matchDataRegex.exec(payload)) !== null) {
				const [, home, away, url] = dataMatch;
				const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
				if (!matches.some((m) => m.matchUrl === fullUrl)) {
					matches.push({ matchUrl: fullUrl, homeTeam: home, awayTeam: away, league: "", time: "" });
				}
			}
		} catch {
			// Skip malformed RSC payloads
		}
	}

	// Strategy 3: Look for table rows with match data
	const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
	let rowMatch;
	while ((rowMatch = rowRegex.exec(html)) !== null) {
		const row = rowMatch[1];
		const kampLink = row.match(/href="(\/kamp\/[^"]+)"/);
		if (!kampLink) continue;
		if (matches.some((m) => m.matchUrl === `${BASE_URL}${kampLink[1]}`)) continue;

		const teams = parseTeamsFromUrl(kampLink[1]);
		if (!teams) continue;

		const timeInRow = row.match(/(\d{2}:\d{2})/);
		matches.push({
			matchUrl: `${BASE_URL}${kampLink[1]}`,
			homeTeam: teams.home,
			awayTeam: teams.away,
			league: "",
			time: timeInRow ? timeInRow[1] : "",
		});
	}

	return matches;
}

/**
 * Parse team names from a tvkampen match URL slug.
 * E.g. "/kamp/arsenal-vs-liverpool-12345" → { home: "Arsenal", away: "Liverpool" }
 */
export function parseTeamsFromUrl(url) {
	// Extract slug: last path segment before any query params
	const slug = url.split("/").pop().split("?")[0];
	// Remove trailing numeric ID
	const withoutId = slug.replace(/-\d+$/, "");
	// Split on "-vs-" or "-mot-" (Norwegian)
	const parts = withoutId.split(/-(?:vs|mot)-/i);
	if (parts.length !== 2) return null;

	const home = parts[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
	const away = parts[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
	if (!home || !away) return null;
	return { home, away };
}

/**
 * Parse a tvkampen match page to extract broadcaster names.
 * Looks for the "Vises på" (shown on) section.
 *
 * @param {string} html - Raw HTML of a match page
 * @returns {string[]} Array of broadcaster names (betting sites filtered out)
 */
export function parseMatchPage(html) {
	const broadcasters = new Set();

	// Pattern 1: "Vises på" section — look for text after this heading
	const visesRegex = /Vises\s+p[åa]\s*:?\s*<\/[^>]+>([\s\S]*?)(?:<\/(?:div|section|ul)|Vises\s+p[åa]|<h[2-4])/i;
	const visesMatch = html.match(visesRegex);
	if (visesMatch) {
		extractBroadcasters(visesMatch[1], broadcasters);
	}

	// Pattern 2: Elements with "channel" or "broadcaster" in class/data attributes
	const channelRegex = /(?:class|data-\w+)="[^"]*(?:channel|broadcaster|kanal|vises)[^"]*"[^>]*>([\s\S]*?)<\//gi;
	let channelMatch;
	while ((channelMatch = channelRegex.exec(html)) !== null) {
		extractBroadcasters(channelMatch[1], broadcasters);
	}

	// Pattern 3: Look for known Norwegian broadcaster names in text content
	const knownBroadcasters = [
		"TV 2 Play", "TV 2 Sport 1", "TV 2 Sport 2", "TV 2 Sport Premium",
		"TV 2 Direkte", "TV2 Play", "TV2 Sport",
		"Viaplay", "V Sport 1", "V Sport 2", "V Sport+", "V Sport Fotball",
		"Discovery+", "Eurosport 1", "Eurosport 2", "Eurosport Norge",
		"NRK1", "NRK2", "NRK Sport",
		"DAZN", "MAX", "Paramount+",
	];
	for (const name of knownBroadcasters) {
		// Use word boundary-like check to avoid false positives
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`(?:>|\\s|^)${escaped}(?:<|\\s|,|$)`, "i").test(html)) {
			broadcasters.add(name);
		}
	}

	// Filter out betting sites
	return [...broadcasters].filter((b) => !isBettingSite(b));
}

/**
 * Extract broadcaster names from an HTML fragment.
 */
function extractBroadcasters(html, set) {
	// Strip HTML tags and split by common delimiters
	const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
	const parts = text.split(/[,\n|]+/);
	for (const part of parts) {
		const name = part.trim();
		if (name.length >= 2 && name.length <= 40 && !isBettingSite(name)) {
			set.add(name);
		}
	}
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
 * @returns {Promise<Array<{matchUrl: string, homeTeam: string, awayTeam: string, league: string, time: string}>>}
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
 * @param {string} sport
 * @param {string[]} dates - Array of YYYY-MM-DD date strings
 * @param {Function} [fetcher] - Optional HTML fetcher (for testing)
 * @returns {Promise<Array<{matchUrl: string, homeTeam: string, awayTeam: string, league: string, time: string, broadcasters: string[]}>>}
 */
export async function fetchListingsWithBroadcasters(sport, dates, fetcher = fetchHtml) {
	const allListings = [];

	// Fetch listings for each date.
	// First date fetch propagates errors for reachability detection.
	// Subsequent date fetches catch individually.
	for (let i = 0; i < dates.length; i++) {
		if (i === 0) {
			// Let errors propagate so callers can detect unreachability
			const url = `${BASE_URL}/${sport}/date/${dates[0]}`;
			const html = await fetcher(url);
			allListings.push(...parseListingPage(html));
		} else {
			const listings = await fetchSportListings(sport, dates[i], fetcher);
			allListings.push(...listings);
		}
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

	// Fetch broadcaster data in batches of MAX_CONCURRENT
	for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
		const batch = unique.slice(i, i + MAX_CONCURRENT);
		const results = await Promise.allSettled(
			batch.map((entry) => fetchMatchBroadcasters(entry.matchUrl, fetcher))
		);
		for (let j = 0; j < batch.length; j++) {
			batch[j].broadcasters = results[j].status === "fulfilled" ? results[j].value : [];
		}
		if (i + MAX_CONCURRENT < unique.length) await delay(REQUEST_DELAY_MS);
	}

	return unique;
}
