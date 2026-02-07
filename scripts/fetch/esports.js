import { fetchJson, iso, normalizeToUTC } from "../lib/helpers.js";

// Esports integration for CS2: 100 Thieves (rain) tracking.
// Primary: PandaScore API (free tier, needs PANDASCORE_API_KEY)
// Fallback: HLTV community API (may have stale data)

const TRACKED_ALIASES = ["100 thieves", "100t"];

function isTrackedTeam(teamName) {
	return TRACKED_ALIASES.some(alias => (teamName || "").toLowerCase().includes(alias));
}

// Filter events to current week only
function filterCurrentWeek(events) {
	const now = new Date();
	const startOfWeek = new Date(now);
	startOfWeek.setDate(now.getDate() - now.getDay());
	startOfWeek.setHours(0, 0, 0, 0);

	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 7);

	return events.filter(event => {
		const eventDate = new Date(event.time);
		return eventDate >= startOfWeek && eventDate < endOfWeek;
	});
}

// ─── PandaScore API (primary source) ────────────────────────────
// Free tier: 1000 requests/hour. Sign up at pandascore.co (no credit card)
// Set PANDASCORE_API_KEY as env var or GitHub secret

async function fetchFromPandaScore() {
	const apiKey = process.env.PANDASCORE_API_KEY;
	if (!apiKey) {
		console.log("PANDASCORE_API_KEY not set, skipping PandaScore");
		return null;
	}

	const events = [];

	try {
		// Fetch upcoming CS2 matches
		const upcoming = await fetchJson(
			`https://api.pandascore.co/cs2/matches/upcoming?per_page=50&token=${apiKey}`,
			{ retries: 2 }
		);

		if (!Array.isArray(upcoming)) {
			console.warn("PandaScore upcoming response is not an array");
			return null;
		}

		console.log(`PandaScore: ${upcoming.length} upcoming CS2 matches`);

		// Find tournaments where 100 Thieves is playing
		const trackedTournaments = new Set();
		for (const match of upcoming) {
			const opponents = match.opponents || [];
			for (const opp of opponents) {
				const teamName = opp.opponent?.name || "";
				if (isTrackedTeam(teamName)) {
					const tournamentName = match.tournament?.name || match.league?.name || "";
					if (tournamentName) trackedTournaments.add(tournamentName);
				}
			}
		}

		console.log("PandaScore: 100 Thieves tournaments:", Array.from(trackedTournaments));

		// Get all matches from those tournaments (full tournament context)
		for (const match of upcoming) {
			const tournamentName = match.tournament?.name || match.league?.name || "";
			const opponents = match.opponents || [];
			const team1 = opponents[0]?.opponent?.name || "TBD";
			const team2 = opponents[1]?.opponent?.name || "TBD";

			const isInTrackedTournament = trackedTournaments.has(tournamentName);
			const isDirectMatch = isTrackedTeam(team1) || isTrackedTeam(team2);

			if (!isInTrackedTournament && !isDirectMatch) continue;

			events.push({
				title: `${team1} vs ${team2}`,
				meta: tournamentName || "CS2 Match",
				time: normalizeToUTC(match.begin_at || match.scheduled_at),
				venue: match.tournament?.slug ? "LAN" : "Online",
				sport: "esports",
				streaming: match.streams_list
					? match.streams_list.slice(0, 2).map(s => ({
						platform: s.language === "en" ? "Main Stream" : s.language,
						url: s.raw_url || "",
						type: "twitch",
					}))
					: [{ platform: "Twitch", url: "https://twitch.tv", type: "twitch" }],
				norwegian: isDirectMatch, // rain (Norwegian) on 100 Thieves
				tournament: tournamentName || "CS2 Tournament",
			});
		}

		// Also fetch running matches
		try {
			const running = await fetchJson(
				`https://api.pandascore.co/cs2/matches/running?token=${apiKey}`,
				{ retries: 1 }
			);
			if (Array.isArray(running)) {
				for (const match of running) {
					const opponents = match.opponents || [];
					const team1 = opponents[0]?.opponent?.name || "TBD";
					const team2 = opponents[1]?.opponent?.name || "TBD";
					if (isTrackedTeam(team1) || isTrackedTeam(team2)) {
						const tournamentName = match.tournament?.name || match.league?.name || "";
						events.push({
							title: `LIVE: ${team1} vs ${team2}`,
							meta: tournamentName || "CS2 Match",
							time: normalizeToUTC(match.begin_at || new Date().toISOString()),
							venue: "Online",
							sport: "esports",
							streaming: [{ platform: "Twitch", url: "https://twitch.tv", type: "twitch" }],
							norwegian: true,
							tournament: tournamentName || "CS2 Tournament",
						});
					}
				}
			}
		} catch (err) {
			console.warn("PandaScore running matches failed:", err.message);
		}

		console.log(`PandaScore: ${events.length} relevant events`);
		return events;
	} catch (err) {
		console.error("PandaScore fetch failed:", err.message);
		return null;
	}
}

// ─── HLTV Community API (fallback) ──────────────────────────────
// NOTE: This API may have stale data. Use as fallback only.

async function fetchFromHLTV() {
	const HLTV_UPCOMING = "https://hltv-api.vercel.app/api/matches.json";
	const events = [];

	try {
		console.log("Trying HLTV community API as fallback...");
		const data = await fetchJson(HLTV_UPCOMING, { retries: 1 });

		if (!Array.isArray(data) || data.length === 0) {
			console.warn("HLTV API returned no data");
			return null;
		}

		// Check data freshness — if newest match is more than 30 days old, data is stale
		const newest = data.reduce((max, m) => {
			const t = new Date(m.time || m.date || 0).getTime();
			return t > max ? t : max;
		}, 0);
		const daysSinceNewest = (Date.now() - newest) / (1000 * 60 * 60 * 24);
		if (daysSinceNewest > 30) {
			console.warn(`HLTV data is stale (newest match is ${Math.round(daysSinceNewest)} days old)`);
			return null;
		}

		console.log(`HLTV: ${data.length} matches, newest is ${Math.round(daysSinceNewest)} days ago`);

		// Find 100 Thieves tournaments
		const trackedEvents = new Set();
		for (const m of data) {
			const teams = m.teams || [];
			const team1 = teams[0]?.name || "";
			const team2 = teams[1]?.name || "";
			if (isTrackedTeam(team1) || isTrackedTeam(team2)) {
				const eventName = m.event?.name || "";
				if (eventName) trackedEvents.add(eventName);
			}
		}

		// Get matches from tracked tournaments
		const now = Date.now();
		for (const m of data) {
			const eventName = m.event?.name || "";
			if (!trackedEvents.has(eventName)) continue;
			const matchTime = new Date(m.time || m.date);
			if (matchTime.getTime() <= now) continue;

			const teams = m.teams || [];
			const team1 = teams[0]?.name || "TBD";
			const team2 = teams[1]?.name || "TBD";

			events.push({
				title: `${team1} vs ${team2}`,
				meta: eventName || "CS2 Match",
				time: normalizeToUTC(m.time || m.date),
				venue: "Online",
				sport: "esports",
				streaming: [{ platform: "Twitch", url: "https://twitch.tv", type: "twitch" }],
				norwegian: isTrackedTeam(team1) || isTrackedTeam(team2),
				tournament: eventName || "CS2 Tournament",
			});
		}

		return events.length > 0 ? events : null;
	} catch (err) {
		console.warn("HLTV community API failed:", err.message);
		return null;
	}
}

// ─── Main export ────────────────────────────────────────────────

export async function fetchEsports() {
	// Try PandaScore first (reliable, needs API key)
	let events = await fetchFromPandaScore();

	// Fallback to HLTV community API
	if (!events || events.length === 0) {
		events = await fetchFromHLTV();
	}

	if (!events || events.length === 0) {
		console.log("No esports events found from any source.");
		if (!process.env.PANDASCORE_API_KEY) {
			console.log("Tip: Set PANDASCORE_API_KEY env var for reliable CS2 data (free at pandascore.co)");
		}
		return {
			lastUpdated: iso(),
			source: "No data available",
			tournaments: [],
		};
	}

	const filtered = filterCurrentWeek(events);
	console.log(`Esports: ${filtered.length} events this week (${events.length} total)`);

	return {
		lastUpdated: iso(),
		source: process.env.PANDASCORE_API_KEY ? "PandaScore API" : "HLTV community API",
		tournaments: filtered.length ? [{ name: "CS2 Focus", events: filtered }] : [],
	};
}
