// Shared sport configuration — single source of truth for sport metadata
// Used by simple-dashboard.js, settings-ui.js, and dashboard-helpers.js

const SPORT_CONFIG = [
	{ id: 'football', emoji: '⚽', name: 'Football', color: '#2d8a4e' },
	{ id: 'golf', emoji: '⛳', name: 'Golf', color: '#c4920a' },
	{ id: 'tennis', emoji: '🎾', name: 'Tennis', color: '#2563eb' },
	{ id: 'formula1', emoji: '🏎️', name: 'F1', color: '#dc2626', aliases: ['f1'] },
	{ id: 'chess', emoji: '♟️', name: 'Chess', color: '#57534e' },
	{ id: 'esports', emoji: '🎮', name: 'Esports', color: '#7c3aed' },
	{ id: 'cycling', emoji: '🚴', name: 'Cycling', color: '#b45309', aliases: ['cycling', 'road cycling', 'classics', 'tour'] }
];

// Lookup helpers
function getSportDisplayName(code) {
	const sport = SPORT_CONFIG.find(s => s.id === code || (s.aliases && s.aliases.includes(code)));
	return sport ? `${sport.emoji} ${sport.name}` : code;
}

function getSportEmoji(code) {
	const sport = SPORT_CONFIG.find(s => s.id === code || (s.aliases && s.aliases.includes(code)));
	return sport ? sport.emoji : '🏆';
}

/**
 * Normalize a pipeline/event sport ID to the canonical client ID.
 * e.g. 'f1' → 'formula1' (using the aliases field in SPORT_CONFIG).
 * Passes through unknown IDs unchanged.
 */
function normalizeClientSportId(id) {
	if (!id) return id;
	// Already a canonical ID?
	if (SPORT_CONFIG.find(s => s.id === id)) return id;
	// Check aliases
	const sport = SPORT_CONFIG.find(s => s.aliases && s.aliases.includes(id));
	return sport ? sport.id : id;
}

/**
 * Convert a canonical client sport ID back to the pipeline short form.
 * e.g. 'formula1' → 'f1'. Returns the first alias if available.
 * Passes through unknown IDs unchanged.
 */
function normalizePipelineSportId(id) {
	if (!id) return id;
	const sport = SPORT_CONFIG.find(s => s.id === id && s.aliases && s.aliases.length);
	return sport ? sport.aliases[0] : id;
}

// Expose globally for non-module scripts
window.SPORT_CONFIG = SPORT_CONFIG;
window.getSportDisplayName = getSportDisplayName;
window.getSportEmoji = getSportEmoji;
window.normalizeClientSportId = normalizeClientSportId;
window.normalizePipelineSportId = normalizePipelineSportId;
