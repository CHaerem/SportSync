import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";

export async function fetchGolfESPN() {
	// Norwegian golfers to look for
	const norwegianPlayers = [
		"Viktor Hovland",
		"Kristoffer Reitan", 
		"Kris Ventura",
		"Espen Kofstad",
		"Anders Krogstad",
		"Kristian Krogh Johannessen",
		"Eivind Henriksen"
	];
	
	const tours = [
		{
			url: "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
			name: "PGA Tour",
		},
		{
			url: "https://site.api.espn.com/apis/site/v2/sports/golf/eur/scoreboard", 
			name: "DP World Tour",
		},
	];
	
	const tournaments = [];
	const now = new Date();
	
	for (const tour of tours) {
		try {
			const data = await fetchJson(tour.url);
			const events = (data.events || [])
				.filter(
					(e) =>
						new Date(e.date) > now &&
						!["STATUS_FINAL", "STATUS_IN_PROGRESS"].includes(
							e.status?.type?.name
						)
				)
				.slice(0, 4);
				
			// Process each event to check for Norwegian players
			for (const ev of events) {
				const competitors = ev.competitions?.[0]?.competitors || [];
				
				// Find Norwegian players in this tournament
				const norwegianCompetitors = competitors.filter(competitor => {
					const playerName = competitor.athlete?.displayName || "";
					return norwegianPlayers.some(norPlayer => 
						playerName.toLowerCase().includes(norPlayer.toLowerCase().split(' ').pop()) // Match by last name
					);
				});
				
				// Only include tournaments with Norwegian players
				if (norwegianCompetitors.length > 0) {
					const norwegianPlayersList = norwegianCompetitors.map(comp => ({
						name: comp.athlete?.displayName || "Unknown",
						teeTime: comp.teeTime || null,
						status: comp.status || null
					}));
					
					console.log(`Found ${norwegianCompetitors.length} Norwegian players in ${ev.name}:`, 
						norwegianPlayersList.map(p => p.name).join(', '));
					
					tournaments.push({
						name: tour.name,
						events: [{
							title: ev.name || "Golf Tournament",
							meta: tour.name,
							time: normalizeToUTC(ev.date),
							venue: ev.competitions?.[0]?.venue?.fullName ||
								   ev.competitions?.[0]?.venue?.address?.city ||
								   "TBD",
							sport: "golf",
							streaming: [],
							norwegian: true,
							norwegianPlayers: norwegianPlayersList,
							totalPlayers: competitors.length
						}]
					});
				}
			}
		} catch (error) {
			console.warn(`Failed to fetch ${tour.name}:`, error.message);
		}
	}
	
	return { 
		lastUpdated: iso(), 
		source: "ESPN API (Norwegian players only)", 
		tournaments 
	};
}
