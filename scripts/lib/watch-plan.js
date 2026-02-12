const PLAN_WINDOWS_MINUTES = [30, 60, 120];
const MAX_WINDOW_ITEMS = 3;
const MAX_PICKS = 3;

function normalize(value) {
	return typeof value === "string" ? value.toLowerCase().trim() : "";
}

function containsAny(haystack, needles) {
	const source = normalize(haystack);
	if (!source || !Array.isArray(needles)) return false;
	return needles.some((needle) => {
		const n = normalize(needle);
		return n && source.includes(n);
	});
}

function startsInMinutes(isoTime, now) {
	const deltaMs = new Date(isoTime).getTime() - now.getTime();
	return Math.round(deltaMs / 60000);
}

function formatOsloTime(isoTime) {
	const d = new Date(isoTime);
	return d.toLocaleString("en-NO", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/Oslo",
	});
}

function relativeStartLabel(minutes) {
	if (minutes < -10) return "Started";
	if (minutes <= 10) return "Live now";
	if (minutes < 60) return `In ${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rem = minutes % 60;
	return rem > 0 ? `In ${hours}h ${rem}m` : `In ${hours}h`;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function toImportance(event) {
	const importance = typeof event.importance === "number" ? event.importance : 2;
	return clamp(Math.round(importance), 1, 5);
}

function getSportPreferenceWeight(event, userContext) {
	const prefs = userContext?.sportPreferences || {};
	const pref = prefs[event.sport] || prefs[event.sport === "formula1" ? "f1" : event.sport];
	if (pref === "high") return 8;
	if (pref === "medium") return 3;
	if (pref === "low") return -6;
	return 0;
}

export function scoreEventForWatchPlan(event, now, userContext = {}) {
	const minutes = startsInMinutes(event.time, now);
	const importance = toImportance(event);
	let score = importance * 18;
	const reasons = [];

	if (event.norwegian) {
		score += 14;
		reasons.push("Norwegian interest");
	}

	if (minutes <= 120 && minutes >= -30) {
		score += 14;
		reasons.push("Starting soon");
	} else if (minutes <= 360 && minutes > 120) {
		score += 8;
	}

	if (containsAny(event.homeTeam, userContext.favoriteTeams) || containsAny(event.awayTeam, userContext.favoriteTeams)) {
		score += 18;
		reasons.push("Favorite team");
	}

	if (
		Array.isArray(event.norwegianPlayers) &&
		event.norwegianPlayers.some((player) => containsAny(player?.name, userContext.favoritePlayers))
	) {
		score += 18;
		reasons.push("Favorite player");
	}

	if (containsAny(event.title, userContext.favoriteEsportsOrgs)) {
		score += 12;
		reasons.push("Favorite org");
	}

	if (Array.isArray(event.tags) && event.tags.includes("must-watch")) {
		score += 10;
		reasons.push("Must-watch");
	}

	score += getSportPreferenceWeight(event, userContext);
	return { score, minutes, reasons };
}

function toPlanItem(event, scored) {
	return {
		id: `${event.sport}-${event.title}-${event.time}`.replace(/\s+/g, "-").toLowerCase(),
		title: event.title,
		sport: event.sport,
		tournament: event.tournament || "",
		time: event.time,
		timeLabel: formatOsloTime(event.time),
		relativeStart: relativeStartLabel(scored.minutes),
		importance: toImportance(event),
		norwegian: !!event.norwegian,
		streaming: Array.isArray(event.streaming) ? event.streaming.slice(0, 2) : [],
		score: Math.round(scored.score),
		reasons: scored.reasons.slice(0, 2),
	};
}

function extractHeadline(featured) {
	if (!Array.isArray(featured?.blocks)) return "Your AI-ranked watch plan";
	const headlineBlock = featured.blocks.find((b) => b.type === "headline");
	if (headlineBlock?.text) return headlineBlock.text;
	const eventLine = featured.blocks.find((b) => b.type === "event-line");
	if (eventLine?.text) return eventLine.text;
	return "Your AI-ranked watch plan";
}

export function buildWatchPlan(events = [], { now = new Date(), userContext = {}, featured = null } = {}) {
	const upcoming = (Array.isArray(events) ? events : [])
		.filter((event) => event?.time && Number.isFinite(new Date(event.time).getTime()))
		.map((event) => ({ event, scored: scoreEventForWatchPlan(event, now, userContext) }))
		.filter(({ scored }) => scored.minutes >= -90 && scored.minutes <= 24 * 60)
		.sort((a, b) => b.scored.score - a.scored.score || new Date(a.event.time) - new Date(b.event.time));

	const windows = PLAN_WINDOWS_MINUTES.map((windowMinutes) => {
		const items = upcoming
			.filter(({ scored }) => scored.minutes >= -30 && scored.minutes <= windowMinutes)
			.slice(0, MAX_WINDOW_ITEMS)
			.map(({ event, scored }) => toPlanItem(event, scored));

		return {
			id: `next-${windowMinutes}`,
			label: `Next ${windowMinutes} min`,
			windowMinutes,
			items,
		};
	});

	const picks = upcoming
		.slice(0, MAX_PICKS)
		.map(({ event, scored }) => toPlanItem(event, scored));

	const nonEmptyWindows = windows.filter((window) => window.items.length > 0).length;
	const summary =
		picks.length === 0
			? "No high-priority events in the next 24 hours."
			: `${picks.length} priority picks across ${nonEmptyWindows || 1} watch window${nonEmptyWindows === 1 ? "" : "s"}.`;

	return {
		generatedAt: now.toISOString(),
		timezone: "Europe/Oslo",
		summary,
		headline: extractHeadline(featured),
		windows,
		picks,
	};
}
