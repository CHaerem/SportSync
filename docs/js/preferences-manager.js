/**
 * PreferencesManager - Handles user preferences for SportSync
 * Stores and retrieves user settings from localStorage
 */
class PreferencesManager {
	constructor() {
		this.STORAGE_KEY = 'sportSync.preferences';
		this.VERSION = '1.0';
		this.preferences = this.load();
	}

	getDefaults() {
		return {
			version: this.VERSION,
			sports: {
				football: true,
				tennis: true,
				golf: true,
				formula1: true,
				chess: true,
				esports: true
			},
			teams: {
				football: [],
				esports: []
			},
			players: {
				tennis: [],
				golf: [],
				chess: []
			},
			leagues: {
				football: ['Premier League', 'La Liga', 'Eliteserien'],
				golf: ['PGA Tour', 'DP World Tour']
			},
			display: {
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				language: navigator.language || 'en',
				theme: 'auto',
				compactMode: false,
				showPastEvents: false,
				maxEventsPerSport: 10
			},
			notifications: {
				enabled: false,
				beforeMinutes: 15,
				favoriteOnly: true
			},
			lastModified: new Date().toISOString(),
			firstVisit: new Date().toISOString()
		};
	}

	load() {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			if (!stored) {
				return this.getDefaults();
			}

			const parsed = JSON.parse(stored);
			
			// Migrate old versions if needed
			if (parsed.version !== this.VERSION) {
				return this.migrate(parsed);
			}

			// Merge with defaults to ensure all properties exist
			return this.mergeWithDefaults(parsed);
		} catch (error) {
			console.error('Failed to load preferences:', error);
			return this.getDefaults();
		}
	}

	save(preferences) {
		try {
			this.preferences = {
				...preferences,
				lastModified: new Date().toISOString()
			};
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.preferences));
			this.notifyChange();
			return true;
		} catch (error) {
			console.error('Failed to save preferences:', error);
			return false;
		}
	}

	get() {
		return this.preferences;
	}

	set(path, value) {
		const keys = path.split('.');
		let obj = this.preferences;
		
		for (let i = 0; i < keys.length - 1; i++) {
			if (!obj[keys[i]]) {
				obj[keys[i]] = {};
			}
			obj = obj[keys[i]];
		}
		
		obj[keys[keys.length - 1]] = value;
		return this.save(this.preferences);
	}

	addTeam(sport, team) {
		if (!this.preferences.teams[sport]) {
			this.preferences.teams[sport] = [];
		}
		if (!this.preferences.teams[sport].includes(team)) {
			this.preferences.teams[sport].push(team);
			return this.save(this.preferences);
		}
		return false;
	}

	removeTeam(sport, team) {
		if (this.preferences.teams[sport]) {
			const index = this.preferences.teams[sport].indexOf(team);
			if (index > -1) {
				this.preferences.teams[sport].splice(index, 1);
				return this.save(this.preferences);
			}
		}
		return false;
	}

	addPlayer(sport, player) {
		if (!this.preferences.players[sport]) {
			this.preferences.players[sport] = [];
		}
		if (!this.preferences.players[sport].includes(player)) {
			this.preferences.players[sport].push(player);
			return this.save(this.preferences);
		}
		return false;
	}

	removePlayer(sport, player) {
		if (this.preferences.players[sport]) {
			const index = this.preferences.players[sport].indexOf(player);
			if (index > -1) {
				this.preferences.players[sport].splice(index, 1);
				return this.save(this.preferences);
			}
		}
		return false;
	}

	toggleSport(sport) {
		this.preferences.sports[sport] = !this.preferences.sports[sport];
		return this.save(this.preferences);
	}

	reset() {
		this.preferences = this.getDefaults();
		return this.save(this.preferences);
	}

	export() {
		return JSON.stringify(this.preferences, null, 2);
	}

	import(jsonString) {
		try {
			const imported = JSON.parse(jsonString);
			this.preferences = this.mergeWithDefaults(imported);
			return this.save(this.preferences);
		} catch (error) {
			console.error('Failed to import preferences:', error);
			return false;
		}
	}

	mergeWithDefaults(preferences) {
		const defaults = this.getDefaults();
		return this.deepMerge(defaults, preferences);
	}

	deepMerge(target, source) {
		const output = { ...target };
		
		for (const key in source) {
			if (source.hasOwnProperty(key)) {
				if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
					output[key] = this.deepMerge(target[key] || {}, source[key]);
				} else {
					output[key] = source[key];
				}
			}
		}
		
		return output;
	}

	migrate(oldPreferences) {
		// Handle migration from old versions
		console.log('Migrating preferences from version', oldPreferences.version || 'unknown');
		return this.mergeWithDefaults(oldPreferences);
	}

	notifyChange() {
		// Dispatch custom event for other components to listen to
		window.dispatchEvent(new CustomEvent('preferencesChanged', {
			detail: this.preferences
		}));
	}

	// Preset templates
	static templates = {
		norwegian: {
			sports: {
				football: true,
				tennis: true,
				golf: true,
				formula1: true,
				chess: true,
				esports: true
			},
			teams: {
				football: ['FK Lyn Oslo', 'Norway'],
				esports: ['FaZe Clan']
			},
			players: {
				tennis: ['Casper Ruud'],
				golf: ['Viktor Hovland', 'Kristoffer Reitan', 'Andreas Halvorsen'],
				chess: ['Magnus Carlsen']
			},
			leagues: {
				football: ['Eliteserien', 'OBOS-ligaen', 'Premier League'],
				golf: ['PGA Tour', 'DP World Tour']
			},
			display: {
				timezone: 'Europe/Oslo',
				language: 'no'
			}
		},
		uk: {
			sports: {
				football: true,
				tennis: true,
				golf: true,
				formula1: true,
				chess: false,
				esports: false
			},
			teams: {
				football: ['Arsenal', 'Manchester United', 'Liverpool', 'Chelsea']
			},
			players: {
				tennis: ['Andy Murray', 'Emma Raducanu'],
				golf: ['Rory McIlroy', 'Matt Fitzpatrick']
			},
			leagues: {
				football: ['Premier League', 'Championship'],
				golf: ['DP World Tour', 'PGA Tour']
			},
			display: {
				timezone: 'Europe/London',
				language: 'en-GB'
			}
		},
		us: {
			sports: {
				football: true,
				tennis: true,
				golf: true,
				formula1: true,
				chess: false,
				esports: true
			},
			teams: {
				football: ['Inter Miami CF', 'LA Galaxy'],
				esports: ['Team Liquid', 'Cloud9']
			},
			players: {
				tennis: ['Taylor Fritz', 'Jessica Pegula'],
				golf: ['Scottie Scheffler', 'Patrick Cantlay']
			},
			leagues: {
				football: ['MLS', 'Premier League'],
				golf: ['PGA Tour']
			},
			display: {
				timezone: 'America/New_York',
				language: 'en-US'
			}
		}
	};

	applyTemplate(templateName) {
		const template = PreferencesManager.templates[templateName];
		if (template) {
			this.preferences = this.mergeWithDefaults(template);
			return this.save(this.preferences);
		}
		return false;
	}
}