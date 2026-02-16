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
 * Returns merged engagement object or null.
 */
export async function readEngagementFromIssues() {
	if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN && !process.env.GITHUB_ACTIONS) {
		return null;
	}

	try {
		const output = execSync(
			'gh issue list --label user-feedback --state all --json body --limit 10',
			{ encoding: "utf-8", timeout: 15000 }
		);
		const issues = JSON.parse(output);
		if (!Array.isArray(issues) || issues.length === 0) return null;

		const engagements = issues
			.map(issue => parseEngagementFromIssueBody(issue.body))
			.filter(Boolean);

		if (engagements.length === 0) return null;
		return mergeEngagement(...engagements);
	} catch {
		return null;
	}
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
	const issueEngagement = await readEngagementFromIssues();
	const fileEngagement = readEngagementFromFile(dDir);

	// Merge both sources
	const merged = mergeEngagement(issueEngagement, fileEngagement);
	const totalClicks = Object.values(merged).reduce((s, e) => s + (e.clicks || 0), 0);

	const sources = [];
	if (issueEngagement) sources.push("github-issues");
	if (fileEngagement) sources.push("local-file");

	if (totalClicks < MIN_TOTAL_CLICKS) {
		console.log(`evolve-preferences: insufficient data (${totalClicks} clicks, need ${MIN_TOTAL_CLICKS})`);
		return { skipped: true, reason: "insufficient-data", totalClicks, sources };
	}

	// Compute new weights
	const newWeights = computeSportWeights(merged, currentPrefs);

	// Detect changes
	const changes = [];
	const allSports = new Set([...Object.keys(currentPrefs), ...Object.keys(newWeights)]);
	for (const sport of allSports) {
		const from = currentPrefs[sport] || null;
		const to = newWeights[sport] || null;
		if (from !== to) {
			const sportData = merged[sport] || { clicks: 0 };
			const share = totalClicks > 0 ? sportData.clicks / totalClicks : 0;
			changes.push({ sport, from, to, share: Number(share.toFixed(3)) });
		}
	}

	if (changes.length === 0) {
		console.log("evolve-preferences: no weight changes needed");
		return { skipped: false, changes: [], totalClicks, sources, currentWeights: newWeights };
	}

	// Update user-context.json (preserve all other fields)
	userContext.sportPreferences = newWeights;
	writeJsonPretty(contextPath, userContext);
	console.log(`evolve-preferences: updated ${changes.length} sport weight(s)`);
	for (const c of changes) {
		console.log(`  ${c.sport}: ${c.from || "none"} → ${c.to} (share: ${Math.round(c.share * 100)}%)`);
	}

	// Write evolution history
	const evolutionPath = path.join(dDir, "preference-evolution.json");
	const existing = readJsonIfExists(evolutionPath) || { runs: [] };
	const run = {
		timestamp: new Date().toISOString(),
		totalClicks,
		changes: changes.length,
		source: sources.join("+"),
	};
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

	writeJsonPretty(evolutionPath, existing);

	return { skipped: false, changes, totalClicks, sources, currentWeights: newWeights };
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
