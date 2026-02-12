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
	if (sanitized.length > 15) {
		issues.push({ severity: "warning", code: "blocks_too_many", message: `${sanitized.length} blocks exceeds recommended max of 15.` });
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
