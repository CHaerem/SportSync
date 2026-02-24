import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";
import { EventFilters } from "../lib/filters.js";

// Top-tier CS2 events to always include for general coverage
const MAJOR_CS2_PATTERNS = [
	/major/i, /iem/i, /esl pro/i, /blast/i, /world cup/i,
	/pgl/i, /dreamhack/i, /champions/i, /pro league/i
];

function isMajorEvent(name) {
	return MAJOR_CS2_PATTERNS.some(p => p.test(name || ""));
}

/**
 * Parse Liquipedia Matches HTML into structured match objects.
 * The HTML comes from Liquipedia's MediaWiki parse API (action=parse&page=Liquipedia:Matches).
 * Uses regex-based parsing to avoid adding DOM dependencies.
 */
export function parseLiquipediaMatches(html) {
	if (!html || typeof html !== "string") return [];

	const matches = [];
	// Split on match-info containers (exact class, not sub-classes like match-info-tournament-name)
	const matchBlocks = html.split(/class="match-info(?:\s[^"]*)?(?=")/);

	for (let i = 1; i < matchBlocks.length; i++) {
		const block = matchBlocks[i];

		// Extract timestamp from timer-object data-timestamp attribute
		const timestampMatch = block.match(/data-timestamp="(\d+)"/);
		if (!timestampMatch) continue;
		const timestamp = parseInt(timestampMatch[1], 10) * 1000;

		// Extract team names - look for team name spans with anchors
		const teamNames = [];
		const teamMatches = [...block.matchAll(/class="name"[^>]*>(?:<a[^>]*>)?([^<]+)(?:<\/a>)?/g)];
		for (const tm of teamMatches) {
			const name = tm[1].trim();
			if (name && name !== "TBD") teamNames.push(name);
		}

		// Extract tournament name
		const tournamentMatch = block.match(/class="match-info-tournament-name"[^>]*>(?:<a[^>]*>)?([^<]+)/);
		const tournament = tournamentMatch ? tournamentMatch[1].trim() : "CS2 Match";

		// Extract format (Bo1, Bo3, Bo5)
		const formatMatch = block.match(/(?:Bo|Best of\s*)(\d)/i);
		const format = formatMatch ? `Bo${formatMatch[1]}` : null;

		// Extract scores if available
		const scoreMatches = [...block.matchAll(/class="match-info-header-scoreholder-score[^"]*"[^>]*>(\d+)/g)];
		const scores = scoreMatches.map(s => parseInt(s[1], 10));

		const team1 = teamNames[0] || "TBD";
		const team2 = teamNames[1] || "TBD";

		matches.push({
			team1,
			team2,
			timestamp,
			time: new Date(timestamp).toISOString(),
			tournament,
			format,
			score1: scores[0] ?? null,
			score2: scores[1] ?? null
		});
	}

	return matches;
}

export class EsportsFetcher extends BaseFetcher {
	constructor() {
		super(sportsConfig.esports);
	}

	async fetchFromSource(source) {
		if (source.api === "liquipedia") {
			return await this.fetchLiquipedia(source);
		} else if (source.api === "hltv") {
			return await this.fetchHLTV(source);
		} else if (source.api === "fallback" && source.enabled) {
			return await this.fetchFallbackMatches();
		}
		return [];
	}

	async fetchLiquipedia(source) {
		const matches = [];

		try {
			const params = new URLSearchParams(source.params);
			const url = `${source.url}?${params.toString()}`;
			console.log("Fetching Liquipedia CS2 matches from:", url);

			const data = await this.apiClient.fetchJSON(url, {
				headers: {
					"User-Agent": "SportSync/2.0 (https://github.com; sports dashboard; 1 req/2h)",
					"Accept": "application/json"
				},
				retries: 1
			});

			if (!data?.parse?.text) {
				console.warn("Liquipedia API did not return expected structure");
				return matches;
			}

			// The API returns { parse: { text: { "*": "<html>..." } } }
			const html = data.parse.text["*"] || data.parse.text;
			if (typeof html !== "string") {
				console.warn("Liquipedia HTML content not found in response");
				return matches;
			}

			const parsed = parseLiquipediaMatches(html);
			console.log(`Parsed ${parsed.length} Liquipedia matches`);

			const focusTeams = this.config.filters?.teams || [];

			const filtered = parsed.filter(match => {
				const hasFocusTeam = focusTeams.some(team =>
					match.team1.toLowerCase().includes(team.toLowerCase()) ||
					match.team2.toLowerCase().includes(team.toLowerCase())
				);
				return hasFocusTeam || isMajorEvent(match.tournament);
			});

			console.log(`Filtered to ${filtered.length} matches (focus teams + major events)`);

			for (const match of filtered.slice(0, 10)) {
				matches.push({
					title: `${match.team1} vs ${match.team2}`,
					time: match.time,
					venue: "Online",
					tournament: match.tournament,
					format: match.format,
					norwegian: this.isNorwegianTeamFromNames(match.team1, match.team2),
					meta: match.tournament
				});
			}
		} catch (error) {
			console.error("Failed to fetch Liquipedia data:", error.message);
		}

		return matches;
	}

	async fetchHLTV(source) {
		const matches = [];

		try {
			console.log("Fetching HLTV matches from:", source.url);
			const data = await this.apiClient.fetchJSON(source.url, { retries: 2 });

			if (!Array.isArray(data)) {
				console.warn("HLTV API did not return an array");
				return matches;
			}

			console.log(`Total HLTV matches found: ${data.length}`);

			// Check data freshness
			const newest = data.reduce((max, m) => {
				const t = new Date(m.date || m.time || 0).getTime();
				return t > max ? t : max;
			}, 0);
			const daysSinceNewest = (Date.now() - newest) / (1000 * 60 * 60 * 24);
			if (daysSinceNewest > 30) {
				console.warn(`HLTV data is stale (${Math.round(daysSinceNewest)} days old), skipping`);
				return matches;
			}

			const focusTeams = this.config.filters?.teams || [];

			const filteredMatches = data.filter(match => {
				const team1 = this.extractTeamName(match, 0);
				const team2 = this.extractTeamName(match, 1);
				const eventName = match.event?.name || match.tournament?.name || "";

				const hasFocusTeam = focusTeams.some(team =>
					team1.toLowerCase().includes(team.toLowerCase()) ||
					team2.toLowerCase().includes(team.toLowerCase())
				);
				return hasFocusTeam || isMajorEvent(eventName);
			});

			console.log(`Filtered to ${filteredMatches.length} matches with focus teams`);

			for (const match of filteredMatches.slice(0, 10)) {
				matches.push({
					title: `${this.extractTeamName(match, 0)} vs ${this.extractTeamName(match, 1)}`,
					time: match.date || match.time || match.timestamp,
					venue: "Online",
					tournament: match.event?.name || match.tournament?.name || "CS2 Match",
					norwegian: this.isNorwegianTeam(match),
					meta: match.event?.name || "CS2 Competition"
				});
			}
		} catch (error) {
			console.error("Failed to fetch HLTV data:", error.message);
		}

		return matches;
	}

	async fetchFallbackMatches() {
		const now = new Date();
		const currentWeekStart = new Date(now);
		currentWeekStart.setDate(now.getDate() - now.getDay());
		const currentWeekEnd = new Date(currentWeekStart);
		currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

		// No hardcoded matches — rely on API data
		const knownMatches = [];

		return knownMatches.filter(match => {
			const matchDate = new Date(match.time);
			return matchDate >= currentWeekStart && matchDate <= currentWeekEnd;
		});
	}

	extractTeamName(match, index) {
		// Try multiple possible structures
		const paths = [
			`team${index + 1}.name`,
			`team${['A', 'B'][index]}.name`,
			`opponents[${index}].name`,
			`competitors[${index}].name`
		];

		for (const path of paths) {
			const value = this.getNestedValue(match, path);
			if (value) return value;
		}

		return "TBD";
	}

	getNestedValue(obj, path) {
		return path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
			return current?.[key];
		}, obj);
	}

	isNorwegianTeam(match) {
		const norwegianTeams = this.config.norwegian?.teams || [];
		const matchText = JSON.stringify(match).toLowerCase();

		return norwegianTeams.some(team =>
			matchText.includes(team.toLowerCase())
		);
	}

	isNorwegianTeamFromNames(team1, team2) {
		const norwegianTeams = this.config.norwegian?.teams || [];
		const text = `${team1} ${team2}`.toLowerCase();
		return norwegianTeams.some(team => text.includes(team.toLowerCase()));
	}

	transformToEvents(rawData) {
		const events = [];

		for (const item of rawData) {
			const normalized = EventNormalizer.normalize(item, this.config.sport);
			if (normalized && EventNormalizer.validateEvent(normalized)) {
				// Add streaming platforms
				if (this.config.streaming && normalized.norwegian) {
					normalized.streaming = this.config.streaming;
				}
				events.push(normalized);
			}
		}

		return EventNormalizer.deduplicate(events);
	}

	applyCustomFilters(events) {
		// Apply current week filter if configured
		if (this.config.filters?.currentWeek) {
			events = EventFilters.filterCurrentWeek(events);
		}

		return super.applyCustomFilters(events);
	}

	formatResponse(events) {
		const response = super.formatResponse(events);
		// Include Liquipedia attribution
		const liquipediaSource = this.config.sources?.find(s => s.api === "liquipedia");
		if (liquipediaSource?.attribution) {
			response.attribution = liquipediaSource.attribution;
		}
		return response;
	}
}

export async function fetchEsports() {
	const fetcher = new EsportsFetcher();
	return await fetcher.fetch();
}
