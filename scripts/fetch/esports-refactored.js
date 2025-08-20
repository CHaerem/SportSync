import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";
import { EventFilters } from "../lib/filters.js";

export class EsportsFetcher extends BaseFetcher {
	constructor() {
		super(sportsConfig.esports);
	}

	async fetchFromSource(source) {
		if (source.api === "hltv") {
			return await this.fetchHLTV(source);
		} else if (source.api === "fallback" && source.enabled) {
			return await this.fetchFallbackMatches();
		}
		return [];
	}

	async fetchHLTV(source) {
		const matches = [];
		
		try {
			console.log("Fetching HLTV matches from:", source.url);
			const data = await this.apiClient.fetchJSON(source.url, { retries: 2 });
			
			if (!Array.isArray(data)) {
				console.warn("HLTV API did not return an array");
				return matches;
			}
			
			console.log(`Total HLTV matches found: ${data.length}`);
			const focusTeams = this.config.filters?.teams || [];
			
			const filteredMatches = data.filter(match => {
				const team1 = this.extractTeamName(match, 0);
				const team2 = this.extractTeamName(match, 1);
				
				return focusTeams.some(team => 
					team1.toLowerCase().includes(team.toLowerCase()) ||
					team2.toLowerCase().includes(team.toLowerCase())
				);
			});
			
			console.log(`Filtered to ${filteredMatches.length} matches with focus teams`);
			
			for (const match of filteredMatches.slice(0, 10)) {
				matches.push({
					title: `${this.extractTeamName(match, 0)} vs ${this.extractTeamName(match, 1)}`,
					time: match.date || match.time || match.timestamp,
					venue: "Online",
					tournament: match.event?.name || match.tournament?.name || "CS2 Match",
					norwegian: this.isNorwegianTeam(match),
					meta: match.event?.name || "CS2 Competition"
				});
			}
		} catch (error) {
			console.error("Failed to fetch HLTV data:", error.message);
		}
		
		return matches;
	}

	async fetchFallbackMatches() {
		const now = new Date();
		const currentWeekStart = new Date(now);
		currentWeekStart.setDate(now.getDate() - now.getDay());
		const currentWeekEnd = new Date(currentWeekStart);
		currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
		
		// Known tournament matches (manual fallback)
		const knownMatches = [
			{
				title: "FaZe Clan vs Aurora Gaming",
				time: "2025-08-20T17:30:00Z",
				venue: "Online",
				tournament: "Esports World Cup 2025",
				norwegian: true,
				meta: "Esports World Cup 2025 - Round 1"
			}
		];
		
		return knownMatches.filter(match => {
			const matchDate = new Date(match.time);
			return matchDate >= currentWeekStart && matchDate <= currentWeekEnd;
		});
	}

	extractTeamName(match, index) {
		// Try multiple possible structures
		const paths = [
			`team${index + 1}.name`,
			`team${['A', 'B'][index]}.name`,
			`opponents[${index}].name`,
			`competitors[${index}].name`
		];
		
		for (const path of paths) {
			const value = this.getNestedValue(match, path);
			if (value) return value;
		}
		
		return "TBD";
	}

	getNestedValue(obj, path) {
		return path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
			return current?.[key];
		}, obj);
	}

	isNorwegianTeam(match) {
		const norwegianTeams = this.config.norwegian?.teams || [];
		const matchText = JSON.stringify(match).toLowerCase();
		
		return norwegianTeams.some(team => 
			matchText.includes(team.toLowerCase())
		);
	}

	transformToEvents(rawData) {
		const events = [];
		
		for (const item of rawData) {
			const normalized = EventNormalizer.normalize(item, this.config.sport);
			if (normalized && EventNormalizer.validateEvent(normalized)) {
				// Add streaming platforms
				if (this.config.streaming && normalized.norwegian) {
					normalized.streaming = this.config.streaming;
				}
				events.push(normalized);
			}
		}
		
		return EventNormalizer.deduplicate(events);
	}

	applyCustomFilters(events) {
		// Apply current week filter if configured
		if (this.config.filters?.currentWeek) {
			events = EventFilters.filterCurrentWeek(events);
		}
		
		return super.applyCustomFilters(events);
	}
}

export async function fetchEsports() {
	const fetcher = new EsportsFetcher();
	return await fetcher.fetch();
}