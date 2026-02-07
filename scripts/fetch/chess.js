// Consolidated chess fetcher: builds one event per round with participants list.
import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";
import fs from "fs";
import path from "path";

const PLAYERS_FILE = path.resolve(
	process.cwd(),
	"scripts",
	"config",
	"norwegian-chess-players.json"
);
const TOURNAMENT_FILE = path.resolve(
	process.cwd(),
	"scripts",
	"config",
	"chess-tournaments.json"
);

function loadJson(file, fallback = []) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return fallback;
	}
}

// Check if any Norwegian player is mentioned in a text field
function findNorwegianPlayers(text, players) {
	const lower = (text || "").toLowerCase();
	return players.filter(p => {
		const pLower = p.name.toLowerCase();
		// Check last name (most reliable — "Carlsen" matches "Magnus Carlsen")
		const lastName = pLower.split(" ").pop();
		return lower.includes(pLower) || lower.includes(lastName) ||
			(p.aliases || []).some(alias => lower.includes(alias.toLowerCase()));
	});
}

async function fetchLichessBroadcasts() {
	try {
		// /api/broadcast/top returns structured JSON with active, upcoming, past arrays
		// Much better than /api/broadcast which returns NDJSON
		const resp = await fetchJson("https://lichess.org/api/broadcast/top");

		if (!resp || typeof resp !== "object") {
			console.warn("Lichess broadcast/top response was not an object.");
			return { active: [], upcoming: [] };
		}

		const active = Array.isArray(resp.active) ? resp.active : [];
		const upcoming = Array.isArray(resp.upcoming) ? resp.upcoming : [];

		console.log(`Lichess broadcasts: ${active.length} active, ${upcoming.length} upcoming`);

		return { active, upcoming };
	} catch (err) {
		console.warn("Failed to fetch Lichess broadcast/top:", err.message);

		// Fallback to /api/broadcast (NDJSON format)
		try {
			const resp = await fetchJson("https://lichess.org/api/broadcast?nb=20");
			let broadcasts = [];
			if (Array.isArray(resp)) {
				broadcasts = resp;
			} else if (resp && Array.isArray(resp.tours)) {
				broadcasts = resp.tours.map(t => ({ tour: t }));
			}
			console.log(`Lichess broadcast fallback: ${broadcasts.length} tournaments`);
			return { active: broadcasts, upcoming: [] };
		} catch (err2) {
			console.warn("Lichess broadcast fallback also failed:", err2.message);
			return { active: [], upcoming: [] };
		}
	}
}

// Filter events to current week only
function filterCurrentWeek(events) {
	const now = new Date();
	const startOfWeek = new Date(now);
	startOfWeek.setDate(now.getDate() - now.getDay());
	startOfWeek.setHours(0, 0, 0, 0);

	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 7);

	return events.filter(event => {
		const eventDate = new Date(event.time);
		return eventDate >= startOfWeek && eventDate < endOfWeek;
	});
}

function processBroadcasts(broadcastList, players) {
	const out = [];

	for (const entry of broadcastList) {
		const tour = entry.tour || {};
		const rounds = entry.rounds || [];
		const round = entry.round || {}; // /top returns singular "round" for current
		const info = tour.info || {};

		// Build a combined text to search for Norwegian players
		const searchText = [
			tour.name || "",
			tour.description || "",
			info.players || "",
		].join(" ");

		const norwegianParticipants = findNorwegianPlayers(searchText, players);

		// Include if Norwegian player found OR it's a top-tier event (tier >= 5)
		const isTopTier = (tour.tier || 0) >= 5;
		if (norwegianParticipants.length === 0 && !isTopTier) continue;

		const norwegianNames = norwegianParticipants.map(p => p.name);
		const hasNorwegian = norwegianNames.length > 0;

		// Try to get upcoming/ongoing rounds
		const allRounds = rounds.length > 0 ? rounds : (round.id ? [round] : []);
		const upcomingRounds = allRounds.filter(r => !r.finished);

		if (upcomingRounds.length > 0) {
			for (const r of upcomingRounds) {
				out.push({
					title: `${r.name || "Round"} – ${tour.name}`,
					meta: tour.name,
					time: normalizeToUTC(r.startsAt ? new Date(r.startsAt) : new Date()),
					venue: info.location || "Online",
					sport: "chess",
					participants: norwegianNames,
					norwegian: hasNorwegian,
					streaming: [{
						platform: "Lichess",
						url: tour.url || "https://lichess.org",
						type: "lichess",
					}],
				});
			}
		} else {
			// No round details — add the tournament itself
			const startDate = tour.dates && tour.dates[0] ? new Date(tour.dates[0]) : new Date();
			out.push({
				title: tour.name,
				meta: `Professional Chess - ${tour.name}`,
				time: normalizeToUTC(startDate),
				venue: info.location || "Online",
				sport: "chess",
				participants: norwegianNames,
				norwegian: hasNorwegian,
				streaming: [{
					platform: "Lichess",
					url: tour.url || "https://lichess.org",
					type: "lichess",
				}],
			});
		}

		console.log(`Chess: ${tour.name} (tier ${tour.tier || "?"}, Norwegian: ${norwegianNames.join(", ") || "none"})`);
	}

	return out;
}

function consolidateRounds(tournaments, players, broadcasts) {
	const out = [];

	// 1. Add curated tournament rounds (from config file)
	for (const t of tournaments) {
		const participants = players
			.filter((p) => t.participantsHint?.includes(p.name))
			.map((p) => p.name);
		for (const r of t.rounds || []) {
			const roundLabel = r.round ? `Round ${r.round}` : "Round";
			out.push({
				title: `${roundLabel} – ${t.name}`,
				meta: t.name,
				time: normalizeToUTC(r.date),
				venue: t.venue,
				sport: "chess",
				participants,
				norwegian: participants.length > 0,
				streaming: [{
					platform: "Chess24",
					url: "https://chess24.com",
					type: "chess24",
				}],
			});
		}
	}

	// 2. Add live broadcasts from Lichess (active + upcoming)
	const allBroadcasts = [...(broadcasts.active || []), ...(broadcasts.upcoming || [])];
	out.push(...processBroadcasts(allBroadcasts, players));

	out.sort((a, b) => new Date(a.time) - new Date(b.time));
	return out;
}

export async function fetchChessOpen() {
	const players = loadJson(PLAYERS_FILE);
	const tournaments = loadJson(TOURNAMENT_FILE);
	const broadcasts = await fetchLichessBroadcasts();
	const allEvents = consolidateRounds(tournaments, players, broadcasts);
	const events = filterCurrentWeek(allEvents);
	return {
		lastUpdated: iso(),
		source: "Curated + Lichess Broadcast (current week only)",
		tournaments: events.length ? [{ name: "Norwegian Chess Highlights", events }] : [],
	};
}
