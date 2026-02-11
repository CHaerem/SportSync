#!/usr/bin/env node
/**
 * Fetches standings data from ESPN APIs:
 * - Football: Premier League table
 * - Golf: PGA Tour + DP World Tour leaderboards
 * - F1: Driver championship standings
 *
 * Output: docs/data/standings.json
 */

import path from "path";
import { fetchJson, iso, rootDataPath, writeJsonPretty } from "./lib/helpers.js";
import { validateESPNStandings, validateESPNScoreboard } from "./lib/response-validator.js";

const ESPN_BASE = "https://site.api.espn.com/apis/v2/sports";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";

export async function fetchFootballStandings() {
	const url = `${ESPN_BASE}/soccer/eng.1/standings`;
	const data = await fetchJson(url);

	const validated = validateESPNStandings(data, "football");
	for (const w of validated.warnings) console.warn(w);
	if (validated.entries.length === 0) return [];

	const group = data?.children?.[0];
	if (!group?.standings?.entries) return [];

	return group.standings.entries.map((entry) => {
		const stats = {};
		for (const s of entry.stats || []) {
			stats[s.name] = s.value;
		}
		return {
			position: stats.rank || 0,
			team: entry.team?.displayName || entry.team?.name || "Unknown",
			teamShort: entry.team?.abbreviation || "",
			played: stats.gamesPlayed || 0,
			won: stats.wins || 0,
			drawn: stats.ties || 0,
			lost: stats.losses || 0,
			gd: stats.pointDifferential || 0,
			points: stats.points || 0,
		};
	}).sort((a, b) => a.position - b.position);
}

export async function fetchGolfLeaderboard() {
	const tours = [
		{ key: "pga", url: `${ESPN_SITE}/golf/pga/scoreboard` },
		{ key: "dpWorld", url: `${ESPN_SITE}/golf/eur/scoreboard` },
	];

	const result = {};
	for (const tour of tours) {
		try {
			const data = await fetchJson(tour.url);
			const vGolf = validateESPNScoreboard(data, `golf-${tour.key}`);
			for (const w of vGolf.warnings) console.warn(w);
			const event = vGolf.events[0] || data?.events?.[0];
			if (!event) {
				result[tour.key] = { name: null, status: "no_event", leaderboard: [] };
				continue;
			}

			const competition = event.competitions?.[0];
			const competitors = competition?.competitors || [];
			const statusType = event.status?.type?.name || "unknown";

			result[tour.key] = {
				name: event.name || null,
				status: statusType === "STATUS_IN_PROGRESS" ? "in_progress"
					: statusType === "STATUS_SCHEDULED" ? "scheduled"
					: statusType === "STATUS_FINAL" ? "final"
					: statusType,
				leaderboard: competitors.slice(0, 15).map((c, idx) => ({
					position: c.order || parseInt(c.status?.position?.displayName || "0", 10) || (idx + 1),
					player: c.athlete?.displayName || c.athlete?.fullName || "Unknown",
					score: typeof c.score === "object" ? (c.score?.displayValue || "E") : (c.score?.toString() || "E"),
					today: c.linescores?.[c.linescores.length - 1]?.displayValue || "-",
					thru: c.status?.thru?.toString() || "-",
				})),
			};
		} catch (err) {
			console.warn(`Golf ${tour.key} leaderboard fetch failed:`, err.message);
			result[tour.key] = { name: null, status: "error", leaderboard: [] };
		}
	}
	return result;
}

export async function fetchF1Standings() {
	const url = `${ESPN_BASE}/racing/f1/standings`;
	const data = await fetchJson(url);

	const group = data?.children?.[0];
	if (!group?.standings?.entries) return [];

	return group.standings.entries.map((entry) => {
		const stats = {};
		for (const s of entry.stats || []) {
			stats[s.name] = s.value;
		}
		return {
			position: stats.rank || 0,
			driver: entry.athlete?.displayName || "Unknown",
			team: entry.team?.displayName || "",
			points: stats.championshipPts || stats.points || 0,
			wins: stats.wins || 0,
		};
	}).sort((a, b) => {
		// Sort by position, but put 0-position entries at end (pre-season)
		if (a.position === 0 && b.position === 0) return b.points - a.points;
		if (a.position === 0) return 1;
		if (b.position === 0) return -1;
		return a.position - b.position;
	});
}

async function main() {
	const dataDir = rootDataPath();
	const outPath = path.join(dataDir, "standings.json");

	const standings = { lastUpdated: iso() };

	// Football
	try {
		const pl = await fetchFootballStandings();
		standings.football = { premierLeague: pl };
		console.log(`Football: ${pl.length} teams in PL table`);
	} catch (err) {
		console.warn("Football standings failed:", err.message);
		standings.football = { premierLeague: [] };
	}

	// Golf
	try {
		standings.golf = await fetchGolfLeaderboard();
		const pgaCount = standings.golf.pga?.leaderboard?.length || 0;
		const dpCount = standings.golf.dpWorld?.leaderboard?.length || 0;
		console.log(`Golf: PGA ${pgaCount} players, DP World ${dpCount} players`);
	} catch (err) {
		console.warn("Golf leaderboard failed:", err.message);
		standings.golf = {
			pga: { name: null, status: "error", leaderboard: [] },
			dpWorld: { name: null, status: "error", leaderboard: [] },
		};
	}

	// F1
	try {
		const drivers = await fetchF1Standings();
		standings.f1 = { drivers };
		console.log(`F1: ${drivers.length} drivers`);
	} catch (err) {
		console.warn("F1 standings failed:", err.message);
		standings.f1 = { drivers: [] };
	}

	writeJsonPretty(outPath, standings);
	console.log(`Standings written to ${outPath}`);
}

// Run if executed directly
if (process.argv[1]?.includes("fetch-standings")) {
	main().catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}
