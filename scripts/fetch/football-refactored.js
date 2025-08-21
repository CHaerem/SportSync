import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";
import { fetchOBOSLigaenFromFotballNo } from "./fotball-no.js";
import { EventNormalizer } from "../lib/event-normalizer.js";

export class FootballFetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.football);
	}

	async fetchFromSource(source) {
		if (source.api === "fotball.no" && source.enabled) {
			const fotballNoEvents = await this.fetchFotballNo();
			// Return events with proper metadata for grouping
			return fotballNoEvents.map(event => ({
				...event,
				tournament: event.meta || "OBOS-ligaen",
				leagueName: "OBOS-ligaen",
				leagueCode: "nor.2"
			}));
		}
		
		return await super.fetchFromSource(source);
	}

	async fetchFotballNo() {
		try {
			console.log("Fetching OBOS-ligaen data from fotball.no...");
			const fotballNoData = await fetchOBOSLigaenFromFotballNo();
			
			if (fotballNoData?.tournaments?.length > 0) {
				const events = [];
				for (const tournament of fotballNoData.tournaments) {
					events.push(...(tournament.events || []));
				}
				console.log(`Added ${events.length} Lyn matches from fotball.no`);
				return events;
			}
		} catch (error) {
			console.warn("Failed to fetch from fotball.no:", error.message);
		}
		
		return [];
	}

	transformToEvents(rawData) {
		const events = [];
		
		for (const item of rawData) {
			try {
				// Check if this is already a formatted event from fotball.no
				if (item.sport === "football" && item.meta === "OBOS-ligaen") {
					// It's already in the correct format, just validate and add
					// Ensure tournament field is set for proper grouping
					item.tournament = item.tournament || item.meta || "OBOS-ligaen";
					const normalized = EventNormalizer.normalize(item, this.config.sport);
					if (normalized && EventNormalizer.validateEvent(normalized)) {
						events.push(normalized);
					}
				} else {
					// It's an ESPN event, transform it
					const event = this.transformESPNEvent(item);
					if (event) {
						const normalized = EventNormalizer.normalize(event, this.config.sport);
						if (normalized && EventNormalizer.validateEvent(normalized)) {
							events.push(normalized);
						}
					}
				}
			} catch (error) {
				console.error(`Error transforming event:`, error.message);
			}
		}
		
		return EventNormalizer.deduplicate(events);
	}

	applyCustomFilters(events) {
		const filtered = [];
		
		for (const event of events) {
			const isNorwegianLeague = event.leagueCode?.startsWith("nor") || 
									  event.tournament?.includes("OBOS") ||
									  event.tournament?.includes("Eliteserien");
			
			const isInternational = event.leagueCode === "fifa.world";
			
			if (isNorwegianLeague || isInternational) {
				if (event.norwegian) {
					filtered.push(event);
				}
			} else {
				filtered.push(event);
			}
		}
		
		return super.applyCustomFilters(filtered);
	}
}

export async function fetchFootballESPN() {
	const fetcher = new FootballFetcher();
	return await fetcher.fetch();
}