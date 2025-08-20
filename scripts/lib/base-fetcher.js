import { iso, normalizeToUTC } from "./helpers.js";
import { APIClient } from "./api-client.js";

export class BaseFetcher {
	constructor(config) {
		this.config = config;
		this.apiClient = new APIClient();
	}

	async fetch() {
		try {
			const rawData = await this.fetchFromAPIs();
			const events = this.transformToEvents(rawData);
			const filtered = this.applyFilters(events);
			const normalized = this.normalizeEvents(filtered);
			return this.formatResponse(normalized);
		} catch (error) {
			console.error(`Error fetching ${this.config.sport}:`, error.message);
			return this.formatResponse([]);
		}
	}

	async fetchFromAPIs() {
		const results = [];
		for (const source of this.config.sources || []) {
			try {
				const data = await this.fetchFromSource(source);
				if (data) results.push(...data);
			} catch (error) {
				console.warn(`Failed to fetch from ${source.api}:`, error.message);
			}
		}
		return results;
	}

	async fetchFromSource(source) {
		throw new Error("fetchFromSource must be implemented by subclass");
	}

	transformToEvents(rawData) {
		throw new Error("transformToEvents must be implemented by subclass");
	}

	applyFilters(events) {
		let filtered = events;

		if (this.config.filters?.timeRange) {
			filtered = this.filterByTimeRange(filtered, this.config.filters.timeRange);
		}

		if (this.config.filters?.maxEvents) {
			filtered = filtered.slice(0, this.config.filters.maxEvents);
		}

		if (this.config.filters?.custom) {
			filtered = this.applyCustomFilters(filtered);
		}

		return filtered;
	}

	filterByTimeRange(events, range) {
		const now = new Date();
		const future = new Date(now.getTime() + range * 86400000);
		return events.filter(event => {
			const eventDate = new Date(event.time);
			return eventDate >= now && eventDate <= future;
		});
	}

	applyCustomFilters(events) {
		return events;
	}

	normalizeEvents(events) {
		return events.map(event => ({
			...event,
			time: normalizeToUTC(event.time),
			sport: this.config.sport,
			streaming: event.streaming || [],
			norwegian: event.norwegian || false
		}));
	}

	formatResponse(events) {
		const tournaments = this.groupEventsByTournament(events);
		return {
			lastUpdated: iso(),
			source: this.config.source || "API",
			tournaments
		};
	}

	groupEventsByTournament(events) {
		const grouped = new Map();
		
		for (const event of events) {
			const tournament = event.tournament || event.meta || "Unknown";
			if (!grouped.has(tournament)) {
				grouped.set(tournament, {
					name: tournament,
					events: []
				});
			}
			grouped.get(tournament).events.push(event);
		}
		
		return Array.from(grouped.values());
	}

	hasNorwegianInterest(event) {
		if (!this.config.norwegian) return false;
		
		if (this.config.norwegian.teams) {
			const eventTeams = [event.homeTeam, event.awayTeam, event.title].filter(Boolean).join(" ").toLowerCase();
			if (this.config.norwegian.teams.some(team => eventTeams.includes(team.toLowerCase()))) {
				return true;
			}
		}
		
		if (this.config.norwegian.players) {
			const eventText = JSON.stringify(event).toLowerCase();
			if (this.config.norwegian.players.some(player => eventText.includes(player.toLowerCase()))) {
				return true;
			}
		}
		
		return false;
	}
}