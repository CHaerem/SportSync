import https from "https";
import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";
import { getNorwegianStreaming } from "../lib/norwegian-streaming.js";
import { validateESPNScoreboard } from "../lib/response-validator.js";

/**
 * Parse a tee time string like "8:45 AM" to UTC ISO string,
 * given the tournament date and timezone.
 */
function parseTeeTimeToUTC(teeTimeStr, tournamentDate, timezone) {
	if (!teeTimeStr || !tournamentDate) return null;
	try {
		// Parse "8:45 AM" or "1:30 PM" format
		const match = teeTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
		if (!match) return null;
		let hours = parseInt(match[1], 10);
		const minutes = parseInt(match[2], 10);
		const period = match[3].toUpperCase();
		if (period === "PM" && hours !== 12) hours += 12;
		if (period === "AM" && hours === 12) hours = 0;

		// Build a date string in the tournament's local timezone
		const dateStr = typeof tournamentDate === "string"
			? tournamentDate.slice(0, 10)
			: new Date(tournamentDate).toISOString().slice(0, 10);
		const localStr = `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;

		// Use Intl to find the UTC offset for this timezone
		const tz = timezone || "America/New_York";
		const localDate = new Date(localStr);
		const utcFormatter = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			year: "numeric", month: "2-digit", day: "2-digit",
			hour: "2-digit", minute: "2-digit", second: "2-digit",
			hour12: false,
		});
		// Format localDate as if it were in UTC, then find the offset
		const utcParts = utcFormatter.formatToParts(localDate);
		const get = (type) => utcParts.find(p => p.type === type)?.value;
		const tzDate = new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
		const offsetMs = tzDate.getTime() - localDate.getTime();
		// Actual UTC time = local time + offset
		const utcTime = new Date(localDate.getTime() + offsetMs);
		return utcTime.toISOString();
	} catch {
		return null;
	}
}

/**
 * Fetch the current week's PGA Tour field from pgatour.com.
 * Extracts __NEXT_DATA__ JSON embedded in the leaderboard page.
 * Returns { tournamentName, timezone, players: [{ firstName, lastName, displayName, teeTime, teeTimeUTC, startingHole }] }
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

		const timezone = leaderboard.tournament?.timezone
			|| leaderboard.timezone
			|| nextData?.props?.pageProps?.tournament?.timezone
			|| null;

		const tournamentDate = leaderboard.tournament?.date
			|| leaderboard.tournament?.startDate
			|| nextData?.props?.pageProps?.tournament?.date
			|| null;

		// Extract players from rows/players array
		const rows = leaderboard.rows || leaderboard.players || [];
		const players = rows.map(row => {
			const p = row.player || row;
			// Probe multiple paths for tee time
			const rawTeeTime = row.teeTime || row.rounds?.[0]?.teeTime || row.thru || null;
			// Only treat as tee time if it looks like a time (e.g. "8:45 AM")
			const teeTimeStr = (typeof rawTeeTime === "string" && /\d{1,2}:\d{2}/.test(rawTeeTime))
				? rawTeeTime : null;
			const teeTimeUTC = teeTimeStr
				? parseTeeTimeToUTC(teeTimeStr, tournamentDate, timezone)
				: null;
			return {
				firstName: p.firstName || "",
				lastName: p.lastName || "",
				displayName: p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
				teeTime: teeTimeStr,
				teeTimeUTC,
				startingHole: row.startingHole || null,
			};
		}).filter(p => p.displayName);

		if (players.length === 0) return null;

		return { tournamentName, timezone, players };
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

export async function fetchGolfESPN() {
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
	const seen = new Map(); // key -> index in allEvents, keeps earliest date

	// Query every day for next 14 days so we always catch the Thursday
	// start of multi-day tournaments (golf events are Thu-Sun).
	const datesToQuery = [];
	for (let d = 0; d < 14; d++) {
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
						const key = ev.id || ev.name;
						const idx = seen.get(key);
						if (idx === undefined) {
							seen.set(key, allEvents.length);
							allEvents.push(ev);
						} else if (new Date(ev.date) < new Date(allEvents[idx].date)) {
							allEvents[idx] = ev; // Keep earliest date
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
					const key = ev.id || ev.name;
					const idx = seen.get(key);
					if (idx === undefined) {
						seen.set(key, allEvents.length);
						allEvents.push(ev);
					} else if (new Date(ev.date) < new Date(allEvents[idx].date)) {
						allEvents[idx] = ev; // Keep earliest date
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
					const isPGATour = tour.name === "PGA Tour";
					const norwegianPlayersList = norwegianCompetitors.map(comp => {
						const name = comp.athlete?.displayName || "Unknown";
						// Look up tee time from PGA Tour field if available
						let teeTime = null;
						let teeTimeUTC = null;
						if (isPGATour && pgaField && tournamentNameMatches(ev.name, pgaField.tournamentName)) {
							const fieldPlayer = pgaField.players.find(p =>
								p.displayName.toLowerCase().includes(name.toLowerCase().split(' ').pop())
							);
							if (fieldPlayer?.teeTime) {
								teeTime = fieldPlayer.teeTime;
								teeTimeUTC = fieldPlayer.teeTimeUTC;
							}
						}
						return { name, teeTime, teeTimeUTC, status: comp.status || null };
					});

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
									norwegianPlayers: confirmed.map(name => {
										const fieldPlayer = pgaField.players.find(p =>
											p.displayName.toLowerCase().includes(name.toLowerCase().split(' ').pop())
										);
										return {
											name,
											teeTime: fieldPlayer?.teeTime || null,
											teeTimeUTC: fieldPlayer?.teeTimeUTC || null,
											status: "Confirmed",
										};
									}),
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
		source: "ESPN + PGA Tour",
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
