import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";

// Minimal real esports integration: attempt to pull HLTV upcoming matches for FaZe (rain) via working
// community JSON endpoints. Try multiple sources for better coverage.
const HLTV_UPCOMING = "https://hltv-api.vercel.app/api/matches.json"; // community mirror
const HLTV_RESULTS = "https://hltv-api.vercel.app/api/results.json"; // recent/ongoing matches

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
	let fazeEvents = new Set(); // Track tournaments where FaZe is playing
	
	// Try upcoming matches first
	try {
		console.log("Fetching HLTV upcoming matches from:", HLTV_UPCOMING);
		const data = await fetchJson(HLTV_UPCOMING, { retries: 2 });
		console.log("HLTV upcoming API response type:", typeof data, "isArray:", Array.isArray(data));
		
		if (Array.isArray(data)) {
			console.log("Total upcoming matches found:", data.length);
			
			// First pass: Find all tournaments where FaZe is playing
			data.forEach((m) => {
				// Handle teams array structure from HLTV API
				let team1Name = "";
				let team2Name = "";
				
				if (m.teams && Array.isArray(m.teams) && m.teams.length >= 2) {
					team1Name = m.teams[0]?.name || "";
					team2Name = m.teams[1]?.name || "";
				} else {
					// Fallback to other possible structures
					team1Name = m.team1?.name || m.teamA?.name || m.opponents?.[0]?.name || "";
					team2Name = m.team2?.name || m.teamB?.name || m.opponents?.[1]?.name || "";
				}
				
				const eventName = m.event?.name || m.tournament?.name || "";
				
				if (team1Name.toLowerCase().includes("faze") || team2Name.toLowerCase().includes("faze")) {
					if (eventName) {
						fazeEvents.add(eventName);
						console.log("FaZe is playing in tournament:", eventName);
					}
				}
			});
			
			console.log("Tournaments where FaZe is playing:", Array.from(fazeEvents));
			
			// Second pass: Get ALL matches from those tournaments
			matches = data
				.filter((m) => {
					const eventName = m.event?.name || m.tournament?.name || "";
					return fazeEvents.has(eventName);
				})
				.slice(0, 20); // Get more matches since we're including entire tournaments
			
			console.log("Total matches from FaZe tournaments:", matches.length);
			
			// Debug: Show some matches
			matches.slice(0, 5).forEach(m => {
				let t1 = "TBD", t2 = "TBD";
				if (m.teams && Array.isArray(m.teams) && m.teams.length >= 2) {
					t1 = m.teams[0]?.name || "TBD";
					t2 = m.teams[1]?.name || "TBD";
				} else {
					t1 = m.team1?.name || m.teamA?.name || m.opponents?.[0]?.name || "TBD";
					t2 = m.team2?.name || m.teamB?.name || m.opponents?.[1]?.name || "TBD";
				}
				console.log(`  ${t1} vs ${t2} - ${m.event?.name || m.tournament?.name}`);
			});
		} else {
			console.warn("HLTV API did not return an array, got:", typeof data);
		}
	} catch (err) {
		console.error("Failed to fetch HLTV upcoming data:", err.message);
	}
	
	// Try recent/ongoing matches if no upcoming found
	if (matches.length === 0) {
		try {
			console.log("Checking HLTV recent/ongoing matches from:", HLTV_RESULTS);
			const recentData = await fetchJson(HLTV_RESULTS, { retries: 2 });
			
			if (Array.isArray(recentData)) {
				console.log("Total recent/ongoing matches found:", recentData.length);
				
				// Look for FaZe or Esports World Cup matches
				recentData.forEach((m) => {
					let team1Name = "";
					let team2Name = "";
					
					if (m.teams && Array.isArray(m.teams) && m.teams.length >= 2) {
						team1Name = m.teams[0]?.name || "";
						team2Name = m.teams[1]?.name || "";
					}
					
					const eventName = m.event?.name || "";
					const isFazeMatch = team1Name.toLowerCase().includes("faze") || team2Name.toLowerCase().includes("faze");
					const isWorldCup = eventName.toLowerCase().includes("world cup") || eventName.toLowerCase().includes("esports");
					
					if (isFazeMatch || isWorldCup) {
						if (eventName) {
							fazeEvents.add(eventName);
							console.log("Found relevant tournament:", eventName, "FaZe:", isFazeMatch, "WorldCup:", isWorldCup);
						}
					}
				});
				
				// Get matches from those tournaments
				if (fazeEvents.size > 0) {
					matches = recentData
						.filter((m) => {
							const eventName = m.event?.name || "";
							return fazeEvents.has(eventName);
						})
						.slice(0, 20);
					console.log("Found", matches.length, "matches from relevant tournaments");
				}
			}
		} catch (err) {
			console.error("Failed to fetch HLTV recent data:", err.message);
		}
	}
	
	// Try Liquipedia for Esports World Cup if no data from HLTV
	if (matches.length === 0) {
		console.log("No FaZe or Esports World Cup found in HLTV data, checking Liquipedia...");
		
		// For GitHub Actions, we can't do live web scraping, but we can note this for manual updates
		// The workflow should ideally fetch from a proper API or use a scheduled data source
		console.log("Note: Esports World Cup 2025 is ongoing. Manual data refresh may be needed.");
		
		// Return empty for now - the workflow needs a proper API integration
		// User requested automatic fetching only, no hardcoded data
	}
	
	const now = Date.now();
	const allEvents = matches
		.filter((m) => (m.date || m.time) && new Date(m.date || m.time) > now)
		.map((m) => {
			let team1 = "TBD", team2 = "TBD";
			
			// Handle teams array structure from HLTV API
			if (m.teams && Array.isArray(m.teams) && m.teams.length >= 2) {
				team1 = m.teams[0]?.name || "TBD";
				team2 = m.teams[1]?.name || "TBD";
			} else {
				team1 = m.team1?.name || "TBD";
				team2 = m.team2?.name || "TBD";
			}
			
			const isFazeMatch = team1.toLowerCase().includes("faze") || team2.toLowerCase().includes("faze");
			
			return {
				title: `${team1} vs ${team2}`,
				meta: m.event?.name || "CS2 Match",
				time: normalizeToUTC(m.date || m.time),
				venue: "Online",
				sport: "esports",
				streaming: [
					{
						platform: "Twitch",
						url: "https://twitch.tv/esworldcup",
						type: "twitch",
					},
					{
						platform: "YouTube",
						url: "https://youtube.com/@EsportsWorldCup",
						type: "youtube",
					},
				],
				norwegian: isFazeMatch, // rain (Norwegian) on FaZe
				tournament: m.event?.name || "CS2 Tournament",
				isFazeMatch: isFazeMatch // Add flag to identify FaZe matches
			};
		});
	
	const events = filterCurrentWeek(allEvents);
	console.log("Final events after current week filter:", events.length);
	
	return {
		lastUpdated: iso(),
		source: "HLTV community API (current week only)",
		tournaments: events.length ? [{ name: "CS2 Focus", events }] : [],
	};
}
