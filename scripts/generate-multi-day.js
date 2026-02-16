#!/usr/bin/env node
/**
 * Multi-day briefing orchestrator.
 * Generates recap (yesterday) and preview (tomorrow) briefings as featured-{date}.json.
 * Idempotent: skips generation if the file already exists (recaps) or is fresh (previews).
 * Cleans up briefings older than 7 days.
 *
 * Env: inherits CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, OPENAI_API_KEY from parent.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { rootDataPath, formatDateKey, readJsonIfExists, writeJsonPretty, MS_PER_DAY, isEventInWindow } from "./lib/helpers.js";
import crypto from "crypto";

// --backfill N: generate recaps for the last N days (default: 1 = yesterday only)
const backfillArg = process.argv.find(a => a.startsWith("--backfill"));
const BACKFILL_DAYS = backfillArg ? parseInt(backfillArg.split("=")[1] || process.argv[process.argv.indexOf(backfillArg) + 1] || "1", 10) : 1;
const MAX_AI_CALLS = BACKFILL_DAYS + 1; // backfill days + tomorrow preview

/**
 * Compute a fingerprint of events for a given date. Used to detect
 * whether the preview needs regeneration (events changed vs. cached version).
 */
export function computeEventFingerprint(events, dateKey) {
	if (!Array.isArray(events) || !dateKey) return "";
	const [y, m, d] = dateKey.split("-").map(Number);
	const dayStart = new Date(y, m - 1, d);
	const dayEnd = new Date(y, m - 1, d + 1);

	const dayEvents = events
		.filter(ev => isEventInWindow(ev, dayStart, dayEnd))
		.map(ev => `${ev.sport || ""}:${ev.title || ""}:${ev.time || ""}`)
		.sort();

	if (dayEvents.length === 0) return "empty";
	return crypto.createHash("md5").update(dayEvents.join("|")).digest("hex").slice(0, 12);
}

function generateBriefing(dateKey, mode, eventFingerprint) {
	console.log(`Generating ${mode} briefing for ${dateKey}...`);
	const env = {
		...process.env,
		SPORTSYNC_FEATURED_DATE: dateKey,
		SPORTSYNC_FEATURED_MODE: mode,
	};
	if (eventFingerprint) env.SPORTSYNC_EVENT_FINGERPRINT = eventFingerprint;
	execSync("node scripts/generate-featured.js", {
		env,
		stdio: "inherit",
		timeout: 180000,
	});
}

function readTokenUsageFromQuality(dataDir) {
	const quality = readJsonIfExists(path.join(dataDir, "ai-quality.json"));
	return quality?.featured?.tokenUsage || null;
}

function main() {
	const dataDir = rootDataPath();
	const now = new Date();
	let aiCalls = 0;
	let totalInput = 0;
	let totalOutput = 0;

	// --- Past day recaps (1..BACKFILL_DAYS days ago) ---
	for (let i = 1; i <= BACKFILL_DAYS; i++) {
		const pastDate = new Date(now.getTime() - i * MS_PER_DAY);
		const pastKey = formatDateKey(pastDate);
		const pastFile = path.join(dataDir, `featured-${pastKey}.json`);

		if (!fs.existsSync(pastFile)) {
			try {
				generateBriefing(pastKey, "recap");
				aiCalls++;
				const usage = readTokenUsageFromQuality(dataDir);
				if (usage) {
					totalInput += usage.input || 0;
					totalOutput += usage.output || 0;
				}
			} catch (err) {
				console.error(`Recap generation failed for ${pastKey}:`, err.message);
			}
		} else {
			console.log(`Recap for ${pastKey} already exists, skipping.`);
		}
	}

	// --- Tomorrow preview ---
	const tomorrow = new Date(now.getTime() + MS_PER_DAY);
	const tomorrowKey = formatDateKey(tomorrow);
	const tomorrowFile = path.join(dataDir, `featured-${tomorrowKey}.json`);

	// Load events to compute fingerprint for preview caching
	const allEvents = readJsonIfExists(path.join(dataDir, "events.json")) || [];
	const tomorrowFingerprint = computeEventFingerprint(allEvents, tomorrowKey);

	let shouldGenerate = false;
	if (!fs.existsSync(tomorrowFile)) {
		shouldGenerate = true;
	} else {
		const existing = readJsonIfExists(tomorrowFile);
		const cachedFingerprint = existing?._meta?.eventFingerprint;
		if (cachedFingerprint && cachedFingerprint === tomorrowFingerprint) {
			// Events haven't changed — skip regeneration
			console.log(`Preview for ${tomorrowKey} events unchanged (fingerprint: ${tomorrowFingerprint}), skipping.`);
		} else if (cachedFingerprint) {
			shouldGenerate = true;
			console.log(`Preview for ${tomorrowKey} events changed (${cachedFingerprint} → ${tomorrowFingerprint}), regenerating.`);
		} else {
			// No fingerprint in cached file — regenerate if older than 24h (legacy behavior)
			const generatedAt = existing?._meta?.generatedAt;
			if (generatedAt) {
				const age = now.getTime() - new Date(generatedAt).getTime();
				if (age > MS_PER_DAY) {
					shouldGenerate = true;
					console.log(`Preview for ${tomorrowKey} is stale (${Math.round(age / MS_PER_DAY * 10) / 10}d old, no fingerprint), regenerating.`);
				}
			}
		}
	}

	if (shouldGenerate) {
		try {
			generateBriefing(tomorrowKey, "preview", tomorrowFingerprint);
			aiCalls++;
			const usage = readTokenUsageFromQuality(dataDir);
			if (usage) {
				totalInput += usage.input || 0;
				totalOutput += usage.output || 0;
			}
		} catch (err) {
			console.error(`Preview generation failed for ${tomorrowKey}:`, err.message);
		}
	} else {
		console.log(`Preview for ${tomorrowKey} is fresh, skipping.`);
	}

	// --- Cleanup: delete briefings older than 7 days ---
	const files = fs.readdirSync(dataDir).filter(f => /^featured-\d{4}-\d{2}-\d{2}\.json$/.test(f));
	const cutoff = now.getTime() - 7 * MS_PER_DAY;
	let cleaned = 0;

	for (const file of files) {
		const dateMatch = file.match(/^featured-(\d{4}-\d{2}-\d{2})\.json$/);
		if (!dateMatch) continue;
		const [y, m, d] = dateMatch[1].split("-").map(Number);
		const fileDate = new Date(y, m - 1, d);
		if (fileDate.getTime() < cutoff) {
			fs.unlinkSync(path.join(dataDir, file));
			cleaned++;
			console.log(`Cleaned up old briefing: ${file}`);
		}
	}

	// Write multi-day token usage to ai-quality.json
	if (aiCalls > 0) {
		const qualityPath = path.join(dataDir, "ai-quality.json");
		const existingQuality = readJsonIfExists(qualityPath) || {};
		writeJsonPretty(qualityPath, {
			...existingQuality,
			multiDay: {
				...existingQuality.multiDay,
				tokenUsage: {
					input: totalInput,
					output: totalOutput,
					calls: aiCalls,
					total: totalInput + totalOutput,
					tracked: false,
					estimated: true,
				},
				lastRun: now.toISOString(),
			},
		});
	}

	console.log(`Multi-day briefings done: ${aiCalls} AI call(s), ${cleaned} old file(s) cleaned.`);
}

main();
