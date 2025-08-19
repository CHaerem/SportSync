import { fetchJson, iso } from "../lib/helpers.js";

// Minimal real esports integration: attempt to pull HLTV upcoming matches for FaZe (rain) via a working
// community JSON endpoint (if unavailable, return empty without placeholders).
// NOTE: This avoids HTML scraping inside the action. Can be swapped for an official API when available.
const HLTV_UPCOMING = "https://hltv-api.vercel.app/api/matches.json"; // community mirror

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

export async function fetchEsports() {
	let matches = [];
	try {
		console.log("Fetching HLTV matches from:", HLTV_UPCOMING);
		const data = await fetchJson(HLTV_UPCOMING, { retries: 2 });
		console.log("HLTV API response type:", typeof data, "isArray:", Array.isArray(data));
		
		if (Array.isArray(data)) {
			console.log("Total matches found:", data.length);
			const focusTeams = ["FaZe", "Team Liquid", "NAVI", "G2", "Astralis"];
			matches = data
				.filter((m) => {
					const t1 = m.team1?.name || "";
					const t2 = m.team2?.name || "";
					const hasTeam = focusTeams.some((ft) => t1.includes(ft) || t2.includes(ft));
					if (hasTeam) {
						console.log("Found match:", t1, "vs", t2, "at", m.date);
					}
					return hasTeam;
				})
				.slice(0, 10); // Increased from 6 to get more potential matches
			console.log("Filtered matches for focus teams:", matches.length);
		} else {
			console.warn("HLTV API did not return an array, got:", typeof data);
		}
	} catch (err) {
		console.error("Failed to fetch HLTV data:", err.message);
	}
	
	const now = Date.now();
	const allEvents = matches
		.filter((m) => m.date && new Date(m.date) > now)
		.map((m) => ({
			title: `${m.team1?.name || "TBD"} vs ${m.team2?.name || "TBD"}`,
			meta: m.event?.name || "CS2 Match",
			time: new Date(m.date).toISOString(),
			venue: "Online",
			sport: "esports",
			streaming: [
				{
					platform: "Twitch",
					url: "https://twitch.tv/esl_csgo",
					type: "twitch",
				},
			],
			norwegian:
				(m.team1?.name || "").includes("FaZe") ||
				(m.team2?.name || "").includes("FaZe"), // rain (Norwegian) on FaZe
		}));
	
	const events = filterCurrentWeek(allEvents);
	console.log("Final events after current week filter:", events.length);
	
	return {
		lastUpdated: iso(),
		source: "HLTV community API (current week only)",
		tournaments: events.length ? [{ name: "CS2 Focus", events }] : [],
	};
}
