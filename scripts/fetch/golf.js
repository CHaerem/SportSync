import https from "https";
import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";
import { getNorwegianStreaming } from "../lib/norwegian-streaming.js";
import { validateESPNScoreboard, validateLiveGolfEvents } from "../lib/response-validator.js";

/**
 * Fetch the current week's PGA Tour field from pgatour.com.
 * Extracts __NEXT_DATA__ JSON embedded in the leaderboard page.
 * Returns { tournamentName, players: [{ firstName, lastName, displayName }] }
 * or null on any failure.
 */
async function fetchPGATourField() {
	try {
		const html = await new Promise((resolve, reject) => {
			const req = https.get("https://www.pgatour.com/leaderboard", {
				headers: { "User-Agent": "Mozilla/5.0 (compatible; SportSync/1.0)" },
				timeout: 10000,
			}, (res) => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					// Follow one redirect
					const redirectReq = https.get(res.headers.location, {
						headers: { "User-Agent": "Mozilla/5.0 (compatible; SportSync/1.0)" },
						timeout: 10000,
					}, (res2) => {
						if (res2.statusCode >= 400) return reject(new Error(`HTTP ${res2.statusCode}`));
						let body = "";
						res2.on("data", (c) => (body += c));
						res2.on("end", () => resolve(body));
					});
					redirectReq.on("error", reject);
					redirectReq.on("timeout", () => { redirectReq.destroy(); reject(new Error("Timeout")); });
					return;
				}
				if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
				let body = "";
				res.on("data", (c) => (body += c));
				res.on("end", () => resolve(body));
			});
			req.on("error", reject);
			req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
		});

		// Extract __NEXT_DATA__ JSON from HTML
		const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
		if (!match) return null;

		const nextData = JSON.parse(match[1]);
		const queries = nextData?.props?.pageProps?.dehydratedState?.queries;
		if (!Array.isArray(queries)) return null;

		// Find the leaderboard query
		const lbQuery = queries.find(q =>
			q.queryKey?.some?.(k => typeof k === "string" && k.toLowerCase().includes("leaderboard"))
		) || queries.find(q => q.state?.data?.leaderboard);

		const leaderboard = lbQuery?.state?.data?.leaderboard || lbQuery?.state?.data;
		if (!leaderboard) return null;

		const tournamentName = leaderboard.tournament?.tournamentName
			|| leaderboard.tournamentName
			|| nextData?.props?.pageProps?.tournament?.tournamentName
			|| null;

		// Extract players from rows/players array
		const rows = leaderboard.rows || leaderboard.players || [];
		const players = rows.map(row => {
			const p = row.player || row;
			return {
				firstName: p.firstName || "",
				lastName: p.lastName || "",
				displayName: p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
			};
		}).filter(p => p.displayName);

		if (players.length === 0) return null;

		return { tournamentName, players };
	} catch {
		return null;
	}
}

/**
 * Check if two tournament names likely refer to the same event.
 * Case-insensitive substring match in either direction.
 */
function tournamentNameMatches(espnName, pgaName) {
	if (!espnName || !pgaName) return false;
	const a = espnName.toLowerCase().replace(/[^a-z0-9 ]/g, "");
	const b = pgaName.toLowerCase().replace(/[^a-z0-9 ]/g, "");
	return a.includes(b) || b.includes(a);
}

/**
 * Given a list of Norwegian player names and a PGA Tour field,
 * return only the players confirmed in the field.
 */
function filterNorwegiansAgainstField(norwegianPlayers, pgaField) {
	return norwegianPlayers.filter(norPlayer => {
		const norLower = norPlayer.toLowerCase();
		return pgaField.players.some(p => {
			const fieldLower = p.displayName.toLowerCase();
			// Check full name match in either direction
			if (fieldLower.includes(norLower) || norLower.includes(fieldLower)) return true;
			// Check last name + first name
			const parts = norLower.split(" ");
			return parts.length >= 2 && parts.every(part => fieldLower.includes(part));
		});
	});
}

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
	const isScript = process.argv[1]?.includes('golf.js');
	const log = isScript ? console.log : () => {};

	const norwegianPlayers = [
		"Viktor Hovland",
		"Kristoffer Reitan",
		"Kris Ventura",
		"Espen Kofstad",
		"Anders Krogstad",
		"Kristian Krogh Johannessen",
		"Eivind Henriksen",
		"Andreas Halvorsen"
	];

	const tournaments = [];
	const now = new Date();

	try {
		log("Fetching golf events from LiveGolf API...");

		// Get upcoming events from both PGA Tour and DP World Tour
		const eventsUrl = `https://use.livegolfapi.com/v1/events?api_key=${API_KEY}`;
		const rawEvents = await fetchJson(eventsUrl);
		const validated = validateLiveGolfEvents(rawEvents);
		for (const w of validated.warnings) console.warn(w);
		const events = validated.events;

		if (events.length === 0 && !validated.valid) {
			throw new Error("Invalid events response format");
		}

		log(`Total events from API: ${events.length}`);
		events.slice(0, 10).forEach(e => {
			log(`  - ${e.name}: status=${e.status}, start=${e.startDatetime}`);
		});

		// Filter to upcoming tournaments (include today's events)
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);

		const upcomingEvents = events.filter(event => {
			const eventDate = new Date(event.startDatetime);
			const isUpcoming = event.status === 'Scheduled' &&
				eventDate >= todayStart; // Include today's events
			if (isUpcoming) {
				log(`Found upcoming event: ${event.name} starting ${event.startDatetime}`);
			}
			return isUpcoming;
		}).slice(0, 6); // Limit to next 6 tournaments

		log(`Found ${upcomingEvents.length} upcoming events`)

		// Fetch PGA Tour field once for cross-referencing
		log("Fetching PGA Tour field for verification...");
		const pgaField = await fetchPGATourField();
		if (pgaField) {
			log(`PGA Tour field: ${pgaField.tournamentName} (${pgaField.players.length} players)`);
		} else {
			log("PGA Tour field unavailable, will use unverified 'Expected' status");
		}

		for (const event of upcomingEvents) {
			try {
				log(`Processing ${event.name} (${event.tour?.name})...`);

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

				if (!eventDetail.leaderboard || !Array.isArray(eventDetail.leaderboard) || eventDetail.leaderboard.length === 0) {
					// No field data yet from LiveGolf
					const tourName = event.tour?.name || "Unknown Tour";
					const isPGA = tourName.toLowerCase().includes('pga');

					if (isPGA) {
						// Try to verify against PGA Tour website field
						if (pgaField && tournamentNameMatches(event.name, pgaField.tournamentName)) {
							const confirmed = filterNorwegiansAgainstField(norwegianPlayers, pgaField);
							if (confirmed.length > 0) {
								log(`Verified ${confirmed.length} Norwegian player(s) in ${event.name} via pgatour.com`);
								tournaments.push({
									name: tourName,
									events: [{
										title: event.name || "Golf Tournament",
										meta: tourName,
										tournament: tourName,
										time: normalizeToUTC(event.startDatetime),
										venue: `${event.course || "TBD"}${event.location ? `, ${event.location}` : ""}`,
										sport: "golf",
										streaming: getNorwegianStreaming("golf", tourName),
										norwegian: true,
										norwegianPlayers: confirmed.map(name => ({
											name,
											teeTime: null,
											teeTimeUTC: null,
											status: "Confirmed",
										})),
										totalPlayers: pgaField.players.length,
										link: event.link,
										status: event.status
									}]
								});
							} else {
								log(`No Norwegian players in ${event.name} field (verified via pgatour.com), skipping`);
							}
						} else {
							// PGA Tour field unavailable or different tournament
							log(`No leaderboard for ${event.name}, including as PGA Tour regular (unverified)`);
							tournaments.push({
								name: tourName,
								events: [{
									title: event.name || "Golf Tournament",
									meta: tourName,
									tournament: tourName,
									time: normalizeToUTC(event.startDatetime),
									venue: `${event.course || "TBD"}${event.location ? `, ${event.location}` : ""}`,
									sport: "golf",
									streaming: getNorwegianStreaming("golf", tourName),
									norwegian: true,
									norwegianPlayers: [{
										name: "Viktor Hovland",
										teeTime: null,
										teeTimeUTC: null,
										status: "Expected",
									}],
									totalPlayers: 0,
									link: event.link,
									status: event.status
								}]
							});
						}
					} else {
						log(`No leaderboard data for ${event.name}, skipping`);
					}
					continue;
				}

				// Find Norwegian players in this tournament
				const norwegianCompetitors = eventDetail.leaderboard.filter(player => {
					const playerName = player.player || "";
					return norwegianPlayers.some(norPlayer => {
						const norPlayerLower = norPlayer.toLowerCase();
						const playerNameLower = playerName.toLowerCase();

						// Check for exact matches (Viktor Hovland)
						if (playerNameLower.includes(norPlayerLower) || norPlayerLower.includes(playerNameLower)) {
							return true;
						}

						// Check for surname, firstname format (HALVORSEN, Andreas -> Andreas Halvorsen)
						const [firstName, ...lastNames] = norPlayer.split(' ');
						const lastName = lastNames.join(' ');
						const reversedName = `${lastName.toLowerCase()}, ${firstName.toLowerCase()}`;
						if (playerNameLower.includes(reversedName) || playerNameLower === reversedName) {
							return true;
						}

						// Check individual name parts
						const norPlayerParts = norPlayer.toLowerCase().split(' ');
						return norPlayerParts.every(part => playerNameLower.includes(part));
					});
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

						log(`Found Norwegian player: ${competitor.player} - Tee time: ${teeTimeDisplay || 'TBD'}${featuredGroupInfo ? ' (Featured Group)' : ''}`);

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

					// Use the earliest Norwegian player's tee time as the event time
					// This ensures the event shows up properly in the dashboard
					let eventTime = normalizeToUTC(event.startDatetime);
					const earliestTeeTime = norwegianPlayersList
						.filter(p => p.teeTimeUTC)
						.map(p => new Date(p.teeTimeUTC))
						.sort((a, b) => a - b)[0];

					if (earliestTeeTime) {
						eventTime = earliestTeeTime.toISOString();
					}

					tournaments.push({
						name: tourName,
						events: [{
							title: event.name || "Golf Tournament",
							meta: tourName,
							tournament: tourName,
							time: eventTime, // Use earliest tee time if available
							venue: `${event.course || "TBD"}${event.location ? `, ${event.location}` : ""}`,
							sport: "golf",
							streaming: getNorwegianStreaming("golf", tourName),
							norwegian: true,
							norwegianPlayers: norwegianPlayersList,
							totalPlayers: eventDetail.leaderboard.length,
							link: event.link,
							status: event.status
						}]
					});

					log(`Added ${event.name} with ${norwegianCompetitors.length} Norwegian players`);
				} else {
					log(`No Norwegian players found in ${event.name}`);
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

// Run if executed directly
if (process.argv[1]?.includes('golf.js')) {
	fetchGolfESPN().then(data => {
		console.log(JSON.stringify(data, null, 2));
	}).catch(err => {
		console.error('Error:', err);
		process.exit(1);
	});
}

async function fetchGolfESPNFallback() {
	const isScript = process.argv[1]?.includes('golf.js');
	const log = isScript ? console.log : () => {};

	// Norwegian golfers to look for
	const norwegianPlayers = [
		"Viktor Hovland",
		"Kristoffer Reitan",
		"Kris Ventura",
		"Espen Kofstad",
		"Anders Krogstad",
		"Kristian Krogh Johannessen",
		"Eivind Henriksen",
		"Andreas Halvorsen"
	];

	const tours = [
		{
			url: "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
			name: "PGA Tour",
			includeWithoutField: true,
		},
		{
			url: "https://site.api.espn.com/apis/site/v2/sports/golf/eur/scoreboard",
			name: "DP World Tour",
			includeWithoutField: true,
		},
	];

	const tournaments = [];
	const now = new Date();
	const seen = new Set(); // deduplicate across date queries

	// Query multiple date ranges to find upcoming tournaments
	// ESPN default scoreboard only returns current event, so we probe
	// future dates. Step of 4 days guarantees hitting any tournament
	// (golf events are Thu-Sun, 4-day windows).
	const datesToQuery = [];
	for (let d = 0; d < 21; d += 4) {
		const date = new Date(now);
		date.setDate(date.getDate() + d);
		datesToQuery.push(date.toISOString().slice(0, 10).replace(/-/g, ''));
	}

	// Fetch PGA Tour field once for cross-referencing
	log("Fetching PGA Tour field for verification...");
	const pgaField = await fetchPGATourField();
	if (pgaField) {
		log(`PGA Tour field: ${pgaField.tournamentName} (${pgaField.players.length} players)`);
	} else {
		log("PGA Tour field unavailable, will use unverified 'Expected' status");
	}

	for (const tour of tours) {
		try {
			const allEvents = [];

			for (const dateStr of datesToQuery) {
				try {
					const data = await fetchJson(`${tour.url}?dates=${dateStr}`);
					const v = validateESPNScoreboard(data, tour.name);
					for (const w of v.warnings) console.warn(w);
					for (const ev of v.events) {
						if (!seen.has(ev.id || ev.name + ev.date)) {
							seen.add(ev.id || ev.name + ev.date);
							allEvents.push(ev);
						}
					}
				} catch {
					// Individual date query failed, continue
				}
			}

			// Also query default endpoint for current/in-progress events
			try {
				const data = await fetchJson(tour.url);
				const v = validateESPNScoreboard(data, tour.name);
				for (const w of v.warnings) console.warn(w);
				for (const ev of v.events) {
					if (!seen.has(ev.id || ev.name + ev.date)) {
						seen.add(ev.id || ev.name + ev.date);
						allEvents.push(ev);
					}
				}
			} catch {
				// Default query failed, continue
			}

			const events = allEvents
				.filter(e =>
					new Date(e.date) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) &&
					!["STATUS_FINAL"].includes(e.status?.type?.name)
				)
				.sort((a, b) => new Date(a.date) - new Date(b.date))
				.slice(0, 4);

			log(`${tour.name}: found ${events.length} upcoming events`);

			for (const ev of events) {
				const competitors = ev.competitions?.[0]?.competitors || [];

				// Find Norwegian players in this tournament
				const norwegianCompetitors = competitors.filter(competitor => {
					const playerName = competitor.athlete?.displayName || "";
					return norwegianPlayers.some(norPlayer =>
						playerName.toLowerCase().includes(norPlayer.toLowerCase().split(' ').pop())
					);
				});

				const venue = ev.competitions?.[0]?.venue?.fullName ||
					ev.competitions?.[0]?.venue?.address?.city || "TBD";

				if (norwegianCompetitors.length > 0) {
					// Confirmed Norwegian players in field from ESPN
					const norwegianPlayersList = norwegianCompetitors.map(comp => ({
						name: comp.athlete?.displayName || "Unknown",
						teeTime: null,
						status: comp.status || null,
					}));

					log(`Found ${norwegianCompetitors.length} Norwegian players in ${ev.name}:`,
						norwegianPlayersList.map(p => p.name).join(', '));

					tournaments.push({
						name: tour.name,
						events: [{
							title: ev.name || "Golf Tournament",
							meta: tour.name,
							tournament: tour.name,
							time: normalizeToUTC(ev.date),
							venue,
							sport: "golf",
							streaming: getNorwegianStreaming("golf", tour.name),
							norwegian: true,
							norwegianPlayers: norwegianPlayersList,
							totalPlayers: competitors.length
						}]
					});
				} else if (competitors.length === 0 && tour.includeWithoutField) {
					// Scheduled tournament with no field on ESPN yet
					const isPGA = tour.name === "PGA Tour";

					if (isPGA && pgaField && tournamentNameMatches(ev.name, pgaField.tournamentName)) {
						// Cross-reference Norwegian players against PGA Tour website field
						const confirmed = filterNorwegiansAgainstField(norwegianPlayers, pgaField);
						if (confirmed.length > 0) {
							log(`Verified ${confirmed.length} Norwegian player(s) in ${ev.name} via pgatour.com`);
							tournaments.push({
								name: tour.name,
								events: [{
									title: ev.name || "Golf Tournament",
									meta: tour.name,
									tournament: tour.name,
									time: normalizeToUTC(ev.date),
									venue,
									sport: "golf",
									streaming: getNorwegianStreaming("golf", tour.name),
									norwegian: true,
									norwegianPlayers: confirmed.map(name => ({
										name,
										teeTime: null,
										status: "Confirmed",
									})),
									totalPlayers: pgaField.players.length
								}]
							});
						} else {
							log(`No Norwegian players in ${ev.name} field (verified via pgatour.com), skipping`);
						}
					} else {
						// PGA Tour field unavailable, different tournament, or DP World Tour
						log(`Including ${ev.name} (field TBD, ${tour.name} regular)`);
						const expectedPlayers = isPGA
							? [{ name: "Viktor Hovland", teeTime: null, status: "Expected" }]
							: [{ name: "Andreas Halvorsen", teeTime: null, status: "Expected" }];

						tournaments.push({
							name: tour.name,
							events: [{
								title: ev.name || "Golf Tournament",
								meta: tour.name,
								tournament: tour.name,
								time: normalizeToUTC(ev.date),
								venue,
								sport: "golf",
								streaming: getNorwegianStreaming("golf", tour.name),
								norwegian: true,
								norwegianPlayers: expectedPlayers,
								totalPlayers: 0
							}]
						});
					}
				}
			}
		} catch (error) {
			console.warn(`Failed to fetch ${tour.name}:`, error.message);
		}
	}

	return {
		lastUpdated: iso(),
		source: "ESPN API",
		tournaments
	};
}
