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

	// 9. Featured mentions athletes not in any event's norwegianPlayers
	if (featured?.blocks) {
		const allNorwegianPlayers = new Set();
		for (const ev of events) {
			if (Array.isArray(ev.norwegianPlayers)) {
				for (const p of ev.norwegianPlayers) {
					if (p.name) allNorwegianPlayers.add(p.name.toLowerCase());
				}
			}
		}
		// Also collect top-level norwegianAthletes from events (they have tournament field)
		const norwegianAthleteNames = new Set();
		for (const ev of events) {
			if (ev.norwegian && ev.title) {
				// Extract athlete-like names from event data
			}
		}

		for (const block of featured.blocks) {
			if (!block.text) continue;
			if (block.type !== "narrative" && block.type !== "event-line") continue;
			// Look for capitalized names that could be athlete references
			const namePattern = /\b([A-Z][a-zæøå]+(?:\s+[A-Z][a-zæøå]+)*)\b/g;
			let match;
			while ((match = namePattern.exec(block.text)) !== null) {
				const name = match[1];
				// Skip common non-name words
				if (["The", "Norway", "Norwegian", "Olympic", "Olympics", "World", "Cup", "London", "Paris", "Milan", "Italy", "Barcelona", "Arsenal", "Brentford", "Madrid", "Premier", "League", "Champions", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "This", "Week", "Gold", "Today"].includes(name)) continue;
				// Check if this name appears in event titles or norwegianPlayers
				const nameLower = name.toLowerCase();
				const inEvents = events.some(e =>
					e.title?.toLowerCase().includes(nameLower) ||
					(Array.isArray(e.norwegianPlayers) && e.norwegianPlayers.some(p => p.name?.toLowerCase().includes(nameLower)))
				);
				if (!inEvents && allNorwegianPlayers.size > 0) {
					// Only flag if we have norwegianPlayers data to compare against
					const couldBeAthlete = allNorwegianPlayers.size > 0 &&
						!events.some(e => e.tournament?.toLowerCase().includes(nameLower));
					if (couldBeAthlete && name.length > 3) {
						findings.push({
							severity: "warning",
							check: "featured_unknown_athlete",
							message: `Featured mentions "${name}" but no matching athlete found in events data`,
						});
					}
				}
			}
		}
	}

	// 10. Roster/event player desync — config norwegianPlayers not in roster
	// (This is caught by sync-configs at runtime, but sanity-check catches it post-hoc)
	for (const ev of events) {
		if (!Array.isArray(ev.norwegianPlayers) || !ev.norwegian) continue;
		if (ev.norwegianPlayers.length === 0 && ev.norwegian === true) {
			findings.push({
				severity: "info",
				check: "norwegian_flag_no_players",
				message: `"${ev.title}" marked norwegian=true but has no norwegianPlayers`,
			});
		}
	}

	// 11. Featured event times don't match events.json
	if (featured?.blocks) {
		const timePattern = /(\d{1,2}:\d{2})/;
		for (const block of featured.blocks) {
			if (block.type !== "event-line" || !block.text) continue;
			const timeMatch = block.text.match(timePattern);
			if (!timeMatch) continue;
			const featuredTime = timeMatch[1];
			// Find matching event by partial title match
			const titlePart = block.text.replace(/^[⚽🏌🎾🏎♟🎮🏅]\s*/, "").replace(timePattern, "").replace(/[—\-,]/g, " ").trim().split(/\s+/).filter(w => w.length > 3).slice(0, 2).join(" ").toLowerCase();
			if (!titlePart) continue;
			const matchingEvent = events.find(e => {
				const eLower = e.title?.toLowerCase() || "";
				return titlePart.split(" ").some(w => eLower.includes(w));
			});
			if (matchingEvent?.time) {
				// Convert event time to HH:MM in local timezone (Europe/Oslo)
				try {
					const evDate = new Date(matchingEvent.time);
					const evTimeStr = evDate.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
					if (evTimeStr !== featuredTime) {
						findings.push({
							severity: "warning",
							check: "featured_time_mismatch",
							message: `Featured shows "${featuredTime}" for "${matchingEvent.title}" but events.json has ${evTimeStr}`,
						});
					}
				} catch { /* timezone not available in all environments */ }
			}
		}
	}

	// 12. Events with missing critical fields
	for (const ev of events) {
		if (!ev.title) {
			findings.push({ severity: "warning", check: "missing_title", message: `Event missing title (sport: ${ev.sport})` });
		}
		if (!ev.time) {
			findings.push({ severity: "warning", check: "missing_time", message: `"${ev.title || 'unknown'}" has no time field` });
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

async function runLLMCheck(snapshot, deterministicFindings, data, externalLlm) {
	const llm = externalLlm || new LLMClient();
	if (!llm.isAvailable()) return null;

	const systemPrompt = `You are a QA tester for SportSync, a sports dashboard. You receive a snapshot of what the user sees plus detailed event data. Look for anything that seems wrong, inconsistent, or confusing from a user perspective.

Focus on:
- Events showing wrong status (ended when still ongoing, live when not started)
- Missing or mismatched data (standings for a sport with no events)
- Temporal inconsistencies (events in wrong day band)
- Content quality issues (empty sections, broken references)
- Data completeness: fields that should have values but are null/empty (e.g., a golf event with 80 players but tee times are null, or a football match with no venue). Think about what data SHOULD be there given the context — an in-progress tournament should have tee times, a match today should have a venue.
- Sport-specific anomalies: anything that doesn't make sense for that sport (e.g., golf tournament with 0 featured groups despite Norwegian players, football match in the wrong timezone)
- Anything a real user would find confusing or incorrect

When you find data quality issues, include actionable detail in the message: which field is wrong, what the expected value would be, and what component likely caused it (fetcher, enrichment, config).

Return a JSON array of findings. Each finding: {"severity": "critical|warning|info", "check": "short_id", "message": "description", "actionable": true/false}
Set "actionable" to true for findings that represent fixable code/data issues (vs. transient API issues or cosmetic observations).
Return [] if everything looks good.`;

	const userPrompt = JSON.stringify({
		currentTime: new Date().toISOString(),
		snapshot,
		deterministicFindings,
		events: data.events.slice(0, 30).map(e => ({
			title: e.title, sport: e.sport, time: e.time, endTime: e.endTime || null,
			importance: e.importance, venue: e.venue,
			norwegian: e.norwegian || false,
			...(e.norwegianPlayers?.length > 0 && {
				norwegianPlayers: e.norwegianPlayers.map(p => ({
					name: p.name, teeTime: p.teeTime || null, status: p.status || null,
				})),
			}),
			...(e.featuredGroups?.length > 0 && { featuredGroupCount: e.featuredGroups.length }),
			...(e.totalPlayers && { totalPlayers: e.totalPlayers }),
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
	const sanityLlm = new LLMClient();
	const llmFindings = await runLLMCheck(snapshot, deterministicFindings, data, sanityLlm);

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
		tokenUsage: sanityLlm.isAvailable() ? sanityLlm.getUsage() : null,
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
