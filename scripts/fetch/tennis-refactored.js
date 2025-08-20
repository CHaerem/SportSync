import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";

export class TennisFetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.tennis);
	}

	transformESPNEvent(espnEvent) {
		const event = super.transformESPNEvent(espnEvent);
		if (!event) return null;

		// Handle different tennis data structures
		if (espnEvent.competitors && !espnEvent.competitions) {
			// Direct competitors format (mixed doubles)
			const competitors = espnEvent.competitors;
			event.participants = [
				competitors[0]?.displayName || competitors[0]?.team?.displayName || "TBD",
				competitors[1]?.displayName || competitors[1]?.team?.displayName || "TBD"
			];
			event.title = event.participants.join(" vs ");
		}

		// Extract from event name if needed
		if (!event.participants && espnEvent.name?.includes(" vs ")) {
			const parts = espnEvent.name.split(" vs ");
			if (parts.length === 2) {
				event.participants = parts.map(p => p.trim());
				event.title = espnEvent.name;
			}
		}

		// Check for Norwegian players
		if (this.config.norwegian?.players) {
			const eventText = JSON.stringify(espnEvent).toLowerCase();
			event.norwegian = this.config.norwegian.players.some(player => {
				const playerLower = player.toLowerCase();
				const nameParts = playerLower.split(/[\s,]+/);
				return nameParts.some(part => eventText.includes(part));
			});
		}

		return event;
	}

	applyCustomFilters(events) {
		// For tennis, only show matches with Norwegian players
		if (this.config.norwegian?.filterMode === "exclusive") {
			return events.filter(event => event.norwegian);
		}
		return super.applyCustomFilters(events);
	}
}

export async function fetchTennis() {
	const fetcher = new TennisFetcher();
	return await fetcher.fetch();
}