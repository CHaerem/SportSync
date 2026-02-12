import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";

export class F1Fetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.f1);
	}

	transformESPNEvent(espnEvent) {
		const event = super.transformESPNEvent(espnEvent);
		if (!event) return null;

		// F1 specific transformations
		event.meta = "Formula 1 2025 - Race Weekend";
		event.venue = event.venue || "F1 Circuit";
		
		// F1 doesn't have Norwegian focus
		event.norwegian = false;

		return event;
	}
}

export async function fetchF1ESPN() {
	const fetcher = new F1Fetcher();
	return await fetcher.fetch();
}