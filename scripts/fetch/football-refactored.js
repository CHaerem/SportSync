import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";
import { fetchOBOSLigaenFromFotballNo } from "./fotball-no.js";

export class FootballFetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.football);
	}

	async fetchFromSource(source) {
		if (source.api === "fotball.no" && source.enabled) {
			return await this.fetchFotballNo();
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