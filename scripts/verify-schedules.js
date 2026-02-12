#!/usr/bin/env node
/**
 * Schedule Verification Script
 *
 * Cross-references curated config event dates/times against live API data
 * (ESPN scoreboard). Reports mismatches to health-report.json and auto-corrects
 * dates when confidence is high.
 */

import fs from "fs";
import path from "path";
import { readJsonIfExists, writeJsonPretty, rootDataPath, fetchJson } from "./lib/helpers.js";

const configDir = path.resolve(process.cwd(), "scripts", "config");
const dataDir = rootDataPath();

const ESPN_SCOREBOARD_URLS = {
	"cross-country": "https://site.api.espn.com/apis/site/v2/sports/skiing/cross-country/scoreboard",
	biathlon: "https://site.api.espn.com/apis/site/v2/sports/skiing/biathlon/scoreboard",
	"ski-jumping": "https://site.api.espn.com/apis/site/v2/sports/skiing/ski-jumping/scoreboard",
	"alpine-skiing": "https://site.api.espn.com/apis/site/v2/sports/skiing/alpine/scoreboard",
	"nordic-combined": "https://site.api.espn.com/apis/site/v2/sports/skiing/nordic-combined/scoreboard",
	football: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard",
	golf: "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
	tennis: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
	f1: "https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard",
};

/**
 * Detect which ESPN sport category a curated event title maps to.
 */
export function detectSportFromTitle(title) {
	const lower = title.toLowerCase();
	if (lower.includes("cross-country")) return "cross-country";
	if (lower.includes("biathlon")) return "biathlon";
	if (lower.includes("ski jumping")) return "ski-jumping";
	if (lower.includes("alpine")) return "alpine-skiing";
	if (lower.includes("nordic combined")) return "nordic-combined";
	if (lower.includes("football") || lower.includes("soccer")) return "football";
	if (lower.includes("golf")) return "golf";
	if (lower.includes("tennis")) return "tennis";
	if (lower.includes("formula") || lower.includes("f1") || lower.includes("grand prix")) return "f1";
	return null;
}

/**
 * Load all curated configs that have an `events` array with date info.
 */
export function loadCuratedConfigs() {
	const configs = [];
	if (!fs.existsSync(configDir)) return configs;

	const files = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
	for (const file of files) {
		const data = readJsonIfExists(path.join(configDir, file));
		if (data && Array.isArray(data.events) && data.events.length > 0) {
			configs.push({ file, ...data });
		}
	}
	return configs;
}

/**
 * Check a single curated config for schedule issues.
 * Returns { issues, corrections } without making API calls.
 */
export function verifyConfigDates(config) {
	const issues = [];
	const corrections = [];
	const now = new Date();

	// Check config-level dates
	if (config.startDate && config.endDate) {
		const start = new Date(config.startDate);
		const end = new Date(config.endDate);
		if (end < start) {
			issues.push({
				severity: "warning",
				code: "config_date_order",
				config: config.file,
				message: `endDate (${config.endDate}) is before startDate (${config.startDate})`,
			});
		}
	}

	for (const event of config.events) {
		if (!event.time) {
			issues.push({
				severity: "warning",
				code: "missing_event_time",
				config: config.file,
				event: event.title,
				message: `Event "${event.title}" has no time field`,
			});
			continue;
		}

		const eventDate = new Date(event.time);
		if (isNaN(eventDate.getTime())) {
			issues.push({
				severity: "warning",
				code: "invalid_event_time",
				config: config.file,
				event: event.title,
				message: `Event "${event.title}" has invalid time: ${event.time}`,
			});
			continue;
		}

		// Check if event is outside the config's date range
		if (config.startDate && config.endDate) {
			const start = new Date(config.startDate);
			const end = new Date(config.endDate + "T23:59:59Z");
			if (eventDate < start || eventDate > end) {
				issues.push({
					severity: "warning",
					code: "event_outside_range",
					config: config.file,
					event: event.title,
					message: `Event "${event.title}" at ${event.time} is outside config range ${config.startDate} to ${config.endDate}`,
				});
			}
		}

		// Check for duplicate times in the same config (possible copy-paste error)
		const siblings = config.events.filter(
			(e) => e !== event && e.time === event.time && e.venue === event.venue
		);
		if (siblings.length > 0) {
			issues.push({
				severity: "warning",
				code: "duplicate_event_time",
				config: config.file,
				event: event.title,
				message: `Event "${event.title}" shares time and venue with ${siblings.length} other event(s)`,
			});
		}
	}

	return { issues, corrections };
}

/**
 * Cross-reference curated events against ESPN scoreboard data.
 * Returns matches and mismatches.
 */
export function crossReferenceWithAPI(configEvents, apiEvents, sportKey) {
	const results = [];

	for (const configEvent of configEvents) {
		const configDate = new Date(configEvent.time);
		if (isNaN(configDate.getTime())) continue;

		// Try to match by title similarity and date proximity
		let bestMatch = null;
		let bestScore = 0;

		for (const apiEvent of apiEvents) {
			const apiDate = new Date(apiEvent.date || apiEvent.time);
			if (isNaN(apiDate.getTime())) continue;

			// Score: title similarity + date proximity
			const titleScore = titleSimilarity(configEvent.title, apiEvent.name || apiEvent.title || "");
			const timeDiffHours = Math.abs(configDate - apiDate) / (1000 * 60 * 60);
			const dateScore = timeDiffHours < 1 ? 1.0 : timeDiffHours < 24 ? 0.5 : timeDiffHours < 72 ? 0.2 : 0;

			const score = titleScore * 0.6 + dateScore * 0.4;
			if (score > bestScore && score > 0.3) {
				bestScore = score;
				bestMatch = { apiEvent, titleScore, timeDiffHours, score };
			}
		}

		if (bestMatch && bestMatch.timeDiffHours > 1) {
			const apiDate = new Date(bestMatch.apiEvent.date || bestMatch.apiEvent.time);
			results.push({
				configEvent: configEvent.title,
				configTime: configEvent.time,
				apiTime: apiDate.toISOString(),
				timeDiffHours: Math.round(bestMatch.timeDiffHours * 10) / 10,
				confidence: bestMatch.score > 0.7 ? "high" : bestMatch.score > 0.5 ? "medium" : "low",
				correctable: bestMatch.score > 0.7 && bestMatch.timeDiffHours < 48,
			});
		}
	}

	return results;
}

/**
 * Simple title similarity score (0-1) based on word overlap.
 */
export function titleSimilarity(a, b) {
	const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
	const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
	if (wordsA.size === 0 || wordsB.size === 0) return 0;

	let overlap = 0;
	for (const w of wordsA) {
		if (wordsB.has(w)) overlap++;
	}
	return (2 * overlap) / (wordsA.size + wordsB.size);
}

/**
 * Run full schedule verification.
 * @param {object} options - { configs, fetchFn, dryRun }
 */
export async function verifySchedules(options = {}) {
	const { configs = loadCuratedConfigs(), fetchFn = fetchJson, dryRun = false } = options;

	const allIssues = [];
	const allCorrections = [];
	const apiMismatches = [];

	// Step 1: Static validation of all configs
	for (const config of configs) {
		const { issues, corrections } = verifyConfigDates(config);
		allIssues.push(...issues);
		allCorrections.push(...corrections);
	}

	// Step 2: Cross-reference with ESPN APIs (best-effort)
	for (const config of configs) {
		for (const event of config.events) {
			const sport = detectSportFromTitle(event.title);
			if (!sport || !ESPN_SCOREBOARD_URLS[sport]) continue;

			try {
				const url = ESPN_SCOREBOARD_URLS[sport];
				const data = await fetchFn(url);
				if (data?.events && Array.isArray(data.events)) {
					const mismatches = crossReferenceWithAPI([event], data.events, sport);
					for (const m of mismatches) {
						m.config = config.file;
						apiMismatches.push(m);

						if (m.correctable && !dryRun) {
							allCorrections.push({
								config: config.file,
								event: m.configEvent,
								oldTime: m.configTime,
								newTime: m.apiTime,
								confidence: m.confidence,
							});
						}

						allIssues.push({
							severity: m.confidence === "high" ? "warning" : "warning",
							code: "schedule_mismatch",
							config: config.file,
							event: m.configEvent,
							message: `"${m.configEvent}" time mismatch: config=${m.configTime}, API=${m.apiTime} (diff ${m.timeDiffHours}h, confidence=${m.confidence})`,
						});
					}
				}
			} catch (err) {
				// API fetch failures are non-fatal
				console.warn(`ESPN ${sport} fetch failed: ${err.message}`);
			}
		}
	}

	// Step 3: Apply high-confidence corrections
	if (!dryRun && allCorrections.length > 0) {
		for (const correction of allCorrections) {
			applyCorrection(correction);
		}
	}

	return {
		generatedAt: new Date().toISOString(),
		configsChecked: configs.length,
		eventsChecked: configs.reduce((sum, c) => sum + c.events.length, 0),
		issues: allIssues,
		corrections: allCorrections,
		apiMismatches,
	};
}

/**
 * Apply a date correction to a curated config file.
 */
function applyCorrection(correction) {
	const filePath = path.join(configDir, correction.config);
	const data = readJsonIfExists(filePath);
	if (!data || !Array.isArray(data.events)) return;

	let modified = false;
	for (const event of data.events) {
		if (event.title === correction.event && event.time === correction.oldTime) {
			event.time = correction.newTime;
			modified = true;
		}
	}

	if (modified) {
		writeJsonPretty(filePath, data);
		console.log(`Corrected "${correction.event}" in ${correction.config}: ${correction.oldTime} → ${correction.newTime}`);
	}
}

async function main() {
	console.log("Verifying curated config schedules...");

	const result = await verifySchedules();

	console.log(`Checked ${result.configsChecked} config(s), ${result.eventsChecked} event(s).`);
	console.log(`Issues: ${result.issues.length}, Corrections: ${result.corrections.length}`);

	for (const issue of result.issues) {
		console.log(`  [${issue.severity}] ${issue.message}`);
	}

	// Merge issues into existing health report
	const healthPath = path.join(dataDir, "health-report.json");
	const health = readJsonIfExists(healthPath);
	if (health) {
		// Remove old schedule issues, add new ones
		health.issues = (health.issues || []).filter((i) => i.code !== "schedule_mismatch" && !i.code?.startsWith("config_"));
		health.issues.push(...result.issues);

		// Recalculate status
		const hasCritical = health.issues.some((i) => i.severity === "critical");
		const hasWarning = health.issues.some((i) => i.severity === "warning");
		health.status = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";
		health.scheduleVerification = {
			lastChecked: result.generatedAt,
			configsChecked: result.configsChecked,
			eventsChecked: result.eventsChecked,
			issueCount: result.issues.length,
			correctionsApplied: result.corrections.length,
		};

		writeJsonPretty(healthPath, health);
	}
}

if (process.argv[1]?.includes("verify-schedules")) {
	main().catch((err) => {
		console.error("Schedule verification failed:", err);
		process.exit(1);
	});
}
