/**
 * Fact Checker — LLM-powered cross-referencing for sports data accuracy.
 *
 * Provides a general-purpose factCheck() function that takes structured data
 * (config events or featured blocks) plus reference data (events, standings,
 * RSS, recent results) and uses the LLM to find factual problems.
 *
 * Feedback loop #10: fact-check-history.json → buildFactCheckHints() →
 * discovery and featured prompts.
 */

import { readJsonIfExists, writeJsonPretty } from "./helpers.js";

const FACT_CHECK_SYSTEM_PROMPT = `You are a fact-checker for sports data. You receive items to verify and reference data to cross-check against. Find factual problems.

CATEGORIES:
1. cross-data-inconsistency — A fact contradicts the reference data provided
2. entity-error — A name, venue, team, or athlete doesn't match known entities
3. temporal-anomaly — A date/time doesn't make sense in context
4. hallucination — A claim that can't be corroborated by any reference data
5. coherence — Items grouped incorrectly (wrong sport in a section, etc.)
6. internal-contradiction — The data contradicts itself

RULES:
- Only flag issues you are CONFIDENT about based on the reference data
- Do not flag stylistic, subjective, or uncertain issues
- For each finding, specify which item has the problem and what's wrong
- If you can suggest a correction, include it

Return a JSON array of findings, or [] if no issues found.
Each finding: { "severity": "error" or "warning", "category": "one of the 6 above", "item": "identifier of the problematic item", "message": "what's wrong", "correction": "suggested fix or null" }`;

const MAX_ITEMS = 30;
const MAX_HISTORY = 50;

const VALID_CATEGORIES = new Set([
	"cross-data-inconsistency",
	"entity-error",
	"temporal-anomaly",
	"hallucination",
	"coherence",
	"internal-contradiction",
]);

/**
 * Build compact reference context from available data sources.
 */
function buildReferenceContext({ events, standings, rssDigest, recentResults }) {
	const parts = [];

	if (Array.isArray(events) && events.length > 0) {
		const compact = events.slice(0, 30).map((e) => ({
			sport: e.sport,
			title: e.title,
			time: e.time,
			venue: e.venue,
			homeTeam: e.homeTeam,
			awayTeam: e.awayTeam,
			tournament: e.tournament,
			context: e.context,
		}));
		parts.push(`Events (${compact.length} shown):\n${JSON.stringify(compact)}`);
	}

	if (standings) {
		const standingSummary = {};
		const pl = standings.football?.premierLeague;
		if (Array.isArray(pl) && pl.length > 0) {
			standingSummary.premierLeague = pl.slice(0, 5).map((t) => `${t.position}. ${t.team}`);
		}
		for (const key of ["pga", "dpWorld"]) {
			const tour = standings.golf?.[key];
			if (tour?.leaderboard?.length > 0) {
				standingSummary[key] = tour.leaderboard.slice(0, 5).map((p) => `${p.position}. ${p.player}`);
			}
		}
		const f1 = standings.f1?.drivers;
		if (Array.isArray(f1) && f1.length > 0) {
			standingSummary.f1 = f1.slice(0, 5).map((d) => `${d.position}. ${d.driver}`);
		}
		if (Object.keys(standingSummary).length > 0) {
			parts.push(`Standings:\n${JSON.stringify(standingSummary)}`);
		}
	}

	if (rssDigest?.items?.length > 0) {
		const headlines = rssDigest.items.slice(0, 10).map((i) => `[${i.sport || i.source}] ${i.title}`);
		parts.push(`Recent headlines:\n${headlines.join("\n")}`);
	}

	if (recentResults) {
		const football = Array.isArray(recentResults.football) ? recentResults.football.slice(0, 8) : [];
		if (football.length > 0) {
			const lines = football.map((m) => `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`);
			parts.push(`Recent football results:\n${lines.join("\n")}`);
		}
	}

	return parts.join("\n\n");
}

/**
 * Build the user prompt for the LLM fact-check call.
 */
function buildFactCheckPrompt(items, itemType, referenceContext) {
	const itemLabel = itemType === "config-events" ? "Config events" : "Featured blocks";
	const capped = items.slice(0, MAX_ITEMS);

	return `REFERENCE DATA:\n${referenceContext}\n\n${itemLabel} TO VERIFY (${capped.length} items):\n${JSON.stringify(capped, null, 2)}\n\nCross-reference the items against the reference data. Return a JSON array of findings, or [] if no issues.`;
}

/**
 * Validate and normalize findings from LLM response.
 */
function normalizeFindings(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((f) => f && typeof f === "object")
		.map((f) => ({
			severity: f.severity === "error" || f.severity === "warning" ? f.severity : "warning",
			category: VALID_CATEGORIES.has(f.category) ? f.category : "cross-data-inconsistency",
			item: String(f.item || "unknown"),
			message: String(f.message || ""),
			correction: f.correction || null,
		}))
		.filter((f) => f.message.length > 0);
}

/**
 * Run a fact-check on items using LLM cross-referencing.
 *
 * @param {object} options
 * @param {Array} options.items - Events from a config or blocks from featured.json
 * @param {string} options.itemType - "config-events" | "featured-blocks"
 * @param {object} options.context - { events, standings, rssDigest, recentResults }
 * @param {object} [options.llm] - Optional LLMClient instance (reuse for token tracking)
 * @returns {object} { findings, itemsChecked, issuesFound, provider, tokenUsage }
 */
export async function factCheck({ items, itemType, context, llm }) {
	const noResult = { findings: [], itemsChecked: 0, issuesFound: 0, provider: "none", tokenUsage: null };

	if (!items || items.length === 0) return noResult;
	if (!llm || !llm.isAvailable()) return noResult;

	const referenceContext = buildReferenceContext(context || {});
	const prompt = buildFactCheckPrompt(items, itemType, referenceContext);
	const capped = items.slice(0, MAX_ITEMS);

	try {
		const raw = await llm.completeJSON(FACT_CHECK_SYSTEM_PROMPT, prompt);
		const findings = normalizeFindings(raw);

		return {
			findings,
			itemsChecked: capped.length,
			issuesFound: findings.length,
			provider: llm.getProviderName(),
			tokenUsage: llm.getUsage(),
		};
	} catch (err) {
		console.warn("Fact-check LLM call failed (non-blocking):", err.message);
		return { ...noResult, itemsChecked: capped.length };
	}
}

/**
 * Append a fact-check summary to history and cap at MAX_HISTORY entries.
 */
export function appendFactCheckHistory(historyPath, result) {
	const history = readJsonIfExists(historyPath) || [];
	const summary = {
		timestamp: new Date().toISOString(),
		itemType: result.itemType || "unknown",
		itemsChecked: result.itemsChecked || 0,
		issuesFound: result.issuesFound || 0,
		categories: {},
		provider: result.provider || "none",
	};

	if (Array.isArray(result.findings)) {
		for (const f of result.findings) {
			summary.categories[f.category] = (summary.categories[f.category] || 0) + 1;
		}
	}

	history.push(summary);
	while (history.length > MAX_HISTORY) history.shift();
	writeJsonPretty(historyPath, history);
	return history;
}

/**
 * Analyze fact-check history and generate adaptive hints.
 * Same pattern as buildVerificationHints / buildAdaptiveHints.
 */
export function buildFactCheckHints(history) {
	const empty = { hints: [], metrics: {} };
	if (!Array.isArray(history) || history.length === 0) return empty;

	const recent = history.slice(-5);
	let totalItems = 0;
	let totalIssues = 0;
	const categoryCounts = {};

	for (const entry of recent) {
		totalItems += entry.itemsChecked || 0;
		totalIssues += entry.issuesFound || 0;
		if (entry.categories) {
			for (const [cat, count] of Object.entries(entry.categories)) {
				categoryCounts[cat] = (categoryCounts[cat] || 0) + count;
			}
		}
	}

	const rate = (cat) => (totalItems > 0 ? (categoryCounts[cat] || 0) / totalItems : 0);

	const entityErrorRate = rate("entity-error");
	const coherenceErrorRate = rate("coherence");
	const temporalErrorRate = rate("temporal-anomaly");
	const hallucinationRate = rate("hallucination");

	const metrics = { entityErrorRate, coherenceErrorRate, temporalErrorRate, hallucinationRate, totalItems, totalIssues };

	const hints = [];
	if (entityErrorRate > 0.1) {
		hints.push("FACTUAL: Recent outputs contained wrong names/venues. Cross-reference ALL names against the provided data.");
	}
	if (coherenceErrorRate > 0.05) {
		hints.push("FACTUAL: Recent outputs mixed events from different sports/competitions. Keep each section coherent.");
	}
	if (temporalErrorRate > 0.1) {
		hints.push("FACTUAL: Recent outputs had wrong dates/times. Use exact times from the events data.");
	}
	if (hallucinationRate > 0.05) {
		hints.push("FACTUAL: Recent outputs referenced data not provided. ONLY use information from the data you receive.");
	}

	return { hints, metrics };
}
