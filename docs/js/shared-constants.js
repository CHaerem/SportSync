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

/**
 * Extract aggregate-score context from a knockout football meta string.
 * Recognizes patterns like:
 *   "Champions League • 2nd Leg - Atlético Madrid lead 2-0 on aggregate"
 *   "Semi-final 2nd Leg • Tied 1-1 on aggregate"
 *   "Agg. 0-2" / "2-0 agg"
 * Returns { score: "2-0", label: "AGG", leader: "Atlético Madrid"|null } or null.
 */
function ssExtractAggregate(meta) {
	if (!meta || typeof meta !== 'string') return null;
	// Pattern 1: "<team> lead|lead by <X>-<Y> on aggregate" — richest context.
	// Anchor from a separator (-, en/em dash, •, :) or start-of-string so we don't scoop
	// up context prefixes like "Champions League • 2nd Leg - " into the leader name.
	let m = meta.match(/(?:^|[-\u2013\u2014\u00B7:]\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\- ]*?)\s+lead(?:s)?(?:\s+by)?\s+(\d+-\d+)\s+on\s+aggregate/i);
	if (m) return { score: m[2].trim(), label: 'AGG', leader: m[1].trim() };
	// Pattern 2: "Tied <X>-<Y> on aggregate"
	m = meta.match(/tied\s+(\d+-\d+)\s+on\s+aggregate/i);
	if (m) return { score: m[1].trim(), label: 'AGG', leader: null, tied: true };
	// Pattern 3: "<X>-<Y> on aggregate" (no leader specified)
	m = meta.match(/(\d+-\d+)\s+on\s+aggregate/i);
	if (m) return { score: m[1].trim(), label: 'AGG', leader: null };
	// Pattern 4: "Agg. <X>-<Y>" or "<X>-<Y> agg"
	m = meta.match(/agg\.?\s+(\d+-\d+)/i) || meta.match(/(\d+-\d+)\s+agg\b/i);
	if (m) return { score: m[1].trim(), label: 'AGG', leader: null };
	return null;
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
window.ssExtractAggregate = ssExtractAggregate;
