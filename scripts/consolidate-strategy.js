#!/usr/bin/env node
/**
 * Consolidate Strategy — autoDream-inspired knowledge compaction
 *
 * Inspired by Claude Code's autoDream consolidation pattern:
 * merge observations, remove contradictions, distill patterns.
 *
 * When processNotes.entries exceeds MAX_ENTRIES, consolidates
 * entries older than RETENTION_DAYS into theme-based summaries.
 *
 * Closes the loop: pipeline-health.js monitors strategy file size.
 */

import fs from "fs";
import path from "path";

const MAX_ENTRIES = 25;
const RETENTION_DAYS = 21;
const MAX_CONSOLIDATED_THEMES = 10;

const defaultPath = path.resolve(process.cwd(), "scripts", "autopilot-strategy.json");

/**
 * Extract key themes from a processNotes entry.
 */
export function extractThemes(entry) {
	const themes = [];
	const note = (entry.note || "").toLowerCase();

	if (/parallel|subagent|multi-agent|delegation/.test(note)) themes.push("parallel-execution");
	if (/direct-to-main|branch-pr|ship mode/.test(note)) themes.push("shipping-strategy");
	if (/autonomy|loop|feedback/.test(note)) themes.push("autonomy-loops");
	if (/test|coverage|regression/.test(note)) themes.push("testing");
	if (/quality|editorial|score|metric/.test(note)) themes.push("quality-metrics");
	if (/scout|heuristic|opportunity/.test(note)) themes.push("scouting");
	if (/config|sport|new.*sport/.test(note)) themes.push("sport-expansion");
	if (/pattern|decay|hint.*fatigue/.test(note)) themes.push("pattern-analysis");
	if (/bug|fix|repair|broken/.test(note)) themes.push("debugging");
	if (/insight|learning|key/.test(note)) themes.push("key-learnings");

	return themes.length > 0 ? themes : ["general"];
}

/**
 * Consolidate old processNotes entries into theme summaries.
 */
export function consolidateEntries(entries, now = new Date()) {
	if (!Array.isArray(entries) || entries.length <= MAX_ENTRIES) {
		return { entries, consolidated: null, consolidatedCount: 0 };
	}

	const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

	const recent = [];
	const old = [];

	for (const entry of entries) {
		const entryDate = entry.date ? new Date(entry.date) : null;
		if (entryDate && entryDate < cutoff) {
			old.push(entry);
		} else {
			recent.push(entry);
		}
	}

	if (old.length === 0) {
		return { entries, consolidated: null, consolidatedCount: 0 };
	}

	// Group old entries by theme
	const themeGroups = {};
	for (const entry of old) {
		const themes = extractThemes(entry);
		for (const theme of themes) {
			if (!themeGroups[theme]) themeGroups[theme] = [];
			themeGroups[theme].push(entry);
		}
	}

	// Build consolidated summaries per theme
	const consolidated = [];
	const sortedThemes = Object.entries(themeGroups)
		.sort((a, b) => b[1].length - a[1].length)
		.slice(0, MAX_CONSOLIDATED_THEMES);

	for (const [theme, themeEntries] of sortedThemes) {
		const runs = themeEntries.map(e => {
			const runMatch = (e.note || "").match(/Run\s+(\d+)/i);
			return runMatch ? `Run ${runMatch[1]}` : e.date;
		}).filter(Boolean);

		// Extract "Key insight:" or "Key learning:" phrases
		const insights = themeEntries
			.map(e => {
				const match = (e.note || "").match(/Key\s+(?:insight|learning):\s*([^.]+\.)/i);
				return match ? match[1].trim() : null;
			})
			.filter(Boolean);

		const dateRange = themeEntries.length > 1
			? `${themeEntries[0].date} to ${themeEntries[themeEntries.length - 1].date}`
			: themeEntries[0].date;

		let summary = `${theme} (${themeEntries.length} entries, ${dateRange})`;
		if (insights.length > 0) {
			summary += ": " + insights.slice(0, 2).join(" ");
		}

		// Cap at 200 chars
		if (summary.length > 200) {
			summary = summary.slice(0, 197) + "...";
		}

		consolidated.push({
			theme,
			entryCount: themeEntries.length,
			dateRange,
			summary,
			runs: runs.slice(0, 5),
		});
	}

	return {
		entries: recent,
		consolidated,
		consolidatedCount: old.length,
	};
}

// --- Main ---
async function main() {
	const strategyPath = process.env.SPORTSYNC_STRATEGY_PATH || defaultPath;

	if (!fs.existsSync(strategyPath)) {
		console.log("No strategy file found at", strategyPath);
		process.exit(0);
	}

	const strategy = JSON.parse(fs.readFileSync(strategyPath, "utf-8"));
	const entries = strategy.processNotes?.entries;

	if (!entries) {
		console.log("No processNotes.entries found.");
		return;
	}

	const { entries: remaining, consolidated, consolidatedCount } = consolidateEntries(entries);

	if (consolidatedCount === 0) {
		console.log(`processNotes has ${entries.length} entries (threshold: ${MAX_ENTRIES}). No consolidation needed.`);
		return;
	}

	// Update strategy
	strategy.processNotes.entries = remaining;
	if (consolidated) {
		strategy.processNotes.consolidated = [
			...(strategy.processNotes.consolidated || []),
			...consolidated,
		];
		// Cap consolidated themes
		if (strategy.processNotes.consolidated.length > MAX_CONSOLIDATED_THEMES * 2) {
			strategy.processNotes.consolidated = strategy.processNotes.consolidated.slice(-MAX_CONSOLIDATED_THEMES * 2);
		}
	}
	strategy.processNotes._lastConsolidated = new Date().toISOString();

	fs.writeFileSync(strategyPath, JSON.stringify(strategy, null, 2) + "\n", "utf-8");

	console.log(`Consolidated ${consolidatedCount} old entries into ${consolidated.length} theme summaries.`);
	console.log(`Remaining entries: ${remaining.length}`);
}

main().catch(console.error);
