#!/usr/bin/env node
/**
 * Generate Insights — Analytical nuggets from standings, results, and events.
 *
 * Reads events.json, standings.json, recent-results.json, and user-context.json
 * to produce docs/data/insights.json — short analytical observations like
 * "Liverpool unbeaten in 12" or "Hovland T3 going into Sunday".
 *
 * Pure data analysis — no LLM calls needed.
 */

import path from "path";
import { readJsonIfExists, writeJsonPretty } from "./lib/helpers.js";

/**
 * Analyze football results for team streaks (wins, unbeaten runs, losing runs).
 * @param {Array} results - Football results array from recent-results.json
 * @returns {Array} Insight objects
 */
export function analyzeFootballStreaks(results) {
	if (!Array.isArray(results) || results.length === 0) return [];

	// Group results by team, ordered by date
	const teamResults = {};
	for (const match of results) {
		if (!match.homeTeam || !match.awayTeam) continue;
		const date = match.date || "";

		for (const team of [match.homeTeam, match.awayTeam]) {
			if (!teamResults[team]) teamResults[team] = [];
			const isHome = team === match.homeTeam;
			const goalsFor = isHome ? match.homeScore : match.awayScore;
			const goalsAgainst = isHome ? match.awayScore : match.homeScore;
			let outcome;
			if (goalsFor > goalsAgainst) outcome = "W";
			else if (goalsFor < goalsAgainst) outcome = "L";
			else outcome = "D";
			teamResults[team].push({ date, outcome, goalsFor, goalsAgainst });
		}
	}

	const insights = [];

	for (const [team, matches] of Object.entries(teamResults)) {
		// Sort by date descending (most recent first)
		matches.sort((a, b) => b.date.localeCompare(a.date));

		// Count current streaks from most recent match
		let winStreak = 0;
		let unbeatenStreak = 0;
		let lossStreak = 0;

		for (const m of matches) {
			if (m.outcome === "W") {
				winStreak++;
				unbeatenStreak++;
			} else if (m.outcome === "D") {
				unbeatenStreak++;
				break; // Win streak broken
			} else {
				break; // Both win and unbeaten streaks broken
			}
		}

		// Reset and count loss streak
		for (const m of matches) {
			if (m.outcome === "L") lossStreak++;
			else break;
		}

		if (winStreak >= 3) {
			insights.push({
				type: "streak",
				sport: "football",
				subject: team,
				text: `${team} on a ${winStreak}-match winning streak`,
				value: winStreak,
				priority: winStreak >= 5 ? "high" : "medium",
			});
		} else if (unbeatenStreak >= 4) {
			insights.push({
				type: "streak",
				sport: "football",
				subject: team,
				text: `${team} unbeaten in ${unbeatenStreak} matches`,
				value: unbeatenStreak,
				priority: unbeatenStreak >= 6 ? "high" : "medium",
			});
		}

		if (lossStreak >= 3) {
			insights.push({
				type: "streak",
				sport: "football",
				subject: team,
				text: `${team} have lost ${lossStreak} in a row`,
				value: lossStreak,
				priority: "medium",
			});
		}
	}

	return insights;
}

/**
 * Analyze football standings for interesting positions and gaps.
 * @param {Object} standings - Football standings from standings.json
 * @param {Array} favoriteTeams - User's favorite teams
 * @returns {Array} Insight objects
 */
export function analyzeFootballStandings(standings, favoriteTeams = []) {
	const insights = [];
	const favLower = favoriteTeams.map(t => t.toLowerCase());

	for (const [league, table] of Object.entries(standings)) {
		if (!Array.isArray(table) || table.length < 2) continue;

		const leagueLabel = league === "premierLeague" ? "Premier League"
			: league === "laLiga" ? "La Liga" : league;

		// Title race: gap between 1st and 2nd
		const leader = table[0];
		const second = table[1];
		if (leader && second) {
			const gap = leader.points - second.points;
			if (gap >= 6) {
				insights.push({
					type: "standings",
					sport: "football",
					subject: leader.team,
					text: `${leader.team} lead ${leagueLabel} by ${gap} points`,
					value: gap,
					priority: gap >= 10 ? "high" : "medium",
				});
			} else if (gap <= 1 && leader.played >= 10) {
				insights.push({
					type: "standings",
					sport: "football",
					subject: leagueLabel,
					text: `Tight title race in ${leagueLabel} — ${leader.team} and ${second.team} separated by ${gap === 0 ? "goal difference" : "1 point"}`,
					value: gap,
					priority: "high",
				});
			}
		}

		// Favorite team positions
		for (const entry of table) {
			if (favLower.some(f => entry.team?.toLowerCase().includes(f) || f.includes(entry.team?.toLowerCase()))) {
				insights.push({
					type: "favorite-position",
					sport: "football",
					subject: entry.team,
					text: `${entry.team} are ${ordinal(entry.position)} in ${leagueLabel} with ${entry.points} pts (${entry.won}W ${entry.drawn}D ${entry.lost}L)`,
					value: entry.position,
					priority: entry.position <= 4 ? "high" : "medium",
				});
			}
		}
	}

	return insights;
}

/**
 * Analyze golf standings/results for Norwegian player positions.
 * @param {Object} golfStandings - Golf data from standings.json
 * @param {Object} golfResults - Golf data from recent-results.json
 * @returns {Array} Insight objects
 */
export function analyzeGolf(golfStandings, golfResults) {
	const insights = [];

	// Check current tournament leaderboards
	for (const tour of ["pga", "dpWorld"]) {
		const data = golfStandings?.[tour];
		if (!data?.leaderboard?.length) continue;

		const tourLabel = tour === "pga" ? "PGA Tour" : "DP World Tour";

		// Leader insight
		const leader = data.leaderboard[0];
		if (leader && data.status !== "scheduled") {
			insights.push({
				type: "leaderboard",
				sport: "golf",
				subject: leader.player,
				text: `${leader.player} leads ${data.name || tourLabel} at ${leader.score}`,
				value: 1,
				priority: "medium",
			});
		}
	}

	// Norwegian players from results
	for (const tour of ["pga", "dpWorld"]) {
		const data = golfResults?.[tour];
		if (!data?.norwegianPlayers?.length) continue;

		const tourLabel = tour === "pga" ? "PGA Tour" : "DP World Tour";
		for (const player of data.norwegianPlayers) {
			if (player.position && player.position <= 10) {
				insights.push({
					type: "norwegian-performance",
					sport: "golf",
					subject: player.player,
					text: `${player.player} is T${player.position} at ${data.tournamentName || tourLabel} (${player.score})`,
					value: player.position,
					priority: player.position <= 5 ? "high" : "medium",
				});
			}
		}
	}

	return insights;
}

/**
 * Analyze F1 standings for interesting data points.
 * @param {Object} f1Standings - F1 data from standings.json
 * @returns {Array} Insight objects
 */
export function analyzeF1(f1Standings) {
	if (!f1Standings?.drivers?.length) return [];

	const insights = [];
	const drivers = f1Standings.drivers;

	// Only generate insights when season is active (points > 0)
	const totalPoints = drivers.reduce((s, d) => s + (d.points || 0), 0);
	if (totalPoints === 0) return [];

	const leader = drivers[0];
	if (leader && drivers.length >= 2) {
		const gap = leader.points - drivers[1].points;
		insights.push({
			type: "standings",
			sport: "f1",
			subject: leader.driver,
			text: `${leader.driver} leads F1 championship by ${gap} points with ${leader.wins} win(s)`,
			value: gap,
			priority: gap >= 30 ? "high" : "medium",
		});
	}

	return insights;
}

/**
 * Generate a high-scoring-match insight from recent results.
 * @param {Array} results - Football results
 * @returns {Array} Insight objects
 */
export function analyzeHighScoringMatches(results) {
	if (!Array.isArray(results)) return [];

	const insights = [];
	for (const match of results) {
		const total = (match.homeScore || 0) + (match.awayScore || 0);
		if (total >= 5) {
			insights.push({
				type: "high-scoring",
				sport: "football",
				subject: `${match.homeTeam} vs ${match.awayTeam}`,
				text: `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam} — ${total}-goal thriller`,
				value: total,
				priority: total >= 7 ? "high" : "medium",
			});
		}
	}

	// Only keep top 3 highest-scoring
	return insights.sort((a, b) => b.value - a.value).slice(0, 3);
}

/**
 * Ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
 */
function ordinal(n) {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Main: generate insights.json
 */
export async function generateInsights({ dataDir, configDir } = {}) {
	const dDir = dataDir || path.resolve(process.cwd(), "docs", "data");
	const cfgDir = configDir || path.resolve(process.cwd(), "scripts", "config");

	const standings = readJsonIfExists(path.join(dDir, "standings.json"));
	const results = readJsonIfExists(path.join(dDir, "recent-results.json"));
	const userContext = readJsonIfExists(path.join(cfgDir, "user-context.json"));

	const favoriteTeams = userContext?.favoriteTeams || [];

	const allInsights = [
		...analyzeFootballStreaks(results?.football),
		...analyzeFootballStandings(standings?.football || {}, favoriteTeams),
		...analyzeGolf(standings?.golf, results?.golf),
		...analyzeF1(standings?.f1),
		...analyzeHighScoringMatches(results?.football),
	];

	// Sort: high priority first, then by value descending
	allInsights.sort((a, b) => {
		const prio = { high: 0, medium: 1, low: 2 };
		const pd = (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2);
		if (pd !== 0) return pd;
		return (b.value || 0) - (a.value || 0);
	});

	const output = {
		generatedAt: new Date().toISOString(),
		count: allInsights.length,
		insights: allInsights,
	};

	const outPath = path.join(dDir, "insights.json");
	writeJsonPretty(outPath, output);
	console.log(`generate-insights: ${allInsights.length} insights generated`);

	return output;
}

if (process.argv[1]?.includes("generate-insights")) {
	generateInsights().then(result => {
		console.log(`Done: ${result.count} insights`);
	}).catch(err => {
		console.error("generate-insights failed:", err);
		process.exit(1);
	});
}
