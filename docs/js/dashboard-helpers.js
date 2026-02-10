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
