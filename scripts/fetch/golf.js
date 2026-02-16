import fs from "fs";
import path from "path";
import https from "https";
import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";
import { getNorwegianStreaming } from "../lib/norwegian-streaming.js";
import { validateESPNScoreboard } from "../lib/response-validator.js";

// Load Norwegian golfers from config
const configPath = path.resolve(process.cwd(), "scripts", "config", "norwegian-golfers.json");
let norwegianGolfers = [];
try {
	norwegianGolfers = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (err) {
	console.warn(`Failed to load norwegian-golfers.json: ${err.message}`);
}

/**
 * Check if an ESPN player name matches a configured golfer.
 * Uses full-name matching to avoid false positives (e.g. "Ventura" matching wrong player).
 */
function playerNameMatches(espnName, golfer) {
	const espn = espnName.toLowerCase().trim();
	const full = golfer.name.toLowerCase();
	// Exact or contains in either direction
	if (espn === full || espn.includes(full) || full.includes(espn)) return true;
	// All name parts must appear in the ESPN name
	const parts = full.split(" ");
	return parts.length >= 2 && parts.every(p => espn.includes(p));
}

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
		const utcParts = utcFormatter.formatToParts(localDate);
		const get = (type) => utcParts.find(p => p.type === type)?.value;
		const tzDate = new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`);
		const offsetMs = tzDate.getTime() - localDate.getTime();
		const utcTime = new Date(localDate.getTime() + offsetMs);

		// Sanity check: reject tee times in the past or >7 days in the future
		const now = new Date();
		const maxFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
		if (utcTime < now || utcTime > maxFuture) {
			console.warn(`Tee time ${utcTime.toISOString()} outside valid window, ignoring`);
			return null;
		}

		return utcTime.toISOString();
	} catch (err) {
		console.warn(`Failed to parse tee time "${teeTimeStr}": ${err.message}`);
		return null;
	}
}

/**
 * Fetch a PGA Tour page and extract __NEXT_DATA__ JSON.
 * Shared helper for both leaderboard and tee-times pages.
 * Returns { nextData, queries } or null on any failure.
 */
async function fetchPGATourPage(pagePath) {
	try {
		const url = `https://www.pgatour.com${pagePath}`;
		const html = await new Promise((resolve, reject) => {
			const req = https.get(url, {
				headers: { "User-Agent": "Mozilla/5.0 (compatible; SportSync/1.0)" },
				timeout: 10000,
			}, (res) => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

		const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
		if (!match) {
			console.warn(`PGA Tour ${pagePath}: __NEXT_DATA__ script tag not found`);
			return null;
		}

		let nextData;
		try {
			nextData = JSON.parse(match[1]);
		} catch (parseErr) {
			console.warn(`PGA Tour ${pagePath}: Failed to parse __NEXT_DATA__: ${parseErr.message}`);
			return null;
		}

		const queries = nextData?.props?.pageProps?.dehydratedState?.queries;
		if (!Array.isArray(queries)) {
			console.warn(`PGA Tour ${pagePath}: No queries array in __NEXT_DATA__`);
			return null;
		}

		return { nextData, queries };
	} catch (err) {
		console.warn(`PGA Tour ${pagePath} fetch failed: ${err.message}`);
		return null;
	}
}

/**
 * Fetch the current week's PGA Tour field from pgatour.com.
 * Returns { tournamentName, timezone, players: [...] } or null on any failure.
 */
async function fetchPGATourField() {
	try {
		const page = await fetchPGATourPage("/leaderboard");
		if (!page) return null;
		const { nextData, queries } = page;

		// Find the leaderboard query
		const lbQuery = queries.find(q =>
			q.queryKey?.some?.(k => typeof k === "string" && k.toLowerCase().includes("leaderboard"))
		) || queries.find(q => q.state?.data?.leaderboard);

		const leaderboard = lbQuery?.state?.data?.leaderboard || lbQuery?.state?.data;
		if (!leaderboard) {
			console.warn("PGA Tour: No leaderboard data found in queries");
			return null;
		}

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
			const sd = row.scoringData || {};

			// Tee time: PGA Tour uses epoch ms in scoringData.teeTime
			let teeTime = null;
			let teeTimeUTC = null;
			const rawTeeTime = sd.teeTime || row.teeTime || null;
			if (typeof rawTeeTime === "number" && rawTeeTime > 0) {
				const dt = new Date(rawTeeTime);
				if (!isNaN(dt.getTime())) {
					teeTimeUTC = dt.toISOString();
					// Format local time string for display (Norway timezone, 24h)
					try {
						teeTime = dt.toLocaleTimeString("no-NO", {
							timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false
						});
					} catch {
						teeTime = dt.toLocaleTimeString("no-NO", {
							hour: "2-digit", minute: "2-digit", hour12: false
						});
					}
				}
			} else if (typeof rawTeeTime === "string" && /\d{1,2}:\d{2}/.test(rawTeeTime)) {
				// Fallback: string format like "8:45 AM"
				teeTime = rawTeeTime;
				teeTimeUTC = parseTeeTimeToUTC(rawTeeTime, tournamentDate, timezone);
			}

			return {
				firstName: p.firstName || "",
				lastName: p.lastName || "",
				displayName: p.displayName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
				teeTime,
				teeTimeUTC,
				startingHole: sd.backNine ? 10 : (row.startingHole || null),
			};
		}).filter(p => p.displayName);

		if (players.length === 0) {
			console.warn("PGA Tour: Leaderboard parsed but 0 players extracted");
			return null;
		}

		console.log(`PGA Tour field loaded: ${tournamentName} (${players.length} players)`);
		return { tournamentName, timezone, players };
	} catch (err) {
		console.warn(`PGA Tour scrape failed: ${err.message}`);
		return null;
	}
}

/**
 * Fetch tee times from pgatour.com/tee-times page.
 * Returns { tournamentName, timezone, playerTeeTimes: Map<normalizedName, info> } or null.
 * The tee-times page has real tee times during in-progress tournaments
 * when the leaderboard page only shows scoring data.
 */
async function fetchPGATourTeeTimes() {
	try {
		const page = await fetchPGATourPage("/tee-times");
		if (!page) return null;
		const { nextData, queries } = page;

		const tournamentName = nextData?.props?.pageProps?.tournament?.tournamentName || null;
		const timezone = nextData?.props?.pageProps?.tournament?.timezone || null;
		const currentRound = nextData?.props?.pageProps?.tournament?.currentRound || 1;

		// Find tee-times query — try multiple key patterns
		const ttQuery = queries.find(q =>
			q.queryKey?.some?.(k => typeof k === "string" &&
				(k.toLowerCase().includes("teetimes") || k.toLowerCase().includes("tee-times") || k.toLowerCase().includes("tee_times"))
			)
		) || queries.find(q => q.state?.data?.rounds);

		const ttData = ttQuery?.state?.data?.teeTimeV3 || ttQuery?.state?.data;
		if (!ttData) {
			console.warn("PGA Tour tee-times: No tee-time data found in queries");
			return null;
		}

		// Navigate to rounds array
		const rounds = ttData.rounds || ttData.teeTimeRounds || [];
		if (!Array.isArray(rounds) || rounds.length === 0) {
			console.warn("PGA Tour tee-times: No rounds data");
			return null;
		}

		// Use currentRound (1-indexed) to pick the right round
		const roundIndex = Math.min(currentRound - 1, rounds.length - 1);
		const round = rounds[roundIndex];
		if (!round) {
			console.warn(`PGA Tour tee-times: Round ${currentRound} not found`);
			return null;
		}

		const groups = round.groups || round.teeTimeGroups || [];
		const playerTeeTimes = new Map();

		for (const group of groups) {
			const rawTeeTime = group.time || group.teeTime || null;
			const startTee = group.startTee || group.startingHole || 1;
			const courseName = group.course?.courseName || group.courseName || null;
			const players = group.players || group.golfers || [];

			// Parse group tee time
			let teeTimeDisplay = null;
			let teeTimeUTC = null;
			if (typeof rawTeeTime === "number" && rawTeeTime > 0) {
				const dt = new Date(rawTeeTime);
				if (!isNaN(dt.getTime())) {
					teeTimeUTC = dt.toISOString();
					try {
						teeTimeDisplay = dt.toLocaleTimeString("no-NO", {
							timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false
						});
					} catch {
						teeTimeDisplay = dt.toLocaleTimeString("no-NO", {
							hour: "2-digit", minute: "2-digit", hour12: false
						});
					}
				}
			} else if (typeof rawTeeTime === "string" && rawTeeTime) {
				// May be "8:45 AM" format or ISO
				if (/\d{4}-\d{2}-\d{2}/.test(rawTeeTime)) {
					const dt = new Date(rawTeeTime);
					if (!isNaN(dt.getTime())) {
						teeTimeUTC = dt.toISOString();
						try {
							teeTimeDisplay = dt.toLocaleTimeString("no-NO", {
								timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false
							});
						} catch {
							teeTimeDisplay = dt.toLocaleTimeString("no-NO", {
								hour: "2-digit", minute: "2-digit", hour12: false
							});
						}
					}
				} else {
					teeTimeDisplay = rawTeeTime;
				}
			}

			// Build groupmate names for this group
			const groupPlayerNames = players.map(p => {
				const display = p.displayName || p.playerName || `${p.firstName || ""} ${p.lastName || ""}`.trim();
				return display;
			}).filter(Boolean);

			for (const p of players) {
				const displayName = p.displayName || p.playerName || `${p.firstName || ""} ${p.lastName || ""}`.trim();
				if (!displayName) continue;
				const key = displayName.toLowerCase();
				const groupmates = groupPlayerNames.filter(n => n.toLowerCase() !== key);

				playerTeeTimes.set(key, {
					teeTime: teeTimeDisplay,
					teeTimeUTC,
					startingHole: typeof startTee === "number" ? startTee : parseInt(startTee, 10) || 1,
					courseName,
					groupmates,
				});
			}
		}

		if (playerTeeTimes.size === 0) {
			console.warn("PGA Tour tee-times: Parsed page but 0 player tee times extracted");
			return null;
		}

		console.log(`PGA Tour tee-times loaded: ${tournamentName} round ${currentRound} (${playerTeeTimes.size} players)`);
		return { tournamentName, timezone, playerTeeTimes };
	} catch (err) {
		console.warn(`PGA Tour tee-times scrape failed: ${err.message}`);
		return null;
	}
}

/**
 * Check if two tournament names likely refer to the same event.
 * Requires at least 2 meaningful words in common to avoid false positives
 * (e.g. "Open" matching both "U.S. Open" and "British Open").
 */
function tournamentNameMatches(espnName, pgaName) {
	if (!espnName || !pgaName) return false;
	const stopWords = new Set(["the", "at", "in", "of", "and", "a"]);
	const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/)
		.filter(w => w.length > 1 && !stopWords.has(w));
	const aWords = tokenize(espnName);
	const bWords = new Set(tokenize(pgaName));
	const overlap = aWords.filter(w => bWords.has(w));
	return overlap.length >= 2;
}

/**
 * Given the configured golfer list (filtered by tour) and a PGA Tour field,
 * return only the golfers confirmed in the field.
 */
function filterNorwegiansAgainstField(golfers, pgaField) {
	return golfers.filter(golfer => {
		return pgaField.players.some(p => playerNameMatches(p.displayName, golfer));
	});
}

/**
 * Find a PGA Tour field player matching a golfer config entry.
 */
function findFieldPlayer(golfer, pgaField) {
	return pgaField.players.find(p => playerNameMatches(p.displayName, golfer));
}

/**
 * Build featured groups for Norwegian players.
 * If pgaTeeTimes is available (from /tee-times page), use its real group data.
 * Otherwise fall back to synthetic grouping from pgaField (leaderboard page).
 */
function buildFeaturedGroups(norwegianPlayersList, pgaField, pgaTeeTimes) {
	// Prefer tee-times data (has real groups from the /tee-times page)
	if (pgaTeeTimes?.playerTeeTimes?.size > 0) {
		const featuredGroups = [];
		for (const np of norwegianPlayersList) {
			const info = pgaTeeTimes.playerTeeTimes.get(np.name.toLowerCase());
			if (!info?.teeTime || !info.groupmates?.length) continue;
			featuredGroups.push({
				player: np.name,
				teeTime: info.teeTime,
				groupmates: info.groupmates.map(name => ({ name, teeTime: info.teeTime })),
			});
		}
		return featuredGroups;
	}

	// Fallback: synthetic grouping from leaderboard field
	if (!pgaField?.players?.length) return [];
	const groups = new Map();
	for (const p of pgaField.players) {
		if (!p.teeTime) continue;
		const key = `${p.teeTime}|${p.startingHole || 1}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(p);
	}
	const featuredGroups = [];
	for (const np of norwegianPlayersList) {
		const fieldPlayer = pgaField.players.find(p => playerNameMatches(p.displayName, { name: np.name }));
		if (!fieldPlayer?.teeTime) continue;
		const key = `${fieldPlayer.teeTime}|${fieldPlayer.startingHole || 1}`;
		const group = groups.get(key);
		if (!group || group.length <= 1) continue;
		const groupmates = group
			.filter(p => p.displayName !== fieldPlayer.displayName)
			.map(p => ({ name: p.displayName, teeTime: p.teeTime }));
		if (groupmates.length > 0) {
			featuredGroups.push({ player: np.name, teeTime: np.teeTime, groupmates });
		}
	}
	return featuredGroups;
}

/**
 * Get the tour key used in config for a given tour name.
 */
function tourConfigKey(tourName) {
	if (tourName === "PGA Tour") return "pga";
	if (tourName === "DP World Tour") return "dpWorld";
	return tourName.toLowerCase();
}

export async function fetchGolfESPN() {
	// Get golfers filtered by tour
	const getGolfersForTour = (tourName) => {
		const key = tourConfigKey(tourName);
		return norwegianGolfers.filter(g => g.tours.includes(key));
	};

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
	const seen = new Map();

	// Query every day for next 14 days so we always catch the Thursday
	// start of multi-day tournaments (golf events are Thu-Sun).
	const datesToQuery = [];
	for (let d = 0; d < 14; d++) {
		const date = new Date(now);
		date.setDate(date.getDate() + d);
		datesToQuery.push(date.toISOString().slice(0, 10).replace(/-/g, ''));
	}

	// Fetch PGA Tour field and tee times in parallel
	console.log("Fetching PGA Tour field + tee times for verification...");
	const [pgaField, pgaTeeTimes] = await Promise.allSettled([
		fetchPGATourField(),
		fetchPGATourTeeTimes(),
	]).then(results => results.map(r => r.status === "fulfilled" ? r.value : null));

	if (pgaField) {
		console.log(`PGA Tour field: ${pgaField.tournamentName} (${pgaField.players.length} players)`);
	} else {
		console.warn("PGA Tour field unavailable — tournaments without ESPN field data will be skipped");
	}
	if (pgaTeeTimes) {
		console.log(`PGA Tour tee-times: ${pgaTeeTimes.tournamentName} (${pgaTeeTimes.playerTeeTimes.size} players)`);
	}

	for (const tour of tours) {
		const tourGolfers = getGolfersForTour(tour.name);
		if (tourGolfers.length === 0) {
			console.warn(`No Norwegian golfers configured for ${tour.name}, skipping`);
			continue;
		}

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
							allEvents[idx] = ev;
						}
					}
				} catch (err) {
					console.warn(`${tour.name} date query ${dateStr} failed: ${err.message}`);
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
						allEvents[idx] = ev;
					}
				}
			} catch (err) {
				console.warn(`${tour.name} default query failed: ${err.message}`);
			}

			// Golf tournaments run Thu–Sun (4 days). Allow events that started
			// up to 4 days ago so in-progress tournaments aren't dropped.
			const lookback = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4);
			const events = allEvents
				.filter(e =>
					new Date(e.date) >= lookback &&
					!["STATUS_FINAL"].includes(e.status?.type?.name)
				)
				.sort((a, b) => new Date(a.date) - new Date(b.date))
				.slice(0, 4);

			console.log(`${tour.name}: found ${events.length} upcoming events`);

			for (const ev of events) {
				const competitors = ev.competitions?.[0]?.competitors || [];

				// Find Norwegian players in this tournament via full-name matching
				const norwegianCompetitors = competitors.filter(competitor => {
					const playerName = competitor.athlete?.displayName || "";
					return tourGolfers.some(golfer => playerNameMatches(playerName, golfer));
				});

				const venue = ev.competitions?.[0]?.venue?.fullName ||
					ev.competitions?.[0]?.venue?.address?.city || "TBD";

				if (norwegianCompetitors.length > 0) {
					// Confirmed Norwegian players in field from ESPN
					const isPGATour = tour.name === "PGA Tour";
					const teeTimesMatch = isPGATour && pgaTeeTimes && tournamentNameMatches(ev.name, pgaTeeTimes.tournamentName);
					const fieldMatch = isPGATour && pgaField && tournamentNameMatches(ev.name, pgaField.tournamentName);

					const norwegianPlayersList = norwegianCompetitors.map(comp => {
						const name = comp.athlete?.displayName || "Unknown";
						let teeTime = null;
						let teeTimeUTC = null;
						// Prefer tee-times page (has real tee times during in-progress tournaments)
						if (teeTimesMatch) {
							const info = pgaTeeTimes.playerTeeTimes.get(name.toLowerCase());
							if (info?.teeTime) {
								teeTime = info.teeTime;
								teeTimeUTC = info.teeTimeUTC;
							}
						}
						// Fallback to leaderboard field
						if (!teeTime && fieldMatch) {
							const golfer = tourGolfers.find(g => playerNameMatches(name, g));
							if (golfer) {
								const fieldPlayer = findFieldPlayer(golfer, pgaField);
								if (fieldPlayer?.teeTime) {
									teeTime = fieldPlayer.teeTime;
									teeTimeUTC = fieldPlayer.teeTimeUTC;
								}
							}
						}
						return { name, teeTime, teeTimeUTC, status: comp.status || null };
					});

					console.log(`Found ${norwegianCompetitors.length} Norwegian player(s) in ${ev.name}: ${norwegianPlayersList.map(p => p.name).join(", ")}`);

					const startTime = normalizeToUTC(ev.date);
					// Golf tournaments are multi-day (typically Thu-Sun = 4 days)
					const endDate = new Date(new Date(startTime).getTime() + 3 * 24 * 60 * 60 * 1000);
					endDate.setUTCHours(20, 0, 0, 0);

					const matchedTeeTimes = teeTimesMatch ? pgaTeeTimes : null;
					tournaments.push({
						name: tour.name,
						events: [{
							title: ev.name || "Golf Tournament",
							meta: tour.name,
							tournament: tour.name,
							time: startTime,
							endTime: endDate.toISOString(),
							venue,
							sport: "golf",
							streaming: getNorwegianStreaming("golf", tour.name),
							norwegian: true,
							norwegianPlayers: norwegianPlayersList,
							featuredGroups: (teeTimesMatch || fieldMatch)
								? buildFeaturedGroups(norwegianPlayersList, fieldMatch ? pgaField : null, matchedTeeTimes)
								: [],
							totalPlayers: competitors.length
						}]
					});
				} else if (competitors.length === 0) {
					// Scheduled tournament with no field on ESPN yet — try PGA Tour verification
					const isPGA = tour.name === "PGA Tour";

					if (isPGA && pgaField && tournamentNameMatches(ev.name, pgaField.tournamentName)) {
						const confirmed = filterNorwegiansAgainstField(tourGolfers, pgaField);
						const teeTimesMatch2 = pgaTeeTimes && tournamentNameMatches(ev.name, pgaTeeTimes.tournamentName);
						if (confirmed.length > 0) {
							console.log(`Verified ${confirmed.length} Norwegian player(s) in ${ev.name} via pgatour.com`);
							const startTime2 = normalizeToUTC(ev.date);
							const endDate2 = new Date(new Date(startTime2).getTime() + 3 * 24 * 60 * 60 * 1000);
							endDate2.setUTCHours(20, 0, 0, 0);

							const playersList2 = confirmed.map(golfer => {
								let teeTime = null;
								let teeTimeUTC = null;
								// Prefer tee-times page
								if (teeTimesMatch2) {
									const info = pgaTeeTimes.playerTeeTimes.get(golfer.name.toLowerCase());
									if (info?.teeTime) {
										teeTime = info.teeTime;
										teeTimeUTC = info.teeTimeUTC;
									}
								}
								// Fallback to leaderboard field
								if (!teeTime) {
									const fieldPlayer = findFieldPlayer(golfer, pgaField);
									teeTime = fieldPlayer?.teeTime || null;
									teeTimeUTC = fieldPlayer?.teeTimeUTC || null;
								}
								return { name: golfer.name, teeTime, teeTimeUTC, status: "Confirmed" };
							});

							const matchedTeeTimes2 = teeTimesMatch2 ? pgaTeeTimes : null;
							tournaments.push({
								name: tour.name,
								events: [{
									title: ev.name || "Golf Tournament",
									meta: tour.name,
									tournament: tour.name,
									time: startTime2,
									endTime: endDate2.toISOString(),
									venue,
									sport: "golf",
									streaming: getNorwegianStreaming("golf", tour.name),
									norwegian: true,
									norwegianPlayers: playersList2,
									featuredGroups: buildFeaturedGroups(playersList2, pgaField, matchedTeeTimes2),
									totalPlayers: pgaField.players.length
								}]
							});
						} else {
							console.log(`No Norwegian players in ${ev.name} field (verified via pgatour.com), skipping`);
						}
					} else {
						// Cannot verify Norwegian participation — include as pending so
						// golf.json stays fresh and retainLastGood doesn't trigger
						console.log(`Including ${ev.name} (${tour.name}) with pending field (no ESPN competitors, no PGA Tour match)`);
						const startTime3 = normalizeToUTC(ev.date);
						const endDate3 = new Date(new Date(startTime3).getTime() + 3 * 24 * 60 * 60 * 1000);
						endDate3.setUTCHours(20, 0, 0, 0);
						tournaments.push({
							name: tour.name,
							events: [{
								title: ev.name || "Golf Tournament",
								meta: tour.name,
								tournament: tour.name,
								time: startTime3,
								endTime: endDate3.toISOString(),
								venue,
								sport: "golf",
								streaming: getNorwegianStreaming("golf", tour.name),
								norwegian: false,
								norwegianPlayers: [],
								featuredGroups: [],
								totalPlayers: 0,
								fieldPending: true,
							}]
						});
					}
				}
				// If competitors exist but no Norwegians found, skip silently (not relevant)
			}
		} catch (error) {
			console.warn(`Failed to fetch ${tour.name}: ${error.message}`);
		}
	}

	return {
		lastUpdated: iso(),
		source: "ESPN + PGA Tour",
		tournaments
	};
}

// Exported for testing
export { playerNameMatches, parseTeeTimeToUTC, tournamentNameMatches, filterNorwegiansAgainstField, buildFeaturedGroups, fetchPGATourPage, fetchPGATourTeeTimes };

// Run if executed directly
if (process.argv[1]?.includes('golf.js')) {
	fetchGolfESPN().then(data => {
		console.log(JSON.stringify(data, null, 2));
	}).catch(err => {
		console.error('Error:', err);
		process.exit(1);
	});
}
