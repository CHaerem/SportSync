import { MS_PER_DAY, isEventInWindow } from "./helpers.js";

export class EventFilters {
	static filterByTimeRange(events, days = 7) {
		if (!Array.isArray(events)) return [];

		const now = new Date();
		const future = new Date(now.getTime() + days * MS_PER_DAY);
		return events.filter(event => isEventInWindow(event, now, future));
	}

	static filterCurrentWeek(events) {
		if (!Array.isArray(events)) return [];

		const now = new Date();
		const startOfWeek = new Date(now);
		startOfWeek.setDate(now.getDate() - now.getDay());
		startOfWeek.setHours(0, 0, 0, 0);

		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 7);
		return events.filter(event => isEventInWindow(event, startOfWeek, endOfWeek));
	}

	static filterByTeams(events, teams) {
		if (!Array.isArray(events) || !Array.isArray(teams) || teams.length === 0) {
			return events || [];
		}
		
		const normalizedTeams = teams.map(t => t.toLowerCase());
		
		return events.filter(event => {
			const eventTeams = [
				event.homeTeam,
				event.awayTeam,
				event.title,
				event.meta
			].filter(Boolean).join(" ").toLowerCase();
			
			return normalizedTeams.some(team => eventTeams.includes(team));
		});
	}

	static filterByPlayers(events, players) {
		if (!Array.isArray(events) || !Array.isArray(players) || players.length === 0) {
			return events || [];
		}
		
		const normalizedPlayers = players.map(p => p.toLowerCase());
		
		return events.filter(event => {
			const eventText = JSON.stringify(event).toLowerCase();
			
			return normalizedPlayers.some(player => {
				const playerParts = player.split(" ");
				return playerParts.every(part => eventText.includes(part));
			});
		});
	}

	static filterByLeagues(events, leagues) {
		if (!Array.isArray(events) || !Array.isArray(leagues) || leagues.length === 0) {
			return events || [];
		}
		
		const normalizedLeagues = leagues.map(l => l.toLowerCase());
		
		return events.filter(event => {
			const eventLeague = (event.meta || event.tournament || "").toLowerCase();
			return normalizedLeagues.some(league => eventLeague.includes(league));
		});
	}

	static filterNorwegian(events) {
		if (!Array.isArray(events)) return [];
		
		return events.filter(event => event.norwegian === true);
	}

	static filterBySport(events, sports) {
		if (!Array.isArray(events) || !Array.isArray(sports) || sports.length === 0) {
			return events || [];
		}
		
		const normalizedSports = sports.map(s => s.toLowerCase());
		return events.filter(event => normalizedSports.includes(event.sport?.toLowerCase()));
	}

	static sortByTime(events, ascending = true) {
		if (!Array.isArray(events)) return [];
		
		return [...events].sort((a, b) => {
			try {
				const dateA = new Date(a.time).getTime();
				const dateB = new Date(b.time).getTime();
				return ascending ? dateA - dateB : dateB - dateA;
			} catch {
				return 0;
			}
		});
	}

	static limitEvents(events, max) {
		if (!Array.isArray(events)) return [];
		if (!max || max <= 0) return events;
		
		return events.slice(0, max);
	}

	static combineFilters(events, filters = {}) {
		let filtered = events || [];
		
		if (filters.timeRange) {
			filtered = this.filterByTimeRange(filtered, filters.timeRange);
		}
		
		if (filters.currentWeek) {
			filtered = this.filterCurrentWeek(filtered);
		}
		
		if (filters.teams && filters.teams.length > 0) {
			filtered = this.filterByTeams(filtered, filters.teams);
		}
		
		if (filters.players && filters.players.length > 0) {
			filtered = this.filterByPlayers(filtered, filters.players);
		}
		
		if (filters.leagues && filters.leagues.length > 0) {
			filtered = this.filterByLeagues(filtered, filters.leagues);
		}
		
		if (filters.norwegian) {
			filtered = this.filterNorwegian(filtered);
		}
		
		if (filters.sports && filters.sports.length > 0) {
			filtered = this.filterBySport(filtered, filters.sports);
		}
		
		if (filters.sort !== false) {
			filtered = this.sortByTime(filtered, filters.sortAscending !== false);
		}
		
		if (filters.limit) {
			filtered = this.limitEvents(filtered, filters.limit);
		}
		
		return filtered;
	}

	static removeDuplicates(events) {
		if (!Array.isArray(events)) return [];
		
		const seen = new Set();
		return events.filter(event => {
			const key = `${event.sport}-${event.title}-${new Date(event.time).getTime()}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}

	static mergeEventLists(...eventLists) {
		const allEvents = [];
		
		for (const list of eventLists) {
			if (Array.isArray(list)) {
				allEvents.push(...list);
			}
		}
		
		return this.removeDuplicates(this.sortByTime(allEvents));
	}
}