import { BaseFetcher } from "../base-fetcher.js";
import { EventNormalizer } from "../event-normalizer.js";
import { EventFilters } from "../filters.js";

export class ESPNAdapter extends BaseFetcher {
	async fetchFromSource(source) {
		if (source.api !== "espn") return null;
		
		const results = [];
		
		try {
			if (source.type === "scoreboard" && source.leagues) {
				results.push(...await this.fetchScoreboardWithLeagues(source));
			} else if (source.type === "scoreboard" && source.endpoints) {
				results.push(...await this.fetchMultipleEndpoints(source));
			} else if (source.type === "scoreboard" && source.url) {
				results.push(...await this.fetchSingleEndpoint(source));
			} else if (source.type === "fallback" && source.tours) {
				results.push(...await this.fetchTours(source));
			}
		} catch (error) {
			console.error(`ESPN adapter error for ${this.config.sport}:`, error.message);
		}
		
		return results;
	}

	async fetchScoreboardWithLeagues(source) {
		const allEvents = [];
		const now = new Date();
		const days = this.generateDateRange(7);
		
		for (const league of source.leagues) {
			for (const day of days) {
				try {
					const url = `${source.baseUrl}/${league.code}/scoreboard?dates=${day}`;
					const data = await this.apiClient.fetchJSON(url);
					
					if (data?.events && Array.isArray(data.events)) {
						const futureEvents = data.events.filter(e => new Date(e.date) > now);
						allEvents.push(...futureEvents.map(e => ({ ...e, leagueName: league.name, leagueCode: league.code })));
					}
					
					await this.apiClient.delay(150);
				} catch (error) {
					console.warn(`Failed to fetch ${league.name} for ${day}:`, error.message);
				}
			}
		}
		
		return allEvents;
	}

	async fetchMultipleEndpoints(source) {
		const allEvents = [];
		
		for (const endpoint of source.endpoints) {
			try {
				const data = await this.apiClient.fetchJSON(endpoint.url);
				const events = data?.events || data?.matches || [];
				
				if (Array.isArray(events)) {
					allEvents.push(...events.map(e => ({ ...e, sourceName: endpoint.name })));
				}
			} catch (error) {
				console.warn(`Failed to fetch from ${endpoint.name}:`, error.message);
			}
		}
		
		return allEvents;
	}

	async fetchSingleEndpoint(source) {
		try {
			const data = await this.apiClient.fetchJSON(source.url);
			return data?.events || [];
		} catch (error) {
			console.warn(`Failed to fetch from ${source.url}:`, error.message);
			return [];
		}
	}

	async fetchTours(source) {
		const allEvents = [];
		
		for (const tour of source.tours) {
			try {
				const data = await this.apiClient.fetchJSON(tour.url);
				const events = data?.events || [];
				
				if (Array.isArray(events)) {
					allEvents.push(...events.map(e => ({ ...e, tourName: tour.name })));
				}
			} catch (error) {
				console.warn(`Failed to fetch ${tour.name}:`, error.message);
			}
		}
		
		return allEvents;
	}

	transformToEvents(rawData) {
		const events = [];
		
		for (const item of rawData) {
			try {
				const event = this.transformESPNEvent(item);
				if (event) {
					const normalized = EventNormalizer.normalize(event, this.config.sport);
					if (normalized && EventNormalizer.validateEvent(normalized)) {
						events.push(normalized);
					}
				}
			} catch (error) {
				console.error(`Error transforming event:`, error.message);
			}
		}
		
		return EventNormalizer.deduplicate(events);
	}

	transformESPNEvent(espnEvent) {
		if (!espnEvent) return null;
		
		const competition = espnEvent.competitions?.[0];
		if (!competition) return null;
		
		const event = {
			title: this.extractTitle(espnEvent, competition),
			time: espnEvent.date,
			venue: competition.venue?.fullName || competition.venue?.address?.city || "TBD",
			meta: this.extractMeta(espnEvent, competition),
			tournament: espnEvent.leagueName || espnEvent.tourName || espnEvent.sourceName || "",
			streaming: this.extractStreaming(espnEvent, competition),
			status: espnEvent.status?.type?.name
		};
		
		if (competition.competitors && competition.competitors.length >= 2) {
			const home = competition.competitors.find(c => c.homeAway === "home");
			const away = competition.competitors.find(c => c.homeAway === "away");
			
			if (home && away) {
				event.homeTeam = home.team?.displayName || home.athlete?.displayName;
				event.awayTeam = away.team?.displayName || away.athlete?.displayName;
			} else {
				event.participants = competition.competitors.map(c => 
					c.team?.displayName || c.athlete?.displayName || "Unknown"
				);
			}
		}
		
		event.norwegian = this.hasNorwegianInterest(event);
		
		return event;
	}

	extractTitle(espnEvent, competition) {
		if (espnEvent.name) return espnEvent.name;
		if (espnEvent.shortName) return espnEvent.shortName;
		
		if (competition?.competitors?.length >= 2) {
			const home = competition.competitors.find(c => c.homeAway === "home");
			const away = competition.competitors.find(c => c.homeAway === "away");
			
			if (home && away) {
				const homeName = home.team?.displayName || home.athlete?.displayName || "TBD";
				const awayName = away.team?.displayName || away.athlete?.displayName || "TBD";
				return `${homeName} vs ${awayName}`;
			}
			
			const names = competition.competitors
				.map(c => c.team?.displayName || c.athlete?.displayName || "Unknown")
				.filter(n => n !== "Unknown");
			
			if (names.length >= 2) {
				return names.slice(0, 2).join(" vs ");
			}
		}
		
		return "Unknown Event";
	}

	extractMeta(espnEvent, competition) {
		const meta = [];
		
		if (espnEvent.leagueName) meta.push(espnEvent.leagueName);
		else if (espnEvent.tourName) meta.push(espnEvent.tourName);
		else if (espnEvent.sourceName) meta.push(espnEvent.sourceName);
		
		if (competition?.notes?.length > 0) {
			meta.push(competition.notes[0].headline);
		}
		
		return meta.filter(Boolean).join(" • ") || this.config.sport;
	}

	extractStreaming(espnEvent, competition) {
		const streaming = [];
		
		if (this.config.streaming) {
			if (this.config.norwegian?.filterMode && espnEvent.leagueCode?.startsWith("nor")) {
				streaming.push(...(this.config.streaming.norwegian || []));
			} else if (Array.isArray(this.config.streaming)) {
				streaming.push(...this.config.streaming);
			}
		}
		
		if (competition?.broadcasts?.length > 0) {
			for (const broadcast of competition.broadcasts) {
				if (broadcast.market === "national" || !broadcast.market) {
					streaming.push({
						platform: broadcast.names?.[0] || "TV",
						url: "",
						type: "tv"
					});
				}
			}
		}
		
		return streaming;
	}

	generateDateRange(days) {
		const dates = [];
		const now = new Date();
		
		for (let i = 0; i < days; i++) {
			const date = new Date(now.getTime() + i * 86400000);
			dates.push(date.toISOString().split("T")[0].replace(/-/g, ""));
		}
		
		return dates;
	}

	applyCustomFilters(events) {
		if (!this.config.norwegian) return events;
		
		const { filterMode, teams, players } = this.config.norwegian;
		
		if (filterMode === "exclusive") {
			return events.filter(event => event.norwegian);
		} else if (filterMode === "focused") {
			const norwegianEvents = events.filter(event => event.norwegian);
			const otherEvents = events.filter(event => !event.norwegian);
			
			const maxOther = Math.max(0, (this.config.filters?.maxEvents || 15) - norwegianEvents.length);
			return [...norwegianEvents, ...otherEvents.slice(0, maxOther)];
		} else if (filterMode === "inclusive") {
			return events;
		}
		
		return events;
	}
}