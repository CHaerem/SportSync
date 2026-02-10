// Shared sport configuration — single source of truth for sport metadata
// Used by simple-dashboard.js, settings-ui.js, and dashboard-helpers.js

const SPORT_CONFIG = [
	{ id: 'football', emoji: '⚽', name: 'Football', color: '#22c55e' },
	{ id: 'golf', emoji: '⛳', name: 'Golf', color: '#f59e0b' },
	{ id: 'tennis', emoji: '🎾', name: 'Tennis', color: '#3b82f6' },
	{ id: 'formula1', emoji: '🏎️', name: 'F1', color: '#ef4444', aliases: ['f1'] },
	{ id: 'chess', emoji: '♟️', name: 'Chess', color: '#6b7280' },
	{ id: 'esports', emoji: '🎮', name: 'Esports', color: '#8b5cf6' },
	{ id: 'olympics', emoji: '🏅', name: 'Olympics', color: '#0081C8' }
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

// Expose globally for non-module scripts
window.SPORT_CONFIG = SPORT_CONFIG;
window.getSportDisplayName = getSportDisplayName;
window.getSportEmoji = getSportEmoji;
