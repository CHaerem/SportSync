/**
 * Broadcaster URL Mapper
 *
 * Maps Norwegian broadcaster names (from tvkampen.com) to streaming URLs.
 * Data-driven — the autopilot can extend the BROADCASTER_MAP.
 */

/**
 * Broadcaster URL mapping.
 * Keys are lowercase broadcaster names (normalized).
 * Values are { platform, baseUrl, type }.
 */
export const BROADCASTER_MAP = {
	// TV 2 family
	"tv 2 play": { platform: "TV 2 Play", baseUrl: "https://play.tv2.no/sport/fotball/", type: "streaming" },
	"tv2 play": { platform: "TV 2 Play", baseUrl: "https://play.tv2.no/sport/fotball/", type: "streaming" },
	"tv 2 sport 1": { platform: "TV 2 Sport 1", baseUrl: "https://play.tv2.no/sport/fotball/", type: "tv" },
	"tv 2 sport 2": { platform: "TV 2 Sport 2", baseUrl: "https://play.tv2.no/sport/fotball/", type: "tv" },
	"tv 2 sport premium": { platform: "TV 2 Sport Premium", baseUrl: "https://play.tv2.no/sport/fotball/", type: "tv" },
	"tv 2 direkte": { platform: "TV 2 Direkte", baseUrl: "https://play.tv2.no/sport/fotball/", type: "tv" },
	"tv2 sport": { platform: "TV 2 Sport", baseUrl: "https://play.tv2.no/sport/fotball/", type: "tv" },

	// Viaplay family
	"viaplay": { platform: "Viaplay", baseUrl: "https://viaplay.no/sport/fotball/", type: "streaming" },
	"v sport 1": { platform: "V Sport 1", baseUrl: "https://viaplay.no/sport/fotball/", type: "tv" },
	"v sport 2": { platform: "V Sport 2", baseUrl: "https://viaplay.no/sport/fotball/", type: "tv" },
	"v sport+": { platform: "V Sport+", baseUrl: "https://viaplay.no/sport/fotball/", type: "tv" },
	"v sport fotball": { platform: "V Sport Fotball", baseUrl: "https://viaplay.no/sport/fotball/", type: "tv" },

	// Discovery family
	"discovery+": { platform: "Discovery+", baseUrl: "https://www.discoveryplus.no/sport", type: "streaming" },
	"eurosport 1": { platform: "Eurosport 1", baseUrl: "https://www.discoveryplus.no/sport", type: "tv" },
	"eurosport 2": { platform: "Eurosport 2", baseUrl: "https://www.discoveryplus.no/sport", type: "tv" },
	"eurosport norge": { platform: "Eurosport Norge", baseUrl: "https://www.discoveryplus.no/sport", type: "tv" },

	// NRK
	"nrk1": { platform: "NRK1", baseUrl: "https://tv.nrk.no/direkte/nrk1", type: "free" },
	"nrk2": { platform: "NRK2", baseUrl: "https://tv.nrk.no/direkte/nrk2", type: "free" },
	"nrk sport": { platform: "NRK Sport", baseUrl: "https://tv.nrk.no/direkte/nrk1", type: "free" },

	// Other
	"dazn": { platform: "DAZN", baseUrl: "https://www.dazn.com/en-NO/sport/", type: "streaming" },
	"max": { platform: "MAX", baseUrl: "https://play.max.com/", type: "streaming" },
	"paramount+": { platform: "Paramount+", baseUrl: "https://www.paramountplus.com/", type: "streaming" },
};

/**
 * Sport-specific URL path overrides.
 * When a sport is known, append a sport-specific path to the base URL.
 */
const SPORT_PATHS = {
	football: {
		"tv 2 play": "fotball/",
		"viaplay": "fotball/",
		"discovery+": "/fotball",
	},
	golf: {
		"tv 2 play": "golf/",
		"viaplay": "golf/",
		"discovery+": "/golf",
	},
	tennis: {
		"discovery+": "/tennis",
	},
	f1: {
		"viaplay": "motorsport/",
	},
};

/**
 * Build a streaming entry from a broadcaster name.
 *
 * @param {string} broadcasterName - Raw broadcaster name from tvkampen
 * @param {object} [event] - Optional event for sport-specific URL paths
 * @returns {{ platform: string, url: string, type: string, source: string }}
 */
export function buildStreamingEntry(broadcasterName, event) {
	const key = broadcasterName.toLowerCase().trim();
	const mapping = BROADCASTER_MAP[key];

	if (!mapping) {
		return {
			platform: broadcasterName,
			url: "",
			type: "unknown",
			source: "tvkampen",
		};
	}

	// Build sport-specific URL if possible
	let url = mapping.baseUrl;
	const sport = (event?.sport || "").toLowerCase();
	const sportPaths = SPORT_PATHS[sport];
	if (sportPaths && sportPaths[key]) {
		// Replace the sport path in the base URL if it exists, or append
		const baseWithoutTrailingPath = mapping.baseUrl.replace(/\/[a-z]+\/$/, "/");
		url = baseWithoutTrailingPath + sportPaths[key];
	}

	return {
		platform: mapping.platform,
		url,
		type: mapping.type,
		source: "tvkampen",
	};
}

/**
 * Build streaming entries from an array of broadcaster names.
 * Deduplicates by platform name.
 *
 * @param {string[]} broadcasters - Array of broadcaster names
 * @param {object} [event] - Optional event for sport-specific URLs
 * @returns {Array<{ platform: string, url: string, type: string, source: string }>}
 */
export function buildStreamingEntries(broadcasters, event) {
	const seen = new Set();
	const entries = [];

	for (const name of broadcasters) {
		const entry = buildStreamingEntry(name, event);
		if (!seen.has(entry.platform)) {
			seen.add(entry.platform);
			entries.push(entry);
		}
	}

	return entries;
}
