#!/usr/bin/env node
/**
 * Fetches recent results from ESPN APIs:
 * - Football: completed matches from PL and La Liga (past 3 days)
 * - Golf: PGA Tour + DP World Tour final/in-progress leaderboard positions
 *
 * Matches results against rss-digest.json for recap headlines
 * and user-context.json for favorite tagging.
 *
 * Output: docs/data/recent-results.json
 */

import path from "path";
import { fetchJson, iso, readJsonIfExists, rootDataPath, writeJsonPretty, MS_PER_DAY } from "./lib/helpers.js";
import { validateESPNScoreboard } from "./lib/response-validator.js";

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";
const USER_CONTEXT_PATH = path.resolve(process.cwd(), "scripts", "config", "user-context.json");

function formatDate(d) {
	return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function loadUserContext() {
	return readJsonIfExists(USER_CONTEXT_PATH) || {};
}

function isFavoriteTeam(teamName, userContext) {
	const favorites = (userContext.favoriteTeams || []).map(t => t.toLowerCase());
	const name = (teamName || "").toLowerCase();
	return favorites.some(fav => name.includes(fav) || fav.includes(name));
}

function isFavoritePlayer(playerName, userContext) {
	const favorites = (userContext.favoritePlayers || []).map(p => p.toLowerCase());
	const name = (playerName || "").toLowerCase();
	return favorites.some(fav => name.includes(fav) || fav.includes(name));
}

// --- Write-time validation ---

export function validateFootballResult(result) {
	const issues = [];
	if (!result || typeof result !== "object") return { valid: false, issues: ["Not an object"] };

	if (typeof result.homeTeam !== "string" || !result.homeTeam.trim()) issues.push("homeTeam missing or empty");
	if (typeof result.awayTeam !== "string" || !result.awayTeam.trim()) issues.push("awayTeam missing or empty");
	if (result.homeTeam && result.awayTeam && result.homeTeam === result.awayTeam) issues.push("homeTeam equals awayTeam");

	if (typeof result.homeScore !== "number" || result.homeScore < 0 || result.homeScore > 20) issues.push(`homeScore out of range: ${result.homeScore}`);
	if (typeof result.awayScore !== "number" || result.awayScore < 0 || result.awayScore > 20) issues.push(`awayScore out of range: ${result.awayScore}`);

	if (result.date) {
		const d = new Date(result.date);
		if (isNaN(d.getTime())) issues.push("Invalid date");
		else if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) issues.push("Date is in the future");
	} else {
		issues.push("date missing");
	}

	// Goal scorer count should not wildly exceed total goals
	if (Array.isArray(result.goalScorers)) {
		const totalGoals = (result.homeScore || 0) + (result.awayScore || 0);
		if (result.goalScorers.length > totalGoals + 2) {
			issues.push(`goalScorers count (${result.goalScorers.length}) exceeds total goals (${totalGoals}) + tolerance`);
		}
	}

	return { valid: issues.length === 0, issues };
}

export function validateGolfResult(tour) {
	if (tour === null || tour === undefined) return { valid: true, issues: [] };
	const issues = [];

	if (typeof tour !== "object") return { valid: false, issues: ["Not an object"] };

	if (tour.tournamentName !== undefined && tour.tournamentName !== null) {
		if (typeof tour.tournamentName !== "string" || !tour.tournamentName.trim()) {
			issues.push("tournamentName present but empty");
		}
	}

	if (tour.status === "final") {
		if (!Array.isArray(tour.topPlayers) || tour.topPlayers.length === 0) {
			issues.push("Final tournament has no topPlayers");
		}
		if (typeof tour.completedRound !== "number" || tour.completedRound < 4) {
			issues.push(`Final tournament has only ${tour.completedRound ?? 0} completed rounds`);
		}
	}

	// Check positions are ascending
	if (Array.isArray(tour.topPlayers) && tour.topPlayers.length > 1) {
		for (let i = 1; i < tour.topPlayers.length; i++) {
			if (tour.topPlayers[i].position < tour.topPlayers[i - 1].position) {
				issues.push("topPlayers positions not ascending");
				break;
			}
		}
	}

	return { valid: issues.length === 0, issues };
}

export function validateResults(output) {
	const issues = [];
	let totalResults = 0;
	let validResults = 0;

	// Validate football
	const football = Array.isArray(output?.football) ? output.football : [];
	for (const r of football) {
		totalResults++;
		const v = validateFootballResult(r);
		if (v.valid) {
			validResults++;
		} else {
			issues.push(...v.issues.map(i => `Football [${r.homeTeam || "?"} v ${r.awayTeam || "?"}]: ${i}`));
		}
	}

	// Validate golf
	const golf = output?.golf || {};
	for (const [key, tour] of Object.entries(golf)) {
		if (tour === null) continue;
		totalResults++;
		const v = validateGolfResult(tour);
		if (v.valid) {
			validResults++;
		} else {
			issues.push(...v.issues.map(i => `Golf [${key}]: ${i}`));
		}
	}

	return { totalResults, validResults, issues };
}

const LEAGUE_MAP = {
	"eng.1": "Premier League",
	"esp.1": "La Liga",
};

export async function fetchFootballResults(options = {}) {
	const { daysBack = 7, userContext = null } = options;
	const ctx = userContext || loadUserContext();
	const results = [];
	const seen = new Set();
	const now = new Date();

	for (const [leagueCode, leagueName] of Object.entries(LEAGUE_MAP)) {
		for (let d = 0; d < daysBack; d++) {
			const date = new Date(now.getTime() - d * MS_PER_DAY);
			const dateStr = formatDate(date);
			const url = `${ESPN_SITE}/soccer/${leagueCode}/scoreboard?dates=${dateStr}`;

			try {
				const data = await fetchJson(url);
				const validated = validateESPNScoreboard(data, `results-${leagueCode}`);
				for (const w of validated.warnings) console.warn(w);

				for (const event of (data?.events || [])) {
					const comp = event.competitions?.[0];
					if (!comp) continue;

					const state = comp.status?.type?.state;
					if (state !== "post") continue;

					const home = comp.competitors?.find(c => c.homeAway === "home");
					const away = comp.competitors?.find(c => c.homeAway === "away");
					if (!home || !away) continue;

					const homeName = home.team?.displayName || "Unknown";
					const awayName = away.team?.displayName || "Unknown";

					// Deduplicate across date queries
					const key = `${homeName}-${awayName}-${event.date}`;
					if (seen.has(key)) continue;
					seen.add(key);

					// Extract goal scorers
					const goalScorers = [];
					for (const detail of (comp.details || [])) {
						const type = detail.type?.text || "";
						if (!type.includes("Goal") && !type.includes("Penalty")) continue;
						const minute = detail.clock?.displayValue || "";
						const athletes = (detail.athletesInvolved || []).map(a => a.displayName || "").filter(Boolean);
						const teamId = detail.team?.id;
						const teamName = teamId === home.team?.id ? homeName : awayName;
						goalScorers.push({
							player: athletes[0] || "Unknown",
							team: teamName,
							minute,
						});
					}

					const favorite = isFavoriteTeam(homeName, ctx) || isFavoriteTeam(awayName, ctx);

					results.push({
						homeTeam: homeName,
						awayTeam: awayName,
						homeScore: parseInt(home.score, 10) || 0,
						awayScore: parseInt(away.score, 10) || 0,
						date: event.date || new Date(date).toISOString(),
						league: leagueName,
						leagueCode,
						venue: comp.venue?.fullName || null,
						goalScorers,
						recapHeadline: null, // filled in by matchRssHeadlines
						isFavorite: favorite,
					});
				}
			} catch (err) {
				console.warn(`Football results fetch failed for ${leagueCode} ${dateStr}:`, err.message);
			}
		}
	}

	// Sort by date descending, favorites first
	results.sort((a, b) => {
		if (a.isFavorite && !b.isFavorite) return -1;
		if (!a.isFavorite && b.isFavorite) return 1;
		return new Date(b.date) - new Date(a.date);
	});

	return results;
}

export async function fetchGolfResults(options = {}) {
	const { userContext = null } = options;
	const ctx = userContext || loadUserContext();
	const tours = [
		{ key: "pga", url: `${ESPN_SITE}/golf/pga/scoreboard` },
		{ key: "dpWorld", url: `${ESPN_SITE}/golf/eur/scoreboard` },
	];

	const result = {};

	for (const tour of tours) {
		try {
			const data = await fetchJson(tour.url);
			const validated = validateESPNScoreboard(data, `golf-results-${tour.key}`);
			for (const w of validated.warnings) console.warn(w);

			const event = validated.events[0] || data?.events?.[0];
			if (!event) {
				result[tour.key] = null;
				continue;
			}

			const statusName = event.status?.type?.name || "unknown";
			// Only include final or in-progress tournaments (with completed rounds)
			if (statusName !== "STATUS_FINAL" && statusName !== "STATUS_IN_PROGRESS") {
				result[tour.key] = null;
				continue;
			}

			const competition = event.competitions?.[0];
			const competitors = competition?.competitors || [];

			// Determine completed round from linescores
			const samplePlayer = competitors[0];
			const completedRound = samplePlayer?.linescores?.length || 0;

			const topPlayers = competitors.slice(0, 5).map((c, idx) => ({
				position: c.order || parseInt(c.status?.position?.displayName || "0", 10) || (idx + 1),
				player: c.athlete?.displayName || c.athlete?.fullName || "Unknown",
				score: typeof c.score === "object" ? (c.score?.displayValue || "E") : (c.score?.toString() || "E"),
				roundScore: c.linescores?.[c.linescores.length - 1]?.displayValue || "-",
			}));

			// Find Norwegian players (or any favorite players)
			const favoritePlayers = (ctx.favoritePlayers || []).map(p => p.toLowerCase());
			const norwegianPlayers = competitors
				.filter(c => {
					const name = (c.athlete?.displayName || c.athlete?.fullName || "").toLowerCase();
					return favoritePlayers.some(fav => name.includes(fav.split(" ").pop()));
				})
				.map((c, idx) => ({
					position: c.order || parseInt(c.status?.position?.displayName || "0", 10) || (idx + 1),
					player: c.athlete?.displayName || c.athlete?.fullName || "Unknown",
					score: typeof c.score === "object" ? (c.score?.displayValue || "E") : (c.score?.toString() || "E"),
					roundScore: c.linescores?.[c.linescores.length - 1]?.displayValue || "-",
				}));

			result[tour.key] = {
				tournamentName: event.name || null,
				status: statusName === "STATUS_FINAL" ? "final" : "in_progress",
				completedRound,
				topPlayers,
				norwegianPlayers,
			};
		} catch (err) {
			console.warn(`Golf results fetch failed for ${tour.key}:`, err.message);
			result[tour.key] = null;
		}
	}

	return result;
}

export function matchRssHeadline(homeTeam, awayTeam, rssItems) {
	if (!homeTeam || !awayTeam || !Array.isArray(rssItems)) return null;

	const home = homeTeam.toLowerCase();
	const away = awayTeam.toLowerCase();

	for (const item of rssItems) {
		const title = (item.title || "").toLowerCase();
		if (title.includes(home) && title.includes(away)) {
			return item.title;
		}
		// Try short names (drop FC/AFC suffixes)
		const homeShort = home.replace(/ fc$| afc$| cf$| fk$/i, "").trim();
		const awayShort = away.replace(/ fc$| afc$| cf$| fk$/i, "").trim();
		if (homeShort.length > 2 && awayShort.length > 2 && title.includes(homeShort) && title.includes(awayShort)) {
			return item.title;
		}
	}
	return null;
}

/**
 * Merge new football results with existing ones.
 * Deduplicates by match key, prunes results older than retainDays.
 * Default: 7 days — keeps a full matchweek cycle so the editorial brief
 * can reference the complete round for narrative context.
 */
export function mergeFootballResults(existing, fresh, retainDays = 7) {
	const cutoff = Date.now() - retainDays * MS_PER_DAY;
	const map = new Map();

	// Add existing results first (retained history)
	for (const r of (existing || [])) {
		if (new Date(r.date).getTime() < cutoff) continue;
		const key = `${r.homeTeam}-${r.awayTeam}-${r.date}`;
		map.set(key, r);
	}

	// Fresh results override existing (newer data may have more details)
	for (const r of (fresh || [])) {
		if (new Date(r.date).getTime() < cutoff) continue;
		const key = `${r.homeTeam}-${r.awayTeam}-${r.date}`;
		map.set(key, r);
	}

	return Array.from(map.values());
}

async function main() {
	const dataDir = rootDataPath();
	const outPath = path.join(dataDir, "recent-results.json");

	// Load existing results for history retention
	const existing = readJsonIfExists(outPath);

	const rssPath = path.join(dataDir, "rss-digest.json");
	const rssDigest = readJsonIfExists(rssPath);
	const rssItems = rssDigest?.items || [];

	const userContext = loadUserContext();

	const output = { lastUpdated: iso() };

	// Football results — merge with existing history
	try {
		const fresh = await fetchFootballResults({ userContext });
		const merged = mergeFootballResults(existing?.football, fresh);
		// Match RSS headlines
		for (const result of merged) {
			if (!result.recapHeadline) {
				result.recapHeadline = matchRssHeadline(result.homeTeam, result.awayTeam, rssItems);
			}
		}
		// Sort: favorites first, then by date descending
		merged.sort((a, b) => {
			if (a.isFavorite && !b.isFavorite) return -1;
			if (!a.isFavorite && b.isFavorite) return 1;
			return new Date(b.date) - new Date(a.date);
		});
		output.football = merged;
		console.log(`Football: ${merged.length} results (${merged.filter(r => r.isFavorite).length} favorites, ${fresh.length} fresh)`);
	} catch (err) {
		console.warn("Football results failed:", err.message);
		// Retain existing football results on failure
		output.football = existing?.football || [];
	}

	// Golf results — latest snapshot replaces previous (leaderboard is live state)
	try {
		const golf = await fetchGolfResults({ userContext });
		// Retain previous golf data if new fetch returned nothing
		output.golf = {
			pga: golf.pga || existing?.golf?.pga || null,
			dpWorld: golf.dpWorld || existing?.golf?.dpWorld || null,
		};
		const pgaName = output.golf.pga?.tournamentName || "none";
		const dpName = output.golf.dpWorld?.tournamentName || "none";
		console.log(`Golf: PGA=${pgaName}, DP World=${dpName}`);
	} catch (err) {
		console.warn("Golf results failed:", err.message);
		output.golf = existing?.golf || { pga: null, dpWorld: null };
	}

	// Validate before writing
	const validation = validateResults(output);
	output.validationMetrics = {
		totalResults: validation.totalResults,
		validResults: validation.validResults,
		issueCount: validation.issues.length,
	};
	if (validation.issues.length > 0) {
		console.warn(`Validation: ${validation.issues.length} issue(s):`);
		for (const issue of validation.issues.slice(0, 5)) console.warn(`  - ${issue}`);
	}

	writeJsonPretty(outPath, output);
	console.log(`Results written to ${outPath} (${validation.validResults}/${validation.totalResults} valid)`);
}

if (process.argv[1]?.includes("fetch-results")) {
	main().catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}
