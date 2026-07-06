import { ESPNAdapter } from "../lib/adapters/espn-adapter.js";
import { sportsConfig } from "../config/sports-config.js";

// ESPN's core API exposes the full session list for a single F1 event.
const F1_CORE_COMPETITIONS = (id) =>
	`https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/events/${id}/competitions?lang=en&region=us`;

// Only re-stamp weekends the pipeline would actually keep (config timeRange is 30
// days). The lookback catches a Friday-dated weekend that is already "in the past"
// mid-weekend, before the pipeline's date filter drops it.
const RACE_LOOKAHEAD_MS = 35 * 86400000;
const RACE_LOOKBACK_MS = 3 * 86400000;

/** The Race session is type id "3" / abbreviation "Race" (not "Sprint"). */
function isRaceSession(competition) {
	const type = competition?.type || {};
	const abbr = (type.abbreviation || "").toLowerCase();
	const text = (type.text || "").toLowerCase();
	return abbr === "race" || text === "race" || String(type.id) === "3";
}

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
		let events;
		if (source?.api === "espn" && source?.type === "scoreboard" && source?.url) {
			const year = new Date().getFullYear();
			const separator = source.url.includes("?") ? "&" : "?";
			const hasDates = /[?&]dates=/.test(source.url);
			const patchedSource = hasDates
				? source
				: { ...source, url: `${source.url}${separator}dates=${year}` };
			events = await super.fetchFromSource(patchedSource);
		} else {
			events = await super.fetchFromSource(source);
		}
		return await this.useRaceSessionDates(events);
	}

	/**
	 * Re-stamp each near-term Grand Prix with its actual RACE session date/time.
	 *
	 * ESPN's F1 scoreboard dates a GP weekend to its FRIDAY practice session (FP1)
	 * and can mark it STATUS_FINAL before the race is run. Because the pipeline
	 * filters out events dated in the past, a weekend happening *now* drops off the
	 * board on Saturday and Sunday's race silently disappears — exactly how the
	 * British GP vanished on 2026-07-05 (see the source-quirks skill). Fixing it at
	 * the source: for each in-window weekend, pull the full session list from ESPN's
	 * core API and use the Race session's date, clearing the premature FINAL status.
	 *
	 * Fail-open: an event we can't enrich keeps ESPN's original (Friday) date, so
	 * this is never worse than before.
	 */
	async useRaceSessionDates(events) {
		if (!Array.isArray(events) || events.length === 0) return events;

		const now = Date.now();
		const corrected = [];
		for (const event of events) {
			corrected.push(await this.stampRaceSession(event, now));
		}
		return corrected;
	}

	async stampRaceSession(event, now) {
		const id = event?.id;
		const rawDate = event?.date ? new Date(event.date).getTime() : NaN;
		if (!id || Number.isNaN(rawDate)) return event;
		if (rawDate < now - RACE_LOOKBACK_MS || rawDate > now + RACE_LOOKAHEAD_MS) return event;

		try {
			const data = await this.apiClient.fetchJSON(F1_CORE_COMPETITIONS(id));
			const race = (data?.items || []).find(isRaceSession);
			if (!race?.date) return event;

			const patched = { ...event, date: race.date };
			// The scoreboard status reflects FP1 (often prematurely FINAL); drop it
			// so a future race isn't shown as finished. transformESPNEvent reads
			// espnEvent.status?.type?.name, so undefined → no bogus status.
			if (patched.status) delete patched.status;
			return patched;
		} catch (error) {
			console.warn(`F1: could not fetch race session for event ${id}:`, error.message);
			return event;
		}
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
