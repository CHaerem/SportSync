#!/usr/bin/env node
/**
 * Schedule Verification Script
 *
 * Thin CLI orchestrator that imports from schedule-verifier.js.
 * Runs the 5-verifier chain, writes verification-history.json,
 * applies high-confidence corrections, flags unverified configs
 * for re-research, and merges summary into health-report.json.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, writeJsonPretty, rootDataPath, fetchJson, parseCliJsonOutput } from "./lib/helpers.js";
import {
	titleSimilarity,
	detectSportFromTitle,
	ESPN_SCOREBOARD_URLS,
	verifyConfig,
	buildVerificationHints,
} from "./lib/schedule-verifier.js";

const configDir = path.resolve(process.cwd(), "scripts", "config");
const dataDir = rootDataPath();

const MAX_HISTORY_RUNS = 50;
const UNVERIFIED_THRESHOLD = 0.5;
const MAX_WEB_SEARCHES = 3;

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
 * (Preserved for backward compatibility with existing tests.)
 */
export function verifyConfigDates(config) {
	const issues = [];
	const corrections = [];

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
 * (Preserved for backward compatibility with existing tests.)
 */
export function crossReferenceWithAPI(configEvents, apiEvents, sportKey) {
	const results = [];

	for (const configEvent of configEvents) {
		const configDate = new Date(configEvent.time);
		if (isNaN(configDate.getTime())) continue;

		let bestMatch = null;
		let bestScore = 0;

		for (const apiEvent of apiEvents) {
			const apiDate = new Date(apiEvent.date || apiEvent.time);
			if (isNaN(apiDate.getTime())) continue;

			const tScore = titleSimilarity(configEvent.title, apiEvent.name || apiEvent.title || "");
			const timeDiffHours = Math.abs(configDate - apiDate) / (1000 * 60 * 60);
			const dateScore = timeDiffHours < 1 ? 1.0 : timeDiffHours < 24 ? 0.5 : timeDiffHours < 72 ? 0.2 : 0;

			const score = tScore * 0.6 + dateScore * 0.4;
			if (score > bestScore && score > 0.3) {
				bestScore = score;
				bestMatch = { apiEvent, titleScore: tScore, timeDiffHours, score };
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

// Re-export from schedule-verifier for backward compatibility
export { titleSimilarity, detectSportFromTitle };

/** Per-request timeout for ESPN fetches — keeps the step well within 60s budget. */
const ESPN_FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch ESPN data for all relevant sports (batched).
 * Each fetch is bounded by ESPN_FETCH_TIMEOUT_MS to prevent stalls.
 */
async function fetchESPNData(fetchFn) {
	const espnEvents = {};
	for (const [sport, url] of Object.entries(ESPN_SCOREBOARD_URLS)) {
		try {
			const data = await fetchFn(url, { timeout: ESPN_FETCH_TIMEOUT_MS });
			if (data?.events && Array.isArray(data.events)) {
				espnEvents[sport] = data.events;
			}
		} catch (err) {
			console.warn(`ESPN ${sport} fetch failed: ${err.message}`);
		}
	}
	return espnEvents;
}

/**
 * Load sport data files from docs/data/{sport}.json.
 */
function loadSportDataMap(dDir) {
	const sportDataMap = {};
	const sportFiles = ["football", "golf", "tennis", "f1", "chess", "esports"];
	for (const sport of sportFiles) {
		const data = readJsonIfExists(path.join(dDir, `${sport}.json`));
		if (data) {
			sportDataMap[sport] = data;
		}
	}
	return sportDataMap;
}

/**
 * Create a web search verification function using Claude CLI.
 * Returns a function compatible with context.webSearchFn.
 * Returns null if Claude CLI is not available (no CLAUDE_CODE_OAUTH_TOKEN).
 */
function createWebSearchFn() {
	if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
		return null;
	}

	return async function webSearchVerify(event) {
		const prompt = `You are a sports schedule fact-checker. Verify the exact start time for this event.

EVENT: ${event.title}
LISTED TIME: ${event.time}
VENUE: ${event.venue || "unknown"}

INSTRUCTIONS:
1. Search for the official schedule for this event
2. Find the exact start time from an authoritative source (official event website, broadcaster schedule, or major sports news)
3. Compare against the listed time above
4. If the time is correct (within 15 minutes), mark as verified
5. If the time is wrong, provide the correct time in ISO 8601 format with timezone offset

Return ONLY valid JSON, no markdown fences:
{
  "verified": true/false,
  "confidence": 0.0-1.0,
  "correctTime": "ISO 8601 time if different, or null",
  "source": "where you found the time",
  "details": "brief explanation"
}`;

		const dataDir = rootDataPath();
		const tmpFile = path.join(dataDir, ".verify-prompt.tmp");
		fs.writeFileSync(tmpFile, prompt);
		try {
			const cmd = `cat "${tmpFile}" | npx -y @anthropic-ai/claude-code@latest -p --output-format json --max-turns 4 --allowedTools "WebSearch" "WebFetch"`;
			const output = execSync(cmd, {
				encoding: "utf-8",
				timeout: 120000,
				maxBuffer: 2 * 1024 * 1024,
			});
			const parsed = parseCliJsonOutput(output);
			const raw = parsed.result;

			let result;
			try {
				result = JSON.parse(raw);
			} catch {
				const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
				if (match) {
					result = JSON.parse(match[1].trim());
				} else {
					const jsonMatch = raw.match(/\{[\s\S]*\}/);
					if (jsonMatch) result = JSON.parse(jsonMatch[0]);
					else return { verified: false, confidence: 0.2, details: "Could not parse web search result" };
				}
			}

			const searchResult = {
				verified: !!result.verified,
				confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
				details: result.details || result.source || "Web search completed",
			};

			if (!result.verified && result.correctTime) {
				searchResult.correction = {
					field: "time",
					oldValue: event.time,
					newValue: result.correctTime,
					confidence: searchResult.confidence,
				};
			}

			return searchResult;
		} finally {
			try { fs.unlinkSync(tmpFile); } catch {}
		}
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
		if (event.title === correction.event && event.time === correction.oldValue) {
			event.time = correction.newValue;
			modified = true;
		}
	}

	if (modified) {
		writeJsonPretty(filePath, data);
		console.log(`Corrected "${correction.event}" in ${correction.config}: ${correction.oldValue} → ${correction.newValue}`);
	}
}

/**
 * Flag configs with >50% unverified events as needsResearch.
 */
function flagUnverifiedConfigs(configResults) {
	for (const result of configResults) {
		if (result.eventsChecked === 0) continue;
		const unverifiedRatio = result.unverified / result.eventsChecked;
		if (unverifiedRatio > UNVERIFIED_THRESHOLD) {
			const filePath = path.join(configDir, result.file);
			const data = readJsonIfExists(filePath);
			if (data && !data.needsResearch) {
				data.needsResearch = true;
				data.verificationSummary = result.verificationSummary;
				writeJsonPretty(filePath, data);
				console.log(`Flagged ${result.file} for re-research (${Math.round(unverifiedRatio * 100)}% unverified)`);
			}
		}
	}
}

/**
 * Write verificationSummary to each config.
 */
function writeVerificationSummaries(configResults) {
	for (const result of configResults) {
		const filePath = path.join(configDir, result.file);
		const data = readJsonIfExists(filePath);
		if (data) {
			data.verificationSummary = result.verificationSummary;
			writeJsonPretty(filePath, data);
		}
	}
}

/**
 * Run full schedule verification using the modular verifier engine.
 * @param {object} options - { configs, fetchFn, dryRun }
 */
export async function verifySchedules(options = {}) {
	const { configs = loadCuratedConfigs(), fetchFn = fetchJson, dryRun = false } = options;

	const allIssues = [];
	const allCorrections = [];
	const apiMismatches = [];

	// Step 1: Static validation of all configs (preserved for backward compat)
	for (const config of configs) {
		const { issues, corrections } = verifyConfigDates(config);
		allIssues.push(...issues);
		allCorrections.push(...corrections);
	}

	// Step 2: Cross-reference with ESPN APIs (best-effort, backward compat)
	for (const config of configs) {
		for (const event of config.events) {
			const sport = detectSportFromTitle(event.title);
			if (!sport || !ESPN_SCOREBOARD_URLS[sport]) continue;

			try {
				const url = ESPN_SCOREBOARD_URLS[sport];
				const data = await fetchFn(url, { timeout: ESPN_FETCH_TIMEOUT_MS });
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
							severity: "warning",
							code: "schedule_mismatch",
							config: config.file,
							event: m.configEvent,
							message: `"${m.configEvent}" time mismatch: config=${m.configTime}, API=${m.apiTime} (diff ${m.timeDiffHours}h, confidence=${m.confidence})`,
						});
					}
				}
			} catch (err) {
				console.warn(`ESPN ${sport} fetch failed: ${err.message}`);
			}
		}
	}

	// Step 3: Apply high-confidence corrections
	if (!dryRun && allCorrections.length > 0) {
		for (const correction of allCorrections) {
			applyCorrection({ ...correction, oldValue: correction.oldTime, newValue: correction.newTime });
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
 * Run the full modular verification pipeline (verifier chain + history + health).
 */
export async function runVerification(options = {}) {
	const {
		configs = loadCuratedConfigs(),
		fetchFn = fetchJson,
		dryRun = false,
		dDir = dataDir,
		cfgDir = configDir,
	} = options;

	// Load context
	const rssDigest = readJsonIfExists(path.join(dDir, "rss-digest.json"));
	const sportDataMap = loadSportDataMap(dDir);
	const espnEvents = await fetchESPNData(fetchFn);
	const verificationHistory = readJsonIfExists(path.join(dDir, "verification-history.json")) || { runs: [] };

	const webSearchFn = createWebSearchFn();

	const context = {
		rssDigest,
		sportDataMap,
		espnEvents,
		now: new Date(),
		webSearchFn,
		webSearchCount: 0,
		maxWebSearches: MAX_WEB_SEARCHES,
	};

	// Run verifier chain for each config
	// Enable web search when Claude CLI is available (graceful degradation)
	const skipWebSearch = !webSearchFn;
	const configResults = [];
	for (const config of configs) {
		const result = await verifyConfig(config, context, { skipWebSearch, dryRun });
		configResults.push(result);
	}

	// Apply high-confidence corrections
	if (!dryRun) {
		for (const result of configResults) {
			for (const correction of result.corrections) {
				applyCorrection({ config: result.file, ...correction });
			}
		}

		// Flag configs with >50% unverified for re-research
		flagUnverifiedConfigs(configResults);

		// Write verificationSummary to each config
		writeVerificationSummaries(configResults);
	}

	// Build run record
	const runRecord = {
		timestamp: new Date().toISOString(),
		configsChecked: configs.length,
		eventsChecked: configs.reduce((sum, c) => sum + c.events.length, 0),
		results: configResults.map((r) => ({
			file: r.file,
			sport: configs.find((c) => c.file === r.file)?.sport || null,
			eventsChecked: r.eventsChecked,
			verified: r.verified,
			plausible: r.plausible,
			unverified: r.unverified,
			overallConfidence: r.overallConfidence,
			corrections: r.corrections,
		})),
	};

	// Append to verification history (keep last 50)
	verificationHistory.runs.push(runRecord);
	while (verificationHistory.runs.length > MAX_HISTORY_RUNS) {
		verificationHistory.runs.shift();
	}

	if (!dryRun) {
		writeJsonPretty(path.join(dDir, "verification-history.json"), verificationHistory);
	}

	return { runRecord, verificationHistory, configResults };
}

async function main() {
	console.log("Verifying curated config schedules...");

	// Safety valve: exit cleanly after 50s so the pipeline step never times out hard.
	// The pipeline timeout is 60s; this gives a 10s margin for I/O cleanup.
	const SAFETY_TIMEOUT_MS = 50000;
	const safetyTimer = setTimeout(() => {
		console.warn("verify-schedules: safety timeout reached — exiting cleanly with partial results");
		process.exit(0);
	}, SAFETY_TIMEOUT_MS);
	safetyTimer.unref(); // Don't keep the process alive just for this timer

	const dDir = rootDataPath();
	const result = await runVerification({ dDir, dryRun: false });
	clearTimeout(safetyTimer);
	const { runRecord } = result;

	console.log(`Checked ${runRecord.configsChecked} config(s), ${runRecord.eventsChecked} event(s).`);

	let totalVerified = 0;
	let totalPlausible = 0;
	let totalUnverified = 0;
	let totalCorrections = 0;

	for (const r of runRecord.results) {
		totalVerified += r.verified;
		totalPlausible += r.plausible;
		totalUnverified += r.unverified;
		totalCorrections += (r.corrections || []).length;
		console.log(`  ${r.file}: ${r.verified} verified, ${r.plausible} plausible, ${r.unverified} unverified (confidence: ${r.overallConfidence})`);
	}

	console.log(`Total: ${totalVerified} verified, ${totalPlausible} plausible, ${totalUnverified} unverified, ${totalCorrections} corrections`);

	// Merge verification summary into health report
	const healthPath = path.join(dDir, "health-report.json");
	const health = readJsonIfExists(healthPath);
	if (health) {
		health.scheduleVerification = {
			lastChecked: runRecord.timestamp,
			configsChecked: runRecord.configsChecked,
			eventsChecked: runRecord.eventsChecked,
			verified: totalVerified,
			plausible: totalPlausible,
			unverified: totalUnverified,
			correctionsApplied: totalCorrections,
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
