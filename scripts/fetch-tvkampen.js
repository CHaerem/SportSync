#!/usr/bin/env node
/**
 * Fetches Norwegian TV listings for football from tvkampen.com
 * → docs/data/tv-listings.json
 *
 * NOTE (verified 2026-07-03): tvkampen's per-date URLs (/fotball/date/YYYY-MM-DD)
 * redirect to /fotball, which lists today's + upcoming matches on one page.
 * Entries therefore carry NO date — consumers must match by team names, and
 * times are Oslo-local HH:MM strings.
 *
 * This is streaming GROUND TRUTH for "hvor kan jeg se det": the research and
 * verify agents cross-check event streaming info against it. Fails soft — an
 * unreachable source keeps the previous file (pipeline step is continue-on-error).
 */

import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty, iso } from "./lib/helpers.js";
import { fetchListingsWithBroadcasters } from "./lib/tvkampen-scraper.js";

function osloToday() {
	return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

async function main() {
	const dataDir = rootDataPath();
	const target = path.join(dataDir, "tv-listings.json");

	let listings;
	try {
		// Single date → single page fetch; the /fotball page covers upcoming days.
		listings = await fetchListingsWithBroadcasters("fotball", [osloToday()]);
	} catch (err) {
		console.warn(`tvkampen unreachable (${err.message}) — keeping previous tv-listings.json`);
		const previous = readJsonIfExists(target);
		if (!previous) {
			writeJsonPretty(target, {
				fetchedAt: iso(),
				source: "tvkampen.com",
				timezone: "Europe/Oslo",
				listings: [],
				unreachable: true,
			});
		}
		return;
	}

	writeJsonPretty(target, {
		fetchedAt: iso(),
		source: "tvkampen.com",
		timezone: "Europe/Oslo",
		note: "Times are Oslo-local HH:MM without dates — match entries by team names.",
		listings: listings.map((m) => ({
			homeTeam: m.homeTeam,
			awayTeam: m.awayTeam,
			time: m.time,
			league: m.league,
			broadcasters: m.broadcasters,
			// Per-match tvkampen page (lists every Norwegian broadcaster for THIS
			// match) — a real "where to watch" deep link, esp. for shared/tentative
			// rights. Agents may set it as an event's streaming url (see norwegian-rights skill).
			url: m.matchUrl,
		})),
	});
	console.log(`tvkampen: ${listings.length} listings → tv-listings.json`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
