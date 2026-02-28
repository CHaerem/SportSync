import fs from "fs";
import path from "path";
import { BaseFetcher } from "../lib/base-fetcher.js";
import { sportsConfig } from "../config/sports-config.js";
import { EventNormalizer } from "../lib/event-normalizer.js";
import { EventFilters } from "../lib/filters.js";
import { readJsonIfExists } from "../lib/helpers.js";

// Top-tier CS2 events to always include for general coverage
const MAJOR_CS2_PATTERNS = [
	/major/i, /iem/i, /esl pro/i, /blast/i, /world cup/i,
	/pgl/i, /dreamhack/i, /champions/i, /pro league/i, /draculan/i
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
		if (source.api === "curated-configs") {
			return await this.fetchFromCuratedConfigs();
		} else if (source.api === "liquipedia") {
			return await this.fetchLiquipedia(source);
		} else if (source.api === "hltv") {
			return await this.fetchHLTV(source);
		} else if (source.api === "fallback" && source.enabled) {
			return await this.fetchFallbackMatches();
		}
		return [];
	}

	/**
	 * Extract upcoming/scheduled matches from curated config bracket data.
	 * The discovery loop (Claude CLI + WebSearch) maintains these configs,
	 * so we get fresh match data without needing external APIs.
	 */
	async fetchFromCuratedConfigs() {
		const configDir = path.resolve(process.cwd(), "scripts", "config");
		if (!fs.existsSync(configDir)) return [];

		const matches = [];
		const configFiles = fs.readdirSync(configDir).filter(f => f.startsWith("esports-") && f.endsWith(".json"));

		for (const file of configFiles) {
			const config = readJsonIfExists(path.join(configDir, file));
			if (!config?.tournaments) continue;

			for (const tournament of config.tournaments) {
				if (!tournament.bracket) continue;
				const tName = tournament.name || file.replace(".json", "");

				// Extract matches from all bracket sections
				const bracketMatches = this._extractBracketMatches(tournament.bracket, tName);
				matches.push(...bracketMatches);
			}
		}

		console.log(`Extracted ${matches.length} matches from curated configs`);
		return matches;
	}

	/**
	 * Recursively extract matches from bracket data structure.
	 * Handles: groups, playoffs (upper/lower bracket), grandFinal.
	 */
	_extractBracketMatches(bracket, tournamentName) {
		const matches = [];
		const now = Date.now();
		const MS_PER_DAY = 86400000;
		const windowStart = now - 1 * MS_PER_DAY;  // Include recent (1 day ago)
		const windowEnd = now + 14 * MS_PER_DAY;    // Up to 14 days ahead

		// Helper to process a round's matches
		const processRound = (round, stage) => {
			if (!round?.matches) return;
			for (const match of round.matches) {
				if (!match.team1 || !match.team2) continue;
				if (match.team1 === "TBD" && match.team2 === "TBD") continue;

				// Determine time — use scheduledTime, or the round's scheduledTime
				const timeStr = match.scheduledTime || round.scheduledTime;
				const matchTime = timeStr ? new Date(timeStr).getTime() : null;

				// Skip matches outside our window (if we know the time)
				if (matchTime && (matchTime < windowStart || matchTime > windowEnd)) continue;

				const isScheduled = match.status === "scheduled" || !match.winner;
				const isCompleted = match.status === "completed" || !!match.winner;

				// For completed matches without a time, skip (they're historical)
				if (isCompleted && !matchTime) continue;

				const roundName = round.round || stage || "";
				matches.push({
					title: `${match.team1} vs ${match.team2}`,
					time: timeStr ? new Date(timeStr).toISOString() : new Date().toISOString(),
					venue: "Online",
					tournament: tournamentName,
					format: match.score ? null : "Bo3",
					stage: roundName,
					result: isCompleted ? { winner: match.winner, score: match.score } : null,
					status: isCompleted ? "completed" : "scheduled",
					norwegian: this.isNorwegianTeamFromNames(match.team1, match.team2),
					meta: `${tournamentName} - ${roundName}`
				});
			}
		};

		// Groups
		if (bracket.groups) {
			for (const [groupId, group] of Object.entries(bracket.groups)) {
				processRound({ matches: group.matches, round: `Group ${groupId}` }, `Group ${groupId}`);
			}
		}

		// Playoffs
		if (bracket.playoffs) {
			const playoffs = bracket.playoffs;

			// Upper bracket rounds
			if (Array.isArray(playoffs.upperBracket)) {
				for (const round of playoffs.upperBracket) {
					processRound(round, `UB ${round.round || ""}`);
				}
			}

			// Lower bracket rounds
			if (Array.isArray(playoffs.lowerBracket)) {
				for (const round of playoffs.lowerBracket) {
					processRound(round, `LB ${round.round || ""}`);
				}
			}

			// Grand final
			if (playoffs.grandFinal) {
				processRound({ ...playoffs.grandFinal, round: playoffs.grandFinal.round || "Grand Final" }, "Grand Final");
			}
		}

		return matches;
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
		return super.formatResponse(events);
	}
}

export async function fetchEsports() {
	const fetcher = new EsportsFetcher();
	return await fetcher.fetch();
}
