/**
 * EventFilter - Filters sports events based on user preferences
 */
class EventFilter {
	constructor(preferencesManager) {
		this.preferences = preferencesManager;
	}

	/**
	 * Filter events based on user preferences
	 * @param {Array} events - All events from the data source
	 * @returns {Array} Filtered events
	 */
	filterEvents(events) {
		if (!events || !Array.isArray(events)) return [];
		
		const prefs = this.preferences.get();
		let filtered = [...events];

		// Filter by enabled sports
		filtered = this.filterBySports(filtered, prefs.sports);

		// Filter by favorite teams
		filtered = this.filterByTeams(filtered, prefs.teams);

		// Filter by favorite players
		filtered = this.filterByPlayers(filtered, prefs.players);

		// Filter by leagues
		filtered = this.filterByLeagues(filtered, prefs.leagues);

		// Apply display preferences
		filtered = this.applyDisplayPreferences(filtered, prefs.display);

		// Sort by time
		filtered.sort((a, b) => new Date(a.time) - new Date(b.time));

		return filtered;
	}

	filterBySports(events, enabledSports) {
		// If no sports preferences, show all
		if (!enabledSports) return events;

		// Get list of enabled sports
		const enabled = Object.entries(enabledSports)
			.filter(([sport, isEnabled]) => isEnabled)
			.map(([sport]) => sport);

		// If all sports are disabled, show all (fallback)
		if (enabled.length === 0) return events;

		return events.filter(event => {
			// Handle both 'formula1' and 'f1' naming
			const sportName = event.sport === 'formula1' ? 'formula1' : event.sport;
			return enabled.includes(sportName);
		});
	}

	filterByTeams(events, favoriteTeams) {
		// If no team preferences, don't filter
		if (!favoriteTeams || Object.keys(favoriteTeams).length === 0) {
			return events;
		}

		// Check if user has any favorite teams
		const hasAnyFavorites = Object.values(favoriteTeams).some(teams => teams.length > 0);
		if (!hasAnyFavorites) {
			return events;
		}

		// Create a map of sports with favorite teams
		const sportTeamsMap = {};
		for (const [sport, teams] of Object.entries(favoriteTeams)) {
			if (teams.length > 0) {
				sportTeamsMap[sport] = teams.map(t => t.toLowerCase());
			}
		}

		return events.filter(event => {
			// If this sport doesn't have favorite teams, include all events for it
			if (!sportTeamsMap[event.sport]) {
				return true;
			}

			// Check if event involves a favorite team
			const favoriteTeams = sportTeamsMap[event.sport];
			const eventTeams = [
				event.homeTeam,
				event.awayTeam,
				event.title
			].filter(Boolean).join(' ').toLowerCase();

			return favoriteTeams.some(team => eventTeams.includes(team));
		});
	}

	filterByPlayers(events, favoritePlayers) {
		// If no player preferences, don't filter
		if (!favoritePlayers || Object.keys(favoritePlayers).length === 0) {
			return events;
		}

		// Check if user has any favorite players
		const hasAnyFavorites = Object.values(favoritePlayers).some(players => players.length > 0);
		if (!hasAnyFavorites) {
			return events;
		}

		// Create a map of sports with favorite players
		const sportPlayersMap = {};
		for (const [sport, players] of Object.entries(favoritePlayers)) {
			if (players.length > 0) {
				sportPlayersMap[sport] = players.map(p => p.toLowerCase());
			}
		}

		return events.filter(event => {
			// If this sport doesn't have favorite players, include all events for it
			if (!sportPlayersMap[event.sport]) {
				return true;
			}

			// Check if event involves a favorite player
			const favoritePlayers = sportPlayersMap[event.sport];
			
			// Check in participants
			if (event.participants && Array.isArray(event.participants)) {
				const participantsStr = event.participants.join(' ').toLowerCase();
				if (favoritePlayers.some(player => participantsStr.includes(player))) {
					return true;
				}
			}

			// Check in norwegianPlayers (for golf)
			if (event.norwegianPlayers && Array.isArray(event.norwegianPlayers)) {
				const playersStr = event.norwegianPlayers.map(p => p.name).join(' ').toLowerCase();
				if (favoritePlayers.some(player => playersStr.includes(player))) {
					return true;
				}
			}

			// Check in title
			const titleStr = (event.title || '').toLowerCase();
			return favoritePlayers.some(player => titleStr.includes(player));
		});
	}

	filterByLeagues(events, favoriteLeagues) {
		// If no league preferences, don't filter
		if (!favoriteLeagues || Object.keys(favoriteLeagues).length === 0) {
			return events;
		}

		// Check if user has any favorite leagues
		const hasAnyFavorites = Object.values(favoriteLeagues).some(leagues => leagues.length > 0);
		if (!hasAnyFavorites) {
			return events;
		}

		// Create a map of sports with favorite leagues
		const sportLeaguesMap = {};
		for (const [sport, leagues] of Object.entries(favoriteLeagues)) {
			if (leagues.length > 0) {
				sportLeaguesMap[sport] = leagues.map(l => l.toLowerCase());
			}
		}

		return events.filter(event => {
			// If this sport doesn't have favorite leagues, include all events for it
			if (!sportLeaguesMap[event.sport]) {
				return true;
			}

			// Check if event is in a favorite league
			const favoriteLeagues = sportLeaguesMap[event.sport];
			const eventLeague = (event.meta || event.tournament || '').toLowerCase();
			
			return favoriteLeagues.some(league => eventLeague.includes(league));
		});
	}

	applyDisplayPreferences(events, displayPrefs) {
		let filtered = [...events];

		// Filter out past events if configured
		if (!displayPrefs.showPastEvents) {
			const now = new Date();
			filtered = filtered.filter(event => new Date(event.time) > now);
		}

		// Limit events per sport if configured
		if (displayPrefs.maxEventsPerSport && displayPrefs.maxEventsPerSport > 0) {
			const sportCounts = {};
			filtered = filtered.filter(event => {
				if (!sportCounts[event.sport]) {
					sportCounts[event.sport] = 0;
				}
				sportCounts[event.sport]++;
				return sportCounts[event.sport] <= displayPrefs.maxEventsPerSport;
			});
		}

		return filtered;
	}

	/**
	 * Get personalized events (favorites only)
	 */
	getFavoriteEvents(events) {
		const prefs = this.preferences.get();
		
		return events.filter(event => {
			// Check if event involves favorite team
			if (prefs.teams[event.sport] && prefs.teams[event.sport].length > 0) {
				const eventTeams = [event.homeTeam, event.awayTeam, event.title]
					.filter(Boolean).join(' ').toLowerCase();
				
				if (prefs.teams[event.sport].some(team => 
					eventTeams.includes(team.toLowerCase())
				)) {
					return true;
				}
			}

			// Check if event involves favorite player
			if (prefs.players[event.sport] && prefs.players[event.sport].length > 0) {
				const eventText = JSON.stringify(event).toLowerCase();
				
				if (prefs.players[event.sport].some(player => 
					eventText.includes(player.toLowerCase())
				)) {
					return true;
				}
			}

			return false;
		});
	}

	/**
	 * Check if an event matches user's interests
	 */
	isEventRelevant(event) {
		const prefs = this.preferences.get();

		// Check if sport is enabled
		if (prefs.sports[event.sport] === false) {
			return false;
		}

		// Check for favorite teams/players
		const isFavorite = this.getFavoriteEvents([event]).length > 0;
		
		// If user has favorites and this isn't one, it might be less relevant
		const hasFavorites = 
			(prefs.teams[event.sport] && prefs.teams[event.sport].length > 0) ||
			(prefs.players[event.sport] && prefs.players[event.sport].length > 0);

		return !hasFavorites || isFavorite;
	}

	/**
	 * Group events by preference relevance
	 */
	groupByRelevance(events) {
		const favorites = [];
		const relevant = [];
		const other = [];

		for (const event of events) {
			if (this.getFavoriteEvents([event]).length > 0) {
				favorites.push(event);
			} else if (this.isEventRelevant(event)) {
				relevant.push(event);
			} else {
				other.push(event);
			}
		}

		return { favorites, relevant, other };
	}
}