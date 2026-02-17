#!/usr/bin/env node
/**
 * Streaming Enrichment Pipeline Step
 *
 * Scrapes tvkampen.com for Norwegian broadcaster data,
 * matches entries to events.json, and enriches events with
 * real streaming links (replacing static league-level mappings).
 *
 * Runs after build-events but before enrich-events in the pipeline.
 * Graceful degradation: if tvkampen is unreachable, existing streaming data is preserved.
 *
 * Output:
 *   - Updated events.json with per-event streaming data
 *   - docs/data/streaming-enrichment.json (enrichment log for health monitoring)
 */

import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty, formatDateKey } from "./lib/helpers.js";
import { fetchListingsWithBroadcasters } from "./lib/tvkampen-scraper.js";
import { matchTvkampenToEvents, mineAliasSuggestions, buildStreamingHints } from "./lib/streaming-matcher.js";
import { buildStreamingEntries } from "./lib/broadcaster-urls.js";

/**
 * Enrich events with tvkampen streaming data.
 * Exported for testing.
 *
 * @param {object} options
 * @param {Array} options.events - events.json array
 * @param {Function} [options.fetcher] - HTML fetcher override for testing
 * @returns {Promise<{events: Array, log: object}>}
 */
export async function enrichStreaming({ events, fetcher }) {
	const now = new Date();
	const today = formatDateKey(now);
	const tomorrow = formatDateKey(new Date(now.getTime() + 86400000));
	const dates = [today, tomorrow];

	const log = {
		generatedAt: now.toISOString(),
		dates,
		tvkampenReachable: false,
		listingsFound: 0,
		matchesAttempted: 0,
		matchesSucceeded: 0,
		eventsEnriched: 0,
		totalEvents: events.length,
		matchRate: 0,
		unmatched: [],
		enrichedEvents: [],
	};

	// Filter to football events (tvkampen's strongest coverage) with homeTeam/awayTeam
	const footballEvents = events.filter(
		(e) => e.sport === "football" && e.homeTeam && e.awayTeam
	);
	log.matchesAttempted = footballEvents.length;

	if (footballEvents.length === 0) {
		console.log("No football events with teams to match — skipping streaming enrichment.");
		return { events, log };
	}

	// Fetch from tvkampen
	let tvkEntries;
	const fetcherFn = fetcher || undefined;
	try {
		tvkEntries = await fetchListingsWithBroadcasters("fotball", dates, fetcherFn);
		log.tvkampenReachable = true;
		log.listingsFound = tvkEntries.length;
		console.log(`tvkampen: fetched ${tvkEntries.length} listings for ${dates.join(", ")}`);
	} catch (err) {
		console.warn(`tvkampen unreachable: ${err.message} — preserving existing streaming data.`);
		return { events, log };
	}

	if (tvkEntries.length === 0) {
		console.log("tvkampen returned 0 listings — preserving existing streaming data.");
		return { events, log };
	}

	// Match tvkampen entries per source date to avoid cross-day confusion
	const matched = [];
	const usedEventIds = new Set();
	for (const date of dates) {
		const dateEntries = tvkEntries.filter((e) => e.date === date);
		if (dateEntries.length === 0) continue;
		// Filter out already-matched events to prevent duplicates across date groups
		const availableEvents = footballEvents.filter((_, i) => !usedEventIds.has(i));
		const dateMatches = matchTvkampenToEvents(dateEntries, availableEvents, {
			minConfidence: 0.6,
			dateStr: date,
		});
		for (const m of dateMatches) {
			const idx = footballEvents.indexOf(m.event);
			if (idx >= 0) usedEventIds.add(idx);
			matched.push(m);
		}
	}
	log.matchesSucceeded = matched.length;
	log.matchRate = footballEvents.length > 0
		? Number((matched.length / footballEvents.length).toFixed(2))
		: 0;

	// Track unmatched tvkampen entries for debugging / alias improvement
	const matchedUrls = new Set(matched.map((m) => m.tvkEntry.matchUrl));
	log.unmatched = tvkEntries
		.filter((e) => !matchedUrls.has(e.matchUrl))
		.map((e) => ({ homeTeam: e.homeTeam, awayTeam: e.awayTeam, time: e.time }))
		.slice(0, 20); // cap at 20 for log size

	// Enrich matched events
	for (const { tvkEntry, event, confidence } of matched) {
		if (tvkEntry.broadcasters && tvkEntry.broadcasters.length > 0) {
			const streamingEntries = buildStreamingEntries(tvkEntry.broadcasters, event);
			if (streamingEntries.length > 0) {
				event.streaming = streamingEntries;
				event.streamingSource = "tvkampen";
				event.streamingConfidence = confidence;
				log.eventsEnriched++;
				log.enrichedEvents.push({
					homeTeam: event.homeTeam,
					awayTeam: event.awayTeam,
					broadcasters: streamingEntries.map((s) => s.platform),
					confidence,
				});
			}
		}
	}

	// Self-monitoring: mine alias suggestions from unmatched entries
	const aliasSuggestions = mineAliasSuggestions(log.unmatched, footballEvents);
	log.aliasSuggestions = aliasSuggestions.slice(0, 10); // cap at 10

	// Read verification history, build hints, and append run record
	const historyPath = path.join(rootDataPath(), "streaming-verification-history.json");
	const history = readJsonIfExists(historyPath) || { runs: [] };
	const hints = buildStreamingHints(history.runs);
	log.hintsApplied = hints;

	if (hints.length > 0) {
		console.log(`Streaming hints (${hints.length}):`);
		for (const h of hints) console.log(`  ${h}`);
	}

	// Append run record (keep last 50)
	history.runs.push({
		timestamp: now.toISOString(),
		matchRate: log.matchRate,
		listingsFound: log.listingsFound,
		eventsEnriched: log.eventsEnriched,
		matchesSucceeded: log.matchesSucceeded,
		matchesAttempted: log.matchesAttempted,
		aliasSuggestions: log.aliasSuggestions,
		hintsCount: hints.length,
	});
	if (history.runs.length > 50) {
		history.runs = history.runs.slice(-50);
	}
	writeJsonPretty(historyPath, history);

	console.log(
		`Streaming enrichment: ${log.eventsEnriched}/${footballEvents.length} football events enriched ` +
		`(${log.listingsFound} listings, ${log.matchesSucceeded} matched, rate ${Math.round(log.matchRate * 100)}%)`
	);

	return { events, log };
}

async function main() {
	const dataDir = rootDataPath();
	const eventsPath = path.join(dataDir, "events.json");

	// Read events
	const events = readJsonIfExists(eventsPath);
	if (!events || !Array.isArray(events) || events.length === 0) {
		console.log("No events to enrich (events.json missing or empty).");
		process.exit(0);
	}

	const { events: enrichedEvents, log } = await enrichStreaming({ events });

	// Write enriched events back
	writeJsonPretty(eventsPath, enrichedEvents);

	// Write enrichment log
	const logPath = path.join(dataDir, "streaming-enrichment.json");
	writeJsonPretty(logPath, log);

	console.log(`Wrote streaming enrichment log to ${logPath}`);
}

main().catch((err) => {
	console.error("Streaming enrichment failed:", err.message);
	process.exit(1);
});
