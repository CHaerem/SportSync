#!/usr/bin/env node
/**
 * Enriches events.json with LLM-generated metadata:
 * importance scores, summaries, tags, and Norwegian relevance ratings.
 *
 * Auth (checked in order):
 *   1. CLAUDE_CODE_OAUTH_TOKEN — uses Claude CLI / Opus 4.6 (Max subscription)
 *   2. ANTHROPIC_API_KEY — direct Anthropic API (Opus 4.6)
 *   3. OPENAI_API_KEY — direct OpenAI API (gpt-4o-mini)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath, writeJsonPretty } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";
import { enforceEnrichmentQuality } from "./lib/ai-quality-gates.js";
import {
	buildSystemPrompt,
	buildUserPrompt,
} from "./lib/enrichment-prompts.js";

const BATCH_SIZE = 10;
const CONFIG_PATH = path.resolve(process.cwd(), "scripts", "config", "user-context.json");

async function completeWithClaudeCLI(systemPrompt, userPrompt) {
	const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
	const tmpFile = path.join(rootDataPath(), ".enrich-prompt.tmp");
	fs.writeFileSync(tmpFile, fullPrompt);
	try {
		const output = execSync(
			`cat "${tmpFile}" | npx -y @anthropic-ai/claude-code@latest -p --output-format text`,
			{ encoding: "utf-8", timeout: 120000, maxBuffer: 1024 * 1024 }
		);
		const text = output.trim();
		try {
			return JSON.parse(text);
		} catch {
			const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (match) return JSON.parse(match[1].trim());
			throw new Error(`Could not parse JSON from Claude CLI: ${text.substring(0, 200)}`);
		}
	} finally {
		try { fs.unlinkSync(tmpFile); } catch {}
	}
}

async function main() {
	const dataDir = rootDataPath();
	const eventsPath = path.join(dataDir, "events.json");
	const qualityPath = path.join(dataDir, "ai-quality.json");

	// 1. Read events
	const events = readJsonIfExists(eventsPath);
	if (!events || !Array.isArray(events) || events.length === 0) {
		console.log("No events to enrich (events.json missing or empty).");
		process.exit(0);
	}

	// 2. Determine LLM provider — prefer Claude CLI (Max subscription / Opus 4.6)
	const useClaudeCLI = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
	const llm = useClaudeCLI ? null : new LLMClient();
	const llmAvailable = useClaudeCLI || llm.isAvailable();
	const providerName = useClaudeCLI ? "claude-cli" : (llm.isAvailable() ? llm.getProviderName() : "none");

	if (!llmAvailable) {
		console.log(
			"No LLM available (CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, or OPENAI_API_KEY). Applying deterministic enrichment fallback."
		);
	} else {
		console.log(`Using ${useClaudeCLI ? "Claude CLI (Opus 4.6 via Max subscription)" : llm.getProviderName()} for enrichment.`);
	}

	// 3. Read user context
	const userContext = readJsonIfExists(CONFIG_PATH) || {};
	const systemPrompt = buildSystemPrompt(userContext);

	// 4. Batch and enrich
	let enrichedCount = 0;
	let failedBatches = 0;

	if (llmAvailable) {
		for (let i = 0; i < events.length; i += BATCH_SIZE) {
			const batch = events.slice(i, i + BATCH_SIZE);
			const batchNum = Math.floor(i / BATCH_SIZE) + 1;
			const totalBatches = Math.ceil(events.length / BATCH_SIZE);

			console.log(
				`Enriching batch ${batchNum}/${totalBatches} (${batch.length} events)...`
			);

			try {
				const userPrompt = buildUserPrompt(batch);
				const result = useClaudeCLI
					? await completeWithClaudeCLI(systemPrompt, userPrompt)
					: await llm.completeJSON(systemPrompt, userPrompt);

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
	}

	// 5. Enforce quality gates and deterministic fallback on missing fields
	const quality = enforceEnrichmentQuality(events);

	// 6. Write enriched events + quality report
	writeJsonPretty(eventsPath, events);
	const existingQuality = readJsonIfExists(qualityPath) || {};
	writeJsonPretty(qualityPath, {
		...existingQuality,
		generatedAt: new Date().toISOString(),
		enrichment: {
			provider: providerName,
			before: quality.before,
			after: quality.after,
			score: quality.score,
			valid: quality.valid,
			issues: quality.issues.map((issue) => issue.message),
			fallbackFieldsFilled: quality.changedCount,
			aiUpdatedFields: enrichedCount,
			failedBatches,
			totalEvents: events.length,
		},
	});

	console.log(
		`Enriched ${enrichedCount}/${events.length} events (${failedBatches} failed batches).`
	);
	console.log(
		`Quality gate: importance ${quality.after.importanceCoverage}, summary ${quality.after.summaryCoverage}, relevance ${quality.after.relevanceCoverage} (score ${quality.score}/100).`
	);
}

main().catch((err) => {
	console.error("Enrichment failed:", err.message);
	process.exit(1);
});
