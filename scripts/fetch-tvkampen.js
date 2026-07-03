#!/usr/bin/env node
/**
 * Fetches Norwegian TV listings for football from tvkampen.com (today + 2 days)
 * → docs/data/tv-listings.json
 *
 * This is streaming GROUND TRUTH for "hvor kan jeg se det": the research and
 * verify agents cross-check event streaming info against it, and the static
 * pipeline can enrich football events mechanically. Fails soft — an unreachable
 * source keeps the previous file (the pipeline step is continue-on-error).
 */

import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty, iso, MS_PER_DAY } from "./lib/helpers.js";
import { fetchListingsWithBroadcasters } from "./lib/tvkampen-scraper.js";

const DAYS_AHEAD = 3; // today + 2

function osloDateKey(offsetDays) {
	return new Date(Date.now() + offsetDays * MS_PER_DAY).toLocaleDateString("en-CA", {
		timeZone: "Europe/Oslo",
	});
}

async function main() {
	const dataDir = rootDataPath();
	const target = path.join(dataDir, "tv-listings.json");
	const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => osloDateKey(i));

	let listings;
	try {
		listings = await fetchListingsWithBroadcasters("fotball", dates);
	} catch (err) {
		console.warn(`tvkampen unreachable (${err.message}) — keeping previous tv-listings.json`);
		const previous = readJsonIfExists(target);
		if (!previous) {
			writeJsonPretty(target, { fetchedAt: iso(), source: "tvkampen.com", days: {}, unreachable: true });
		}
		return;
	}

	const days = {};
	for (const date of dates) days[date] = [];
	for (const m of listings) {
		const key = m.date && days[m.date] ? m.date : dates[0];
		days[key].push({
			homeTeam: m.homeTeam,
			awayTeam: m.awayTeam,
			time: m.time,
			league: m.league,
			broadcasters: m.broadcasters,
		});
	}

	writeJsonPretty(target, { fetchedAt: iso(), source: "tvkampen.com", days });
	console.log(
		`tvkampen: ${listings.length} listings across ${dates.length} day(s) → tv-listings.json`
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
