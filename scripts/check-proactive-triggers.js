#!/usr/bin/env node
/**
 * Proactive Trigger Check — KAIROS-inspired event-driven pipeline upgrades
 *
 * Inspired by Claude Code's KAIROS tick loop: on each tick, check if
 * anything merits proactive action. If nothing is actionable, sleep.
 *
 * Runs every pipeline cycle (cheap, <1s). Checks if the current data-only
 * run should be upgraded to a full run based on trigger conditions:
 *
 * 1. Breaking RSS: new high-importance headline in RSS digest
 * 2. Health degradation: new critical warning not in previous health report
 * 3. Stale featured: featured.json too old during a high-activity period
 *
 * Writes result to docs/data/proactive-triggers.json.
 * The pipeline runner checks this to decide whether to upgrade mode.
 *
 * Closes the loop: trigger decisions are logged for pattern analysis.
 */

import fs from "fs";
import path from "path";
import { readJsonIfExists, writeJsonPretty, rootDataPath, iso } from "./lib/helpers.js";

const HIGH_IMPORTANCE_PATTERNS = [
	/champions league.*(?:result|score|final|draw|goal)/i,
	/world cup.*(?:result|score|final|draw|goal)/i,
	/(?:hovland|ruud|carlsen|klaebo|johaug|boe).*(?:win|lost|medal|lead)/i,
	/(?:transfer|sign|depart|sack|appoint).*(?:confirm|official|done deal)/i,
	/(?:injury|suspend|ban).*(?:confirm|ruled out|miss)/i,
	/breaking|just in|confirmed/i,
];

const STALE_FEATURED_HOURS = 6;

/**
 * Check if any proactive triggers should upgrade the pipeline mode.
 */
export function checkTriggers(rssDigest, prevRssDigest, healthReport, prevHealthReport, featuredMeta, events, now = new Date()) {
	const triggers = [];

	// Trigger 1: Breaking RSS — new high-importance headline
	if (rssDigest?.items && prevRssDigest?.items) {
		const prevIds = new Set((prevRssDigest.items || []).map(i => i.id || i.link || i.title));
		const newItems = (rssDigest.items || []).filter(i => !prevIds.has(i.id || i.link || i.title));

		for (const item of newItems) {
			const title = item.title || "";
			for (const pattern of HIGH_IMPORTANCE_PATTERNS) {
				if (pattern.test(title)) {
					triggers.push({
						type: "breaking_rss",
						reason: `New high-importance headline: "${title.slice(0, 80)}"`,
						pattern: pattern.source,
						severity: "medium",
					});
					break;
				}
			}
		}
	}

	// Trigger 2: Health degradation — new critical/warning not in previous report
	if (healthReport?.issues && prevHealthReport?.issues) {
		const prevCodes = new Set((prevHealthReport.issues || []).map(i => i.code));
		const newWarnings = (healthReport.issues || []).filter(
			i => (i.severity === "warning" || i.severity === "critical") && !prevCodes.has(i.code)
		);

		for (const warning of newWarnings) {
			triggers.push({
				type: "health_degradation",
				reason: `New ${warning.severity}: ${warning.code} — ${(warning.message || "").slice(0, 80)}`,
				code: warning.code,
				severity: warning.severity === "critical" ? "high" : "medium",
			});
		}
	}

	// Trigger 3: Stale featured during high-activity period
	if (featuredMeta?.generatedAt) {
		const featuredAge = (now.getTime() - new Date(featuredMeta.generatedAt).getTime()) / (60 * 60 * 1000);
		const hour = now.getUTCHours();
		const isActiveHours = hour >= 6 && hour <= 22;

		// Check if there are must-watch events today
		const hasMustWatch = Array.isArray(events) && events.some(e => {
			if (!e.time || (e.importance || 0) < 4) return false;
			const eventDate = new Date(e.time);
			return eventDate.toDateString() === now.toDateString();
		});

		if (featuredAge > STALE_FEATURED_HOURS && isActiveHours && hasMustWatch) {
			triggers.push({
				type: "stale_featured",
				reason: `Featured content is ${Math.round(featuredAge)}h old with must-watch events today`,
				ageHours: Math.round(featuredAge),
				severity: "medium",
			});
		}
	}

	return {
		timestamp: iso(now),
		shouldUpgrade: triggers.length > 0,
		triggerCount: triggers.length,
		triggers,
	};
}

// --- Main ---
async function main() {
	const dataDir = process.env.SPORTSYNC_DATA_DIR || rootDataPath();

	const rssDigest = readJsonIfExists(path.join(dataDir, "rss-digest.json"));
	const healthReport = readJsonIfExists(path.join(dataDir, "health-report.json"));
	const featured = readJsonIfExists(path.join(dataDir, "featured.json"));
	const events = readJsonIfExists(path.join(dataDir, "events.json"));

	// Load previous state for comparison (from last pipeline run's snapshot)
	const prevTriggers = readJsonIfExists(path.join(dataDir, "proactive-triggers.json"));
	const prevRssDigest = prevTriggers?._prevRssSnapshot || null;
	const prevHealthReport = prevTriggers?._prevHealthSnapshot || null;

	const result = checkTriggers(
		rssDigest, prevRssDigest,
		healthReport, prevHealthReport,
		{ generatedAt: featured?.generatedAt },
		events
	);

	// Save current state for next run's comparison
	result._prevRssSnapshot = {
		items: (rssDigest?.items || []).slice(0, 20).map(i => ({
			id: i.id || i.link || i.title,
			title: i.title,
		})),
	};
	result._prevHealthSnapshot = {
		issues: (healthReport?.issues || []).map(i => ({
			code: i.code,
			severity: i.severity,
			message: (i.message || "").slice(0, 80),
		})),
	};

	writeJsonPretty(path.join(dataDir, "proactive-triggers.json"), result);

	if (result.shouldUpgrade) {
		console.log(`PROACTIVE: ${result.triggerCount} trigger(s) detected — recommend full mode`);
		for (const t of result.triggers) {
			console.log(`  [${t.severity}] ${t.type}: ${t.reason}`);
		}
	} else {
		console.log("No proactive triggers — data-only mode is fine.");
	}
}

main().catch(console.error);
