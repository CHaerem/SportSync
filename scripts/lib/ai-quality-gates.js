import { MS_PER_DAY } from "./helpers.js";

const BLOCK_WORD_LIMITS = {
	headline: 15,
	"event-line": 20,
	"event-group": 20,
	narrative: 40,
	section: 0, // sections validated by items
	divider: 8,
};
const VALID_BLOCK_TYPES = ["headline", "event-line", "event-group", "narrative", "section", "divider"];
const ENRICHMENT_DEFAULTS = {
	minImportanceCoverage: 0.85,
	minSummaryCoverage: 0.6,
	minRelevanceCoverage: 0.85,
};

const MAJOR_EVENT_RE =
	/olympics|world cup|champions league|grand slam|masters|major|playoff|final/i;

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function countWords(text) {
	if (typeof text !== "string") return 0;
	return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeLine(text) {
	if (typeof text !== "string") return "";
	return text.replace(/\s+/g, " ").trim();
}

function looksLikeMajorEvent(event) {
	const haystack = `${event?.context || ""} ${event?.tournament || ""} ${event?.title || ""}`;
	return MAJOR_EVENT_RE.test(haystack);
}

function sanitizeSection(section) {
	const id = normalizeLine(section?.id || "").toLowerCase().replace(/\s+/g, "-") || "featured";
	const title = normalizeLine(section?.title || "");
	const emoji = normalizeLine(section?.emoji || "");
	const style = section?.style === "highlight" ? "highlight" : "default";
	const items = (Array.isArray(section?.items) ? section.items : [])
		.map((item) => ({
			text: normalizeLine(item?.text || ""),
			type: ["stat", "event", "text"].includes(item?.type) ? item.type : "text",
		}))
		.filter((item) => item.text.length > 0);
	const expandLabel = normalizeLine(section?.expandLabel || "");
	const expandItems = (Array.isArray(section?.expandItems) ? section.expandItems : [])
		.map((item) => ({
			text: normalizeLine(item?.text || ""),
			type: ["stat", "event", "text"].includes(item?.type) ? item.type : "text",
		}))
		.filter((item) => item.text.length > 0);

	return {
		id,
		title,
		emoji,
		style,
		items,
		expandLabel: expandLabel || null,
		expandItems,
	};
}

function sanitizeTags(tags) {
	const out = [];
	const seen = new Set();
	for (const tag of Array.isArray(tags) ? tags : []) {
		if (typeof tag !== "string") continue;
		const cleaned = tag.toLowerCase().trim();
		if (!cleaned || seen.has(cleaned)) continue;
		seen.add(cleaned);
		out.push(cleaned);
		if (out.length >= 10) break;
	}
	return out;
}

function inferImportance(event) {
	const text = `${event?.title || ""} ${event?.tournament || ""} ${event?.context || ""}`;
	let score = event?.norwegian ? 3 : 2;

	if (MAJOR_EVENT_RE.test(text)) score = Math.max(score, 4);
	if (/final|decider|title/i.test(text)) score = Math.max(score, 5);
	if (event?.sport === "football" && /derby|rivalry/i.test(text)) score = Math.max(score, 4);

	return clamp(score, 1, 5);
}

function inferImportanceReason(event, importance) {
	if (importance >= 5) return "Major event with high stakes and broad viewer appeal.";
	if (importance >= 4) return "Strong storyline with meaningful stakes for fans.";
	if (event?.norwegian) return "Norwegian relevance increases importance for the target audience.";
	return "Regular fixture with moderate impact and viewing interest.";
}

function inferSummary(event) {
	const sport = normalizeLine(event?.sport || "sport");
	const tournament = normalizeLine(event?.tournament || "");

	if (event?.homeTeam && event?.awayTeam) {
		return `${event.homeTeam} vs ${event.awayTeam}${tournament ? ` in ${tournament}` : ""}.`;
	}

	if (Array.isArray(event?.norwegianPlayers) && event.norwegianPlayers.length > 0) {
		const player = event.norwegianPlayers[0]?.name || "Norwegian player";
		return `${player} competes${tournament ? ` in ${tournament}` : ""} with Norwegian interest.`;
	}

	return `${event?.title || "Upcoming event"}${tournament ? ` in ${tournament}` : ""} (${sport}).`;
}

function inferNorwegianRelevance(event) {
	if (event?.norwegian) return 5;
	if (Array.isArray(event?.norwegianPlayers) && event.norwegianPlayers.length > 0) return 4;
	if (["football", "golf", "tennis", "f1", "formula1", "chess"].includes(event?.sport)) return 3;
	return 2;
}

function inferTags(event, importance) {
	const tags = [];
	const text = `${event?.title || ""} ${event?.tournament || ""} ${event?.context || ""}`.toLowerCase();

	if (importance >= 4) tags.push("must-watch");
	if (text.includes("final")) tags.push("final");
	if (looksLikeMajorEvent(event)) tags.push("major");
	if (event?.norwegian) {
		if (event?.homeTeam || event?.awayTeam) {
			tags.push("norwegian-team");
		} else {
			tags.push("norwegian-player");
		}
	}

	if (tags.length === 0) tags.push("watchlist");

	return sanitizeTags(tags);
}

function coverage(events, field) {
	if (!Array.isArray(events) || events.length === 0) return 1;
	let hit = 0;
	for (const event of events) {
		const value = event?.[field];
		if (field === "tags") {
			if (Array.isArray(value) && value.length > 0) hit++;
			continue;
		}
		if (field === "summary" || field === "importanceReason") {
			if (typeof value === "string" && value.trim().length > 0) hit++;
			continue;
		}
		if (typeof value === "number") hit++;
	}
	return hit / events.length;
}

function roundRatio(num) {
	return Number(num.toFixed(3));
}

export function isMajorEventActive(events = []) {
	return events.some((event) => looksLikeMajorEvent(event));
}

function sanitizeBlock(block) {
	if (!block || typeof block !== "object") return null;
	const type = typeof block.type === "string" ? block.type.trim() : "";
	if (!VALID_BLOCK_TYPES.includes(type)) return null;

	const out = { type };

	if (type === "section") {
		const section = sanitizeSection(block);
		if (!section.title || section.items.length === 0) return null;
		return { type, ...section };
	}

	if (type === "event-group") {
		out.label = normalizeLine(block.label || "");
		out.items = (Array.isArray(block.items) ? block.items : [])
			.map((item) => {
				if (typeof item === "string") return normalizeLine(item);
				return normalizeLine(item?.text || "");
			})
			.filter(Boolean);
		if (out.items.length === 0) return null;
		return out;
	}

	out.text = normalizeLine(block.text || "");
	if (type !== "divider" && !out.text) return null;
	if (type === "divider" && !out.text) out.text = "";
	return out;
}

export function validateBlocksContent(blocks, { events = [] } = {}) {
	const issues = [];
	let score = 100;

	if (!Array.isArray(blocks) || blocks.length === 0) {
		issues.push({ severity: "error", code: "blocks_empty", message: "Blocks array is empty." });
		return { valid: false, score: 0, issues, normalized: { blocks: [] } };
	}

	const sanitized = blocks.map(sanitizeBlock).filter(Boolean);

	if (sanitized.length < 3) {
		issues.push({ severity: "error", code: "blocks_too_few", message: `Only ${sanitized.length} valid blocks (min 3).` });
		score -= 35;
	}
	if (sanitized.length > 10) {
		issues.push({ severity: "warning", code: "blocks_too_many", message: `${sanitized.length} blocks exceeds recommended max of 10.` });
		score -= 10;
	}

	const eventLineCount = sanitized.filter((b) => b.type === "event-line" || b.type === "event-group").length;
	if (eventLineCount < 1) {
		issues.push({ severity: "error", code: "no_event_blocks", message: "At least 1 event-line or event-group block is required." });
		score -= 25;
	}

	const narrativeCount = sanitized.filter((b) => b.type === "narrative").length;
	if (narrativeCount > 3) {
		issues.push({ severity: "warning", code: "too_many_narratives", message: `${narrativeCount} narratives exceeds max of 3.` });
		score -= 10;
	}

	for (const block of sanitized) {
		const limit = BLOCK_WORD_LIMITS[block.type];
		if (limit && block.text && countWords(block.text) > limit) {
			issues.push({
				severity: "warning",
				code: "block_text_too_long",
				message: `${block.type} block exceeds ${limit} words: "${block.text.slice(0, 50)}..."`,
			});
			score -= 5;
		}
	}

	score = clamp(score, 0, 100);
	const valid = issues.filter((i) => i.severity === "error").length === 0;
	return { valid, score, issues, normalized: { blocks: sanitized } };
}

export function validateFeaturedContent(featured, { events = [] } = {}) {
	const blocks = Array.isArray(featured?.blocks) ? featured.blocks : [];
	return validateBlocksContent(blocks, { events });
}

export function getEnrichmentCoverage(events = []) {
	return {
		totalEvents: Array.isArray(events) ? events.length : 0,
		importanceCoverage: roundRatio(coverage(events, "importance")),
		summaryCoverage: roundRatio(coverage(events, "summary")),
		relevanceCoverage: roundRatio(coverage(events, "norwegianRelevance")),
		tagsCoverage: roundRatio(coverage(events, "tags")),
	};
}

export function applyEnrichmentFallback(event) {
	let changed = 0;
	if (typeof event !== "object" || !event) return changed;

	if (typeof event.importance !== "number") {
		event.importance = inferImportance(event);
		changed++;
	}
	if (typeof event.importanceReason !== "string" || !event.importanceReason.trim()) {
		event.importanceReason = inferImportanceReason(event, event.importance);
		changed++;
	}
	if (typeof event.summary !== "string" || !event.summary.trim()) {
		event.summary = inferSummary(event).slice(0, 300);
		changed++;
	}

	const existingTags = sanitizeTags(event.tags);
	if (existingTags.length === 0) {
		event.tags = inferTags(event, event.importance);
		changed++;
	} else {
		event.tags = existingTags;
	}

	if (typeof event.norwegianRelevance !== "number") {
		event.norwegianRelevance = inferNorwegianRelevance(event);
		changed++;
	}

	event.importance = clamp(Math.round(event.importance), 1, 5);
	event.norwegianRelevance = clamp(Math.round(event.norwegianRelevance), 1, 5);
	event.enrichedAt = new Date().toISOString();
	return changed;
}

export function enforceEnrichmentQuality(events = [], options = {}) {
	const thresholds = { ...ENRICHMENT_DEFAULTS, ...options };
	const before = getEnrichmentCoverage(events);
	let changedCount = 0;

	for (const event of events) {
		changedCount += applyEnrichmentFallback(event);
	}

	const after = getEnrichmentCoverage(events);
	const issues = [];

	if (after.importanceCoverage < thresholds.minImportanceCoverage) {
		issues.push({
			severity: "error",
			code: "importance_coverage_low",
			message: `Importance coverage ${after.importanceCoverage} below ${thresholds.minImportanceCoverage}.`,
		});
	}
	if (after.summaryCoverage < thresholds.minSummaryCoverage) {
		issues.push({
			severity: "error",
			code: "summary_coverage_low",
			message: `Summary coverage ${after.summaryCoverage} below ${thresholds.minSummaryCoverage}.`,
		});
	}
	if (after.relevanceCoverage < thresholds.minRelevanceCoverage) {
		issues.push({
			severity: "error",
			code: "relevance_coverage_low",
			message: `Norwegian relevance coverage ${after.relevanceCoverage} below ${thresholds.minRelevanceCoverage}.`,
		});
	}

	const score = clamp(
		Math.round(
			(after.importanceCoverage + after.summaryCoverage + after.relevanceCoverage + after.tagsCoverage) * 25
		),
		0,
		100
	);

	return {
		events,
		before,
		after,
		changedCount,
		score,
		issues,
		valid: issues.length === 0,
	};
}

// --- Editorial quality evaluation ---

function mustWatchCoverage(blocks, events) {
	const mustWatch = (events || []).filter((e) => e.importance >= 4);
	if (mustWatch.length === 0) return 1;
	const allText = blocks
		.map((b) => {
			let text = b.text || "";
			if (b.label) text += " " + b.label;
			if (Array.isArray(b.items)) {
				text += " " + b.items.map((i) => (typeof i === "string" ? i : i.text || "")).join(" ");
			}
			return text.toLowerCase();
		})
		.join(" ");

	let covered = 0;
	for (const event of mustWatch) {
		const needles = [event.title, event.homeTeam, event.awayTeam].filter(Boolean);
		if (needles.some((n) => allText.includes(n.toLowerCase()))) covered++;
	}
	return covered / mustWatch.length;
}

function sportDiversity(blocks, events) {
	const eventSports = new Set((events || []).map((e) => e.sport).filter(Boolean));
	if (eventSports.size === 0) return 1;
	const blockText = blocks
		.map((b) => {
			let text = b.text || "";
			if (Array.isArray(b.items)) text += " " + b.items.map((i) => (typeof i === "string" ? i : i.text || "")).join(" ");
			return text;
		})
		.join(" ");
	const sportEmojis = { football: "⚽", golf: "⛳", tennis: "🎾", formula1: "🏎", f1: "🏎", chess: "♟", esports: "🎮", olympics: "🏅" };
	const found = new Set();
	for (const [sport, emoji] of Object.entries(sportEmojis)) {
		if (blockText.includes(emoji)) found.add(sport === "f1" ? "formula1" : sport);
	}
	return Math.min(found.size / eventSports.size, 1);
}

function blockTypeBalance(blocks) {
	if (blocks.length === 0) return 1;
	const counts = {};
	for (const b of blocks) {
		counts[b.type] = (counts[b.type] || 0) + 1;
	}
	const maxRatio = Math.max(...Object.values(counts)) / blocks.length;
	return maxRatio > 0.8 ? 0.5 : 1;
}

function textQualityRatio(blocks) {
	let checked = 0;
	let withinLimit = 0;
	for (const block of blocks) {
		const limit = BLOCK_WORD_LIMITS[block.type];
		if (limit && block.text) {
			checked++;
			if (countWords(block.text) <= limit) withinLimit++;
		}
	}
	return checked === 0 ? 1 : withinLimit / checked;
}

function quietDayPenalty(blocks, events) {
	const todayCount = (events || []).length;
	if (todayCount < 3 && blocks.length > 5) return 0.3;
	return 1;
}

function blockCountScore(blocks) {
	const count = blocks.length;
	if (count >= 3 && count <= 8) return 1;
	if (count < 3 || count > 10) return 0.4;
	return 0.7; // 9-10 blocks
}

export function evaluateEditorialQuality(featured, events, options = {}) {
	const blocks = Array.isArray(featured?.blocks) ? featured.blocks : [];
	const todayEvents = filterTodayEvents(events, options.now);

	const metrics = {
		mustWatchCoverage: roundRatio(mustWatchCoverage(blocks, todayEvents)),
		sportDiversity: roundRatio(sportDiversity(blocks, todayEvents)),
		blockTypeBalance: roundRatio(blockTypeBalance(blocks)),
		textQuality: roundRatio(textQualityRatio(blocks)),
		quietDayCompliance: roundRatio(quietDayPenalty(blocks, todayEvents)),
		blockCountTarget: roundRatio(blockCountScore(blocks)),
	};

	const weights = {
		mustWatchCoverage: 30,
		sportDiversity: 20,
		blockTypeBalance: 15,
		textQuality: 15,
		quietDayCompliance: 10,
		blockCountTarget: 10,
	};

	let score = 0;
	for (const [key, weight] of Object.entries(weights)) {
		score += metrics[key] * weight;
	}
	score = clamp(Math.round(score), 0, 100);

	const issues = [];
	if (metrics.mustWatchCoverage < 0.5) {
		issues.push({ severity: "warning", code: "must_watch_missed", message: `Only ${Math.round(metrics.mustWatchCoverage * 100)}% of must-watch events covered in blocks` });
	}
	if (metrics.sportDiversity < 0.3) {
		issues.push({ severity: "warning", code: "low_sport_diversity", message: `Sport diversity is ${Math.round(metrics.sportDiversity * 100)}%` });
	}
	if (metrics.blockCountTarget < 0.5) {
		issues.push({ severity: "warning", code: "block_count_out_of_range", message: `Block count ${blocks.length} is outside ideal range (3-8)` });
	}

	return { score, metrics, issues };
}

function filterTodayEvents(events, now) {
	if (!Array.isArray(events)) return [];
	const ref = now || new Date();
	const todayStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
	const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);
	return events.filter((e) => {
		const t = new Date(e.time);
		const end = e.endTime ? new Date(e.endTime) : null;
		if (t >= todayStart && t < todayEnd) return true;
		if (t < todayStart && end && end >= todayStart) return true;
		return false;
	});
}

export function evaluateWatchPlanQuality(watchPlan) {
	const picks = Array.isArray(watchPlan?.picks) ? watchPlan.picks : [];

	const pickCount = picks.length;
	const avgScore = pickCount > 0 ? Math.round(picks.reduce((sum, p) => sum + (p.score || 0), 0) / pickCount) : 0;
	const streamingCoverage = pickCount > 0
		? roundRatio(picks.filter((p) => Array.isArray(p.streaming) && p.streaming.length > 0).length / pickCount)
		: 0;
	const reasonCoverage = pickCount > 0
		? roundRatio(picks.filter((p) => Array.isArray(p.reasons) && p.reasons.length > 0).length / pickCount)
		: 0;

	const metrics = { pickCount, avgScore, streamingCoverage, reasonCoverage };

	let score = 0;
	if (pickCount > 0) score += 40;
	score += streamingCoverage * 30;
	score += reasonCoverage * 30;
	score = clamp(Math.round(score), 0, 100);

	return { score, metrics };
}

export function buildQualitySnapshot(editorial, enrichment, featured, watchPlan, { hintsApplied, tokenUsage } = {}) {
	return {
		timestamp: new Date().toISOString(),
		editorial: editorial
			? { score: editorial.score, mustWatchCoverage: editorial.metrics.mustWatchCoverage, sportDiversity: editorial.metrics.sportDiversity, blockCount: featured?.blocks?.length ?? 0 }
			: null,
		enrichment: enrichment
			? { score: enrichment.score ?? null, importanceCoverage: enrichment.importanceCoverage ?? enrichment.after?.importanceCoverage ?? null, summaryCoverage: enrichment.summaryCoverage ?? enrichment.after?.summaryCoverage ?? null }
			: null,
		featured: featured
			? { score: featured.score ?? null, blockCount: Array.isArray(featured.blocks) ? featured.blocks.length : featured.blockCount ?? 0, provider: featured.provider ?? null, valid: featured.valid ?? null }
			: null,
		watchPlan: watchPlan
			? { pickCount: watchPlan.metrics?.pickCount ?? watchPlan.pickCount ?? 0, avgScore: watchPlan.metrics?.avgScore ?? watchPlan.avgScore ?? 0, streamingCoverage: watchPlan.metrics?.streamingCoverage ?? 0 }
			: null,
		hintsApplied: hintsApplied || [],
		tokenUsage: tokenUsage || null,
	};
}

const ADAPTIVE_HINT_RULES = [
	{ metric: "mustWatchCoverage", threshold: 0.6, hint: "CORRECTION: Recent outputs missed must-watch events. You MUST include ALL events with importance ≥4. This is the highest-priority fix." },
	{ metric: "sportDiversity", threshold: 0.4, hint: "CORRECTION: Recent outputs were too focused on one sport. Include events from at least 2 different sports when available." },
	{ metric: "blockTypeBalance", threshold: 0.6, hint: "CORRECTION: Recent outputs used too many of the same block type. Mix headlines, event-lines, narratives, and dividers." },
	{ metric: "textQuality", threshold: 0.7, hint: "CORRECTION: Recent blocks exceeded word limits. headline: max 15 words, event-line: max 20, narrative: max 40." },
	{ metric: "blockCountTarget", threshold: 0.6, hint: "CORRECTION: Keep total block count between 3 and 8. Recent outputs were outside this range." },
	{ metric: "quietDayCompliance", threshold: 0.5, hint: "CORRECTION: On quiet days (<3 events), use only 3-4 blocks. Don't pad with low-importance events." },
];

export function buildAdaptiveHints(history) {
	const empty = { hints: [], metrics: {} };
	if (!Array.isArray(history) || history.length < 3) return empty;

	const recent = history.slice(-5);
	const metricKeys = ADAPTIVE_HINT_RULES.map((r) => r.metric);
	const averages = {};

	for (const key of metricKeys) {
		const values = recent
			.map((entry) => entry.editorial?.[key] ?? null)
			.filter((v) => v !== null && v !== undefined);
		averages[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
	}

	const hints = [];
	for (const rule of ADAPTIVE_HINT_RULES) {
		const avg = averages[rule.metric];
		if (avg !== null && avg < rule.threshold) {
			hints.push(rule.hint);
		}
	}

	return { hints, metrics: averages };
}
