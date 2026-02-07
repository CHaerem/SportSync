#!/usr/bin/env node
/**
 * Enriches events.json with LLM-generated metadata:
 * importance scores, summaries, tags, and Norwegian relevance ratings.
 *
 * Usage: OPENAI_API_KEY=... node scripts/enrich-events.js
 *   or:  ANTHROPIC_API_KEY=... node scripts/enrich-events.js
 */

import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";
import {
	buildSystemPrompt,
	buildUserPrompt,
} from "./lib/enrichment-prompts.js";

const BATCH_SIZE = 10;
const CONFIG_PATH = path.resolve(process.cwd(), "scripts", "config", "user-context.json");

async function main() {
	const dataDir = rootDataPath();
	const eventsPath = path.join(dataDir, "events.json");

	// 1. Read events
	const events = readJsonIfExists(eventsPath);
	if (!events || !Array.isArray(events) || events.length === 0) {
		console.log("No events to enrich (events.json missing or empty).");
		process.exit(0);
	}

	// 2. Check LLM availability
	const llm = new LLMClient();
	if (!llm.isAvailable()) {
		console.log(
			"No LLM API key found (OPENAI_API_KEY or ANTHROPIC_API_KEY). Skipping enrichment."
		);
		process.exit(0);
	}
	console.log(`Using ${llm.getProviderName()} for enrichment.`);

	// 3. Read user context
	const userContext = readJsonIfExists(CONFIG_PATH) || {};
	const systemPrompt = buildSystemPrompt(userContext);

	// 4. Batch and enrich
	let enrichedCount = 0;
	let failedBatches = 0;

	for (let i = 0; i < events.length; i += BATCH_SIZE) {
		const batch = events.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(events.length / BATCH_SIZE);

		console.log(
			`Enriching batch ${batchNum}/${totalBatches} (${batch.length} events)...`
		);

		try {
			const userPrompt = buildUserPrompt(batch);
			const result = await llm.completeJSON(systemPrompt, userPrompt);

			const enrichments = result.events;
			if (!Array.isArray(enrichments) || enrichments.length !== batch.length) {
				console.warn(
					`Batch ${batchNum}: Expected ${batch.length} enrichments, got ${enrichments?.length ?? 0}. Skipping batch.`
				);
				failedBatches++;
				continue;
			}

			for (let j = 0; j < batch.length; j++) {
				const e = enrichments[j];
				const event = events[i + j];

				// Validate and merge
				if (typeof e.importance === "number" && e.importance >= 1 && e.importance <= 5) {
					event.importance = Math.round(e.importance);
				}
				if (typeof e.importanceReason === "string") {
					event.importanceReason = e.importanceReason.substring(0, 200);
				}
				if (typeof e.summary === "string") {
					event.summary = e.summary.substring(0, 300);
				}
				if (Array.isArray(e.tags)) {
					event.tags = e.tags
						.filter((t) => typeof t === "string")
						.map((t) => t.toLowerCase().trim())
						.slice(0, 10);
				}
				if (typeof e.norwegianRelevance === "number" && e.norwegianRelevance >= 1 && e.norwegianRelevance <= 5) {
					event.norwegianRelevance = Math.round(e.norwegianRelevance);
				}

				event.enrichedAt = new Date().toISOString();
				enrichedCount++;
			}
		} catch (err) {
			console.error(`Batch ${batchNum} failed:`, err.message);
			failedBatches++;
		}
	}

	// 5. Write enriched events
	writeJsonPretty(eventsPath, events);
	console.log(
		`Enriched ${enrichedCount}/${events.length} events (${failedBatches} failed batches).`
	);
}

main().catch((err) => {
	console.error("Enrichment failed:", err.message);
	process.exit(1);
});
