// Pure utility functions extracted from SimpleSportsDashboard for testability

export function escapeHtml(unsafe) {
	if (typeof unsafe !== "string") return "";
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function formatEventTime(timeString) {
	if (!timeString) return "TBD";
	const date = new Date(timeString);
	return date.toLocaleTimeString("en-NO", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/Oslo",
	});
}

export function getRelativeTime(timeString, now = new Date()) {
	if (!timeString) return "Soon";
	const eventTime = new Date(timeString);
	const diffMs = eventTime - now;
	const diffHours = diffMs / (1000 * 60 * 60);
	const diffDays = diffMs / (1000 * 60 * 60 * 24);

	if (diffHours < 0) return "Started";
	if (diffHours < 1) {
		const mins = Math.round(diffHours * 60);
		return mins < 5 ? "Starting now" : `In ${mins} min`;
	}
	if (diffHours < 24) {
		const hours = Math.round(diffHours);
		return hours === 1 ? "In 1 hour" : `In ${hours} hours`;
	}
	if (diffDays < 2) return "Tomorrow";
	if (diffDays < 7) {
		return eventTime.toLocaleDateString('en-US', { weekday: 'long' });
	}
	return `In ${Math.round(diffDays)} days`;
}

// Canonical sport config — shared with sport-config.js at runtime
export const SPORT_CONFIG = [
	{ id: 'football', emoji: '⚽', name: 'Football', color: '#22c55e' },
	{ id: 'golf', emoji: '⛳', name: 'Golf', color: '#f59e0b' },
	{ id: 'tennis', emoji: '🎾', name: 'Tennis', color: '#3b82f6' },
	{ id: 'formula1', emoji: '🏎️', name: 'F1', color: '#ef4444', aliases: ['f1'] },
	{ id: 'chess', emoji: '♟️', name: 'Chess', color: '#6b7280' },
	{ id: 'esports', emoji: '🎮', name: 'Esports', color: '#8b5cf6' }
];

export function sportDisplayName(code) {
	const sport = SPORT_CONFIG.find(s => s.id === code || (s.aliases && s.aliases.includes(code)));
	return sport ? `${sport.emoji} ${sport.name}` : code;
}

export function getAbbreviatedTeamName(teamName) {
	if (!teamName) return '';
	const cleaned = teamName
		.replace(/ FC$/i, '')
		.replace(/ FK$/i, '')
		.replace(/ IF$/i, '')
		.replace(/ IL$/i, '')
		.replace(/ BK$/i, '')
		.replace(/ SK$/i, '')
		.replace(/ CF$/i, '')
		.replace(/ AFC$/i, '')
		.replace(/ United$/i, ' Utd')
		.replace(/^FC /i, '')
		.replace(/^AFC /i, '');

	if (cleaned.length > 12) {
		if (cleaned.includes(' & ') || cleaned.includes(' and ')) {
			return cleaned.split(/\s+[&]\s+|\s+and\s+/)[0];
		}
		const words = cleaned.split(' ');
		if (words[0].length >= 4) {
			return words[0];
		}
		return words.slice(0, 2).join(' ');
	}
	return cleaned;
}

export function truncateTitle(title, maxLength) {
	if (title.length <= maxLength) return title;
	return title.substring(0, maxLength - 3) + '...';
}

export function passesFilter(event, { currentFilter, selectedSports, preferences, isFavoriteEvent }) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const weekEnd = new Date(today);
	weekEnd.setDate(today.getDate() + 7);
	const eventDate = new Date(event.time);

	const eventId = `${event.sport}-${event.title}-${event.time}`.replace(/\s+/g, '-').toLowerCase();

	let passesTimeFilter = false;
	switch (currentFilter) {
		case "all":
			passesTimeFilter = true;
			break;
		case "today":
			passesTimeFilter = eventDate >= today && eventDate < tomorrow;
			break;
		case "week":
			passesTimeFilter = eventDate >= today && eventDate < weekEnd;
			break;
		case "favorites":
			if (preferences) {
				passesTimeFilter = preferences.isEventFavorite(event, eventId);
			} else if (isFavoriteEvent) {
				passesTimeFilter = isFavoriteEvent(event);
			}
			break;
		default:
			passesTimeFilter = true;
	}

	if (!passesTimeFilter) return false;

	if (selectedSports.size === 0) return true;

	return selectedSports.has("golf") && event.sport === "golf" ||
		selectedSports.has("football") && event.sport === "football" ||
		selectedSports.has("tennis") && event.sport === "tennis" ||
		selectedSports.has("formula1") && (event.sport === "f1" || event.sport === "formula1") ||
		selectedSports.has("chess") && event.sport === "chess" ||
		selectedSports.has("esports") && event.sport === "esports";
}

export function isFavoriteEvent(event) {
	if (event.sport === "football") {
		const title = event.title.toLowerCase();
		const homeTeam = event.homeTeam?.toLowerCase() || "";
		const awayTeam = event.awayTeam?.toLowerCase() || "";

		const isBarca = title.includes("barcelona") || title.includes("barça") ||
			homeTeam.includes("barcelona") || awayTeam.includes("barcelona");
		const isLiverpool = title.includes("liverpool") ||
			homeTeam.includes("liverpool") || awayTeam.includes("liverpool");
		const isLyn = title.includes("lyn") ||
			homeTeam.includes("lyn") || awayTeam.includes("lyn");

		return isBarca || isLiverpool || isLyn;
	}

	if (event.sport === "esports") {
		const title = event.title.toLowerCase();
		return title.includes("100 thieves") || title.includes("100t");
	}

	if (event.sport === "golf") {
		return event.norwegian === true && event.norwegianPlayers && event.norwegianPlayers.length > 0;
	}

	return false;
}

// --- New helpers for redesigned dashboard ---

export function getCountdown(isoTime, now = new Date()) {
	if (!isoTime) return '';
	const target = new Date(isoTime);
	const diffMs = target - now;
	if (diffMs <= 0) return 'Live';
	const mins = Math.floor(diffMs / 60000);
	const hours = Math.floor(mins / 60);
	const days = Math.floor(hours / 24);
	if (days > 0) return `In ${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${mins % 60}m`;
	return `${mins}m`;
}

export function generateBrief(events, now = new Date()) {
	if (!events || events.length === 0) return '';

	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart);
	todayEnd.setDate(todayEnd.getDate() + 1);

	const todayEvents = events.filter(e => {
		const t = new Date(e.time);
		return t >= todayStart && t < todayEnd;
	});

	if (todayEvents.length === 0) return 'No events scheduled today.';

	// Count by sport
	const sportCounts = {};
	const sportEmojiMap = {};
	SPORT_CONFIG.forEach(s => {
		sportEmojiMap[s.id] = s.emoji;
		if (s.aliases) s.aliases.forEach(a => { sportEmojiMap[a] = s.emoji; });
	});

	todayEvents.forEach(e => {
		const key = e.sport === 'f1' ? 'formula1' : e.sport;
		sportCounts[key] = (sportCounts[key] || 0) + 1;
	});

	const parts = [];
	const sportNames = { football: 'football', golf: 'golf', tennis: 'tennis', formula1: 'F1', chess: 'chess', esports: 'esports' };

	for (const [sport, count] of Object.entries(sportCounts)) {
		const name = sportNames[sport] || sport;
		parts.push(`${count} ${name}${count > 1 ? '' : ''} event${count > 1 ? 's' : ''}`);
	}

	// Find the soonest upcoming event
	const upcoming = todayEvents
		.filter(e => new Date(e.time) > now)
		.sort((a, b) => new Date(a.time) - new Date(b.time))[0];

	let nextUp = '';
	if (upcoming) {
		const time = new Date(upcoming.time).toLocaleTimeString('en-NO', {
			hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo'
		});
		nextUp = ` Next up: ${upcoming.title} at ${time}.`;
	}

	if (todayEvents.length <= 2) {
		return `Quiet day \u2014 ${parts.join(' and ')}.${nextUp}`;
	}

	return `${todayEvents.length} events today: ${parts.join(', ')}.${nextUp}`;
}

export function groupEventsByTemporalBand(events, now = new Date()) {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrowStart = new Date(todayStart);
	tomorrowStart.setDate(tomorrowStart.getDate() + 1);
	const tomorrowEnd = new Date(tomorrowStart);
	tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
	const weekEnd = new Date(todayStart);
	weekEnd.setDate(weekEnd.getDate() + 7);

	const bands = { today: [], tomorrow: [], thisWeek: [], later: [] };

	events.forEach(event => {
		const t = new Date(event.time);
		if (t < todayStart) return; // skip past events (more than a day old)
		if (t < tomorrowStart) bands.today.push(event);
		else if (t < tomorrowEnd) bands.tomorrow.push(event);
		else if (t < weekEnd) bands.thisWeek.push(event);
		else bands.later.push(event);
	});

	return bands;
}

export function groupByTournament(events) {
	const map = {};
	events.forEach(event => {
		const key = event.tournament || event.title;
		if (!map[key]) {
			map[key] = { tournament: key, sport: event.sport, events: [] };
		}
		map[key].events.push(event);
	});

	return Object.values(map).sort((a, b) => {
		const aTime = new Date(a.events[0].time);
		const bTime = new Date(b.events[0].time);
		return aTime - bTime;
	});
}

export function extractFeaturedContext(events) {
	if (!events || events.length === 0) return null;
	const contextEvents = events.filter(e => e.context);
	if (contextEvents.length === 0) return null;

	// Group by context
	const contexts = {};
	contextEvents.forEach(e => {
		if (!contexts[e.context]) {
			contexts[e.context] = { name: e.context, events: [] };
		}
		contexts[e.context].events.push(e);
	});

	// Return the context with the most events
	const best = Object.values(contexts).sort((a, b) => b.events.length - a.events.length)[0];

	// Format the name nicely
	const nameMap = {
		'olympics-2028': { name: 'Olympics 2028', emoji: '🇳🇴' },
		'world-cup-2026': { name: 'World Cup 2026', emoji: '🏆' },
	};

	const mapped = nameMap[best.name] || { name: best.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), emoji: '🌍' };

	return {
		id: best.name,
		name: mapped.name,
		emoji: mapped.emoji,
		events: best.events.sort((a, b) => new Date(a.time) - new Date(b.time))
	};
}
