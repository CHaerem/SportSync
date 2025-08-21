// Simple Preferences Manager for SportSync
class PreferencesManager {
	constructor() {
		this.STORAGE_KEY = 'sportsync-preferences';
		this.preferences = this.loadPreferences();
	}

	loadPreferences() {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			if (stored) {
				return JSON.parse(stored);
			}
		} catch (error) {
			console.error('Error loading preferences:', error);
		}
		
		// Default preferences
		return {
			favoriteSports: [],
			favoriteTeams: {
				football: [],
				esports: []
			},
			favoritePlayers: {
				golf: [],
				tennis: []
			},
			favoriteEvents: [], // Store individual event IDs
			hidePassedEvents: false,
			defaultView: 'list',
			theme: 'auto'
		};
	}

	savePreferences() {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.preferences));
			return true;
		} catch (error) {
			console.error('Error saving preferences:', error);
			return false;
		}
	}

	// Sport preferences
	toggleFavoriteSport(sport) {
		const index = this.preferences.favoriteSports.indexOf(sport);
		if (index > -1) {
			this.preferences.favoriteSports.splice(index, 1);
		} else {
			this.preferences.favoriteSports.push(sport);
		}
		this.savePreferences();
		return this.preferences.favoriteSports.includes(sport);
	}

	isFavoriteSport(sport) {
		return this.preferences.favoriteSports.includes(sport);
	}

	// Team preferences
	addFavoriteTeam(sport, teamName) {
		if (!this.preferences.favoriteTeams[sport]) {
			this.preferences.favoriteTeams[sport] = [];
		}
		if (!this.preferences.favoriteTeams[sport].includes(teamName)) {
			this.preferences.favoriteTeams[sport].push(teamName);
			this.savePreferences();
		}
	}

	removeFavoriteTeam(sport, teamName) {
		if (this.preferences.favoriteTeams[sport]) {
			const index = this.preferences.favoriteTeams[sport].indexOf(teamName);
			if (index > -1) {
				this.preferences.favoriteTeams[sport].splice(index, 1);
				this.savePreferences();
			}
		}
	}

	getFavoriteTeams(sport) {
		return this.preferences.favoriteTeams[sport] || [];
	}

	isTeamFavorite(sport, teamName) {
		const teams = this.getFavoriteTeams(sport);
		return teams.some(team => 
			teamName.toLowerCase().includes(team.toLowerCase()) ||
			team.toLowerCase().includes(teamName.toLowerCase())
		);
	}

	// Player preferences
	addFavoritePlayer(sport, playerName) {
		if (!this.preferences.favoritePlayers[sport]) {
			this.preferences.favoritePlayers[sport] = [];
		}
		if (!this.preferences.favoritePlayers[sport].includes(playerName)) {
			this.preferences.favoritePlayers[sport].push(playerName);
			this.savePreferences();
		}
	}

	removeFavoritePlayer(sport, playerName) {
		if (this.preferences.favoritePlayers[sport]) {
			const index = this.preferences.favoritePlayers[sport].indexOf(playerName);
			if (index > -1) {
				this.preferences.favoritePlayers[sport].splice(index, 1);
				this.savePreferences();
			}
		}
	}

	getFavoritePlayers(sport) {
		return this.preferences.favoritePlayers[sport] || [];
	}

	isPlayerFavorite(sport, playerName) {
		const players = this.getFavoritePlayers(sport);
		return players.some(player => 
			playerName.toLowerCase().includes(player.toLowerCase()) ||
			player.toLowerCase().includes(playerName.toLowerCase())
		);
	}

	// Individual event favorites
	toggleEventFavorite(eventId) {
		if (!this.preferences.favoriteEvents) {
			this.preferences.favoriteEvents = [];
		}
		
		const index = this.preferences.favoriteEvents.indexOf(eventId);
		if (index > -1) {
			this.preferences.favoriteEvents.splice(index, 1);
		} else {
			this.preferences.favoriteEvents.push(eventId);
		}
		this.savePreferences();
		return this.preferences.favoriteEvents.includes(eventId);
	}

	isEventIdFavorite(eventId) {
		return this.preferences.favoriteEvents && this.preferences.favoriteEvents.includes(eventId);
	}

	// Check if an event matches user favorites
	isEventFavorite(event, eventId) {
		// Check if this specific event is marked as favorite
		if (eventId && this.isEventIdFavorite(eventId)) {
			return true;
		}

		// Check sport preference
		if (this.isFavoriteSport(event.sport)) {
			return true;
		}

		// Check team preferences for football
		if (event.sport === 'football') {
			if (event.homeTeam && this.isTeamFavorite('football', event.homeTeam)) {
				return true;
			}
			if (event.awayTeam && this.isTeamFavorite('football', event.awayTeam)) {
				return true;
			}
		}

		// Check team preferences for esports
		if (event.sport === 'esports') {
			const teams = this.getFavoriteTeams('esports');
			for (const team of teams) {
				if (event.title.toLowerCase().includes(team.toLowerCase())) {
					return true;
				}
			}
		}

		// Check player preferences for golf
		if (event.sport === 'golf' && event.norwegianPlayers) {
			for (const player of event.norwegianPlayers) {
				if (this.isPlayerFavorite('golf', player.name)) {
					return true;
				}
			}
		}

		// Check player preferences for tennis
		if (event.sport === 'tennis' && event.participants) {
			for (const participant of event.participants) {
				if (this.isPlayerFavorite('tennis', participant)) {
					return true;
				}
			}
		}

		return false;
	}

	// View preferences
	setDefaultView(view) {
		this.preferences.defaultView = view;
		this.savePreferences();
	}

	getDefaultView() {
		return this.preferences.defaultView;
	}

	// Theme preferences
	setTheme(theme) {
		this.preferences.theme = theme;
		this.savePreferences();
	}

	getTheme() {
		return this.preferences.theme;
	}

	// Reset preferences
	reset() {
		localStorage.removeItem(this.STORAGE_KEY);
		this.preferences = this.loadPreferences();
	}
}

// Export for use in dashboard
window.PreferencesManager = PreferencesManager;