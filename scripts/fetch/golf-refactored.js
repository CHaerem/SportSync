import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";

export class GolfFetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.golf);
	}

	transformESPNEvent(espnEvent) {
		const event = super.transformESPNEvent(espnEvent);
		if (!event) return null;

		// Store endDate so ongoing tournaments aren't filtered as "past"
		// but keep time as start date for correct display
		if (espnEvent.endDate) {
			event.endDate = espnEvent.endDate;
		}

		// Check for Norwegian players in ESPN data
		const competitors = espnEvent.competitions?.[0]?.competitors || [];
		const norwegianCompetitors = competitors.filter(comp => {
			const playerName = comp.athlete?.displayName || "";
			return this.config.norwegian?.players?.some(norPlayer =>
				playerName.toLowerCase().includes(norPlayer.toLowerCase().split(' ').pop())
			);
		});

		if (norwegianCompetitors.length > 0) {
			event.norwegian = true;
			event.norwegianPlayers = norwegianCompetitors.map(comp => ({
				name: comp.athlete?.displayName || "Unknown",
				status: comp.status || null
			}));
			event.totalPlayers = competitors.length;
		}

		return event;
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

	filterByTimeRange(events, range) {
		// Golf tournaments span multiple days — use endDate so ongoing
		// tournaments aren't excluded just because they started in the past
		const now = new Date();
		const future = new Date(now.getTime() + range * 86400000);
		return events.filter(event => {
			const startDate = new Date(event.time);
			const endDate = event.endDate ? new Date(event.endDate) : startDate;
			return endDate >= now && startDate <= future;
		});
	}

	applyCustomFilters(events) {
		// For golf, only show tournaments with Norwegian players
		if (this.config.norwegian?.filterMode === "exclusive") {
			return events.filter(event => event.norwegian);
		}
		return super.applyCustomFilters(events);
	}
}

export async function fetchGolfESPN() {
	const fetcher = new GolfFetcher();
	return await fetcher.fetch();
}