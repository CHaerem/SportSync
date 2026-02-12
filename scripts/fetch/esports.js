import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";
import { EventFilters } from "../lib/filters.js";

// Top-tier CS2 events to always include for general coverage
const MAJOR_CS2_PATTERNS = [
	/major/i, /iem/i, /esl pro/i, /blast/i, /world cup/i,
	/pgl/i, /dreamhack/i, /champions/i, /pro league/i
];

function isMajorEvent(name) {
	return MAJOR_CS2_PATTERNS.some(p => p.test(name || ""));
}

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

			// Check data freshness
			const newest = data.reduce((max, m) => {
				const t = new Date(m.date || m.time || 0).getTime();
				return t > max ? t : max;
			}, 0);
			const daysSinceNewest = (Date.now() - newest) / (1000 * 60 * 60 * 24);
			if (daysSinceNewest > 30) {
				console.warn(`HLTV data is stale (${Math.round(daysSinceNewest)} days old), skipping`);
				return matches;
			}

			const focusTeams = this.config.filters?.teams || [];
			
			const filteredMatches = data.filter(match => {
				const team1 = this.extractTeamName(match, 0);
				const team2 = this.extractTeamName(match, 1);
				const eventName = match.event?.name || match.tournament?.name || "";

				const hasFocusTeam = focusTeams.some(team =>
					team1.toLowerCase().includes(team.toLowerCase()) ||
					team2.toLowerCase().includes(team.toLowerCase())
				);
				return hasFocusTeam || isMajorEvent(eventName);
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
		
		// No hardcoded matches — rely on API data
		const knownMatches = [];
		
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