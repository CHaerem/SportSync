import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";

// LiveGolf API - provides actual tee times!
export async function fetchGolfESPN() {
	const API_KEY = process.env.LIVEGOLF_API_KEY;
	
	// If we have the LiveGolf API key, use the better API
	if (API_KEY) {
		return await fetchGolfLiveGolfAPI();
	}
	
	// Fallback to ESPN API (no tee times)
	return await fetchGolfESPNFallback();
}

async function fetchGolfLiveGolfAPI() {
	const API_KEY = process.env.LIVEGOLF_API_KEY;
	
	const norwegianPlayers = [
		"Viktor Hovland",
		"Kristoffer Reitan", 
		"Kris Ventura",
		"Espen Kofstad",
		"Anders Krogstad",
		"Kristian Krogh Johannessen",
		"Eivind Henriksen"
	];
	
	const tournaments = [];
	const now = new Date();
	
	try {
		console.log("Fetching golf events from LiveGolf API...");
		
		// Get upcoming events from both PGA Tour and DP World Tour
		const eventsUrl = `https://use.livegolfapi.com/v1/events?api_key=${API_KEY}`;
		const events = await fetchJson(eventsUrl);
		
		if (!Array.isArray(events)) {
			throw new Error("Invalid events response format");
		}
		
		// Filter to upcoming tournaments
		const upcomingEvents = events.filter(event => 
			event.status === 'Scheduled' && 
			new Date(event.startDatetime) > now
		).slice(0, 6); // Limit to next 6 tournaments
		
		for (const event of upcomingEvents) {
			try {
				console.log(`Processing ${event.name} (${event.tour?.name})...`);
				
				// Get detailed event data with leaderboard (includes tee times)
				const detailUrl = `https://use.livegolfapi.com/v1/events/${event.id}?api_key=${API_KEY}`;
				const eventDetail = await fetchJson(detailUrl);
				
				// Try to get featured groups information
				let featuredGroups = [];
				try {
					const groupsUrl = `https://use.livegolfapi.com/v1/events/${event.id}/groups?api_key=${API_KEY}`;
					const groupsData = await fetchJson(groupsUrl);
					if (Array.isArray(groupsData)) {
						featuredGroups = groupsData.filter(group => group.featured || group.tv);
					}
				} catch (groupError) {
					// Featured groups not available - not critical
				}
				
				if (!eventDetail.leaderboard || !Array.isArray(eventDetail.leaderboard)) {
					console.log(`No leaderboard data for ${event.name}, skipping`);
					continue;
				}
				
				// Find Norwegian players in this tournament
				const norwegianCompetitors = eventDetail.leaderboard.filter(player => {
					const playerName = player.player || "";
					return norwegianPlayers.some(norPlayer => 
						playerName.toLowerCase().includes(norPlayer.toLowerCase()) ||
						norPlayer.toLowerCase().includes(playerName.toLowerCase())
					);
				});
				
				// Only include tournaments with Norwegian players
				if (norwegianCompetitors.length > 0) {
					const norwegianPlayersList = norwegianCompetitors.map(competitor => {
						const rounds = competitor.rounds || [];
						const firstRound = rounds.find(r => r.round === 1) || rounds[0];
						
						// Convert tee time to Norwegian timezone display
						let teeTimeDisplay = null;
						if (firstRound?.teeTime) {
							const teeTimeUTC = new Date(firstRound.teeTime);
							teeTimeDisplay = teeTimeUTC.toLocaleString("en-NO", {
								weekday: "short",
								month: "short", 
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
								timeZone: "Europe/Oslo"
							});
						}
						
						// Check if this player is in a featured group
						let featuredGroupInfo = null;
						if (featuredGroups.length > 0 && firstRound?.teeTime) {
							const playerGroup = featuredGroups.find(group => 
								group.players?.some(p => 
									p.name?.toLowerCase().includes(competitor.player.toLowerCase()) ||
									competitor.player.toLowerCase().includes(p.name?.toLowerCase())
								)
							);
							if (playerGroup) {
								featuredGroupInfo = {
									groupName: playerGroup.name || 'Featured Group',
									players: playerGroup.players?.map(p => p.name) || [],
									coverage: playerGroup.coverage || playerGroup.tv || 'TV Coverage'
								};
							}
						}
						
						console.log(`Found Norwegian player: ${competitor.player} - Tee time: ${teeTimeDisplay || 'TBD'}${featuredGroupInfo ? ' (Featured Group)' : ''}`);
						
						return {
							name: competitor.player,
							teeTime: teeTimeDisplay,
							teeTimeUTC: firstRound?.teeTime || null,
							startingTee: firstRound?.startingTee || null,
							round: firstRound?.round || 1,
							status: competitor.position ? `T${competitor.position}` : 'Scheduled',
							featuredGroup: featuredGroupInfo
						};
					});
					
					// Determine tournament source
					const tourName = event.tour?.name || "Unknown Tour";
					
					tournaments.push({
						name: tourName,
						events: [{
							title: event.name || "Golf Tournament",
							meta: tourName,
							time: normalizeToUTC(event.startDatetime),
							venue: `${event.course || "TBD"}${event.location ? `, ${event.location}` : ""}`,
							sport: "golf",
							streaming: [],
							norwegian: true,
							norwegianPlayers: norwegianPlayersList,
							totalPlayers: eventDetail.leaderboard.length,
							link: event.link,
							status: event.status
						}]
					});
					
					console.log(`✅ Added ${event.name} with ${norwegianCompetitors.length} Norwegian players`);
				} else {
					console.log(`No Norwegian players found in ${event.name}`);
				}
				
			} catch (eventError) {
				console.warn(`Failed to process event ${event.name}:`, eventError.message);
			}
		}
		
	} catch (error) {
		console.error("LiveGolf API error:", error.message);
		throw error;
	}
	
	return { 
		lastUpdated: iso(), 
		source: "LiveGolf API (with tee times)", 
		tournaments 
	};
}

async function fetchGolfESPNFallback() {
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
					const norwegianPlayersList = norwegianCompetitors.map(comp => {
						return {
							name: comp.athlete?.displayName || "Unknown",
							teeTime: null, // ESPN doesn't provide tee times
							status: comp.status || null,
							hasSchedule: false
						};
					});
					
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
		source: "ESPN API (Norwegian players only, no tee times)", 
		tournaments 
	};
}
