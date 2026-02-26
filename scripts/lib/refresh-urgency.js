/**
 * Refresh Urgency Engine
 *
 * Computes urgency scores (0-1) for refreshable data sources based on
 * event proximity, match activity, focus team relevance, and data staleness.
 * Urgency scores drive adaptive refresh intervals across pipeline cycles:
 *
 *   High urgency (live matches)   → refresh every cycle (~1h)
 *   Medium urgency (upcoming)     → refresh every 2-3 cycles (~2-3h)
 *   Low urgency (days away)       → refresh every 6-12 cycles (~6-12h)
 *
 * This creates the 14th feedback loop: detect staleness → compute urgency →
 * boost priority → execute refresh → measure → inform next run.
 */

import { readJsonIfExists } from "./helpers.js";

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

/**
 * Extract all matches from a bracket structure into a flat array.
 * Works with the bracket format used in curated configs and brackets.json.
 */
export function extractBracketMatches(bracket) {
	if (!bracket) return [];
	const matches = [];

	if (bracket.groups) {
		for (const group of Object.values(bracket.groups)) {
			if (Array.isArray(group.matches)) matches.push(...group.matches);
		}
	}

	if (bracket.playoffs) {
		const { upperBracket = [], lowerBracket = [], grandFinal } = bracket.playoffs;
		for (const round of [...upperBracket, ...lowerBracket]) {
			if (Array.isArray(round.matches)) matches.push(...round.matches);
		}
		if (grandFinal?.matches) {
			matches.push(...grandFinal.matches);
		}
	}

	return matches;
}

/**
 * Compute refresh urgency for a single target.
 * @param {RefreshTarget} target
 * @param {Date} [now]
 * @returns {UrgencyResult}
 */
export function computeRefreshUrgency(target, now = new Date()) {
	const reasons = [];
	let score = 0;
	const nowMs = now.getTime();

	// Factor 1: Time since last refresh relative to base interval (0-0.3)
	const refreshAge = target.lastRefreshed
		? nowMs - new Date(target.lastRefreshed).getTime()
		: Infinity;
	const ageRatio = target.baseRefreshIntervalMs > 0
		? Math.min(refreshAge / target.baseRefreshIntervalMs, 3)
		: 0;
	const ageFactor = Math.min(ageRatio * 0.1, 0.3);
	if (ageRatio > 1) reasons.push(`overdue by ${Math.round(ageRatio * 100 - 100)}%`);
	score += ageFactor;

	// Factor 2: Live matches (0 or 0.35)
	if (target.hasLiveMatches) {
		score += 0.35;
		reasons.push("live matches active");
	}

	// Factor 3: Event proximity — matches in next 2 hours (0-0.2)
	const TWO_HOURS = 2 * MS_PER_HOUR;
	const imminentMatches = (target.upcomingMatches || []).filter(m => {
		const matchTime = new Date(m.time || m.scheduledTime).getTime();
		return matchTime > nowMs && matchTime < nowMs + TWO_HOURS;
	});
	if (imminentMatches.length > 0) {
		score += 0.2;
		reasons.push(`${imminentMatches.length} match(es) within 2h`);
	}

	// Factor 4: Focus team involvement (0 or 0.1)
	if (target.hasFocusTeam) {
		score += 0.1;
		reasons.push("focus team involved");
	}

	// Factor 5: Stale match data (0-0.15)
	if (target.staleMatchCount > 0) {
		score += Math.min(target.staleMatchCount * 0.05, 0.15);
		reasons.push(`${target.staleMatchCount} stale match(es)`);
	}

	// Factor 6: Broken data source (0 or 0.1)
	if ((target.consecutiveFailures || 0) >= 6) {
		score += 0.1;
		reasons.push(`${target.consecutiveFailures} consecutive failures`);
	}

	// Factor 7: Negative signal — last refresh produced no changes (reduce by 0.1)
	if (target.lastRefreshProducedChanges === false && !target.hasLiveMatches) {
		score -= 0.1;
		reasons.push("last refresh had no changes (reduced)");
	}

	score = Math.max(0, Math.min(1, score));

	return {
		id: target.id,
		score: Math.round(score * 100) / 100,
		reasons,
		suggestedQuotaPriority: urgencyToQuotaPriority(score),
		suggestedRefreshIntervalMs: urgencyToRefreshInterval(score),
		suggestedStalenessThresholdMinutes: urgencyToStalenessThreshold(score),
	};
}

/**
 * Map urgency score to a quota priority (1=essential, 2=important, 3=nice-to-have).
 */
export function urgencyToQuotaPriority(score) {
	if (score >= 0.6) return 1;
	if (score >= 0.3) return 2;
	return 3;
}

/**
 * Map urgency score to minimum milliseconds between refreshes.
 * Controls how often a data source gets refreshed across hourly pipeline cycles.
 */
export function urgencyToRefreshInterval(score) {
	if (score >= 0.6) return 60 * MS_PER_MINUTE;    // 1h — every cycle
	if (score >= 0.4) return 120 * MS_PER_MINUTE;   // 2h — every 2 cycles
	if (score >= 0.2) return 360 * MS_PER_MINUTE;   // 6h — every 6 cycles
	return 720 * MS_PER_MINUTE;                       // 12h — still catches schedule changes
}

/**
 * Map urgency score to acceptable staleness threshold in minutes.
 * Used by pipeline-health to decide when to raise a warning.
 */
export function urgencyToStalenessThreshold(score) {
	if (score >= 0.6) return 60;
	if (score >= 0.3) return 180;
	return 360;
}

/**
 * Build RefreshTarget objects from configs, brackets, and recipe registry.
 * Gathers all signals needed for urgency scoring.
 */
export function buildRefreshTargets({ configs, brackets, recipeRegistry, userContext, now = new Date() } = {}) {
	const targets = [];
	const nowMs = now.getTime();
	const focusTeams = [
		...(userContext?.favoriteTeams || []),
		...(userContext?.favoriteEsportsOrgs || []),
	].map(t => t.toLowerCase());

	// Build targets from configs with tournaments (bracket-bearing configs)
	for (const { filename, config } of (configs || [])) {
		if (!Array.isArray(config.tournaments)) continue;
		for (const t of config.tournaments) {
			if (!t.bracket || !t.startDate || !t.endDate) continue;
			const start = new Date(t.startDate).getTime();
			const end = new Date(t.endDate + "T23:59:59Z").getTime();
			if (end < nowMs - 6 * MS_PER_HOUR) continue; // expired

			const allMatches = extractBracketMatches(t.bracket);
			const isActive = nowMs >= start && nowMs <= end + 6 * MS_PER_HOUR;
			const focusTeam = (t.focusTeam || "").toLowerCase();

			targets.push({
				id: `config:${filename}:${t.id}`,
				type: "config",
				sport: config.sport || "unknown",
				lastRefreshed: config.lastResearched || null,
				baseRefreshIntervalMs: 2 * MS_PER_HOUR,
				upcomingMatches: isActive ? allMatches.filter(m => {
					if (!m.scheduledTime) return false;
					const mt = new Date(m.scheduledTime).getTime();
					return mt > nowMs && mt < nowMs + 12 * MS_PER_HOUR;
				}) : [],
				hasLiveMatches: allMatches.some(m => m.status === "live"),
				hasFocusTeam: focusTeams.includes(focusTeam),
				staleMatchCount: allMatches.filter(m => {
					if (m.status !== "scheduled") return false;
					if (!m.scheduledTime) return false;
					return new Date(m.scheduledTime).getTime() < nowMs - 2 * MS_PER_HOUR;
				}).length,
				lastRefreshProducedChanges: null,
				consecutiveFailures: 0,
			});
		}
	}

	// Build targets from recipe registry
	if (recipeRegistry?.recipes) {
		for (const recipe of recipeRegistry.recipes.filter(r => r.active)) {
			targets.push({
				id: `recipe:${recipe.id}`,
				type: "recipe",
				sport: recipe.sport || "unknown",
				lastRefreshed: recipe.lastSuccess || recipe.lastRun,
				baseRefreshIntervalMs: MS_PER_HOUR,
				upcomingMatches: [],
				hasLiveMatches: false,
				hasFocusTeam: false,
				staleMatchCount: 0,
				lastRefreshProducedChanges: null,
				consecutiveFailures: recipe.consecutiveFailures || 0,
			});
		}
	}

	return targets;
}

/**
 * Compute urgency for all targets and return sorted (highest urgency first).
 */
export function computeAllUrgencies(targets, now = new Date()) {
	return targets
		.map(t => computeRefreshUrgency(t, now))
		.sort((a, b) => b.score - a.score);
}
