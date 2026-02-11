#!/usr/bin/env node
/**
 * Coverage Gap Detection
 *
 * Cross-references RSS headlines against events.json to find major events
 * the pipeline is missing. Produces docs/data/coverage-gaps.json.
 * Deterministic pattern matching — no LLM needed.
 */

import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";

const dataDir = rootDataPath();

export const MAJOR_EVENT_PATTERNS = [
	{ pattern: /champions league/i, sport: "football", type: "tournament" },
	{ pattern: /europa league/i, sport: "football", type: "tournament" },
	{ pattern: /conference league/i, sport: "football", type: "tournament" },
	{ pattern: /world cup/i, sport: "football", type: "tournament" },
	{ pattern: /euro\s?\d{4}|european championship/i, sport: "football", type: "tournament" },
	{ pattern: /copa del rey/i, sport: "football", type: "tournament" },
	{ pattern: /fa cup/i, sport: "football", type: "tournament" },
	{ pattern: /grand slam|australian open|french open|roland garros|wimbledon|us open/i, sport: "tennis", type: "tournament" },
	{ pattern: /masters(?!\s*league)|the open championship|pga championship|us open golf/i, sport: "golf", type: "tournament" },
	{ pattern: /ryder cup/i, sport: "golf", type: "tournament" },
	{ pattern: /monaco|silverstone|monza|spa|bahrain|saudi|melbourne|imola/i, sport: "f1", type: "race" },
	{ pattern: /formula\s*1|f1\s+grand\s+prix/i, sport: "f1", type: "race" },
	{ pattern: /candidates|world chess|chess olympiad|norway chess/i, sport: "chess", type: "tournament" },
	{ pattern: /major\b|iem\s|esl\s*pro|blast\s*premier/i, sport: "esports", type: "tournament" },
	{ pattern: /olympics|olympic games/i, sport: "olympics", type: "tournament" },
];

function buildCoverageFingerprint(events) {
	const fingerprint = new Set();
	for (const ev of events) {
		const fields = [ev.title, ev.tournament, ev.context, ev.meta].filter(Boolean);
		for (const field of fields) {
			fingerprint.add(field.toLowerCase());
		}
	}
	return fingerprint;
}

function isEventCovered(pattern, fingerprint) {
	for (const entry of fingerprint) {
		if (pattern.pattern.test(entry)) return true;
	}
	return false;
}

export function detectCoverageGaps(rssItems, events) {
	const fingerprint = buildCoverageFingerprint(events);
	const gapMap = new Map(); // pattern source → gap info

	for (const item of rssItems) {
		const title = item.title || "";

		for (const ep of MAJOR_EVENT_PATTERNS) {
			if (!ep.pattern.test(title)) continue;

			// Check if this event type is already covered in our pipeline
			if (isEventCovered(ep, fingerprint)) continue;

			const key = ep.pattern.source;
			if (!gapMap.has(key)) {
				// Generate a slug-style ID
				const slug = title.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(0, 40);

				gapMap.set(key, {
					id: slug,
					sport: ep.sport,
					type: ep.type,
					matchedPattern: ep.pattern.source.replace(/\\/g, "").replace(/\|/g, " | "),
					headlines: [],
					classification: "actionable",
					suggestedConfigName: `${ep.sport}-${ep.type}-${new Date().getFullYear()}.json`,
				});
			}

			const gap = gapMap.get(key);
			if (!gap.headlines.includes(title)) {
				gap.headlines.push(title);
			}
		}
	}

	// Assign confidence and finalize
	const gaps = [];
	for (const gap of gapMap.values()) {
		const headlineCount = gap.headlines.length;
		gap.confidence = headlineCount >= 3 ? "high" : headlineCount >= 2 ? "medium" : "low";

		// Informational if low confidence and generic pattern
		if (gap.confidence === "low" && gap.type !== "tournament") {
			gap.classification = "informational";
		}

		gaps.push(gap);
	}

	const actionableGaps = gaps.filter((g) => g.classification === "actionable").length;
	const informationalGaps = gaps.filter((g) => g.classification === "informational").length;

	return {
		generatedAt: new Date().toISOString(),
		gaps,
		summary: {
			totalGapsDetected: gaps.length,
			actionableGaps,
			informationalGaps,
		},
	};
}

async function main() {
	const rssDigest = readJsonIfExists(path.join(dataDir, "rss-digest.json"));
	const events = readJsonIfExists(path.join(dataDir, "events.json")) || [];

	const rssItems = Array.isArray(rssDigest?.items) ? rssDigest.items : [];

	const result = detectCoverageGaps(rssItems, events);

	const outPath = path.join(dataDir, "coverage-gaps.json");
	writeJsonPretty(outPath, result);

	console.log(`Coverage gaps: ${result.summary.totalGapsDetected} detected (${result.summary.actionableGaps} actionable, ${result.summary.informationalGaps} informational)`);
	for (const gap of result.gaps) {
		console.log(`  [${gap.confidence}] ${gap.sport}/${gap.type}: ${gap.matchedPattern} (${gap.headlines.length} headline(s))`);
	}
}

if (process.argv[1]?.includes("detect-coverage-gaps")) {
	main().catch((err) => {
		console.error("Coverage gap detection failed:", err);
		process.exit(1);
	});
}
