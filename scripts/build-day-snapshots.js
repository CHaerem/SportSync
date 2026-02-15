#!/usr/bin/env node
/**
 * Build Day Snapshots
 *
 * Generates docs/data/days/{YYYY-MM-DD}.json for dates in [-7, +7].
 * Each snapshot is a deterministic, pre-built view of a single day:
 * events (upcoming/results), match results, standings, watch plan, RSS highlights.
 *
 * Runs after build-events.js and fetch-results.js in the pipeline.
 * No AI calls — purely deterministic aggregation of existing data.
 */

import fs from "fs";
import path from "path";
import {
	readJsonIfExists,
	rootDataPath,
	writeJsonPretty,
	isEventInWindow,
	formatDateKey,
	iso,
} from "./lib/helpers.js";

const SCHEMA_VERSION = 1;
const SNAPSHOT_RANGE_DAYS = 7; // -7 to +7
const MAX_RSS_ITEMS = 5;
const MAX_STANDINGS_TEAMS = 5;
const CLEANUP_DAYS = 365;

export function buildSnapshot(date, { events, recentResults, standings, watchPlan, rssDigest }) {
	const dateKey = formatDateKey(date);
	const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayEnd = new Date(dayStart.getTime() + 86400000);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const isToday = dayStart.getTime() === today.getTime();
	const isYesterday = dayStart.getTime() === today.getTime() - 86400000;

	// Filter events for this day
	const dayEvents = events.filter(e => isEventInWindow(e, dayStart, dayEnd));

	// Split into upcoming/results (no "live" — that's real-time client-side only)
	const upcoming = [];
	const results = [];
	for (const e of dayEvents) {
		const t = new Date(e.time);
		const endTime = e.endTime ? new Date(e.endTime) : null;
		const hoursAgo = (now - t) / (1000 * 60 * 60);
		const isEnded = endTime ? now > endTime : hoursAgo > 3;
		if (t < now && isEnded) {
			results.push(e);
		} else {
			upcoming.push(e);
		}
	}

	// Filter match results for this date
	const football = Array.isArray(recentResults?.football) ? recentResults.football : [];
	const matchResults = football.filter(m => m.date && m.date.startsWith(dateKey));

	// Standings: include only for today and yesterday (when relevant)
	let standingsSnapshot = null;
	if ((isToday || isYesterday) && standings) {
		standingsSnapshot = {};
		if (standings.football?.premierLeague?.length > 0) {
			standingsSnapshot.premierLeague = standings.football.premierLeague.slice(0, MAX_STANDINGS_TEAMS);
		}
		if (standings.golf?.pga) {
			standingsSnapshot.golf = {
				pga: {
					name: standings.golf.pga.name || "PGA Tour",
					leaderboard: (standings.golf.pga.leaderboard || []).slice(0, MAX_STANDINGS_TEAMS),
				},
			};
		}
		if (standings.f1?.drivers?.length > 0) {
			standingsSnapshot.f1 = standings.f1.drivers.slice(0, MAX_STANDINGS_TEAMS);
		}
	}

	// Watch plan: include only for today
	let watchPlanSnapshot = null;
	if (isToday && watchPlan && Array.isArray(watchPlan.picks) && watchPlan.picks.length > 0) {
		watchPlanSnapshot = {
			picks: watchPlan.picks,
			headline: watchPlan.headline || null,
		};
	}

	// RSS highlights: include for today and yesterday
	let rssHighlights = null;
	if ((isToday || isYesterday) && rssDigest && Array.isArray(rssDigest.items)) {
		rssHighlights = rssDigest.items.slice(0, MAX_RSS_ITEMS).map(item => ({
			title: item.title,
			source: item.source,
			sport: item.sport || null,
			link: item.link || null,
		}));
	}

	// Collect sports covered
	const sportsCovered = [...new Set(dayEvents.map(e => e.sport).filter(Boolean))];

	const snapshot = {
		schemaVersion: SCHEMA_VERSION,
		date: dateKey,
		generatedAt: iso(),
		events: {
			upcoming,
			results,
		},
		matchResults,
		standings: standingsSnapshot,
		watchPlan: watchPlanSnapshot,
		rssHighlights,
		meta: {
			eventCount: dayEvents.length,
			sportsCovered,
			hasResults: matchResults.length > 0,
			hasStandings: standingsSnapshot !== null,
		},
	};

	return snapshot;
}

export function validateSnapshot(snapshot, events) {
	const dateKey = snapshot.date;
	const dayStart = new Date(dateKey + "T00:00:00");
	const dayEnd = new Date(dayStart.getTime() + 86400000);
	const expectedCount = events.filter(e => isEventInWindow(e, dayStart, dayEnd)).length;
	const actualCount = snapshot.meta.eventCount;

	if (actualCount !== expectedCount) {
		return { valid: false, expected: expectedCount, actual: actualCount };
	}
	return { valid: true };
}

export function cleanOldSnapshots(daysDir, maxAgeDays = CLEANUP_DAYS) {
	if (!fs.existsSync(daysDir)) return 0;
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - maxAgeDays);
	const cutoffKey = formatDateKey(cutoff);
	let removed = 0;

	for (const file of fs.readdirSync(daysDir)) {
		if (!file.endsWith(".json") || file.startsWith("_")) continue;
		const dateKey = file.replace(".json", "");
		if (dateKey < cutoffKey) {
			fs.unlinkSync(path.join(daysDir, file));
			removed++;
		}
	}
	return removed;
}

async function main() {
	const dataDir = rootDataPath();
	const daysDir = path.join(dataDir, "days");

	// Ensure output directory exists
	if (!fs.existsSync(daysDir)) {
		fs.mkdirSync(daysDir, { recursive: true });
	}

	// Load all input data
	const eventsData = readJsonIfExists(path.join(dataDir, "events.json")) || [];
	const recentResults = readJsonIfExists(path.join(dataDir, "recent-results.json"));
	const standings = readJsonIfExists(path.join(dataDir, "standings.json"));
	const watchPlan = readJsonIfExists(path.join(dataDir, "watch-plan.json"));
	const rssDigest = readJsonIfExists(path.join(dataDir, "rss-digest.json"));

	const inputData = { events: eventsData, recentResults, standings, watchPlan, rssDigest };

	const now = new Date();
	const perDay = {};
	let snapshotCount = 0;
	let totalEvents = 0;
	const allSports = new Set();
	const issues = [];

	// Generate snapshots for [-7, +7]
	for (let offset = -SNAPSHOT_RANGE_DAYS; offset <= SNAPSHOT_RANGE_DAYS; offset++) {
		const date = new Date(now);
		date.setDate(date.getDate() + offset);
		const dateKey = formatDateKey(date);

		try {
			const snapshot = buildSnapshot(date, inputData);

			// Self-validation
			const validation = validateSnapshot(snapshot, eventsData);
			if (!validation.valid) {
				console.warn(`Snapshot ${dateKey}: event count mismatch (expected ${validation.expected}, got ${validation.actual}), regenerating`);
				const retried = buildSnapshot(date, inputData);
				writeJsonPretty(path.join(daysDir, `${dateKey}.json`), retried);
			} else {
				writeJsonPretty(path.join(daysDir, `${dateKey}.json`), snapshot);
			}

			perDay[dateKey] = {
				eventCount: snapshot.meta.eventCount,
				resultCount: snapshot.matchResults.length,
				sports: snapshot.meta.sportsCovered,
			};
			totalEvents += snapshot.meta.eventCount;
			snapshot.meta.sportsCovered.forEach(s => allSports.add(s));
			snapshotCount++;
		} catch (err) {
			console.error(`Failed to build snapshot for ${dateKey}:`, err.message);
			issues.push(`Failed to build ${dateKey}: ${err.message}`);
		}
	}

	// Clean up old snapshots
	const removed = cleanOldSnapshots(daysDir);
	if (removed > 0) {
		console.log(`Cleaned up ${removed} old snapshot(s)`);
	}

	// Compute date range
	const dates = Object.keys(perDay).sort();
	const dateRange = dates.length > 0 ? [dates[0], dates[dates.length - 1]] : [];

	// Find empty days
	const emptyDays = Object.entries(perDay)
		.filter(([, info]) => info.eventCount === 0 && info.resultCount === 0)
		.map(([dateKey]) => dateKey);

	// Write meta summary
	const meta = {
		generatedAt: iso(),
		snapshotCount,
		dateRange,
		perDay,
		emptyDays,
		issues,
	};
	writeJsonPretty(path.join(daysDir, "_meta.json"), meta);

	console.log(`Built ${snapshotCount} day snapshots (${totalEvents} events across ${allSports.size} sports)`);
	if (emptyDays.length > 0) {
		console.log(`Empty days: ${emptyDays.join(", ")}`);
	}
}

if (process.argv[1]?.includes("build-day-snapshots")) {
	main().catch(err => {
		console.error("build-day-snapshots failed:", err);
		process.exit(1);
	});
}
