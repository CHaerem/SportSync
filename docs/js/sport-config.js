// Shared sport configuration — single source of truth for sport metadata
// Used by simple-dashboard.js, settings-ui.js, and dashboard-helpers.js

const SPORT_CONFIG = [
	{ id: 'football', emoji: '⚽', name: 'Football', color: '#2d8a4e' },
	{ id: 'golf', emoji: '⛳', name: 'Golf', color: '#c4920a' },
	{ id: 'tennis', emoji: '🎾', name: 'Tennis', color: '#2563eb' },
	{ id: 'formula1', emoji: '🏎️', name: 'F1', color: '#dc2626', aliases: ['f1'] },
	{ id: 'chess', emoji: '♟️', name: 'Chess', color: '#57534e' },
	{ id: 'esports', emoji: '🎮', name: 'Esports', color: '#7c3aed' },
	{ id: 'olympics', emoji: '🏅', name: 'Olympics', color: '#0070b8' }
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
