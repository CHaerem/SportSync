// Consolidated chess fetcher: builds one event per round with participants list.
import { fetchJson, iso } from "../lib/helpers.js";
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

async function fetchLichessBroadcasts() {
	try {
		// Attempt broadcast endpoint (may not be stable JSON; failures are ignored gracefully)
		return await fetchJson("https://lichess.org/api/broadcast");
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
		// Attempt broadcast endpoint (may not be stable JSON; failures are ignored gracefully)
		const resp = await fetchJson("https://lichess.org/api/broadcast");
		if (!isValidBroadcastResponse(resp)) {
			console.warn(
				"Lichess broadcast response did not match expected format. Using empty fallback."
			);
			return {};
		}
		return resp;
	} catch (err) {
		console.warn("Failed to fetch Lichess broadcast endpoint:", err);
		return null;
	}
}

function consolidateRounds(tournaments, players, broadcasts) {
	const out = [];
	const lowerBroadcasts = JSON.stringify(broadcasts || {}).toLowerCase();
	for (const t of tournaments) {
		const participants = players
			.filter((p) => t.participantsHint?.includes(p.name))
			.map((p) => p.name);
		for (const r of t.rounds || []) {
			const roundLabel = r.round ? `Round ${r.round}` : "Round";
			const broadcastLikely = t.broadcastMatch
				? lowerBroadcasts.includes((t.broadcastMatch || "").toLowerCase())
				: false;
			out.push({
				title: `${roundLabel} – ${t.name}`,
				meta: t.name,
				time: r.date,
				venue: t.venue,
				sport: "chess",
				participants,
				norwegian: participants.length > 0,
				streaming: broadcastLikely
					? [
							{
								platform: "Lichess",
								url: "https://lichess.org",
								type: "lichess",
							},
					  ]
					: [
							{
								platform: "Chess24",
								url: "https://chess24.com",
								type: "chess24",
							},
					  ],
			});
		}
	}
	out.sort((a, b) => new Date(a.time) - new Date(b.time));
	return out;
}

export async function fetchChessOpen() {
	const players = loadJson(PLAYERS_FILE);
	const tournaments = loadJson(TOURNAMENT_FILE);
	const broadcasts = await fetchLichessBroadcasts();
	const events = consolidateRounds(tournaments, players, broadcasts);
	return {
		lastUpdated: iso(),
		source: "Curated + Lichess Broadcast probe",
		tournaments: [{ name: "Norwegian Chess Highlights", events }],
	};
}
