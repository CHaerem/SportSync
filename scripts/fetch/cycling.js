import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";

export class CyclingFetcher extends BaseFetcher {
	constructor() {
		super(sportsConfig.cycling);
	}

	async fetchFromSource() {
		// ESPN has no cycling endpoint, and the old curated-config reading
		// (scripts/config/cycling-*.json) is gone — build-events.js's generic
		// config pass owns curated configs. Cycling events come from the
		// research agent (see CLAUDE.md: sports without an API).
		return [];
	}

	transformToEvents(rawData) {
		const events = [];

		for (const item of rawData) {
			const normalized = EventNormalizer.normalize(item, this.config.sport);
			if (normalized && EventNormalizer.validateEvent(normalized)) {
				events.push(normalized);
			}
		}

		return EventNormalizer.deduplicate(events);
	}

	applyCustomFilters(events) {
		return super.applyCustomFilters(events);
	}

	formatResponse(events) {
		const response = super.formatResponse(events);
		// Empty cycling results may be normal (off-season or between races),
		// not necessarily a fetch failure — don't retain stale data
		if (events.length === 0) response._noRetain = true;
		return response;
	}
}

export async function fetchCycling() {
	const fetcher = new CyclingFetcher();
	return await fetcher.fetch();
}
