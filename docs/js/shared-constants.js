// Zenji Shared Constants & Utilities
// Canonical source of truth for values shared between client (dashboard.js) and server (helpers.js).
// Loaded as the first <script> tag — all symbols are globals.

// ── Repo ────────────────────────────────────────────────────────────────────
// The ONE repo slug — used for issue/PR deep links on all pages.
const SS_REPO = 'CHaerem/sportivista';

// ── Time constants ──────────────────────────────────────────────────────────
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

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

/** Display name of an alwaysTrack entry (bare string or {name, aliases} object). */
function ssEntityName(entry) {
	return typeof entry === 'string' ? entry : (entry && entry.name) || '';
}

/** Flatten alwaysTrack entries into match terms (name + aliases), string or object. */
function trackedTerms(entries) {
	const out = [];
	for (const e of entries || []) {
		if (typeof e === 'string') { if (e) out.push(e); }
		else if (e && e.name) {
			out.push(e.name);
			if (Array.isArray(e.aliases)) for (const a of e.aliases) if (a) out.push(a);
		}
	}
	return out;
}

/** Lowercase + strip diacritics (mirrors the server's normalizeText). */
function ssNormalize(s) {
	return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Word-boundary, accent-insensitive containment (mirrors server containsName). */
function ssContainsTerm(haystack, term) {
	const n = ssNormalize(term).trim();
	if (!n) return false;
	const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc}(?:[^\\p{L}\\p{N}]|$)`, 'iu').test(ssNormalize(haystack));
}

/** Trim an agent reason to a one-line gist (drops the provenance prefix). */
function ssShortReason(r, max = 130) {
	if (!r) return '';
	let s = String(r).replace(/^\s*(alwaysTrack\.\w+\.?|interests\.json#\S+)\s*/i, '').replace(/^[,.\s]+/, '').trim();
	if (s.length > max) s = s.slice(0, max - 2).replace(/\s+\S*$/, '') + '…';
	return s;
}

// ── Expose globals ──────────────────────────────────────────────────────────
window.SS_CONSTANTS = Object.freeze({
	MS_PER_MINUTE,
	MS_PER_HOUR,
	MS_PER_DAY,
});

window.SS_REPO = SS_REPO;
window.isEventInWindow = isEventInWindow;
window.ssShortReason = ssShortReason;
window.escapeHtml = escapeHtml;
window.ssShortName = ssShortName;
window.ssTeamMatch = ssTeamMatch;
window.ssEntityName = ssEntityName;
window.trackedTerms = trackedTerms;
window.ssContainsTerm = ssContainsTerm;
window.ssNormalize = ssNormalize;
