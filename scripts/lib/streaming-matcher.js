/**
 * Streaming Matcher
 *
 * Matches tvkampen.com scrape entries to events.json events
 * using fuzzy team name + time matching.
 */

/**
 * Team name alias table for hard-to-match cases.
 * Keys are normalized names (lowercase, no accents, no suffixes).
 * Values are arrays of alternative normalized names.
 * Data-driven — the autopilot can extend this table.
 */
export const TEAM_ALIASES = {
	"bodo glimt": ["bodoe glimt", "bodo/glimt", "bodø/glimt", "fk bodø/glimt"],
	"psg": ["paris saint germain", "paris sg", "paris saint-germain"],
	"paris saint germain": ["psg", "paris sg"],
	"man city": ["manchester city"],
	"manchester city": ["man city"],
	"man united": ["manchester united", "man utd"],
	"manchester united": ["man united", "man utd"],
	"atletico madrid": ["atletico de madrid", "club atletico de madrid", "atl madrid", "atl. madrid"],
	"inter": ["inter milan", "fc internazionale", "internazionale"],
	"inter milan": ["inter", "fc internazionale"],
	"ac milan": ["milan"],
	"spurs": ["tottenham", "tottenham hotspur"],
	"tottenham": ["spurs", "tottenham hotspur"],
	"tottenham hotspur": ["tottenham", "spurs"],
	"wolves": ["wolverhampton", "wolverhampton wanderers"],
	"wolverhampton": ["wolves", "wolverhampton wanderers"],
	"newcastle": ["newcastle united"],
	"newcastle united": ["newcastle"],
	"west ham": ["west ham united"],
	"west ham united": ["west ham"],
	"brighton": ["brighton and hove albion", "brighton & hove albion"],
	"bayern": ["bayern munich", "bayern munchen", "fc bayern"],
	"bayern munich": ["bayern", "bayern munchen", "fc bayern"],
	"dortmund": ["borussia dortmund", "bvb"],
	"borussia dortmund": ["dortmund", "bvb"],
	"real madrid": ["real", "real madrid cf"],
	"barcelona": ["fc barcelona", "barca"],
	"fc barcelona": ["barcelona", "barca"],
	"juventus": ["juve"],
	"lyn": ["lyn oslo", "fk lyn", "lyn fk"],
	"lyn oslo": ["lyn", "fk lyn"],
	"rosenborg": ["rosenborg bk", "rbk"],
	"molde": ["molde fk"],
	"viking": ["viking fk"],
	"brann": ["sk brann"],
	"valerenga": ["vaalerenga", "vålerenga", "valerenga if", "vif"],
};

/**
 * Normalize a team name for fuzzy matching:
 * - Lowercase
 * - Strip diacritics/accents
 * - Remove common suffixes (FC, FK, SK, IF, BK, CF, SC, SL, AC)
 * - Collapse whitespace
 */
export function normalizeTeamName(name) {
	if (!name) return "";
	return name
		.toLowerCase()
		// Replace Nordic characters that don't decompose via NFD
		.replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a")
		.replace(/ö/g, "o").replace(/ä/g, "a").replace(/ü/g, "u")
		.replace(/ð/g, "d").replace(/þ/g, "th")
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip remaining accents
		.replace(/\b(?:fc|fk|sk|if|bk|cf|sc|sl|ac|afc|ssc)\b/gi, "")
		.replace(/[^a-z0-9\s]/g, " ")  // remove non-alphanumeric
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Check if two team names match (exact or via alias table).
 * @returns {boolean}
 */
export function teamsMatch(nameA, nameB) {
	const a = normalizeTeamName(nameA);
	const b = normalizeTeamName(nameB);

	if (!a || !b) return false;

	// Exact match
	if (a === b) return true;

	// Substring containment (for short vs long names)
	if (a.length >= 3 && b.length >= 3) {
		if (a.includes(b) || b.includes(a)) return true;
	}

	// Alias table lookup
	const aliasesA = TEAM_ALIASES[a] || [];
	const aliasesB = TEAM_ALIASES[b] || [];

	for (const alias of aliasesA) {
		const normAlias = normalizeTeamName(alias);
		if (normAlias === b || normAlias.includes(b) || b.includes(normAlias)) return true;
	}
	for (const alias of aliasesB) {
		const normAlias = normalizeTeamName(alias);
		if (normAlias === a || normAlias.includes(a) || a.includes(normAlias)) return true;
	}

	return false;
}

/**
 * Compute a match confidence score between a tvkampen entry and an event.
 *
 * Scoring:
 *   - Time within 30 minutes: required (returns 0 if outside)
 *   - Home team match: +0.3
 *   - Away team match: +0.3
 *   - League/tournament match: +0.1
 *   - Base if time matches: +0.3
 *
 * @param {object} tvkEntry - { homeTeam, awayTeam, time (HH:MM), matchUrl }
 * @param {object} event - events.json event { homeTeam, awayTeam, time (ISO), tournament }
 * @param {string} [dateStr] - Date context (YYYY-MM-DD) for resolving tvkampen HH:MM times
 * @returns {number} 0-1 confidence score
 */
export function computeMatchScore(tvkEntry, event, dateStr) {
	if (!event.time) return 0;

	// Time gate: tvkampen time is HH:MM, event time is ISO
	const eventDate = new Date(event.time);
	let timeDiffMin = Infinity;

	if (tvkEntry.time && dateStr) {
		const [hours, minutes] = tvkEntry.time.split(":").map(Number);
		const tvkDate = new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
		timeDiffMin = Math.abs(eventDate.getTime() - tvkDate.getTime()) / 60000;
	} else if (tvkEntry.time) {
		// Compare just time-of-day if no date context
		const eventHours = eventDate.getUTCHours();
		const eventMinutes = eventDate.getUTCMinutes();
		const [tvkH, tvkM] = tvkEntry.time.split(":").map(Number);
		// tvkampen times are CET/CEST — subtract 1 hour for rough UTC comparison
		const tvkMinOfDay = (tvkH - 1) * 60 + tvkM;
		const eventMinOfDay = eventHours * 60 + eventMinutes;
		timeDiffMin = Math.abs(eventMinOfDay - tvkMinOfDay);
		if (timeDiffMin > 720) timeDiffMin = 1440 - timeDiffMin; // wrap around midnight
	}

	// Hard gate: must be within 30 minutes
	if (timeDiffMin > 30) return 0;

	let score = 0.3; // base score for time match

	// Team matching
	if (teamsMatch(tvkEntry.homeTeam, event.homeTeam)) score += 0.3;
	if (teamsMatch(tvkEntry.awayTeam, event.awayTeam)) score += 0.3;

	// Also try cross-match (home/away swapped between sources)
	if (score < 0.9) {
		let crossScore = 0.3;
		if (teamsMatch(tvkEntry.homeTeam, event.awayTeam)) crossScore += 0.25;
		if (teamsMatch(tvkEntry.awayTeam, event.homeTeam)) crossScore += 0.25;
		if (crossScore > score) score = crossScore;
	}

	// League/tournament bonus
	const tvkLeague = (tvkEntry.league || "").toLowerCase();
	const eventTournament = (event.tournament || event.meta || "").toLowerCase();
	if (tvkLeague && eventTournament && (tvkLeague.includes(eventTournament) || eventTournament.includes(tvkLeague))) {
		score += 0.1;
	}

	return Math.min(score, 1);
}

/**
 * Match tvkampen entries to events.json events.
 *
 * @param {Array} tvkEntries - Scraped tvkampen entries with broadcasters
 * @param {Array} events - events.json events
 * @param {object} [options]
 * @param {number} [options.minConfidence=0.6] - Minimum confidence to accept a match
 * @param {string} [options.dateStr] - Date context for time matching
 * @returns {Array<{tvkEntry: object, event: object, confidence: number}>}
 */
export function matchTvkampenToEvents(tvkEntries, events, options = {}) {
	const { minConfidence = 0.6, dateStr } = options;
	const matched = [];
	const usedEventIndices = new Set();

	for (const tvk of tvkEntries) {
		let bestScore = 0;
		let bestIdx = -1;

		for (let i = 0; i < events.length; i++) {
			if (usedEventIndices.has(i)) continue;
			const score = computeMatchScore(tvk, events[i], dateStr);
			if (score > bestScore) {
				bestScore = score;
				bestIdx = i;
			}
		}

		if (bestScore >= minConfidence && bestIdx >= 0) {
			usedEventIndices.add(bestIdx);
			matched.push({
				tvkEntry: tvk,
				event: events[bestIdx],
				confidence: Number(bestScore.toFixed(2)),
			});
		}
	}

	return matched;
}
