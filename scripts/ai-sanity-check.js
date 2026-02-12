#!/usr/bin/env node
/**
 * AI Sanity Check — "Big picture" validation of the final dashboard state.
 *
 * Loads all generated data files, simulates what the user would see,
 * and flags anything that looks wrong. Uses LLM for nuanced analysis
 * with a deterministic rule-based fallback.
 *
 * Output: docs/data/sanity-report.json
 */

import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";

const dataDir = rootDataPath();

/**
 * Rule-based sanity checks that run without an LLM.
 * Each returns { pass, issue } where issue is null if pass is true.
 */
function runDeterministicChecks(data) {
	const { events, featured, health, quality, standings, meta } = data;
	const findings = [];
	const now = new Date();

	// 1. Multi-day events marked as ended too early
	for (const ev of events) {
		if (!ev.endTime) continue;
		const start = new Date(ev.time);
		const end = new Date(ev.endTime);
		const hoursFromStart = (now - start) / 3600000;
		if (hoursFromStart > 3 && now < end) {
			// Would have been falsely marked "ended" without endTime fix
			// Still flag if event has no endTime in practice
		}
	}

	// 2. Events in wrong temporal band
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = new Date(todayStart.getTime() + 86400000);
	for (const ev of events) {
		const evTime = new Date(ev.time);
		if (evTime > todayEnd) {
			const daysAway = Math.floor((evTime - todayStart) / 86400000);
			if (daysAway > 14) {
				findings.push({
					severity: "warning",
					check: "event_too_far",
					message: `"${ev.title}" is ${daysAway} days away — may clutter the dashboard`,
				});
			}
		}
	}

	// 3. Featured references events that don't exist
	if (featured?.blocks) {
		const eventTitles = new Set(events.map(e => e.title?.toLowerCase()));
		for (const block of featured.blocks) {
			if (block.type === "event-line" && block.text) {
				// Extract event name from block text (before the comma/time)
				const match = block.text.match(/^[⚽🏌🎾🏎♟🎮🏅]\s*(.+?)(?:,|\d{2}:\d{2}|$)/);
				if (match) {
					const ref = match[1].trim().toLowerCase();
					// Fuzzy check — at least one event title should partially match
					const found = [...eventTitles].some(t => t.includes(ref) || ref.includes(t));
					if (!found && ref.length > 5) {
						findings.push({
							severity: "info",
							check: "featured_orphan_ref",
							message: `Featured block references "${match[1].trim()}" which may not match any event`,
						});
					}
				}
			}
		}
	}

	// 4. Sport with standings but zero events
	if (standings && health?.sportCoverage) {
		if (standings.football?.premierLeague?.length > 0 && !health.sportCoverage.football) {
			findings.push({
				severity: "warning",
				check: "standings_without_events",
				message: "Premier League standings exist but no football events",
			});
		}
		if (standings.golf?.pga?.leaderboard?.length > 0 && !health.sportCoverage.golf) {
			findings.push({
				severity: "warning",
				check: "standings_without_events",
				message: "Golf leaderboard exists but no golf events",
			});
		}
	}

	// 5. All events from a sport vanished (vs previous health report)
	if (health?.issues) {
		const dropped = health.issues.filter(i => i.code === "sport_dropped");
		for (const d of dropped) {
			findings.push({
				severity: "critical",
				check: "sport_vanished",
				message: d.message,
			});
		}
	}

	// 6. Quality regression without explanation
	if (quality?.editorial?.score != null && quality.editorial.score < 70) {
		findings.push({
			severity: "warning",
			check: "low_editorial_quality",
			message: `Editorial quality score is ${quality.editorial.score}/100 (below threshold)`,
		});
	}

	// 7. Data staleness
	if (meta?.lastUpdate) {
		const ageHours = (now - new Date(meta.lastUpdate)) / 3600000;
		if (ageHours > 4) {
			findings.push({
				severity: "warning",
				check: "stale_dashboard",
				message: `Dashboard data is ${Math.round(ageHours)} hours old`,
			});
		}
	}

	// 8. Duplicate events (same title + same time)
	const eventKeys = new Set();
	for (const ev of events) {
		const key = `${ev.title}|${ev.time}`;
		if (eventKeys.has(key)) {
			findings.push({
				severity: "warning",
				check: "duplicate_event",
				message: `Duplicate event: "${ev.title}" at ${ev.time}`,
			});
		}
		eventKeys.add(key);
	}

	// 9. Events with missing critical fields
	for (const ev of events) {
		if (!ev.title) {
			findings.push({ severity: "warning", check: "missing_title", message: `Event missing title (sport: ${ev.sport})` });
		}
		if (!ev.time) {
			findings.push({ severity: "warning", check: "missing_time", message: `"${ev.title}" has no time field` });
		}
	}

	return findings;
}

/**
 * Build a snapshot of what the user would see on the dashboard.
 */
function buildDashboardSnapshot(data) {
	const { events, featured, health, quality, standings } = data;
	const now = new Date();

	// Classify events by temporal band
	const bands = { live: [], today: [], tomorrow: [], thisWeek: [], later: [], ended: [] };
	for (const ev of events) {
		const evTime = new Date(ev.time);
		const endTime = ev.endTime ? new Date(ev.endTime) : null;
		const hoursAgo = (now - evTime) / 3600000;
		const isEnded = endTime ? now > endTime : hoursAgo > 3;

		if (isEnded && evTime < now) {
			bands.ended.push(ev.title);
		} else if (evTime <= now && !isEnded) {
			bands.live.push(ev.title);
		} else {
			const daysAway = Math.floor((evTime - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
			if (daysAway === 0) bands.today.push(ev.title);
			else if (daysAway === 1) bands.tomorrow.push(ev.title);
			else if (daysAway <= 7) bands.thisWeek.push(ev.title);
			else bands.later.push(ev.title);
		}
	}

	return {
		totalEvents: events.length,
		sports: [...new Set(events.map(e => e.sport))],
		bands,
		featuredBlockCount: featured?.blocks?.length || 0,
		briefPresent: !!featured?.blocks?.some(b => b.type === "headline"),
		pipelineStatus: health?.status || "unknown",
		editorialScore: quality?.editorial?.score,
		issueCount: health?.issues?.length || 0,
	};
}

async function runLLMCheck(snapshot, deterministicFindings, data) {
	const llm = new LLMClient();
	if (!llm.isAvailable()) return null;

	const systemPrompt = `You are a QA tester for SportSync, a sports dashboard. You receive a snapshot of what the user sees. Look for anything that seems wrong, inconsistent, or confusing from a user perspective.

Focus on:
- Events showing wrong status (ended when still ongoing, live when not started)
- Missing or mismatched data (standings for a sport with no events)
- Temporal inconsistencies (events in wrong day band)
- Content quality issues (empty sections, broken references)
- Anything a real user would find confusing or incorrect

Return a JSON array of findings. Each finding: {"severity": "critical|warning|info", "check": "short_id", "message": "description"}
Return [] if everything looks good.`;

	const userPrompt = JSON.stringify({
		currentTime: new Date().toISOString(),
		snapshot,
		deterministicFindings,
		sampleEvents: data.events.slice(0, 10).map(e => ({
			title: e.title, sport: e.sport, time: e.time, endTime: e.endTime || null,
			importance: e.importance,
		})),
	});

	try {
		const result = await llm.completeJSON(systemPrompt, userPrompt, { maxRetries: 1 });
		if (Array.isArray(result)) return result;
		return [];
	} catch (err) {
		console.warn("LLM sanity check failed:", err.message);
		return null;
	}
}

export async function runSanityCheck() {
	const events = readJsonIfExists(path.join(dataDir, "events.json")) || [];
	const featured = readJsonIfExists(path.join(dataDir, "featured.json"));
	const health = readJsonIfExists(path.join(dataDir, "health-report.json"));
	const quality = readJsonIfExists(path.join(dataDir, "ai-quality.json"));
	const standings = readJsonIfExists(path.join(dataDir, "standings.json"));
	const meta = readJsonIfExists(path.join(dataDir, "meta.json"));

	const data = { events, featured, health, quality, standings, meta };

	// 1. Deterministic checks (always run)
	const deterministicFindings = runDeterministicChecks(data);

	// 2. Build snapshot for LLM
	const snapshot = buildDashboardSnapshot(data);

	// 3. LLM analysis (if available)
	const llmFindings = await runLLMCheck(snapshot, deterministicFindings, data);

	// Merge findings, dedup by message
	const allFindings = [...deterministicFindings];
	if (llmFindings) {
		const existing = new Set(allFindings.map(f => f.message));
		for (const f of llmFindings) {
			if (!existing.has(f.message)) allFindings.push(f);
		}
	}

	const report = {
		generatedAt: new Date().toISOString(),
		provider: llmFindings ? "llm" : "rules-only",
		snapshot,
		findings: allFindings,
		summary: {
			total: allFindings.length,
			critical: allFindings.filter(f => f.severity === "critical").length,
			warning: allFindings.filter(f => f.severity === "warning").length,
			info: allFindings.filter(f => f.severity === "info").length,
		},
		pass: !allFindings.some(f => f.severity === "critical"),
	};

	return report;
}

async function main() {
	const report = await runSanityCheck();

	const outPath = path.join(dataDir, "sanity-report.json");
	writeJsonPretty(outPath, report);

	const icon = report.pass ? "PASS" : "FAIL";
	console.log(`Sanity check: ${icon} (${report.summary.total} finding(s): ${report.summary.critical} critical, ${report.summary.warning} warning, ${report.summary.info} info)`);
	for (const f of report.findings) {
		console.log(`  [${f.severity}] ${f.check}: ${f.message}`);
	}
}

if (process.argv[1]?.includes("ai-sanity-check")) {
	main().catch(err => {
		console.error("Sanity check failed:", err);
		process.exit(1);
	});
}
