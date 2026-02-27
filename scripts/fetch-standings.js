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
import fs from "fs";
import { fetchJson, iso, rootDataPath, readJsonIfExists, writeJsonPretty } from "./lib/helpers.js";
import { validateESPNStandings, validateESPNScoreboard } from "./lib/response-validator.js";

const ESPN_BASE = "https://site.api.espn.com/apis/v2/sports";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";

function parseFootballStandings(data, label) {
	const validated = validateESPNStandings(data, label);
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

export async function fetchFootballStandings() {
	const url = `${ESPN_BASE}/soccer/eng.1/standings`;
	const data = await fetchJson(url);
	return parseFootballStandings(data, "football");
}

export async function fetchLaLigaStandings() {
	const url = `${ESPN_BASE}/soccer/esp.1/standings`;
	const data = await fetchJson(url);
	return parseFootballStandings(data, "laLiga");
}

/**
 * Load tracked golfers from norwegian-golfers.json config.
 * Returns a Map<tourKey, Set<lowercaseName>> for fast lookup.
 * Falls back gracefully if config is missing.
 */
function loadTrackedGolfers() {
	const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
	const golfers = readJsonIfExists(path.join(configDir, "norwegian-golfers.json"));
	const byTour = new Map();
	if (!Array.isArray(golfers)) return byTour;
	for (const g of golfers) {
		const names = [g.name, ...(g.aliases || [])].map(n => n.toLowerCase());
		for (const tour of g.tours || []) {
			if (!byTour.has(tour)) byTour.set(tour, []);
			byTour.get(tour).push({ fullName: g.name, patterns: names });
		}
	}
	return byTour;
}

/**
 * Check if a competitor matches any tracked player for this tour.
 */
function isTrackedPlayer(competitorName, tourTracked) {
	if (!tourTracked || !competitorName) return false;
	const lower = competitorName.toLowerCase();
	return tourTracked.some(t => t.patterns.some(p => lower.includes(p)));
}

function mapCompetitor(c, idx) {
	return {
		position: c.order || parseInt(c.status?.position?.displayName || "0", 10) || (idx + 1),
		positionDisplay: c.status?.position?.displayName || null,
		player: c.athlete?.displayName || c.athlete?.fullName || "Unknown",
		score: typeof c.score === "object" ? (c.score?.displayValue || "E") : (c.score?.toString() || "E"),
		today: c.linescores?.[c.linescores.length - 1]?.displayValue || "-",
		thru: c.status?.thru?.toString() || "-",
		headshot: c.id ? `https://a.espncdn.com/i/headshots/golf/players/full/${c.id}.png` : null,
	};
}

export async function fetchGolfLeaderboard() {
	const tours = [
		{ key: "pga", url: `${ESPN_SITE}/golf/pga/scoreboard` },
		{ key: "dpWorld", url: `${ESPN_SITE}/golf/eur/scoreboard` },
	];

	// Load tracked players once — auto-discovered from norwegian-golfers.json
	const trackedByTour = loadTrackedGolfers();

	const result = {};
	for (const tour of tours) {
		try {
			const data = await fetchJson(tour.url);
			const vGolf = validateESPNScoreboard(data, `golf-${tour.key}`);
			for (const w of vGolf.warnings) console.warn(w);
			const event = vGolf.events[0] || data?.events?.[0];
			if (!event) {
				result[tour.key] = { name: null, status: "no_event", leaderboard: [], trackedPlayers: [] };
				continue;
			}

			const competition = event.competitions?.[0];
			const competitors = competition?.competitors || [];
			const statusType = event.status?.type?.name || "unknown";

			// Build name→headshot map for ALL competitors (enables Norwegian player lookup beyond top 15)
			const headshots = {};
			for (const c of competitors) {
				const name = c.athlete?.displayName || c.athlete?.fullName;
				if (name && c.id) headshots[name] = `https://a.espncdn.com/i/headshots/golf/players/full/${c.id}.png`;
			}

			// Top 15 for general leaderboard
			const tourTracked = trackedByTour.get(tour.key) || [];
			const leaderboard = competitors.slice(0, 15).map((c, idx) => {
				const entry = mapCompetitor(c, idx);
				if (isTrackedPlayer(entry.player, tourTracked)) entry.tracked = true;
				return entry;
			});

			// Always include tracked players (Norwegian golfers) regardless of position.
			// This uses norwegian-golfers.json — when the discovery loop adds new players,
			// they automatically get surfaced here without code changes.
			const leaderboardNames = new Set(leaderboard.map(e => e.player.toLowerCase()));
			const trackedPlayers = [];
			for (let i = 0; i < competitors.length; i++) {
				const c = competitors[i];
				const name = c.athlete?.displayName || c.athlete?.fullName || "";
				if (leaderboardNames.has(name.toLowerCase())) continue; // already in top 15
				if (isTrackedPlayer(name, tourTracked)) {
					const entry = mapCompetitor(c, i);
					entry.tracked = true; // flag for dashboard to highlight
					trackedPlayers.push(entry);
				}
			}

			if (trackedPlayers.length > 0) {
				console.log(`  Golf ${tour.key}: ${trackedPlayers.length} tracked player(s) outside top 15: ${trackedPlayers.map(p => `${p.player} (${p.positionDisplay || p.position})`).join(", ")}`);
			}

			result[tour.key] = {
				name: event.name || null,
				status: statusType === "STATUS_IN_PROGRESS" ? "in_progress"
					: statusType === "STATUS_SCHEDULED" ? "scheduled"
					: statusType === "STATUS_FINAL" ? "final"
					: statusType,
				leaderboard,
				trackedPlayers,
				headshots,
			};
		} catch (err) {
			console.warn(`Golf ${tour.key} leaderboard fetch failed:`, err.message);
			result[tour.key] = { name: null, status: "error", leaderboard: [], trackedPlayers: [] };
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

export async function fetchTennisRankings() {
	const tours = [
		{ key: "atp", url: `${ESPN_BASE}/tennis/atp/standings` },
		{ key: "wta", url: `${ESPN_BASE}/tennis/wta/standings` },
	];

	const result = {};
	for (const tour of tours) {
		try {
			const data = await fetchJson(tour.url);
			const group = data?.children?.[0];
			if (!group?.standings?.entries) {
				result[tour.key] = [];
				continue;
			}

			result[tour.key] = group.standings.entries.slice(0, 20).map((entry) => {
				const stats = {};
				for (const s of entry.stats || []) {
					stats[s.name] = s.value;
				}
				return {
					position: stats.rank || 0,
					player: entry.athlete?.displayName || entry.team?.displayName || "Unknown",
					country: entry.team?.abbreviation || "",
					points: stats.points || 0,
				};
			}).sort((a, b) => a.position - b.position);
		} catch (err) {
			console.warn(`Tennis ${tour.key} rankings failed:`, err.message);
			result[tour.key] = [];
		}
	}
	return result;
}

async function main() {
	const dataDir = rootDataPath();
	const outPath = path.join(dataDir, "standings.json");

	const standings = { lastUpdated: iso() };

	// Football
	try {
		const [pl, laLiga] = await Promise.all([
			fetchFootballStandings(),
			fetchLaLigaStandings(),
		]);
		standings.football = { premierLeague: pl, laLiga };
		console.log(`Football: ${pl.length} PL teams, ${laLiga.length} La Liga teams`);
	} catch (err) {
		console.warn("Football standings failed:", err.message);
		standings.football = { premierLeague: [], laLiga: [] };
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

	// Tennis
	try {
		standings.tennis = await fetchTennisRankings();
		const atpCount = standings.tennis.atp?.length || 0;
		const wtaCount = standings.tennis.wta?.length || 0;
		console.log(`Tennis: ATP top ${atpCount}, WTA top ${wtaCount}`);
	} catch (err) {
		console.warn("Tennis rankings failed:", err.message);
		standings.tennis = { atp: [], wta: [] };
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
