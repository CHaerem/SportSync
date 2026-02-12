/**
 * Schedule Verification Engine
 *
 * Modular verification with pluggable verifiers, per-event confidence scoring,
 * accuracy history, and feedback loop into the discovery prompt.
 *
 * Verifier chain (fast → expensive):
 * 1. Static — date parsing, range checks, duplicates
 * 2. ESPN API — cross-reference against ESPN scoreboard
 * 3. RSS cross-ref — scan rss-digest.json headlines
 * 4. Sport data cross-ref — match against {sport}.json API-fetched events
 * 5. Web re-check — Claude CLI + WebSearch (max 1/run, expensive)
 */

import { MS_PER_DAY, MS_PER_HOUR } from "./helpers.js";

// ESPN scoreboard endpoints for cross-referencing
export const ESPN_SCOREBOARD_URLS = {
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

// --- Verifier 1: Static ---

/**
 * Static verification — date parsing, range checks, duplicates (no I/O).
 */
export function verifyStatic(event, context) {
	const result = { verified: false, confidence: 0, source: "static", details: null, correction: null };

	if (!event.time) {
		result.details = "Missing time field";
		return result;
	}

	const eventDate = new Date(event.time);
	if (isNaN(eventDate.getTime())) {
		result.details = `Invalid time: ${event.time}`;
		return result;
	}

	const issues = [];

	// Range check: event within config date range
	if (context.startDate && context.endDate) {
		const start = new Date(context.startDate);
		const end = new Date(context.endDate + "T23:59:59Z");
		if (eventDate < start || eventDate > end) {
			issues.push(`Outside config range ${context.startDate} to ${context.endDate}`);
		}
	}

	// Check for far-future events (> 365 days out)
	const now = context.now || new Date();
	if (eventDate.getTime() - now.getTime() > 365 * MS_PER_DAY) {
		issues.push("Event is more than 1 year in the future");
	}

	// Check for past events (> 7 days ago)
	if (now.getTime() - eventDate.getTime() > 7 * MS_PER_DAY) {
		issues.push("Event is more than 7 days in the past");
	}

	// Duplicate check within siblings
	if (Array.isArray(context.siblings)) {
		const dupes = context.siblings.filter(
			(e) => e !== event && e.time === event.time && e.venue === event.venue
		);
		if (dupes.length > 0) {
			issues.push(`Shares time and venue with ${dupes.length} other event(s)`);
		}
	}

	if (issues.length === 0) {
		result.verified = true;
		result.confidence = 0.4;
		result.details = "Passes all static checks";
	} else {
		result.confidence = 0.1;
		result.details = issues.join("; ");
	}

	return result;
}

// --- Verifier 2: ESPN API ---

/**
 * Cross-reference event against ESPN API data.
 * Expects context.espnEvents to be pre-fetched per sport.
 */
export function verifyWithESPN(event, context) {
	const result = { verified: false, confidence: 0, source: "espn-api", details: null, correction: null };

	const sportKey = detectSportFromTitle(event.title) || context.sportKey;
	if (!sportKey || !ESPN_SCOREBOARD_URLS[sportKey]) {
		result.details = "No ESPN endpoint for this sport";
		return result;
	}

	const apiEvents = context.espnEvents?.[sportKey];
	if (!Array.isArray(apiEvents) || apiEvents.length === 0) {
		result.details = "No ESPN data available for this sport";
		return result;
	}

	const configDate = new Date(event.time);
	if (isNaN(configDate.getTime())) {
		result.details = "Invalid event time";
		return result;
	}

	let bestMatch = null;
	let bestScore = 0;

	for (const apiEvent of apiEvents) {
		const apiDate = new Date(apiEvent.date || apiEvent.time);
		if (isNaN(apiDate.getTime())) continue;

		const tScore = titleSimilarity(event.title, apiEvent.name || apiEvent.title || "");
		const timeDiffHours = Math.abs(configDate - apiDate) / MS_PER_HOUR;
		const dateScore = timeDiffHours < 1 ? 1.0 : timeDiffHours < 24 ? 0.5 : timeDiffHours < 72 ? 0.2 : 0;

		const score = tScore * 0.6 + dateScore * 0.4;
		if (score > bestScore && score > 0.3) {
			bestScore = score;
			bestMatch = { apiEvent, titleScore: tScore, timeDiffHours, score, apiDate };
		}
	}

	if (!bestMatch) {
		result.details = "No matching ESPN event found";
		return result;
	}

	if (bestMatch.timeDiffHours <= 1) {
		result.verified = true;
		result.confidence = 0.9;
		result.details = `Matches ESPN event (time diff: ${Math.round(bestMatch.timeDiffHours * 60)}min)`;
	} else if (bestMatch.timeDiffHours <= 48 && bestScore > 0.7) {
		result.verified = false;
		result.confidence = 0.7;
		result.details = `Time mismatch: ${Math.round(bestMatch.timeDiffHours)}h diff (confidence: ${bestScore.toFixed(2)})`;
		result.correction = {
			field: "time",
			oldValue: event.time,
			newValue: bestMatch.apiDate.toISOString(),
			confidence: bestScore,
		};
	} else {
		result.confidence = 0.3;
		result.details = `Weak match: ${Math.round(bestMatch.timeDiffHours)}h diff, score=${bestScore.toFixed(2)}`;
	}

	return result;
}

// --- Verifier 3: RSS cross-ref ---

/**
 * Scan RSS digest headlines for corroborating mentions.
 */
export function verifyWithRSS(event, context) {
	const result = { verified: false, confidence: 0, source: "rss-cross-ref", details: null, correction: null };

	const rssDigest = context.rssDigest;
	if (!rssDigest || !Array.isArray(rssDigest.items)) {
		result.details = "No RSS digest available";
		return result;
	}

	const eventTitle = (event.title || "").toLowerCase();
	const eventWords = eventTitle.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);

	if (eventWords.length === 0) {
		result.details = "Event title too short for RSS matching";
		return result;
	}

	let bestOverlap = 0;
	let bestHeadline = null;

	for (const item of rssDigest.items) {
		const headline = (item.title || item.headline || "").toLowerCase();
		if (!headline) continue;

		let overlap = 0;
		for (const word of eventWords) {
			if (headline.includes(word)) overlap++;
		}

		const ratio = overlap / eventWords.length;
		if (ratio > bestOverlap) {
			bestOverlap = ratio;
			bestHeadline = item.title || item.headline;
		}
	}

	if (bestOverlap >= 0.5) {
		result.verified = true;
		result.confidence = 0.5;
		result.details = `Corroborated by RSS headline: "${bestHeadline}"`;
	} else if (bestOverlap > 0) {
		result.confidence = 0.2;
		result.details = `Partial RSS mention (${Math.round(bestOverlap * 100)}% word overlap)`;
	} else {
		result.details = "No RSS mentions found";
	}

	return result;
}

// --- Verifier 4: Sport data cross-ref ---

/**
 * Match against {sport}.json API-fetched events (local files).
 */
export function verifyWithSportData(event, context) {
	const result = { verified: false, confidence: 0, source: "sport-data", details: null, correction: null };

	const sportKey = context.sportKey || event.sport;
	const sportData = context.sportDataMap?.[sportKey];

	if (!sportData || !Array.isArray(sportData.tournaments)) {
		result.details = "No sport data file available";
		return result;
	}

	const configDate = new Date(event.time);
	if (isNaN(configDate.getTime())) {
		result.details = "Invalid event time";
		return result;
	}

	let bestMatch = null;
	let bestScore = 0;

	for (const tournament of sportData.tournaments) {
		if (!Array.isArray(tournament.events)) continue;
		for (const sportEvent of tournament.events) {
			const sportDate = new Date(sportEvent.time || sportEvent.date);
			if (isNaN(sportDate.getTime())) continue;

			const tScore = titleSimilarity(event.title, sportEvent.title || sportEvent.name || "");
			const timeDiffHours = Math.abs(configDate - sportDate) / MS_PER_HOUR;
			const dateScore = timeDiffHours < 1 ? 1.0 : timeDiffHours < 24 ? 0.5 : timeDiffHours < 72 ? 0.2 : 0;

			const score = tScore * 0.6 + dateScore * 0.4;
			if (score > bestScore && score > 0.3) {
				bestScore = score;
				bestMatch = { sportEvent, timeDiffHours, score, sportDate };
			}
		}
	}

	if (!bestMatch) {
		result.details = "No matching event in sport data";
		return result;
	}

	if (bestMatch.timeDiffHours <= 1) {
		result.verified = true;
		result.confidence = 0.8;
		result.details = `Matches sport data event (time diff: ${Math.round(bestMatch.timeDiffHours * 60)}min)`;
	} else if (bestMatch.timeDiffHours <= 48 && bestScore > 0.6) {
		result.confidence = 0.5;
		result.details = `Sport data time mismatch: ${Math.round(bestMatch.timeDiffHours)}h diff`;
		result.correction = {
			field: "time",
			oldValue: event.time,
			newValue: bestMatch.sportDate.toISOString(),
			confidence: bestScore,
		};
	} else {
		result.confidence = 0.2;
		result.details = `Weak sport data match: ${Math.round(bestMatch.timeDiffHours)}h diff`;
	}

	return result;
}

// --- Verifier 5: Web re-check (stub) ---

/**
 * Claude CLI + WebSearch re-check for unverified events.
 * Only used for max 1 event per run. Requires context.webSearchFn.
 */
export async function verifyWithWebSearch(event, context) {
	const result = { verified: false, confidence: 0, source: "web-search", details: null, correction: null };

	if (!context.webSearchFn) {
		result.details = "No web search function available";
		return result;
	}

	if (context.webSearchUsed) {
		result.details = "Web search already used this run (max 1/run)";
		return result;
	}

	try {
		const searchResult = await context.webSearchFn(event);
		context.webSearchUsed = true;

		if (searchResult && searchResult.verified) {
			result.verified = true;
			result.confidence = searchResult.confidence || 0.8;
			result.details = searchResult.details || "Verified via web search";
			if (searchResult.correction) {
				result.correction = searchResult.correction;
			}
		} else if (searchResult) {
			result.confidence = searchResult.confidence || 0.3;
			result.details = searchResult.details || "Web search returned inconclusive results";
		} else {
			result.details = "Web search returned no results";
		}
	} catch (err) {
		result.details = `Web search failed: ${err.message}`;
	}

	return result;
}

// --- Confidence Aggregation ---

/**
 * Aggregate verification results into a single confidence assessment.
 * Takes best confidence + 0.1 corroboration bonus if 2+ sources agree.
 */
export function aggregateConfidence(results) {
	if (!Array.isArray(results) || results.length === 0) {
		return { confidence: 0, status: "unverified", sources: [] };
	}

	const validResults = results.filter((r) => r && typeof r.confidence === "number");
	if (validResults.length === 0) {
		return { confidence: 0, status: "unverified", sources: [] };
	}

	// Best confidence
	const bestResult = validResults.reduce((best, r) => (r.confidence > best.confidence ? r : best));
	let confidence = bestResult.confidence;

	// Corroboration bonus: if 2+ sources agree on verified
	const verifiedSources = validResults.filter((r) => r.verified);
	if (verifiedSources.length >= 2) {
		confidence = Math.min(confidence + 0.1, 1.0);
	}

	// Collect contributing sources
	const sources = validResults
		.filter((r) => r.confidence > 0)
		.map((r) => r.source);

	// Determine status
	let status;
	if (confidence >= 0.7) {
		status = "verified";
	} else if (confidence >= 0.3) {
		status = "plausible";
	} else {
		status = "unverified";
	}

	return { confidence: Math.round(confidence * 100) / 100, status, sources };
}

// --- Config-level Verification ---

/**
 * Verify all events in a config through the verifier chain.
 * @param {object} config - The config with events array
 * @param {object} context - Shared context (rssDigest, espnEvents, sportDataMap, etc.)
 * @param {object} options - { skipWebSearch, dryRun }
 * @returns {object} ConfigVerificationResult
 */
export async function verifyConfig(config, context, options = {}) {
	const events = Array.isArray(config.events) ? config.events : [];
	const eventResults = [];
	const corrections = [];

	for (const event of events) {
		const eventContext = {
			...context,
			startDate: config.startDate,
			endDate: config.endDate,
			siblings: events,
			sportKey: config.sport || detectSportFromTitle(event.title),
		};

		// Run verifier chain
		const results = [];

		// 1. Static (always run)
		results.push(verifyStatic(event, eventContext));

		// 2. ESPN API (if data available)
		results.push(verifyWithESPN(event, eventContext));

		// 3. RSS cross-ref (if data available)
		results.push(verifyWithRSS(event, eventContext));

		// 4. Sport data cross-ref (if data available)
		results.push(verifyWithSportData(event, eventContext));

		// 5. Web search (only for unverified, max 1/run)
		if (!options.skipWebSearch) {
			const staticAndApi = aggregateConfidence(results);
			if (staticAndApi.status === "unverified") {
				const webResult = await verifyWithWebSearch(event, eventContext);
				results.push(webResult);
			}
		}

		// Aggregate
		const aggregate = aggregateConfidence(results);

		// Collect best correction
		const bestCorrection = results
			.filter((r) => r.correction && r.confidence >= 0.7)
			.sort((a, b) => b.confidence - a.confidence)[0];

		if (bestCorrection && bestCorrection.correction.confidence > 0.7) {
			corrections.push({
				event: event.title,
				...bestCorrection.correction,
			});
		}

		eventResults.push({
			title: event.title,
			time: event.time,
			verification: {
				confidence: aggregate.confidence,
				status: aggregate.status,
				sources: aggregate.sources,
				lastVerified: new Date().toISOString(),
			},
			verifierResults: results,
		});
	}

	// Summary
	const verified = eventResults.filter((r) => r.verification.status === "verified").length;
	const plausible = eventResults.filter((r) => r.verification.status === "plausible").length;
	const unverified = eventResults.filter((r) => r.verification.status === "unverified").length;
	const overallConfidence = eventResults.length > 0
		? Math.round(eventResults.reduce((sum, r) => sum + r.verification.confidence, 0) / eventResults.length * 100) / 100
		: 0;

	return {
		file: config.file,
		eventsChecked: events.length,
		verified,
		plausible,
		unverified,
		overallConfidence,
		eventResults,
		corrections,
		verificationSummary: {
			lastRun: new Date().toISOString(),
			eventsChecked: events.length,
			verified,
			plausible,
			unverified,
			overallConfidence,
		},
	};
}

// --- Feedback Loop: Verification Hints ---

const VERIFICATION_HINT_RULES = [
	{
		condition: (metrics) => metrics.overallAccuracy < 0.6,
		hint: "CORRECTION: Recent discoveries had low accuracy. Double-check dates/times against official sources.",
	},
	{
		condition: (metrics) => metrics.sportAccuracy !== null && metrics.sportAccuracy < 0.5,
		hint: null, // Dynamic hint per sport — generated in buildVerificationHints
	},
	{
		condition: (metrics) => metrics.correctionsApplied > 0,
		hint: "CORRECTION: Previous times were wrong. Always include timezone offsets and verify against official schedules.",
	},
	{
		condition: (metrics) => metrics.unverifiedRatio > 0.3,
		hint: "CORRECTION: Many events couldn't be verified. Use official schedules, not secondary sources.",
	},
];

/**
 * Build verification hints from history — same pattern as buildAdaptiveHints().
 * Reads last 5 runs, checks per-sport accuracy, correction rates, unverified ratios.
 * @param {object} history - { runs: [...] } from verification-history.json
 * @returns {{ hints: string[], metrics: object }}
 */
export function buildVerificationHints(history) {
	const empty = { hints: [], metrics: {} };

	if (!history || !Array.isArray(history.runs) || history.runs.length === 0) {
		return empty;
	}

	const recent = history.runs.slice(-5);
	const lastThree = recent.slice(-3);

	// Compute overall accuracy across last 3 runs
	let totalChecked = 0;
	let totalVerified = 0;
	let totalCorrections = 0;
	let totalUnverified = 0;

	for (const run of lastThree) {
		if (!run.results) continue;
		for (const configResult of run.results) {
			totalChecked += configResult.eventsChecked || 0;
			totalVerified += configResult.verified || 0;
			totalCorrections += (configResult.corrections || []).length;
			totalUnverified += configResult.unverified || 0;
		}
	}

	const overallAccuracy = totalChecked > 0 ? totalVerified / totalChecked : 1;
	const unverifiedRatio = totalChecked > 0 ? totalUnverified / totalChecked : 0;

	// Per-sport accuracy from recent runs
	const sportStats = {};
	for (const run of recent) {
		if (!run.results) continue;
		for (const configResult of run.results) {
			const sport = configResult.sport || "unknown";
			if (!sportStats[sport]) {
				sportStats[sport] = { checked: 0, verified: 0 };
			}
			sportStats[sport].checked += configResult.eventsChecked || 0;
			sportStats[sport].verified += configResult.verified || 0;
		}
	}

	const metrics = {
		overallAccuracy: Math.round(overallAccuracy * 100) / 100,
		unverifiedRatio: Math.round(unverifiedRatio * 100) / 100,
		correctionsApplied: totalCorrections,
		sportAccuracy: null,
		runsAnalyzed: recent.length,
	};

	const hints = [];

	// Rule 1: Overall accuracy low
	if (overallAccuracy < 0.6) {
		hints.push("CORRECTION: Recent discoveries had low accuracy. Double-check dates/times against official sources.");
	}

	// Rule 2: Per-sport accuracy low
	for (const [sport, stats] of Object.entries(sportStats)) {
		if (stats.checked >= 2) {
			const accuracy = stats.verified / stats.checked;
			if (accuracy < 0.5) {
				metrics.sportAccuracy = Math.round(accuracy * 100) / 100;
				hints.push(`CORRECTION: ${sport} schedules have been inaccurate. Verify each time against the official event website.`);
			}
		}
	}

	// Rule 3: Time corrections applied
	if (totalCorrections > 0) {
		hints.push("CORRECTION: Previous times were wrong. Always include timezone offsets and verify against official schedules.");
	}

	// Rule 4: Unverified events > 30%
	if (unverifiedRatio > 0.3) {
		hints.push("CORRECTION: Many events couldn't be verified. Use official schedules, not secondary sources.");
	}

	return { hints, metrics };
}
