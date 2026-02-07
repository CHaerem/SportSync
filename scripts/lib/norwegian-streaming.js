/**
 * Norwegian Streaming Service Mapper
 * Maps sports and leagues to Norwegian streaming services
 */

export const norwegianStreamingMap = {
	football: {
		// Premier League
		"Premier League": [
			{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" }
		],
		// La Liga
		"La Liga": [
			{ platform: "TV 2 Play", url: "https://play.tv2.no", type: "streaming" }
		],
		// Champions League
		"UEFA Champions League": [
			{ platform: "TV 2 Play", url: "https://play.tv2.no", type: "streaming" }
		],
		// Europa League
		"UEFA Europa League": [
			{ platform: "TV 2 Play", url: "https://play.tv2.no", type: "streaming" }
		],
		// Serie A (Italy)
		"Serie A": [
			{ platform: "TV 2 Play", url: "https://play.tv2.no", type: "streaming" }
		],
		// Bundesliga
		"Bundesliga": [
			{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" }
		],
		// Ligue 1
		"Ligue 1": [
			{ platform: "TV 2 Play", url: "https://play.tv2.no", type: "streaming" }
		],
		// Norwegian leagues
		"Eliteserien": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"OBOS-ligaen": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		// Default for other football
		"default": [
			{ platform: "Check local listings", url: "", type: "info" }
		]
	},
	
	golf: {
		"PGA Tour": [
			{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" },
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"DP World Tour": [
			{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" },
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"The Masters": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"default": [
			{ platform: "Viaplay/Discovery+", url: "https://viaplay.no", type: "streaming" }
		]
	},
	
	tennis: {
		"ATP Tour": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"WTA Tour": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"Grand Slam": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"Davis Cup": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		],
		"default": [
			{ platform: "Discovery+", url: "https://www.discoveryplus.no", type: "streaming" }
		]
	},
	
	f1: {
		"Formula 1": [
			{ platform: "Viaplay", url: "https://viaplay.no", type: "streaming" },
			{ platform: "F1 TV Pro", url: "https://f1tv.formula1.com", type: "streaming" }
		],
		"default": [
			{ platform: "Viaplay/F1 TV", url: "https://viaplay.no", type: "streaming" }
		]
	},
	
	chess: {
		"default": [
			{ platform: "chess24", url: "https://chess24.com", type: "streaming" },
			{ platform: "Chess.com", url: "https://chess.com/tv", type: "streaming" }
		]
	},
	
	esports: {
		"CS:GO": [
			{ platform: "Twitch", url: "https://twitch.tv", type: "streaming" },
			{ platform: "YouTube", url: "https://youtube.com", type: "streaming" }
		],
		"CS2": [
			{ platform: "Twitch", url: "https://twitch.tv", type: "streaming" },
			{ platform: "YouTube", url: "https://youtube.com", type: "streaming" }
		],
		"default": [
			{ platform: "Twitch", url: "https://twitch.tv", type: "streaming" }
		]
	}
};

/**
 * Get Norwegian streaming services for an event
 */
export function getNorwegianStreaming(sport, league) {
	const sportKey = sport.toLowerCase();
	// Handle sport name aliases (e.g., "formula1" → "f1")
	const sportAliases = { formula1: "f1" };
	const sportMap = norwegianStreamingMap[sportAliases[sportKey] || sportKey];
	if (!sportMap) return [];
	
	// Try to find exact league match
	for (const [key, services] of Object.entries(sportMap)) {
		if (key !== 'default' && league && league.toLowerCase().includes(key.toLowerCase())) {
			return services;
		}
	}
	
	// Return default for the sport
	return sportMap.default || [];
}

/**
 * Apply Norwegian streaming to an event
 */
export function applyNorwegianStreaming(event) {
	if (!event) return event;
	
	const norwegianServices = getNorwegianStreaming(
		event.sport,
		event.meta || event.tournament || event.league
	);
	
	if (norwegianServices.length > 0) {
		event.streaming = norwegianServices;
	}
	
	return event;
}