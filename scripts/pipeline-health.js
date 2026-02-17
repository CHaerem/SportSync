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
import { readJsonIfExists, rootDataPath, writeJsonPretty, isEventInWindow } from "./lib/helpers.js";
import { evaluateAutonomy, trackTrend, detectRegressions } from "./autonomy-scorecard.js";
import { analyzePatterns } from "./analyze-patterns.js";
import { LLMClient } from "./lib/llm-client.js";
import { runVerification } from "./verify-schedules.js";

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

/**
 * Detect events that exist in events.json but would be invisible on the dashboard.
 * Uses isEventInWindow — if an event doesn't overlap [today, far future), it's invisible.
 */
function findInvisibleEvents(events) {
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const farFuture = new Date(todayStart.getTime() + 365 * 86400000);
	return events.filter((e) => e.time && !isEventInWindow(e, todayStart, farFuture));
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
		recentResults = null,
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

	// 1b. Detect sports with data files but zero events
	const STALE_THRESHOLD_MINUTES = 360; // 6 hours
	for (const filename of Object.keys(sportFiles)) {
		const sport = filename.replace(".json", "");
		if (!sportCoverage[sport]) {
			sportCoverage[sport] = { count: 0, previousCount: previousCounts[sport]?.count ?? null, delta: null };
			// Fresh data file with 0 events = normal gap (tournaments not running)
			// Stale data file with 0 events = real problem worth warning about
			const dataAge = ageMinutes(sportFiles[filename]?.lastUpdated);
			const isStale = dataAge > STALE_THRESHOLD_MINUTES;
			issues.push({
				severity: isStale ? "warning" : "info",
				code: "sport_zero_events",
				message: `${sport}: data file exists but 0 events in events.json${isStale ? " (data is stale)" : ""}`,
			});
		}
	}

	// 2. Data freshness
	const dataFreshness = {};
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

	// 2b. Chronic data retention detection
	// When retainLastGood keeps old data across multiple pipeline runs, something is wrong:
	// either the API is consistently failing, the filter is too restrictive, or the data is stale.
	for (const [filename, data] of Object.entries(sportFiles)) {
		const retained = data?._retained;
		if (retained && retained.consecutiveRetains >= 3) {
			const sport = filename.replace(".json", "");
			const retainedSince = retained.since ? new Date(retained.since).toISOString().slice(0, 10) : "unknown";
			issues.push({
				severity: "warning",
				code: "chronic_data_retention",
				message: `${sport}: data retained ${retained.consecutiveRetains} consecutive times (since ${retainedSince}) — fetcher returning empty results, serving stale data`,
			});
		}
	}

	// 2c. Critical output freshness (featured.json, ai-quality.json)
	const { criticalOutputs = {} } = options;
	for (const [name, data] of Object.entries(criticalOutputs)) {
		const age = ageMinutes(data?.generatedAt || data?.timestamp);
		const stale = age > STALE_THRESHOLD_MINUTES;
		dataFreshness[name] = { ageMinutes: Math.round(age), stale };
		if (stale) {
			issues.push({
				severity: "warning",
				code: "stale_output",
				message: `${name}: critical output is ${Math.round(age)} minutes old`,
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

	// 6. Results freshness and quality
	const resultsHealth = { present: false, stale: false, footballCount: 0, validationPassRate: null, recapHeadlineRate: null, issues: [] };
	if (recentResults) {
		resultsHealth.present = true;
		const football = Array.isArray(recentResults.football) ? recentResults.football : [];
		resultsHealth.footballCount = football.length;
		const resultsAge = ageMinutes(recentResults.lastUpdated);
		resultsHealth.stale = resultsAge > STALE_THRESHOLD_MINUTES;
		if (resultsHealth.stale) {
			issues.push({
				severity: "warning",
				code: "results_stale",
				message: `recent-results.json is ${Math.round(resultsAge)} minutes old`,
			});
		}

		// Validation pass rate from embedded metrics
		const vm = recentResults.validationMetrics;
		if (vm && vm.totalResults > 0) {
			resultsHealth.validationPassRate = Number((vm.validResults / vm.totalResults).toFixed(2));
			if (resultsHealth.validationPassRate < 0.9) {
				const msg = `Results validation pass rate is ${Math.round(resultsHealth.validationPassRate * 100)}%`;
				resultsHealth.issues.push(msg);
				issues.push({ severity: "warning", code: "results_validation_low", message: msg });
			}
		}

		// Recap headline rate
		if (football.length > 0) {
			resultsHealth.recapHeadlineRate = Number((football.filter(m => m.recapHeadline).length / football.length).toFixed(2));
		}
	}

	// 6b. Preference evolution freshness
	const { preferenceEvolution = null } = options;
	if (preferenceEvolution?.lastEvolved) {
		const evoAge = ageMinutes(preferenceEvolution.lastEvolved);
		if (evoAge > 10080) { // 7 days
			issues.push({
				severity: "info",
				code: "preference_evolution_stale",
				message: `Preference evolution last ran ${Math.round(evoAge / 1440)} days ago`,
			});
		}
	}

	// 6c. Fact-check history freshness
	const { factCheckHistory: fcHistoryOpt = null } = options;
	if (fcHistoryOpt && Array.isArray(fcHistoryOpt) && fcHistoryOpt.length > 0) {
		const lastEntry = fcHistoryOpt[fcHistoryOpt.length - 1];
		const fcAge = ageMinutes(lastEntry.timestamp);
		if (fcAge > 2880) { // 48 hours
			issues.push({
				severity: "warning",
				code: "fact_check_stale",
				message: `fact-check-history.json last entry is ${Math.round(fcAge / 60)}h old (>48h)`,
			});
		}
	}

	// 7. Norwegian tagging anomaly detection
	// If a sport has many events tagged norwegian=true but none have actual norwegianPlayers,
	// the matching logic is likely broken (false positives).
	const norwegianBySport = {};
	for (const ev of events) {
		const sport = ev.sport || "unknown";
		if (!norwegianBySport[sport]) norwegianBySport[sport] = { total: 0, tagged: 0, withPlayers: 0 };
		norwegianBySport[sport].total++;
		if (ev.norwegian) {
			norwegianBySport[sport].tagged++;
			const players = ev.norwegianPlayers || ev.players || [];
			if (Array.isArray(players) && players.length > 0) norwegianBySport[sport].withPlayers++;
		}
	}
	for (const [sport, stats] of Object.entries(norwegianBySport)) {
		if (stats.total < 3) continue; // too few events to judge
		const tagRate = stats.tagged / stats.total;
		// Anomaly: >80% tagged Norwegian but <20% have actual Norwegian players listed
		if (tagRate > 0.8 && stats.tagged > 2 && stats.withPlayers / stats.tagged < 0.2) {
			issues.push({
				severity: "warning",
				code: "norwegian_tagging_anomaly",
				message: `${sport}: ${stats.tagged}/${stats.total} events tagged Norwegian but only ${stats.withPlayers} have Norwegian players — likely false positives in name matching`,
			});
		}
	}

	// 7b. Editorial content duplication detection
	const { featured = null } = options;
	if (featured && Array.isArray(featured.blocks)) {
		const eventLineTexts = featured.blocks
			.filter((b) => b.type === "event-line")
			.map((b) => (b.text || "").toLowerCase().trim());
		const sectionBlocks = featured.blocks.filter((b) => b.type === "section");
		const sectionItemTexts = new Set();
		for (const s of sectionBlocks) {
			for (const item of (s.items || [])) {
				const text = (typeof item === "string" ? item : item?.text || "").toLowerCase().trim();
				if (text) sectionItemTexts.add(text);
			}
		}
		if (eventLineTexts.length > 0 && sectionItemTexts.size > 0) {
			const dupeCount = eventLineTexts.filter((t) => {
				for (const st of sectionItemTexts) {
					if (st.includes(t) || t.includes(st)) return true;
				}
				return false;
			}).length;
			if (dupeCount > 0 && dupeCount / eventLineTexts.length > 0.5) {
				issues.push({
					severity: "warning",
					code: "editorial_content_duplication",
					message: `${dupeCount}/${eventLineTexts.length} event-lines duplicate section items — fallback generator may need dedup fix`,
				});
			}
		}

		// 7c. Detect "no editorial value" — fallback with no headline or narrative
		if (featured.provider === "fallback") {
			const hasNarrative = featured.blocks.some((b) => b.type === "headline" || b.type === "narrative");
			if (!hasNarrative) {
				issues.push({
					severity: "warning",
					code: "editorial_no_narrative",
					message: "featured.json has no headline or narrative blocks — content is event listings only",
				});
			}
		}
	}

	// 8. Dashboard visibility — events in data but invisible on dashboard
	const invisibleEvents = findInvisibleEvents(events);
	if (invisibleEvents.length > 0) {
		const sports = [...new Set(invisibleEvents.map((e) => e.sport))];
		issues.push({
			severity: "warning",
			code: "invisible_events",
			message: `${invisibleEvents.length} event(s) won't appear on dashboard (${sports.join(", ")})`,
		});
	}

	// 9. Day navigator coverage — past 5 days should have events or results
	const footballResults = Array.isArray(recentResults?.football) ? recentResults.football : [];
	for (let i = 1; i <= 5; i++) {
		const d = new Date(Date.now() - i * 86400000);
		const dateKey = d.toISOString().slice(0, 10);
		const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const dayEnd = new Date(dayStart.getTime() + 86400000);
		const dayEvents = events.filter(e => isEventInWindow(e, dayStart, dayEnd));
		const dayResults = footballResults.filter(m => m.date?.startsWith(dateKey));
		if (dayEvents.length === 0 && dayResults.length === 0) {
			issues.push({
				severity: "info",
				code: "empty_day",
				message: `${dateKey}: no events or results for day navigator`,
			});
		}
	}

	// 10. Day snapshot health
	const { snapshotHealth: snapHealthOpts = {} } = options;
	const snapMeta = snapHealthOpts.meta || null;
	const snapshotHealth = { present: false, issues: [] };

	if (snapMeta) {
		snapshotHealth.present = true;
		snapshotHealth.snapshotCount = snapMeta.snapshotCount || 0;

		// Check for empty snapshots
		const emptySnaps = Array.isArray(snapMeta.emptyDays) ? snapMeta.emptyDays : [];
		if (emptySnaps.length > 0) {
			const msg = `${emptySnaps.length} day snapshot(s) have 0 events and 0 results`;
			snapshotHealth.issues.push(msg);
			issues.push({ severity: "info", code: "empty_day_snapshot", message: msg });
		}

		// Check for stale snapshots (generatedAt > 4h old)
		if (snapMeta.generatedAt) {
			const snapAge = ageMinutes(snapMeta.generatedAt);
			if (snapAge > 240) { // 4 hours = 2 pipeline cycles
				const msg = `Day snapshots are ${Math.round(snapAge)} minutes old (stale > 240m)`;
				snapshotHealth.issues.push(msg);
				issues.push({ severity: "warning", code: "stale_snapshot", message: msg });
			}
		}

		// Check for missing snapshots in expected range
		if (snapMeta.perDay) {
			const expectedDays = [];
			const now = new Date();
			for (let i = -7; i <= 7; i++) {
				const d = new Date(now);
				d.setDate(d.getDate() + i);
				expectedDays.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
			}
			const missing = expectedDays.filter(dk => !snapMeta.perDay[dk]);
			if (missing.length > 0) {
				const msg = `${missing.length} expected day snapshot(s) missing`;
				snapshotHealth.issues.push(msg);
				issues.push({ severity: "warning", code: "missing_snapshot", message: msg });
			}
		}

		// Check for event count mismatch (inconsistency)
		if (snapMeta.perDay && events.length > 0) {
			for (const [dateKey, dayInfo] of Object.entries(snapMeta.perDay)) {
				const dayStart = new Date(dateKey + "T00:00:00");
				const dayEnd = new Date(dayStart.getTime() + 86400000);
				const expectedCount = events.filter(e => isEventInWindow(e, dayStart, dayEnd)).length;
				if (dayInfo.eventCount !== expectedCount) {
					const msg = `Snapshot ${dateKey}: ${dayInfo.eventCount} events but events.json has ${expectedCount}`;
					snapshotHealth.issues.push(msg);
					issues.push({ severity: "critical", code: "snapshot_event_mismatch", message: msg });
				}
			}
		}
	}

	// 11. Quota API availability (from usage-tracking.json)
	const { usageTracking = null } = options;
	const quotaApiHealth = { available: false, transitioned: false, unavailableSince: null };
	if (usageTracking?.quotaApiStatus) {
		const qs = usageTracking.quotaApiStatus;
		quotaApiHealth.available = qs.available === true;
		quotaApiHealth.transitioned = qs.transitioned === true;
		quotaApiHealth.unavailableSince = !qs.available ? qs.since : null;

		if (qs.transitioned && qs.available) {
			issues.push({
				severity: "info",
				code: "quota_api_restored",
				message: "Quota API is now available — external utilization data flowing",
			});
		}
		if (!qs.available) {
			// Not a warning — it's a known upstream limitation
			issues.push({
				severity: "info",
				code: "quota_api_unavailable",
				message: "Quota API unavailable (upstream scope limitation)",
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
		resultsHealth,
		snapshotHealth,
		quotaApiHealth,
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

export async function generateStatusSummary(report, autonomy, quality, externalLlm) {
	const llm = externalLlm || new LLMClient();
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
	const recentResults = readJsonIfExists(path.join(dataDir, "recent-results.json"));
	const previousReport = readJsonIfExists(path.join(dataDir, "health-report.json"));

	// Auto-discover sport files by convention: any JSON with { tournaments: [...] }
	const sportFiles = {};
	const allJsonFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
	for (const name of allJsonFiles) {
		const data = readJsonIfExists(path.join(dataDir, name));
		if (data && Array.isArray(data.tournaments)) {
			sportFiles[name] = data;
		}
	}

	// Check critical pipeline outputs for freshness
	const criticalOutputs = {
		"featured.json": readJsonIfExists(path.join(dataDir, "featured.json")),
		"ai-quality.json": readJsonIfExists(path.join(dataDir, "ai-quality.json")),
	};

	// Read day snapshot metadata
	const snapMeta = readJsonIfExists(path.join(dataDir, "days", "_meta.json"));

	// Read usage tracking for quota API status
	const usageTracking = readJsonIfExists(path.join(dataDir, "usage-tracking.json"));

	// Read fact-check history for freshness monitoring
	const factCheckHistory = readJsonIfExists(path.join(dataDir, "fact-check-history.json"));

	// Read preference evolution history
	const preferenceEvolution = readJsonIfExists(path.join(dataDir, "preference-evolution.json"));

	const report = generateHealthReport({
		events: eventsData,
		standings,
		rssDigest,
		recentResults,
		previousReport,
		sportFiles,
		criticalOutputs,
		featured: criticalOutputs["featured.json"],
		snapshotHealth: { meta: snapMeta },
		usageTracking,
		factCheckHistory,
		preferenceEvolution,
	});

	// Generate autonomy scorecard alongside health report
	const autonomyReport = evaluateAutonomy();
	const autonomyPath = path.join(dataDir, "autonomy-report.json");
	writeJsonPretty(autonomyPath, autonomyReport);
	console.log(`Autonomy: ${Math.round(autonomyReport.overallScore * 100)}% (${autonomyReport.loopsClosed}/${autonomyReport.loopsTotal} loops closed)`);

	// Track autonomy trend and check for regressions
	const trend = trackTrend(autonomyReport, dataDir);
	const regressions = detectRegressions(trend);
	if (regressions.length > 0) {
		console.log(`Autonomy regressions detected:`);
		for (const r of regressions) console.log(`  [WARN] ${r}`);
	}

	// Run pattern analysis
	const patternReport = analyzePatterns({ dataDir });
	writeJsonPretty(path.join(dataDir, "pattern-report.json"), patternReport);
	console.log(`Patterns: ${patternReport.patternsDetected} detected`);

	// Run schedule verification
	try {
		const verification = await runVerification({ dDir: dataDir });
		const vr = verification.runRecord;
		console.log(`Verification: ${vr.configsChecked} configs, ${vr.eventsChecked} events checked`);
	} catch (err) {
		console.warn("Schedule verification failed (non-blocking):", err.message);
	}

	// Check curated configs for low verification confidence with upcoming events
	const configDir = path.resolve(process.cwd(), "scripts", "config");
	if (fs.existsSync(configDir)) {
		const now = Date.now();
		const weekAhead = now + 7 * 86_400_000;
		for (const file of fs.readdirSync(configDir)) {
			if (!file.endsWith(".json") || file === "user-context.json") continue;
			const cfg = readJsonIfExists(path.join(configDir, file));
			if (!cfg?.events?.length) continue;

			// Low verification confidence check
			if (cfg.verificationSummary) {
				const confidence = cfg.verificationSummary.overallConfidence ?? 1;
				const hasUpcoming = cfg.events.some(e => {
					const t = new Date(e.time).getTime();
					return t > now && t < weekAhead;
				});
				if (confidence < 0.6 && hasUpcoming) {
					issues.push({
						severity: "warning",
						code: "low_confidence_config",
						message: `Config ${file} has low verification confidence (${confidence}) with upcoming events — schedule may be inaccurate`,
					});
				}
			}

			// Olympics/major event stale data check: flag configs with past events not pruned
			if (file.includes("olympics") || cfg.context?.includes("olympics")) {
				const pastEvents = cfg.events.filter(e => {
					const t = new Date(e.time).getTime();
					const end = e.endTime ? new Date(e.endTime).getTime() : t + 3 * 60 * 60 * 1000; // 3h default duration
					return end < now;
				});
				const totalEvents = cfg.events.length;
				if (pastEvents.length > 0 && pastEvents.length < totalEvents) {
					issues.push({
						severity: "info",
						code: "olympics_stale_events",
						message: `${file}: ${pastEvents.length}/${totalEvents} events are in the past — consider pruning`,
					});
				}
				if (pastEvents.length === totalEvents) {
					issues.push({
						severity: "warning",
						code: "olympics_all_past",
						message: `${file}: all ${totalEvents} events are in the past — config should be archived`,
					});
				}
			}
		}
	}

	// Generate status summary
	const quality = readJsonIfExists(path.join(dataDir, "ai-quality.json"));
	const summaryLlm = new LLMClient();
	const summary = await generateStatusSummary(report, autonomyReport, quality, summaryLlm);
	report.statusSummary = { text: summary, tokenUsage: summaryLlm.isAvailable() ? summaryLlm.getUsage() : null };
	console.log(`Status summary: ${summary}`);

	const outPath = path.join(dataDir, "health-report.json");
	writeJsonPretty(outPath, report);
	console.log(`Health report: ${report.status} (${report.issues.length} issue(s), ${report.eventCount} events)`);

	for (const issue of report.issues) {
		console.log(`  [${issue.severity}] ${issue.message}`);
	}

	// Trim autopilot-log.json to last 100 entries
	const autopilotLogPath = path.join(dataDir, "autopilot-log.json");
	const autopilotLog = readJsonIfExists(autopilotLogPath);
	if (autopilotLog && Array.isArray(autopilotLog.runs) && autopilotLog.runs.length > 100) {
		const before = autopilotLog.runs.length;
		autopilotLog.runs = autopilotLog.runs.slice(-100);
		writeJsonPretty(autopilotLogPath, autopilotLog);
		console.log(`Trimmed autopilot-log.json: ${before} → 100 entries`);
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
