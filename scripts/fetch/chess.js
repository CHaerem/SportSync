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

// Validate the structure of the Lichess broadcast response
function isValidBroadcastResponse(resp) {
	// The expected structure is an object with a "tours" property that is an array
	return (
		resp &&
		typeof resp === "object" &&
		Array.isArray(resp.tours)
	);
}

async function fetchLichessBroadcasts() {
	try {
		// Fetch professional tournament broadcasts only - these are official FIDE/top-level events
		const resp = await fetchJson("https://lichess.org/api/broadcast");
		if (!isValidBroadcastResponse(resp)) {
			console.warn(
				"Lichess broadcast response did not match expected format. Using empty fallback."
			);
			return {};
		}
		
		// Filter for professional tournaments only - no casual/amateur games
		const proTournaments = resp.tours ? resp.tours.filter(tour => {
			const name = (tour.name || "").toLowerCase();
			const desc = (tour.description || "").toLowerCase();
			
			// Only include elite professional tournaments
			const isEliteTournament = [
				'world championship', 'candidates', 'grand prix', 'fide', 
				'norway chess', 'tata steel', 'sinquefield', 'grand slam',
				'world cup', 'olympiad', 'magnus', 'carlsen', 'super tournament'
			].some(keyword => name.includes(keyword) || desc.includes(keyword));
			
			// Exclude amateur/casual events
			const isAmateurEvent = [
				'bullet', 'blitz arena', 'rapid arena', 'titled tuesday',
				'hourly', 'daily arena', '≤', 'under', 'amateur'
			].some(keyword => name.includes(keyword) || desc.includes(keyword));
			
			console.log(`Chess tournament: "${tour.name}" - ${isEliteTournament && !isAmateurEvent ? 'ELITE/PRO' : 'FILTERED OUT'}`);
			
			return isEliteTournament && !isAmateurEvent;
		}) : [];
		
		return { tours: proTournaments };
	} catch (err) {
		console.warn("Failed to fetch Lichess broadcast endpoint:", err);
		return null;
	}
}

// Filter events to current week only
function filterCurrentWeek(events) {
	const now = new Date();
	const startOfWeek = new Date(now);
	startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
	startOfWeek.setHours(0, 0, 0, 0);
	
	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 7); // End of current week
	
	return events.filter(event => {
		const eventDate = new Date(event.time);
		return eventDate >= startOfWeek && eventDate < endOfWeek;
	});
}

function consolidateRounds(tournaments, players, broadcasts) {
	const out = [];
	
	// First, add curated tournament rounds (from config)
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
				streaming: [
					{
						platform: "Chess24",
						url: "https://chess24.com",
						type: "chess24",
					},
				],
			});
		}
	}
	
	// Then, add live professional broadcasts from Lichess that feature Norwegian players
	if (broadcasts && broadcasts.tours) {
		for (const tour of broadcasts.tours) {
			// Check if this tournament likely features Norwegian players
			const name = (tour.name || "").toLowerCase();
			const desc = (tour.description || "").toLowerCase();
			const hasNorwegian = players.some(p => 
				name.includes(p.name.toLowerCase()) || 
				desc.includes(p.name.toLowerCase()) ||
				p.aliases?.some(alias => name.includes(alias.toLowerCase()) || desc.includes(alias.toLowerCase()))
			);
			
			// Only include if Norwegian player is likely participating
			if (hasNorwegian) {
				const norwegianParticipants = players
					.filter(p => 
						name.includes(p.name.toLowerCase()) || 
						desc.includes(p.name.toLowerCase()) ||
						p.aliases?.some(alias => name.includes(alias.toLowerCase()) || desc.includes(alias.toLowerCase()))
					)
					.map(p => p.name);
				
				out.push({
					title: tour.name,
					meta: `Professional Chess - ${tour.name}`,
					time: normalizeToUTC(new Date()), // Current broadcast
					venue: "Online/Live",
					sport: "chess",
					participants: norwegianParticipants,
					norwegian: true,
					streaming: [
						{
							platform: "Lichess",
							url: "https://lichess.org",
							type: "lichess",
						},
					],
				});
				
				console.log(`Added professional chess broadcast: ${tour.name} (Norwegian players: ${norwegianParticipants.join(', ')})`);
			}
		}
	}
	
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
		source: "Curated + Lichess Broadcast probe (current week only)",
		tournaments: events.length ? [{ name: "Norwegian Chess Highlights", events }] : [],
	};
}