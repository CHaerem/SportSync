import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";

// Norwegian players to track
const norwegianPlayers = [
	"Casper Ruud",
	"Ruud, Casper", 
	"C. Ruud",
	"Ruud"
];

function hasNorwegianPlayer(competitors) {
	return norwegianPlayers.some(player => 
		competitors.some(c => {
			const name = c.athlete?.displayName || c.displayName || c.team?.displayName || '';
			return name.includes(player.split(',')[0].trim());
		})
	);
}

export async function fetchTennis() {
	const tournaments = [];
	const now = new Date();
	
	// Try multiple ESPN tennis endpoints for better coverage
	const endpoints = [
		{ name: "ATP Tour", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard" },
		{ name: "ATP Events", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/events" },
		{ name: "WTA Tour", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard" },
		{ name: "WTA Events", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/events" }
	];
	
	// Try each endpoint
	for (const endpoint of endpoints) {
		try {
			const data = await fetchJson(endpoint.url);
			
			// Handle different response structures
			let events = [];
			if (data.events) {
				events = data.events;
			} else if (data.matches) {
				events = data.matches;
			}
			
			if (events.length === 0) continue;
			
			// Filter for upcoming matches with Norwegian players
			const upcomingMatches = events
				.filter((e) => {
					const d = new Date(e.date);
					const status = e.status?.type?.name;
					return (
						d > now && !["STATUS_FINAL", "STATUS_IN_PROGRESS"].includes(status)
					);
				})
				.filter(e => {
					// More flexible player detection - check JSON for Casper/Ruud
					const eventStr = JSON.stringify(e).toLowerCase();
					return eventStr.includes('ruud') || eventStr.includes('casper');
				})
				.slice(0, 10);
			
			if (upcomingMatches.length > 0) {
				tournaments.push({
					name: endpoint.name,
					events: upcomingMatches.map((ev) => {
						// Extract player names from different possible structures
						let player1 = "TBD", player2 = "TBD";
						
						if (ev.competitions?.[0]?.competitors) {
							// Standard competition format
							const competitors = ev.competitions[0].competitors;
							player1 = competitors[0]?.athlete?.displayName || competitors[0]?.team?.displayName || "TBD";
							player2 = competitors[1]?.athlete?.displayName || competitors[1]?.team?.displayName || "TBD";
						} else if (ev.competitors) {
							// Direct competitors on event (Mixed doubles format like I. Swiatek / C. Ruud)
							const competitors = ev.competitors;
							player1 = competitors[0]?.displayName || competitors[0]?.team?.displayName || "TBD";
							player2 = competitors[1]?.displayName || competitors[1]?.team?.displayName || "TBD";
						} else if (ev.name) {
							// Try to extract from event name
							const vs = ev.name.split(' vs ');
							if (vs.length === 2) {
								player1 = vs[0];
								player2 = vs[1];
							}
						}
						
						return {
							title: `${player1} vs ${player2}`,
							meta: ev.competitions?.[0]?.notes?.[0]?.headline || ev.shortName || endpoint.name,
							time: normalizeToUTC(ev.date),
							venue: ev.competitions?.[0]?.venue?.fullName || ev.venue || "Tennis Center",
							sport: "tennis",
							streaming: [],
							norwegian: true, // All matches are Norwegian since we filtered for Casper Ruud
							participants: [player1, player2]
						};
					})
				});
			}
			
		} catch (error) {
			console.warn(`${endpoint.name} tennis fetch failed:`, error.message);
		}
	}
	
	return { 
		lastUpdated: iso(), 
		source: "ESPN Tennis API (Multiple Endpoints)", 
		tournaments 
	};
}