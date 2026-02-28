#!/usr/bin/env node
/**
 * Analyze Engagement — Telemetry → Actionable Insights
 *
 * Reads the engagement-sync GitHub Issue (or local engagement-data.json fallback)
 * and produces docs/data/engagement-insights.json with content hints for
 * generate-featured.js, pipeline-health.js, and autopilot scouting.
 *
 * Every signal has a consumer — no data hoarding.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, writeJsonPretty } from "./lib/helpers.js";

/**
 * Parse telemetry from a GitHub Issue body containing a ```json block.
 */
export function parseTelemetryFromIssueBody(body) {
	if (!body || typeof body !== "string") return null;
	const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
	if (!match) return null;
	try {
		const data = JSON.parse(match[1]);
		return data.telemetry || null;
	} catch {
		return null;
	}
}

/**
 * Parse backendPreferences from a GitHub Issue body.
 */
export function parsePreferencesFromIssueBody(body) {
	if (!body || typeof body !== "string") return null;
	const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
	if (!match) return null;
	try {
		const data = JSON.parse(match[1]);
		return data.backendPreferences || null;
	} catch {
		return null;
	}
}

/**
 * Read engagement-sync issue from GitHub.
 */
export async function readEngagementSyncIssue() {
	if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN && !process.env.GITHUB_ACTIONS) {
		return null;
	}
	try {
		const output = execSync(
			'gh issue list --label engagement-sync --state open --json body --limit 1',
			{ encoding: "utf-8", timeout: 15000 }
		);
		const issues = JSON.parse(output);
		if (!Array.isArray(issues) || issues.length === 0) return null;
		return issues[0].body;
	} catch {
		return null;
	}
}

/**
 * Compute engagement insights from telemetry and preferences data.
 */
export function computeInsights(telemetry, engagement) {
	const insights = {
		generatedAt: new Date().toISOString(),
		sportWeights: {},
		preferredBlocks: [],
		peakHours: [],
		avgSessionMinutes: 0,
		dayNavPreference: null,
		watchPlanConversionRate: null,
		featureUsage: {},
		contentHints: [],
	};

	// Sport weights from engagement clicks
	if (engagement && typeof engagement === "object") {
		const totalClicks = Object.values(engagement).reduce((s, e) => s + (e?.clicks || 0), 0);
		if (totalClicks > 0) {
			for (const [sport, data] of Object.entries(engagement)) {
				if (data?.clicks > 0) {
					insights.sportWeights[sport] = Math.round((data.clicks / totalClicks) * 100) / 100;
				}
			}
		}
	}

	if (!telemetry) return insights;

	// Preferred blocks (top 3 by engagement)
	const blocks = Object.entries(telemetry.blocks || {}).sort(([, a], [, b]) => b - a);
	insights.preferredBlocks = blocks.slice(0, 3).map(([type]) => type);

	// Peak hours (top 3)
	const hours = Object.entries(telemetry.peakHours || {})
		.sort(([, a], [, b]) => b - a);
	insights.peakHours = hours.slice(0, 3).map(([h]) => parseInt(h, 10));

	// Average session minutes
	const sessions = telemetry.sessions || {};
	if (sessions.count > 0 && sessions.totalMinutes > 0) {
		insights.avgSessionMinutes = Math.round((sessions.totalMinutes / sessions.count) * 10) / 10;
	}

	// Day navigation preference
	const nav = telemetry.dayNav || {};
	const navTotal = (nav.past || 0) + (nav.future || 0) + (nav.today || 0);
	if (navTotal > 0) {
		const sorted = Object.entries(nav).sort(([, a], [, b]) => b - a);
		insights.dayNavPreference = sorted[0][0];
	}

	// Watch plan conversion rate
	if (telemetry.watchPlanClicks) {
		const total = telemetry.watchPlanClicks.total || 0;
		const keys = Object.keys(telemetry.watchPlanClicks.byKey || {}).length;
		// We use the total clicks as the numerator; denominator is harder without
		// knowing total recommendations shown, so we report raw clicks
		insights.watchPlanConversionRate = total > 0 ? total : null;
	}

	// Feature usage classification
	const features = telemetry.features || {};
	for (const [feature, count] of Object.entries(features)) {
		if (count >= 10) insights.featureUsage[feature] = "high";
		else if (count >= 3) insights.featureUsage[feature] = "medium";
		else insights.featureUsage[feature] = "low";
	}

	// Content hints (actionable guidance for featured generation)
	if (insights.preferredBlocks.length > 0) {
		const top = insights.preferredBlocks.slice(0, 2).join(" and ");
		const topCount = blocks.length > 0 ? blocks[0][1] : 0;
		insights.contentHints.push(
			`User engages most with ${top} blocks (${topCount} interactions) — include 2-3 per briefing`
		);
	}

	if (insights.peakHours.length > 0) {
		const hourStrs = insights.peakHours.map(h => `${String(h).padStart(2, "0")}:00`);
		insights.contentHints.push(
			`Peak usage at ${hourStrs.join(" and ")} — ${insights.peakHours.some(h => h < 10) ? "morning recap matters" : "evening preview matters most"}`
		);
	}

	if (insights.watchPlanConversionRate !== null) {
		const rate = insights.watchPlanConversionRate;
		insights.contentHints.push(
			rate >= 5
				? `Watch-plan gets ${rate} clicks — picks are landing well, maintain approach`
				: `Watch-plan has only ${rate} click(s) — consider improving pick quality or visibility`
		);
	}

	if (insights.avgSessionMinutes > 0) {
		insights.contentHints.push(
			`Average session: ${insights.avgSessionMinutes} min — ${insights.avgSessionMinutes >= 5 ? "good engagement" : "brief visits, keep content concise"}`
		);
	}

	if (insights.dayNavPreference) {
		const pref = insights.dayNavPreference;
		if (pref === "future") {
			insights.contentHints.push("User browses future days most — prioritize preview quality");
		} else if (pref === "past") {
			insights.contentHints.push("User browses past days most — prioritize recap quality");
		}
	}

	return insights;
}

/**
 * Main: read from GitHub Issue or local file, compute insights, write output.
 */
export async function analyzeEngagement({ dataDir } = {}) {
	const dir = dataDir || path.resolve(process.cwd(), "docs", "data");

	let telemetry = null;
	let engagement = null;
	let source = "none";

	// Try GitHub Issue first
	const issueBody = await readEngagementSyncIssue();
	if (issueBody) {
		telemetry = parseTelemetryFromIssueBody(issueBody);
		const prefs = parsePreferencesFromIssueBody(issueBody);
		engagement = prefs?.engagement || null;
		if (telemetry || engagement) source = "github-issue";
	}

	// Fallback: local engagement-data.json
	if (!telemetry && !engagement) {
		const localData = readJsonIfExists(path.join(dir, "engagement-data.json"));
		if (localData) {
			engagement = localData.engagement || null;
			telemetry = localData.telemetry || null;
			if (telemetry || engagement) source = "local-file";
		}
	}

	const insights = computeInsights(telemetry, engagement);
	insights.source = source;

	const outPath = path.join(dir, "engagement-insights.json");
	writeJsonPretty(outPath, insights);

	console.log(`Engagement insights: source=${source}, ${insights.contentHints.length} hint(s), ${insights.preferredBlocks.length} preferred block type(s)`);
	return insights;
}

// CLI entry point
if (process.argv[1] && (process.argv[1].endsWith("analyze-engagement.js") || process.argv[1].includes("analyze-engagement"))) {
	analyzeEngagement().catch(err => {
		console.error("analyze-engagement failed:", err.message);
		process.exit(1);
	});
}
