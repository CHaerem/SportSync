/**
 * Focus-Team Filter — Shared utility for esports team-level event filtering
 *
 * Ensures only events involving the user's favorite esports organizations
 * make it through the pipeline. Used at every stage:
 * - Recipe results (run-recipes.js)
 * - Build-time aggregation (build-events.js)
 * - Discovery validation (discover-events.js)
 *
 * Non-esports events pass through untouched.
 * Esports events without team references also pass through (tournament-level events).
 */

import { readJsonIfExists } from "./helpers.js";
import path from "path";

/**
 * Known aliases for esports organizations.
 * Maps canonical name (lowercase) → array of alternative patterns (lowercase).
 * This allows matching "100T" in event titles against "100 Thieves" in user prefs.
 */
const TEAM_ALIASES = {
	"100 thieves": ["100t", "hundred thieves", "100thieves"],
	"fnatic": ["fnc"],
	"natus vincere": ["navi", "na'vi", "na`vi"],
	"team liquid": ["liquid", "tl"],
	"g2 esports": ["g2"],
	"cloud9": ["c9"],
	"faze clan": ["faze"],
	"team vitality": ["vitality", "vit"],
	"virtus.pro": ["vp", "virtuspro"],
	"mouz": ["mousesports"],
	"heroic": [],
	"astralis": [],
	"ence": [],
	"complexity": ["col", "complexity gaming"],
	"eternal fire": ["ef"],
	"the mongolz": ["mongolz"],
	"spirit": ["team spirit"],
};

/**
 * Build a matcher function for a set of team names.
 * Returns (text) => boolean — case-insensitive, checks canonical names + aliases.
 *
 * @param {string[]} teamNames - Canonical team names (e.g., ["100 Thieves"])
 * @returns {(text: string) => boolean}
 */
export function buildTeamMatcher(teamNames) {
	if (!teamNames || teamNames.length === 0) {
		return () => false;
	}

	// Build a flat list of all patterns to match
	const patterns = [];
	for (const name of teamNames) {
		const lower = name.toLowerCase();
		patterns.push(lower);
		// Add known aliases
		const aliases = TEAM_ALIASES[lower] || [];
		patterns.push(...aliases);
		// Also check if the name itself is an alias for something
		for (const [canonical, aliasList] of Object.entries(TEAM_ALIASES)) {
			if (aliasList.includes(lower) && !patterns.includes(canonical)) {
				patterns.push(canonical);
			}
		}
	}

	return (text) => {
		if (!text) return false;
		const lower = text.toLowerCase();
		return patterns.some((p) => lower.includes(p));
	};
}

/**
 * Check if an event involves a focus team.
 * Checks title, team1/team2, homeTeam/awayTeam, participants, and focusTeam field.
 *
 * @param {object} event - Event object
 * @param {(text: string) => boolean} matcher - Team matcher function from buildTeamMatcher()
 * @returns {boolean}
 */
export function eventInvolvesFocusTeam(event, matcher) {
	if (!event || !matcher) return false;

	// Direct focusTeam field (set by config/discovery)
	if (event.focusTeam && matcher(event.focusTeam)) return true;

	// Title match (e.g., "100 Thieves vs ENCE")
	if (event.title && matcher(event.title)) return true;

	// Team fields
	if (event.team1 && matcher(event.team1)) return true;
	if (event.team2 && matcher(event.team2)) return true;
	if (event.homeTeam && matcher(event.homeTeam)) return true;
	if (event.awayTeam && matcher(event.awayTeam)) return true;

	// Participants array
	if (Array.isArray(event.participants)) {
		for (const p of event.participants) {
			const name = typeof p === "string" ? p : p?.name || p?.team;
			if (name && matcher(name)) return true;
		}
	}

	return false;
}

/**
 * Resolve focus teams for a config from config-level and user-context-level settings.
 *
 * @param {object} config - Curated config object (may have norwegianTeams)
 * @param {object} userContext - User context (may have favoriteEsportsOrgs)
 * @returns {string[]} - List of focus team names
 */
export function resolveFocusTeams(config, userContext) {
	const teams = [];

	// Config-level teams take priority
	if (Array.isArray(config?.norwegianTeams)) {
		teams.push(...config.norwegianTeams);
	}

	// Fall back to user-context favoriteEsportsOrgs
	if (teams.length === 0 && Array.isArray(userContext?.favoriteEsportsOrgs)) {
		teams.push(...userContext.favoriteEsportsOrgs);
	}

	return [...new Set(teams)]; // dedupe
}

/**
 * Filter events by focus team. Only applies to esports configs.
 * Non-esports events pass through unchanged.
 * Tournament-level events (_isTournament: true) pass through unchanged.
 * Events with no team references pass through unchanged.
 *
 * @param {object[]} events - Array of events
 * @param {object} config - Config object (for sport detection and norwegianTeams)
 * @param {object} userContext - User context (for favoriteEsportsOrgs)
 * @returns {{ filtered: object[], removedCount: number }}
 */
export function filterEventsByFocusTeam(events, config, userContext) {
	if (!Array.isArray(events) || events.length === 0) {
		return { filtered: [], removedCount: 0 };
	}

	// Only filter esports events
	const sport = config?.sport || "";
	if (!sport.toLowerCase().includes("esport")) {
		return { filtered: events, removedCount: 0 };
	}

	const focusTeams = resolveFocusTeams(config, userContext);
	if (focusTeams.length === 0) {
		// No focus teams configured — pass everything through
		return { filtered: events, removedCount: 0 };
	}

	const matcher = buildTeamMatcher(focusTeams);
	const filtered = [];
	let removedCount = 0;

	for (const event of events) {
		// Tournament-level events always pass through
		if (event._isTournament) {
			filtered.push(event);
			continue;
		}

		// Events with no team references pass through (generic tournament events)
		const hasTeamRefs = event.title || event.team1 || event.team2 ||
			event.homeTeam || event.awayTeam || event.focusTeam ||
			(Array.isArray(event.participants) && event.participants.length > 0);

		if (!hasTeamRefs) {
			filtered.push(event);
			continue;
		}

		// Check if this event involves a focus team
		if (eventInvolvesFocusTeam(event, matcher)) {
			filtered.push(event);
		} else {
			removedCount++;
		}
	}

	return { filtered, removedCount };
}

/**
 * Load user context from config directory.
 * Utility to avoid duplicating path resolution across pipeline stages.
 *
 * @param {string} [configDirOverride] - Optional config dir path
 * @returns {object|null}
 */
export function loadUserContext(configDirOverride) {
	const configDir = configDirOverride ||
		process.env.SPORTSYNC_CONFIG_DIR ||
		path.resolve(process.cwd(), "scripts", "config");
	return readJsonIfExists(path.join(configDir, "user-context.json"));
}
