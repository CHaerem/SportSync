import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";

// Norwegian players to track — use lowercase for matching
const TRACKED_PLAYERS = ["casper ruud"];

function isTrackedPlayer(name) {
	const lower = (name || "").toLowerCase();
	return TRACKED_PLAYERS.some(p => lower.includes(p) || lower.includes(p.split(" ").pop()));
}

export async function fetchTennis() {
	const tournaments = [];
	const now = new Date();

	// The scoreboard endpoint returns active tournaments with full match detail
	// Structure: events[] → each event is a tournament → groupings[] → competitions[] are matches
	const scoreboardEndpoints = [
		{ name: "ATP Tour", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard" },
		{ name: "WTA Tour", url: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard" },
	];

	for (const endpoint of scoreboardEndpoints) {
		try {
			const data = await fetchJson(endpoint.url);
			if (!data.events || data.events.length === 0) continue;

			for (const tournament of data.events) {
				const tournamentName = tournament.name || tournament.shortName || endpoint.name;
				const groupings = tournament.groupings || [];

				// Look through all matches in this tournament for tracked players
				let trackedPlayerFound = false;
				const trackedMatches = [];
				const allUpcomingMatches = [];

				for (const grouping of groupings) {
					// Focus on singles (skip doubles unless tracked player is in it)
					const competitions = grouping.competitions || [];

					for (const match of competitions) {
						const competitors = match.competitors || [];
						const status = match.status?.type?.name || "";
						const matchDate = new Date(match.date);

						// Extract player names
						let player1 = "TBD", player2 = "TBD";
						let hasTracked = false;

						for (const c of competitors) {
							const displayName = c.athlete?.displayName || c.displayName || "";
							if (isTrackedPlayer(displayName)) {
								hasTracked = true;
								trackedPlayerFound = true;
							}
						}

						if (competitors.length >= 2) {
							player1 = competitors[0]?.athlete?.displayName || competitors[0]?.displayName || "TBD";
							player2 = competitors[1]?.athlete?.displayName || competitors[1]?.displayName || "TBD";
						}

						const matchEvent = {
							title: `${player1} vs ${player2}`,
							meta: `${tournamentName} - ${match.round?.displayName || grouping.grouping?.displayName || ""}`,
							time: normalizeToUTC(match.date),
							venue: match.venue?.fullName || tournament.venue || "TBD",
							sport: "tennis",
							streaming: [],
							norwegian: hasTracked,
							participants: [player1, player2],
						};

						// Collect upcoming matches
						if (matchDate > now && status !== "STATUS_FINAL") {
							allUpcomingMatches.push(matchEvent);
							if (hasTracked) {
								trackedMatches.push(matchEvent);
							}
						}
					}
				}

				if (trackedPlayerFound) {
					// Ruud is in this tournament — include his matches plus the tournament info
					console.log(`Tennis: Found tracked player in ${tournamentName} (${trackedMatches.length} upcoming matches)`);

					if (trackedMatches.length > 0) {
						tournaments.push({
							name: tournamentName,
							events: trackedMatches,
						});
					} else {
						// Ruud is in the tournament but no upcoming match scheduled yet
						const tournamentDates = tournament.date ? new Date(tournament.date) : now;
						tournaments.push({
							name: tournamentName,
							events: [{
								title: `${tournamentName} (Casper Ruud participating)`,
								meta: tournamentName,
								time: normalizeToUTC(tournamentDates),
								venue: tournament.venue || "TBD",
								sport: "tennis",
								streaming: [],
								norwegian: true,
								participants: ["Casper Ruud"],
							}],
						});
					}
				} else if (allUpcomingMatches.length > 0) {
					// Include active tournaments for general coverage (capped at 5)
					tournaments.push({
						name: tournamentName,
						events: allUpcomingMatches.slice(0, 5),
					});
				}
			}
		} catch (error) {
			console.warn(`${endpoint.name} tennis fetch failed:`, error.message);
		}
	}

	// Also check the events endpoint as a fallback for simpler match listings
	try {
		const eventsData = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/tennis/atp/events");
		if (eventsData.events && eventsData.events.length > 0) {
			const ruudEvents = eventsData.events.filter(e => {
				const str = JSON.stringify(e).toLowerCase();
				return str.includes("ruud");
			});

			if (ruudEvents.length > 0 && tournaments.length === 0) {
				// Only use events endpoint as fallback if scoreboard gave us nothing
				tournaments.push({
					name: "ATP Tour",
					events: ruudEvents.map(ev => {
						const competitors = ev.competitors || [];
						const player1 = competitors[0]?.displayName || "TBD";
						const player2 = competitors[1]?.displayName || "TBD";
						return {
							title: `${player1} vs ${player2}`,
							meta: ev.shortName || "ATP",
							time: normalizeToUTC(ev.date),
							venue: ev.venue || "TBD",
							sport: "tennis",
							streaming: [],
							norwegian: true,
							participants: [player1, player2],
						};
					}),
				});
			}
		}
	} catch (error) {
		console.warn("ATP events fallback failed:", error.message);
	}

	console.log(`Tennis: Found ${tournaments.length} tournaments with tracked players`);
	return {
		lastUpdated: iso(),
		source: "ESPN Tennis API",
		tournaments,
	};
}
