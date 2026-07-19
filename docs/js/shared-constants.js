// Sportivista Shared Constants & Utilities
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

/** The head-to-head matchup names for an event as a PLAIN "A – B" string — when
 *  `participants` is EXACTLY two named sides and there's no home/away pair — else
 *  null. Fires only for two: a golf/CS2 field of four is a tournament, not a
 *  matchup, and keeps its own title. Un-escaped: HTML callers escape the result
 *  (dashboard.js `participantMatchup`), plain-text callers (detail.js share/
 *  report titles) use it directly. Mirrors iOS `AgendaFormat.matchupTitle`. */
function ssParticipantMatchup(e) {
	if (!e || (e.homeTeam && e.awayTeam)) return null;
	const names = (Array.isArray(e.participants) ? e.participants : [])
		.map((p) => (p && p.name) || (typeof p === 'string' ? p : ''))
		.filter(Boolean);
	if (names.length !== 2) return null;
	return `${ssShortName(names[0])} – ${ssShortName(names[1])}`;
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

/** Strip a trailing year / season / parenthetical from a tracked name for a clean
 *  follow ("Tour de France 2026" → "Tour de France"). Mirrors the iOS resolver's
 *  edition-stripping; shared so edit.js and detail.js don't each carry the regex. */
function ssCoreName(name) {
	return String(name).replace(/\s*\d{4}(?:\/\d{2})?/g, '').replace(/\s*\(.*?\)/g, '').trim();
}

/** The next upcoming event for a followed entity, searched across ALL events
 *  (not the agenda window). Sport-scoped so "Barcelona" (football) never matches
 *  a Tour stage through the city; a >3h-old event is treated as over. Returns the
 *  event or null. The ONE next-event matcher shared by the dashboard's «Dette
 *  dekker vi» rows (followed.js) and the rediger page (edit.js) — same word-
 *  boundary term match as the server, so both surfaces answer identically. */
function ssNextEventForEntity(events, entry, now = Date.now()) {
	const terms = trackedTerms([entry]).map((t) => t.toLowerCase()).filter(Boolean);
	if (!terms.length) return null;
	const sport = (entry && typeof entry === 'object') ? entry.sport : null;
	const floor = now - 3 * MS_PER_HOUR;
	let best = null, bestStart = Infinity;
	for (const e of events || []) {
		if (sport && e.sport && e.sport !== sport) continue;
		const start = new Date(e.time).getTime();
		const end = e.endTime ? new Date(e.endTime).getTime() : start;
		if (!(end >= floor)) continue; // already over
		const hay = [e.title, e.tournament, e.homeTeam, e.awayTeam,
			...(e.norwegianPlayers || []).map((p) => p.name || p),
			...(e.participants || []).map((p) => p.name || p)].filter(Boolean).join(' ');
		if (!terms.some((t) => ssContainsTerm(hay, t))) continue;
		if (start < bestStart) { best = e; bestStart = start; }
	}
	return best;
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
window.ssParticipantMatchup = ssParticipantMatchup;
window.ssTeamMatch = ssTeamMatch;
window.ssEntityName = ssEntityName;
window.trackedTerms = trackedTerms;
window.ssContainsTerm = ssContainsTerm;
window.ssNormalize = ssNormalize;
window.ssCoreName = ssCoreName;
window.ssNextEventForEntity = ssNextEventForEntity;
