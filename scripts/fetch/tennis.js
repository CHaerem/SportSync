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
		competitors.some(c => 
			c.athlete?.displayName?.includes(player.split(',')[0].trim()) ||
			c.athlete?.shortName?.includes(player.split(',')[0].trim())
		)
	);
}

export async function fetchTennis() {
	const tournaments = [];
	
	// Try ATP Tour
	try {
		const atpUrl = "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard";
		const atpData = await fetchJson(atpUrl);
		const now = new Date();
		
		const atpUpcoming = (atpData.events || [])
			.filter((e) => {
				const d = new Date(e.date);
				const status = e.status?.type?.name;
				return (
					d > now && !["STATUS_FINAL", "STATUS_IN_PROGRESS"].includes(status)
				);
			})
			.filter(e => e.competitions[0] && e.competitions[0].competitors && hasNorwegianPlayer(e.competitions[0].competitors)) // Only Casper Ruud matches
			.slice(0, 10);
			
		if (atpUpcoming.length) {
			tournaments.push({
				name: "ATP Tour",
				events: atpUpcoming.map((ev) => ({
					title: `${ev.competitions[0].competitors[0].athlete.displayName} vs ${ev.competitions[0].competitors[1].athlete.displayName}`,
					meta: ev.competitions[0].notes?.[0]?.headline || "ATP Tournament",
					time: normalizeToUTC(ev.date),
					venue: ev.competitions[0].venue?.fullName || "Tennis Center",
					sport: "tennis",
					streaming: [],
					norwegian: true, // All matches are Norwegian since we filtered for Casper Ruud
					participants: [
						ev.competitions[0].competitors[0].athlete.displayName,
						ev.competitions[0].competitors[1].athlete.displayName
					]
				})),
			});
		}
	} catch (error) {
		console.warn("ATP tennis fetch failed:", error.message);
	}
	
	// Try WTA Tour as backup (in case of mixed tournaments)
	try {
		const wtaUrl = "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard";
		const wtaData = await fetchJson(wtaUrl);
		const now = new Date();
		
		const wtaUpcoming = (wtaData.events || [])
			.filter((e) => {
				const d = new Date(e.date);
				const status = e.status?.type?.name;
				return (
					d > now && !["STATUS_FINAL", "STATUS_IN_PROGRESS"].includes(status)
				);
			})
			.filter(e => e.competitions[0] && e.competitions[0].competitors && hasNorwegianPlayer(e.competitions[0].competitors)) // Only Norwegian matches
			.slice(0, 5);
			
		if (wtaUpcoming.length) {
			tournaments.push({
				name: "WTA Tour",
				events: wtaUpcoming.map((ev) => ({
					title: `${ev.competitions[0].competitors[0].athlete.displayName} vs ${ev.competitions[0].competitors[1].athlete.displayName}`,
					meta: ev.competitions[0].notes?.[0]?.headline || "WTA Tournament",
					time: normalizeToUTC(ev.date),
					venue: ev.competitions[0].venue?.fullName || "Tennis Center",
					sport: "tennis",
					streaming: [],
					norwegian: true,
					participants: [
						ev.competitions[0].competitors[0].athlete.displayName,
						ev.competitions[0].competitors[1].athlete.displayName
					]
				})),
			});
		}
	} catch (error) {
		console.warn("WTA tennis fetch failed:", error.message);
	}
	
	// Only return real tennis data - no mock data
	
	return { 
		lastUpdated: iso(), 
		source: "ESPN Tennis API (ATP + WTA)", 
		tournaments 
	};
}
