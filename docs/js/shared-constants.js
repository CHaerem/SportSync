// SportSync Shared Constants & Utilities
// Canonical source of truth for values shared between client (dashboard.js) and server (helpers.js).
// Loaded as the first <script> tag — all symbols are globals.

// ── Time constants ──────────────────────────────────────────────────────────
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

// ── Norwegian context ───────────────────────────────────────────────────────
/** Norwegian clubs that appear in European competitions (ESPN naming) */
const NORWEGIAN_CLUBS = [
	"bodo/glimt", "bodø/glimt", "molde", "rosenborg", "viking",
	"brann", "lillestrøm", "lillestrom", "tromsø", "tromso",
	"vålerenga", "valerenga", "sarpsborg", "odd", "lyn",
];

const UEFA_COMPETITION_CODES = ["uefa.champions", "uefa.europa", "uefa.europa.conf"];

// ── Pure utility functions ──────────────────────────────────────────────────

/** Check if an event overlaps a time window. Handles multi-day events (endTime). */
function isEventInWindow(event, windowStart, windowEnd) {
	if (!event?.time) return false;
	const start = new Date(event.time).getTime();
	const end = event.endTime ? new Date(event.endTime).getTime() : start;
	const ws = windowStart instanceof Date ? windowStart.getTime() : windowStart;
	const we = windowEnd instanceof Date ? windowEnd.getTime() : windowEnd;
	return start < we && end >= ws;
}

/** Check if a football result involves a Norwegian club in a UEFA competition */
function isNoteworthyNorwegianResult(match) {
	const home = (match.homeTeam || "").toLowerCase();
	const away = (match.awayTeam || "").toLowerCase();
	const isNorwegian = NORWEGIAN_CLUBS.some(club => home.includes(club) || away.includes(club));
	if (!isNorwegian) return false;
	const code = (match.leagueCode || "").toLowerCase();
	return UEFA_COMPETITION_CODES.some(comp => code.includes(comp));
}

/** HTML-escape a string (& < > " ') */
function escapeHtml(str) {
	if (typeof str !== 'string') return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/** Strip FC/AFC/CF/FK suffixes and prefixes from team names */
function ssShortName(name) {
	if (!name) return '';
	return name.replace(/ FC$| AFC$| CF$| FK$/i, '').replace(/^FC |^AFC /i, '').trim();
}

/** Fuzzy team name matching (normalize + substring inclusion) */
function ssTeamMatch(a, b) {
	const normalize = s => s.toLowerCase().replace(/ fc$| afc$| cf$| fk$/i, '').replace(/^fc |^afc /i, '').trim();
	return normalize(a) === normalize(b) || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
}

// ── Expose globals ──────────────────────────────────────────────────────────
window.SS_CONSTANTS = Object.freeze({
	MS_PER_MINUTE,
	MS_PER_HOUR,
	MS_PER_DAY,
	NORWEGIAN_CLUBS,
	UEFA_COMPETITION_CODES,
});

window.isEventInWindow = isEventInWindow;
window.isNoteworthyNorwegianResult = isNoteworthyNorwegianResult;
window.escapeHtml = escapeHtml;
window.ssShortName = ssShortName;
window.ssTeamMatch = ssTeamMatch;
