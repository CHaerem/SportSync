#!/usr/bin/env node
/**
 * Pipeline Health Report
 *
 * Reads all generated data files and produces docs/data/health-report.json
 * with anomaly detection, freshness checks, and regression detection.
 * Creates a GitHub issue if critical problems are found.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";
import { evaluateAutonomy } from "./autonomy-scorecard.js";
import { LLMClient } from "./lib/llm-client.js";

const dataDir = rootDataPath();

function ageMinutes(isoDate) {
	if (!isoDate) return Infinity;
	return (Date.now() - new Date(isoDate).getTime()) / 60000;
}

function sportEventCounts(events) {
	const counts = {};
	for (const ev of events) {
		const sport = ev.sport || "unknown";
		counts[sport] = (counts[sport] || 0) + 1;
	}
	return counts;
}

function checkSchemaCompleteness(events) {
	if (events.length === 0) return { venuePercent: 1, streamingPercent: 1 };
	let venue = 0, streaming = 0;
	for (const ev of events) {
		if (ev.venue && ev.venue !== "TBD") venue++;
		if (Array.isArray(ev.streaming) && ev.streaming.length > 0) streaming++;
	}
	return {
		venuePercent: Number((venue / events.length).toFixed(2)),
		streamingPercent: Number((streaming / events.length).toFixed(2)),
	};
}

export function generateHealthReport(options = {}) {
	const {
		events = [],
		standings = null,
		rssDigest = null,
		previousReport = null,
		sportFiles = {},
	} = options;

	const issues = [];
	const now = new Date().toISOString();

	// 1. Sport coverage counts
	const currentCounts = sportEventCounts(events);
	const previousCounts = previousReport?.sportCoverage || {};
	const sportCoverage = {};

	for (const [sport, count] of Object.entries(currentCounts)) {
		const prev = previousCounts[sport]?.count ?? null;
		const delta = prev !== null ? count - prev : null;
		sportCoverage[sport] = { count, previousCount: prev, delta };
	}

	// Check for sports that existed before but dropped to 0
	if (previousReport?.sportCoverage) {
		for (const [sport, info] of Object.entries(previousReport.sportCoverage)) {
			if (!currentCounts[sport] && info.count > 0) {
				sportCoverage[sport] = { count: 0, previousCount: info.count, delta: -info.count };
				issues.push({
					severity: "critical",
					code: "sport_dropped",
					message: `${sport}: 0 events (was ${info.count})`,
				});
			}
		}
	}

	// Flag >50% drop in any sport
	for (const [sport, info] of Object.entries(sportCoverage)) {
		if (info.previousCount > 0 && info.count > 0 && info.delta !== null) {
			const dropPct = -info.delta / info.previousCount;
			if (dropPct > 0.5) {
				issues.push({
					severity: "warning",
					code: "sport_count_drop",
					message: `${sport}: ${info.count} events (was ${info.previousCount}, -${Math.round(dropPct * 100)}%)`,
				});
			}
		}
	}

	// 2. Data freshness
	const dataFreshness = {};
	const STALE_THRESHOLD_MINUTES = 360; // 6 hours
	for (const [filename, data] of Object.entries(sportFiles)) {
		const age = ageMinutes(data?.lastUpdated);
		const stale = age > STALE_THRESHOLD_MINUTES;
		dataFreshness[filename] = { ageMinutes: Math.round(age), stale };
		if (stale) {
			issues.push({
				severity: "warning",
				code: "stale_data",
				message: `${filename}: data is ${Math.round(age)} minutes old`,
			});
		}
	}

	// 3. Schema completeness
	const schemaCompleteness = checkSchemaCompleteness(events);

	// 4. RSS feed health
	const rssItems = Array.isArray(rssDigest?.items) ? rssDigest.items : [];
	const rssHealthy = rssItems.length >= 5;
	const rssFeedHealth = { itemCount: rssItems.length, healthy: rssHealthy };
	if (!rssHealthy) {
		issues.push({
			severity: "warning",
			code: "rss_low",
			message: `RSS digest has only ${rssItems.length} items (expected >= 5)`,
		});
	}

	// 5. Standings presence
	const standingsHealth = {
		premierLeague: (standings?.football?.premierLeague?.length || 0) > 0,
		pgaGolf: (standings?.golf?.pga?.leaderboard?.length || 0) > 0,
		f1Drivers: (standings?.f1?.drivers?.length || 0) > 0,
	};
	for (const [key, present] of Object.entries(standingsHealth)) {
		if (!present) {
			issues.push({
				severity: "warning",
				code: "standings_empty",
				message: `${key} standings data is empty`,
			});
		}
	}

	// Determine overall status
	const hasCritical = issues.some((i) => i.severity === "critical");
	const hasWarning = issues.some((i) => i.severity === "warning");
	const status = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";

	return {
		generatedAt: now,
		eventCount: events.length,
		sportCoverage,
		dataFreshness,
		schemaCompleteness,
		rssFeedHealth,
		standingsHealth,
		issues,
		status,
	};
}

function buildFallbackSummary(report, autonomy, quality) {
	const parts = [];
	const pct = Math.round((autonomy?.overallScore ?? 0) * 100);
	parts.push(`Autonomy at ${pct}% with ${autonomy?.loopsClosed ?? 0}/${autonomy?.loopsTotal ?? 0} feedback loops closed.`);

	if (report.status === "healthy") {
		parts.push(`Pipeline is healthy with ${report.eventCount} events across ${Object.keys(report.sportCoverage).length} sports.`);
	} else {
		const critCount = report.issues.filter(i => i.severity === "critical").length;
		const warnCount = report.issues.filter(i => i.severity === "warning").length;
		const issueDesc = [critCount && `${critCount} critical`, warnCount && `${warnCount} warning`].filter(Boolean).join(", ");
		parts.push(`Pipeline is ${report.status} with ${issueDesc} issue(s).`);
	}

	const edScore = quality?.editorial?.score;
	if (edScore != null) parts.push(`Editorial quality score is ${edScore}/100.`);

	return parts.join(" ");
}

export async function generateStatusSummary(report, autonomy, quality) {
	const llm = new LLMClient();
	if (!llm.isAvailable()) {
		return buildFallbackSummary(report, autonomy, quality);
	}

	const systemPrompt = "You are a concise system status reporter for SportSync, a sports dashboard. Write a 2-3 sentence plain-text summary of the current system health. Be direct, specific, and use numbers. No markdown, no bullet points.";
	const userPrompt = JSON.stringify({
		autonomy: { score: autonomy?.overallScore, loopsClosed: autonomy?.loopsClosed, loopsTotal: autonomy?.loopsTotal },
		pipeline: { status: report.status, eventCount: report.eventCount, sports: Object.keys(report.sportCoverage).length, issueCount: report.issues.length, issues: report.issues.slice(0, 5).map(i => i.message) },
		quality: { editorial: quality?.editorial?.score, enrichment: quality?.enrichment?.score, featured: quality?.featured?.score, provider: quality?.featured?.provider },
	});

	try {
		const summary = await llm.complete(systemPrompt, userPrompt, { maxRetries: 1 });
		return summary.trim();
	} catch (err) {
		console.warn("Status summary LLM failed, using fallback:", err.message);
		return buildFallbackSummary(report, autonomy, quality);
	}
}

async function main() {
	const eventsData = readJsonIfExists(path.join(dataDir, "events.json")) || [];
	const standings = readJsonIfExists(path.join(dataDir, "standings.json"));
	const rssDigest = readJsonIfExists(path.join(dataDir, "rss-digest.json"));
	const previousReport = readJsonIfExists(path.join(dataDir, "health-report.json"));

	const sportFileNames = ["football.json", "golf.json", "tennis.json", "f1.json", "chess.json", "esports.json"];
	const sportFiles = {};
	for (const name of sportFileNames) {
		sportFiles[name] = readJsonIfExists(path.join(dataDir, name));
	}

	const report = generateHealthReport({
		events: eventsData,
		standings,
		rssDigest,
		previousReport,
		sportFiles,
	});

	// Generate autonomy scorecard alongside health report
	const autonomyReport = evaluateAutonomy();
	const autonomyPath = path.join(dataDir, "autonomy-report.json");
	writeJsonPretty(autonomyPath, autonomyReport);
	console.log(`Autonomy: ${Math.round(autonomyReport.overallScore * 100)}% (${autonomyReport.loopsClosed}/${autonomyReport.loopsTotal} loops closed)`);

	// Generate status summary
	const quality = readJsonIfExists(path.join(dataDir, "ai-quality.json"));
	const summary = await generateStatusSummary(report, autonomyReport, quality);
	report.statusSummary = summary;
	console.log(`Status summary: ${summary}`);

	const outPath = path.join(dataDir, "health-report.json");
	writeJsonPretty(outPath, report);
	console.log(`Health report: ${report.status} (${report.issues.length} issue(s), ${report.eventCount} events)`);

	for (const issue of report.issues) {
		console.log(`  [${issue.severity}] ${issue.message}`);
	}

	// Create GitHub issue if critical and running in CI
	if (report.status === "critical" && process.env.GITHUB_ACTIONS) {
		try {
			const title = `Pipeline health: ${report.issues.filter(i => i.severity === "critical").map(i => i.message).join("; ")}`;
			const body = JSON.stringify(report.issues, null, 2);
			execSync(`gh issue create --label maintenance --title "${title.slice(0, 200)}" --body '${body.replace(/'/g, "'\\''")}'`, { stdio: "inherit" });
		} catch (err) {
			console.warn("Failed to create GitHub issue:", err.message);
		}
	}
}

if (process.argv[1]?.includes("pipeline-health")) {
	main().catch((err) => {
		console.error("Pipeline health check failed:", err);
		process.exit(1);
	});
}
