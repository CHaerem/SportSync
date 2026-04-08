import fs from "fs";
import path from "path";
import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";
import { readJsonIfExists } from "../lib/helpers.js";

export class CyclingFetcher extends BaseFetcher {
	constructor() {
		super(sportsConfig.cycling);
	}

	async fetchFromSource(source) {
		if (source.api === "curated-configs") {
			return await this.fetchFromCuratedConfigs();
		}
		return [];
	}

	/**
	 * Read cycling events from curated config files in scripts/config/.
	 * The discovery loop (Claude CLI + WebSearch) maintains these configs,
	 * so we get fresh race data without needing external APIs.
	 *
	 * ESPN does not have a cycling/scoreboard endpoint, so curated configs
	 * are the primary (and currently only) data source for cycling.
	 */
	async fetchFromCuratedConfigs() {
		const configDir = path.resolve(process.cwd(), "scripts", "config");
		if (!fs.existsSync(configDir)) return [];

		const events = [];
		const configFiles = fs.readdirSync(configDir).filter(
			f => f.startsWith("cycling-") && f.endsWith(".json")
		);

		for (const file of configFiles) {
			const config = readJsonIfExists(path.join(configDir, file));
			if (!config?.events) continue;

			const configName = config.name || file.replace(".json", "");

			for (const event of config.events) {
				const norwegianPlayers = event.norwegianPlayers || [];
				const hasNorwegian = event.norwegian || norwegianPlayers.length > 0;

				events.push({
					title: event.title,
					time: event.time,
					endTime: event.endTime || undefined,
					venue: event.venue || config.location || "TBD",
					tournament: configName,
					norwegian: hasNorwegian,
					norwegianPlayers: norwegianPlayers.length > 0 ? norwegianPlayers : undefined,
					streaming: event.streaming || [],
					meta: configName,
					notes: event.notes || undefined
				});
			}
		}

		console.log(`Cycling: extracted ${events.length} events from ${configFiles.length} config files`);
		return events;
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
