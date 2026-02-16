#!/usr/bin/env node
/**
 * Evolve Preferences — Engagement Export Bridge
 *
 * Reads user engagement data (per-sport click counts) from:
 *   1. GitHub Issues labelled "user-feedback" (gh CLI)
 *   2. Local file docs/data/engagement-data.json (fallback/manual)
 *
 * Computes updated sport preference weights (high/medium/low) based on
 * relative engagement share + recency decay, then writes changes back to
 * scripts/config/user-context.json.
 *
 * Closes the personalization evolution gap (Phase 2 in CLAUDE.md roadmap).
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, writeJsonPretty } from "./lib/helpers.js";

const MS_PER_DAY = 86_400_000;
const RECENCY_DECAY_DAYS = 14;
const MIN_TOTAL_CLICKS = 20;
const STABILITY_MARGIN = 0.05; // 5 percentage points

/**
 * Compute sport preference weights from engagement data.
 *
 * @param {Object} engagement - { sport: { clicks, lastClick } }
 * @param {Object} currentPrefs - { sport: "high"|"medium"|"low" }
 * @returns {Object} Updated preferences { sport: "high"|"medium"|"low" }
 */
export function computeSportWeights(engagement, currentPrefs) {
	if (!engagement || typeof engagement !== "object") return { ...currentPrefs };

	// Apply recency decay and compute effective clicks
	const now = Date.now();
	const effective = {};
	let totalClicks = 0;

	for (const [sport, data] of Object.entries(engagement)) {
		let clicks = data?.clicks || 0;
		if (clicks <= 0) continue;

		// Halve clicks if last interaction is older than RECENCY_DECAY_DAYS
		if (data.lastClick) {
			const age = now - new Date(data.lastClick).getTime();
			if (age > RECENCY_DECAY_DAYS * MS_PER_DAY) {
				clicks = Math.floor(clicks / 2);
			}
		}

		if (clicks > 0) {
			effective[sport] = clicks;
			totalClicks += clicks;
		}
	}

	// Below threshold — not enough data to evolve
	if (totalClicks < MIN_TOTAL_CLICKS) return { ...currentPrefs };

	const result = { ...currentPrefs };

	for (const [sport, clicks] of Object.entries(effective)) {
		const share = clicks / totalClicks;
		let newLevel;
		if (share >= 0.25) newLevel = "high";
		else if (share >= 0.10) newLevel = "medium";
		else newLevel = "low";

		const current = currentPrefs[sport];
		if (!current) {
			// New sport — assign directly
			result[sport] = newLevel;
			continue;
		}

		// Stability guard: only change if signal is strong enough
		if (newLevel === current) continue;

		const thresholds = { high: 0.25, medium: 0.10, low: 0 };
		const threshold = thresholds[newLevel];
		const margin = Math.abs(share - threshold);
		if (margin >= STABILITY_MARGIN) {
			result[sport] = newLevel;
		}
		// else: too close to boundary, keep current
	}

	return result;
}

/**
 * Parse engagement data from a GitHub Issue JSON body block.
 * Expects fenced ```json block with { favorites: { engagement: {...} } }
 * or { backendPreferences: { engagement: {...} } }.
 */
export function parseEngagementFromIssueBody(body) {
	if (!body) return null;
	const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
	if (!match) return null;

	try {
		const parsed = JSON.parse(match[1]);
		return parsed?.favorites?.engagement
			|| parsed?.backendPreferences?.engagement
			|| null;
	} catch {
		return null;
	}
}

/**
 * Parse watch-plan feedback from a GitHub Issue JSON body block.
 * Returns { up: number, down: number, total: number } or null.
 */
export function parseWatchFeedbackFromIssueBody(body) {
	if (!body) return null;
	const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
	if (!match) return null;

	try {
		const parsed = JSON.parse(match[1]);
		const fb = parsed?.favorites?.watchFeedback
			|| parsed?.backendPreferences?.watchFeedback
			|| null;
		if (!fb || typeof fb !== "object") return null;
		let up = 0, down = 0;
		for (const entry of Object.values(fb)) {
			if (entry?.value === "up") up++;
			else if (entry?.value === "down") down++;
		}
		if (up === 0 && down === 0) return null;
		return { up, down, total: up + down };
	} catch {
		return null;
	}
}

/**
 * Read watch-plan feedback from local engagement-data.json.
 * Returns { up: number, down: number, total: number } or null.
 */
export function readWatchFeedbackFromFile(dataDir) {
	const filePath = path.join(dataDir, "engagement-data.json");
	const data = readJsonIfExists(filePath);
	if (!data?.watchFeedback || typeof data.watchFeedback !== "object") return null;
	let up = 0, down = 0;
	for (const entry of Object.values(data.watchFeedback)) {
		if (entry?.value === "up") up++;
		else if (entry?.value === "down") down++;
	}
	if (up === 0 && down === 0) return null;
	return { up, down, total: up + down };
}

/**
 * Parse favorite teams/players from a GitHub Issue JSON body block.
 * Returns { favoriteTeams: string[], favoritePlayers: string[] } or null.
 */
export function parseFavoritesFromIssueBody(body) {
	if (!body) return null;
	const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
	if (!match) return null;

	try {
		const parsed = JSON.parse(match[1]);
		const src = parsed?.favorites || parsed?.backendPreferences || null;
		if (!src) return null;
		const teams = Array.isArray(src.favoriteTeams) ? src.favoriteTeams : [];
		const players = Array.isArray(src.favoritePlayers) ? src.favoritePlayers : [];
		if (teams.length === 0 && players.length === 0) return null;
		return { favoriteTeams: teams, favoritePlayers: players };
	} catch {
		return null;
	}
}

/**
 * Read favorite teams/players from local engagement-data.json.
 */
export function readFavoritesFromFile(dataDir) {
	const filePath = path.join(dataDir, "engagement-data.json");
	const data = readJsonIfExists(filePath);
	if (!data) return null;
	const teams = Array.isArray(data.favoriteTeams) ? data.favoriteTeams : [];
	const players = Array.isArray(data.favoritePlayers) ? data.favoritePlayers : [];
	if (teams.length === 0 && players.length === 0) return null;
	return { favoriteTeams: teams, favoritePlayers: players };
}

/**
 * Detect new favorites from client-side exports that aren't in user-context.json.
 * Returns { newTeams: string[], newPlayers: string[] }.
 */
export function detectNewFavorites(clientFavorites, userContext) {
	if (!clientFavorites) return { newTeams: [], newPlayers: [] };
	const currentTeams = userContext.favoriteTeams || [];
	const currentPlayers = userContext.favoritePlayers || [];

	const normalize = s => s.toLowerCase().trim();
	const currentTeamSet = new Set(currentTeams.map(normalize));
	const currentPlayerSet = new Set(currentPlayers.map(normalize));

	const newTeams = (clientFavorites.favoriteTeams || [])
		.filter(t => t && typeof t === "string" && !currentTeamSet.has(normalize(t)));
	const newPlayers = (clientFavorites.favoritePlayers || [])
		.filter(p => p && typeof p === "string" && !currentPlayerSet.has(normalize(p)));

	return { newTeams, newPlayers };
}

/**
 * Merge multiple engagement objects by summing clicks, keeping latest lastClick.
 */
export function mergeEngagement(...sources) {
	const merged = {};
	for (const src of sources) {
		if (!src || typeof src !== "object") continue;
		for (const [sport, data] of Object.entries(src)) {
			if (!data || typeof data !== "object") continue;
			if (!merged[sport]) {
				merged[sport] = { clicks: 0, lastClick: null };
			}
			merged[sport].clicks += (data.clicks || 0);
			if (data.lastClick) {
				if (!merged[sport].lastClick || new Date(data.lastClick) > new Date(merged[sport].lastClick)) {
					merged[sport].lastClick = data.lastClick;
				}
			}
		}
	}
	return merged;
}

/**
 * Read engagement from GitHub Issues (label: user-feedback).
 * Returns { engagement, favorites, watchFeedback } where each may be null.
 */
export async function readFromIssues() {
	if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN && !process.env.GITHUB_ACTIONS) {
		return { engagement: null, favorites: null, watchFeedback: null };
	}

	try {
		const output = execSync(
			'gh issue list --label user-feedback --state all --json body --limit 10',
			{ encoding: "utf-8", timeout: 15000 }
		);
		const issues = JSON.parse(output);
		if (!Array.isArray(issues) || issues.length === 0) return { engagement: null, favorites: null, watchFeedback: null };

		const engagements = issues
			.map(issue => parseEngagementFromIssueBody(issue.body))
			.filter(Boolean);

		const favoritesList = issues
			.map(issue => parseFavoritesFromIssueBody(issue.body))
			.filter(Boolean);

		const watchFeedbackList = issues
			.map(issue => parseWatchFeedbackFromIssueBody(issue.body))
			.filter(Boolean);

		const engagement = engagements.length > 0 ? mergeEngagement(...engagements) : null;

		// Merge favorites: union of all teams and players across issues
		let favorites = null;
		if (favoritesList.length > 0) {
			const allTeams = new Set();
			const allPlayers = new Set();
			for (const f of favoritesList) {
				for (const t of f.favoriteTeams) allTeams.add(t);
				for (const p of f.favoritePlayers) allPlayers.add(p);
			}
			favorites = { favoriteTeams: [...allTeams], favoritePlayers: [...allPlayers] };
		}

		// Merge watch feedback: sum up/down across issues
		let watchFeedback = null;
		if (watchFeedbackList.length > 0) {
			let up = 0, down = 0;
			for (const wf of watchFeedbackList) {
				up += wf.up;
				down += wf.down;
			}
			watchFeedback = { up, down, total: up + down };
		}

		return { engagement, favorites, watchFeedback };
	} catch {
		return { engagement: null, favorites: null, watchFeedback: null };
	}
}

// Backwards-compatible wrapper
export async function readEngagementFromIssues() {
	const { engagement } = await readFromIssues();
	return engagement;
}

/**
 * Read engagement from local file docs/data/engagement-data.json.
 */
export function readEngagementFromFile(dataDir) {
	const filePath = path.join(dataDir, "engagement-data.json");
	const data = readJsonIfExists(filePath);
	if (!data?.engagement || typeof data.engagement !== "object") return null;
	return data.engagement;
}

/**
 * Main evolution flow.
 */
export async function evolvePreferences({ configDir, dataDir } = {}) {
	const cfgDir = configDir || path.resolve(process.cwd(), "scripts", "config");
	const dDir = dataDir || path.resolve(process.cwd(), "docs", "data");

	const contextPath = path.join(cfgDir, "user-context.json");
	const userContext = readJsonIfExists(contextPath);
	if (!userContext) {
		console.warn("evolve-preferences: user-context.json not found");
		return { skipped: true, reason: "no-user-context" };
	}

	const currentPrefs = userContext.sportPreferences || {};

	// Read from both sources
	const issueData = await readFromIssues();
	const fileEngagement = readEngagementFromFile(dDir);
	const fileFavorites = readFavoritesFromFile(dDir);
	const fileWatchFeedback = readWatchFeedbackFromFile(dDir);

	// Merge engagement from both sources
	const merged = mergeEngagement(issueData.engagement, fileEngagement);
	const totalClicks = Object.values(merged).reduce((s, e) => s + (e.clicks || 0), 0);

	const sources = [];
	if (issueData.engagement) sources.push("github-issues");
	if (fileEngagement) sources.push("local-file");

	// --- Sport weight evolution ---
	let weightChanges = [];
	let newWeights = { ...currentPrefs };

	if (totalClicks >= MIN_TOTAL_CLICKS) {
		newWeights = computeSportWeights(merged, currentPrefs);

		const allSports = new Set([...Object.keys(currentPrefs), ...Object.keys(newWeights)]);
		for (const sport of allSports) {
			const from = currentPrefs[sport] || null;
			const to = newWeights[sport] || null;
			if (from !== to) {
				const sportData = merged[sport] || { clicks: 0 };
				const share = totalClicks > 0 ? sportData.clicks / totalClicks : 0;
				weightChanges.push({ sport, from, to, share: Number(share.toFixed(3)) });
			}
		}
	} else {
		console.log(`evolve-preferences: insufficient engagement data (${totalClicks} clicks, need ${MIN_TOTAL_CLICKS})`);
	}

	// --- Favorite teams/players evolution ---
	// Merge client-side favorites from issues and local file
	const allFavSources = [issueData.favorites, fileFavorites].filter(Boolean);
	let mergedFavorites = null;
	if (allFavSources.length > 0) {
		const teamSet = new Set();
		const playerSet = new Set();
		for (const f of allFavSources) {
			for (const t of f.favoriteTeams) teamSet.add(t);
			for (const p of f.favoritePlayers) playerSet.add(p);
		}
		mergedFavorites = { favoriteTeams: [...teamSet], favoritePlayers: [...playerSet] };
	}

	const { newTeams, newPlayers } = detectNewFavorites(mergedFavorites, userContext);

	const changes = [...weightChanges];
	for (const team of newTeams) {
		changes.push({ type: "team", name: team, action: "added" });
	}
	for (const player of newPlayers) {
		changes.push({ type: "player", name: player, action: "added" });
	}

	// Merge watch feedback from both sources
	const watchFeedbackSources = [issueData.watchFeedback, fileWatchFeedback].filter(Boolean);
	let mergedWatchFeedback = null;
	if (watchFeedbackSources.length > 0) {
		let up = 0, down = 0;
		for (const wf of watchFeedbackSources) {
			up += wf.up;
			down += wf.down;
		}
		mergedWatchFeedback = { up, down, total: up + down };
	}

	if (mergedWatchFeedback) {
		console.log(`evolve-preferences: watch feedback — ${mergedWatchFeedback.up} up, ${mergedWatchFeedback.down} down (${mergedWatchFeedback.total} total)`);
	}

	if (changes.length === 0 && totalClicks < MIN_TOTAL_CLICKS && !mergedWatchFeedback) {
		return { skipped: true, reason: "insufficient-data", totalClicks, sources };
	}

	if (changes.length === 0 && !mergedWatchFeedback) {
		console.log("evolve-preferences: no changes needed");
		return { skipped: false, changes: [], totalClicks, sources, currentWeights: newWeights };
	}

	if (changes.length === 0 && mergedWatchFeedback) {
		// No weight/favorite changes but we have watch feedback to record
		const evolutionPath = path.join(dDir, "preference-evolution.json");
		const existing = readJsonIfExists(evolutionPath) || { runs: [] };
		const run = {
			timestamp: new Date().toISOString(),
			totalClicks,
			changes: 0,
			watchFeedback: mergedWatchFeedback,
			source: sources.join("+"),
		};
		existing.runs = existing.runs || [];
		existing.runs.push(run);
		if (existing.runs.length > 50) existing.runs = existing.runs.slice(-50);
		existing.lastEvolved = run.timestamp;
		existing.totalEngagementClicks = totalClicks;
		existing.sources = sources;
		existing.watchFeedback = mergedWatchFeedback;
		existing.currentWeights = newWeights;
		writeJsonPretty(evolutionPath, existing);
		return { skipped: false, changes: [], totalClicks, sources, currentWeights: newWeights, watchFeedback: mergedWatchFeedback };
	}

	// Update user-context.json (preserve all other fields)
	let modified = false;
	if (weightChanges.length > 0) {
		userContext.sportPreferences = newWeights;
		modified = true;
		console.log(`evolve-preferences: updated ${weightChanges.length} sport weight(s)`);
		for (const c of weightChanges) {
			console.log(`  ${c.sport}: ${c.from || "none"} → ${c.to} (share: ${Math.round(c.share * 100)}%)`);
		}
	}
	if (newTeams.length > 0) {
		userContext.favoriteTeams = [...(userContext.favoriteTeams || []), ...newTeams];
		modified = true;
		console.log(`evolve-preferences: added ${newTeams.length} new favorite team(s): ${newTeams.join(", ")}`);
	}
	if (newPlayers.length > 0) {
		userContext.favoritePlayers = [...(userContext.favoritePlayers || []), ...newPlayers];
		modified = true;
		console.log(`evolve-preferences: added ${newPlayers.length} new favorite player(s): ${newPlayers.join(", ")}`);
	}
	if (modified) {
		writeJsonPretty(contextPath, userContext);
	}

	// Write evolution history
	const evolutionPath = path.join(dDir, "preference-evolution.json");
	const existing = readJsonIfExists(evolutionPath) || { runs: [] };
	const run = {
		timestamp: new Date().toISOString(),
		totalClicks,
		changes: changes.length,
		weightChanges: weightChanges.length,
		newTeams: newTeams.length,
		newPlayers: newPlayers.length,
		source: sources.join("+"),
	};
	if (mergedWatchFeedback) {
		run.watchFeedback = mergedWatchFeedback;
	}
	existing.runs = existing.runs || [];
	existing.runs.push(run);
	// Cap at 50 entries
	if (existing.runs.length > 50) {
		existing.runs = existing.runs.slice(-50);
	}
	existing.lastEvolved = run.timestamp;
	existing.totalEngagementClicks = totalClicks;
	existing.sources = sources;
	existing.changes = changes;
	existing.currentWeights = newWeights;
	if (mergedWatchFeedback) {
		existing.watchFeedback = mergedWatchFeedback;
	}

	writeJsonPretty(evolutionPath, existing);

	return { skipped: false, changes, totalClicks, sources, currentWeights: newWeights, watchFeedback: mergedWatchFeedback };
}

if (process.argv[1]?.includes("evolve-preferences")) {
	evolvePreferences().then(result => {
		if (result.skipped) {
			console.log(`Skipped: ${result.reason}`);
		} else {
			console.log(`Done: ${result.changes.length} change(s)`);
		}
	}).catch(err => {
		console.error("evolve-preferences failed:", err);
		process.exit(1);
	});
}
