#!/usr/bin/env node
/**
 * Enriches events.json with LLM-generated metadata:
 * importance scores, summaries, tags, and Norwegian relevance ratings.
 *
 * Auth (checked in order):
 *   1. CLAUDE_CODE_OAUTH_TOKEN — uses Claude CLI / Sonnet 4.6 (Max subscription)
 *   2. ANTHROPIC_API_KEY — direct Anthropic API (Sonnet 4.6)
 *   3. OPENAI_API_KEY — direct OpenAI API (gpt-4o-mini)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { readJsonIfExists, rootDataPath, writeJsonPretty, parseCliJsonOutput } from "./lib/helpers.js";
import { LLMClient } from "./lib/llm-client.js";
import { enforceEnrichmentQuality } from "./lib/ai-quality-gates.js";
import {
	buildSystemPrompt,
	buildUserPrompt,
} from "./lib/enrichment-prompts.js";

const BATCH_SIZE = 10;
const CONFIG_PATH = path.resolve(process.cwd(), "scripts", "config", "user-context.json");

/**
 * Compute a hash of the fields that affect enrichment output.
 * When these fields haven't changed, re-enriching would produce identical results.
 */
export function computeEnrichHash(event) {
	const relevant = {
		sport: event.sport,
		tournament: event.tournament,
		title: event.title,
		time: event.time,
		venue: event.venue,
		homeTeam: event.homeTeam,
		awayTeam: event.awayTeam,
		participants: (event.participants || []).map(p => typeof p === "string" ? p : p.name).sort(),
		norwegianPlayers: (event.norwegianPlayers || []).map(p => typeof p === "string" ? p : p.name).sort(),
		status: event.status,
	};
	return crypto.createHash("md5").update(JSON.stringify(relevant)).digest("hex");
}

/**
 * Builds adaptive hints for enrichment based on previous ai-quality.json metrics.
 * Mirrors the pattern used in generate-featured.js's buildAdaptiveHints.
 * @param {object|null} qualityData - Previous ai-quality.json contents
 * @returns {string[]} Array of hint strings
 */
export function buildEnrichmentHints(qualityData) {
	const hints = [];
	if (!qualityData || typeof qualityData !== "object") return hints;

	const enrichment = qualityData.enrichment;
	const editorial = qualityData.editorial;

	// Check enrichment tag coverage
	if (enrichment?.after?.tagsCoverage != null && enrichment.after.tagsCoverage < 0.8) {
		hints.push("CORRECTION: Recent enrichment had low tag coverage. Ensure EVERY event gets at least 1-2 relevant tags.");
	}

	// Check enrichment summary coverage
	if (enrichment?.after?.summaryCoverage != null && enrichment.after.summaryCoverage < 0.9) {
		hints.push("CORRECTION: Recent enrichment missed summaries for some events. Write a concise summary for EVERY event.");
	}

	// Check batch failures
	if (enrichment?.failedBatches != null && enrichment.failedBatches > 0) {
		hints.push("CORRECTION: Previous enrichment had batch failures. Return exactly the same number of events in the response array as in the input.");
	}

	// Check editorial must-watch coverage
	if (editorial?.metrics?.mustWatchCoverage != null && editorial.metrics.mustWatchCoverage < 0.6) {
		hints.push("CORRECTION: Important events were missed in editorial. Ensure importance \u22654 events get rich, descriptive summaries.");
	}

	return hints;
}

async function completeWithClaudeCLI(systemPrompt, userPrompt) {
	const dataDir = rootDataPath();
	const sysFile = path.join(dataDir, ".enrich-system.tmp");
	const userFile = path.join(dataDir, ".enrich-user.tmp");
	fs.writeFileSync(sysFile, systemPrompt);
	fs.writeFileSync(userFile, userPrompt);
	try {
		const output = execSync(
			`cat "${userFile}" | npx -y @anthropic-ai/claude-code@latest -p --model claude-sonnet-4-6 --system-prompt-file "${sysFile}" --output-format json`,
			{ encoding: "utf-8", timeout: 120000, maxBuffer: 2 * 1024 * 1024 }
		);
		const parsed = parseCliJsonOutput(output);
		const text = parsed.result;
		let content;
		try {
			content = JSON.parse(text);
		} catch {
			const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (match) content = JSON.parse(match[1].trim());
			else throw new Error(`Could not parse JSON from Claude CLI: ${text.substring(0, 200)}`);
		}
		return { content, usage: { ...parsed.usage, tracked: true, estimated: false } };
	} finally {
		try { fs.unlinkSync(sysFile); } catch {}
		try { fs.unlinkSync(userFile); } catch {}
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
		console.log(`Using ${useClaudeCLI ? "Claude CLI (Sonnet 4.6 via Max subscription)" : llm.getProviderName()} for enrichment.`);
	}

	// 3. Read user context and build system prompt
	const userContext = readJsonIfExists(CONFIG_PATH) || {};
	const existingQuality = readJsonIfExists(qualityPath) || {};
	let systemPrompt = buildSystemPrompt(userContext);

	// 3b. Inject adaptive hints from previous quality data
	const enrichmentHints = buildEnrichmentHints(existingQuality);
	if (enrichmentHints.length > 0) {
		console.log(`Enrichment adaptive hints active: ${enrichmentHints.length} correction(s)`);
		for (const hint of enrichmentHints) console.log(`  → ${hint.slice(0, 100)}`);
		systemPrompt += `\n\nADAPTIVE CORRECTIONS (based on recent quality scores):\n${enrichmentHints.map((h) => `- ${h}`).join("\n")}`;
	}

	// 4. Batch and enrich
	let enrichedCount = 0;
	let failedBatches = 0;
	let totalInput = 0;
	let totalOutput = 0;
	let totalCostUSD = 0;
	let totalCalls = 0;

	// Filter to only events needing enrichment (skip already-enriched AND unchanged)
	const needsEnrichment = events.filter(e => {
		if (!e.enrichedAt) return true;
		// Re-enrich if content has changed since last enrichment
		if (e._enrichHash && e._enrichHash === computeEnrichHash(e)) return false;
		// No hash stored yet — skip (was enriched before hashing was added)
		if (!e._enrichHash) return false;
		return true; // hash mismatch → content changed
	});
	const skippedUnchanged = events.filter(e => e.enrichedAt && (!e._enrichHash || e._enrichHash === computeEnrichHash(e))).length;
	const totalSkipped = events.length - needsEnrichment.length;
	if (totalSkipped > 0) {
		console.log(`Skipping ${totalSkipped} events (${skippedUnchanged} unchanged, ${totalSkipped - skippedUnchanged} already-enriched).`);
	}

	if (llmAvailable && needsEnrichment.length > 0) {
		for (let i = 0; i < needsEnrichment.length; i += BATCH_SIZE) {
			const batch = needsEnrichment.slice(i, i + BATCH_SIZE);
			const batchNum = Math.floor(i / BATCH_SIZE) + 1;
			const totalBatches = Math.ceil(needsEnrichment.length / BATCH_SIZE);

			console.log(
				`Enriching batch ${batchNum}/${totalBatches} (${batch.length} events)...`
			);

			try {
				const userPrompt = buildUserPrompt(batch);
				let result;
				if (useClaudeCLI) {
					const cliResult = await completeWithClaudeCLI(systemPrompt, userPrompt);
					totalInput += cliResult.usage.input;
					totalOutput += cliResult.usage.output;
					totalCostUSD += cliResult.usage.costUSD || 0;
					totalCalls++;
					result = cliResult.content;
				} else {
					result = await llm.completeJSON(systemPrompt, userPrompt);
				}

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
					const event = needsEnrichment[i + j];

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
					event._enrichHash = computeEnrichHash(event);
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
	const tokenUsage = useClaudeCLI
		? { input: totalInput, output: totalOutput, calls: totalCalls, total: totalInput + totalOutput, costUSD: totalCostUSD, tracked: true, estimated: false }
		: llm.getUsage();

	const totalTokens = tokenUsage.total || (tokenUsage.input + tokenUsage.output) || 0;
	// Read quota context from env vars (set by run-pipeline.js)
	const quotaTier = process.env.SPORTSYNC_QUOTA_TIER != null ? Number(process.env.SPORTSYNC_QUOTA_TIER) : null;
	const quotaModel = process.env.SPORTSYNC_QUOTA_MODEL || null;

	writeJsonPretty(qualityPath, {
		...existingQuality,
		generatedAt: new Date().toISOString(),
		enrichment: {
			provider: providerName,
			model: useClaudeCLI ? "claude-sonnet-4-6" : (llm?.config?.model || "unknown"),
			quotaTier,
			quotaModel,
			before: quality.before,
			after: quality.after,
			score: quality.score,
			valid: quality.valid,
			issues: quality.issues.map((issue) => issue.message),
			fallbackFieldsFilled: quality.changedCount,
			aiUpdatedFields: enrichedCount,
			failedBatches,
			totalEvents: events.length,
			skipStats: {
				total: events.length,
				unchanged: skippedUnchanged,
				enriched: needsEnrichment.length,
				skipRate: events.length > 0 ? Math.round((1 - needsEnrichment.length / events.length) * 100) / 100 : 0,
			},
			tokensPerEvent: enrichedCount > 0 ? Math.round(totalTokens / enrichedCount) : 0,
			hintsApplied: enrichmentHints,
			tokenUsage,
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
