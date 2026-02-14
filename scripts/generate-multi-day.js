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
import { rootDataPath, formatDateKey, readJsonIfExists, MS_PER_DAY } from "./lib/helpers.js";

const MAX_AI_CALLS = 2;

function generateBriefing(dateKey, mode) {
	console.log(`Generating ${mode} briefing for ${dateKey}...`);
	execSync("node scripts/generate-featured.js", {
		env: {
			...process.env,
			SPORTSYNC_FEATURED_DATE: dateKey,
			SPORTSYNC_FEATURED_MODE: mode,
		},
		stdio: "inherit",
		timeout: 180000,
	});
}

function main() {
	const dataDir = rootDataPath();
	const now = new Date();
	let aiCalls = 0;

	// --- Yesterday recap ---
	const yesterday = new Date(now.getTime() - MS_PER_DAY);
	const yesterdayKey = formatDateKey(yesterday);
	const yesterdayFile = path.join(dataDir, `featured-${yesterdayKey}.json`);

	if (!fs.existsSync(yesterdayFile)) {
		try {
			generateBriefing(yesterdayKey, "recap");
			aiCalls++;
		} catch (err) {
			console.error(`Recap generation failed for ${yesterdayKey}:`, err.message);
		}
	} else {
		console.log(`Recap for ${yesterdayKey} already exists, skipping.`);
	}

	// --- Tomorrow preview ---
	if (aiCalls < MAX_AI_CALLS) {
		const tomorrow = new Date(now.getTime() + MS_PER_DAY);
		const tomorrowKey = formatDateKey(tomorrow);
		const tomorrowFile = path.join(dataDir, `featured-${tomorrowKey}.json`);

		let shouldGenerate = false;
		if (!fs.existsSync(tomorrowFile)) {
			shouldGenerate = true;
		} else {
			// Regenerate if older than 24h
			const existing = readJsonIfExists(tomorrowFile);
			const generatedAt = existing?._meta?.generatedAt;
			if (generatedAt) {
				const age = now.getTime() - new Date(generatedAt).getTime();
				if (age > MS_PER_DAY) {
					shouldGenerate = true;
					console.log(`Preview for ${tomorrowKey} is stale (${Math.round(age / MS_PER_DAY * 10) / 10}d old), regenerating.`);
				}
			}
		}

		if (shouldGenerate) {
			try {
				generateBriefing(tomorrowKey, "preview");
				aiCalls++;
			} catch (err) {
				console.error(`Preview generation failed for ${tomorrowKey}:`, err.message);
			}
		} else {
			console.log(`Preview for ${tomorrowKey} is fresh, skipping.`);
		}
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

	console.log(`Multi-day briefings done: ${aiCalls} AI call(s), ${cleaned} old file(s) cleaned.`);
}

main();
