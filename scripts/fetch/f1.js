import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";

export class F1Fetcher extends ESPNAdapter {
	constructor() {
		super(sportsConfig.f1);
	}

	/**
	 * Override to append ?dates=<currentYear> to the ESPN F1 scoreboard URL.
	 *
	 * Without a `dates` parameter, ESPN's F1 scoreboard silently returns only
	 * the single most-recent race (which quickly becomes stale). Appending
	 * `?dates=<year>` returns the entire season (~24 races). The year is
	 * derived dynamically so no annual config churn is needed.
	 */
	async fetchFromSource(source) {
		if (source?.api === "espn" && source?.type === "scoreboard" && source?.url) {
			const year = new Date().getFullYear();
			const separator = source.url.includes("?") ? "&" : "?";
			const hasDates = /[?&]dates=/.test(source.url);
			const patchedSource = hasDates
				? source
				: { ...source, url: `${source.url}${separator}dates=${year}` };
			return super.fetchFromSource(patchedSource);
		}
		return super.fetchFromSource(source);
	}

	transformESPNEvent(espnEvent) {
		const event = super.transformESPNEvent(espnEvent);
		if (!event) return null;

		// F1 specific transformations — use current year dynamically
		const year = new Date().getFullYear();
		event.meta = `Formula 1 ${year} - Race Weekend`;
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