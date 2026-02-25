/**
 * Recipe Scraper Engine
 *
 * Generalizes hand-coded scrapers (parseLiquipediaMatches, parseListingPage, etc.)
 * into a declarative recipe system. Each recipe is a JSON file that describes:
 *   - How to fetch content (URL, headers, response type)
 *   - How to split content into repeating blocks
 *   - How to extract fields from each block (regex/jsonpath selectors)
 *   - How to map fields to the standard event schema
 *   - Validation criteria (for self-repair triggering)
 *
 * Three modes:
 *   1. Execute — apply recipe mechanically (zero LLM cost)
 *   2. Validate — check extraction results against recipe health criteria
 *   3. Diagnose — determine why a recipe failed (for self-repair)
 *
 * Follows the existing patterns: fetchJson/fetchHtml for content,
 * regex-based extraction (like parseLiquipediaMatches), health tracking
 * (like streaming-verification-history).
 */

import https from "https";
import http from "http";

// ─── Content Fetching ───────────────────────────────────────────────────────

/**
 * Fetch raw content from a URL.
 * Supports JSON and HTML response types.
 */
export async function fetchContent(source) {
	const url = buildUrl(source);
	const headers = {
		"User-Agent": "SportSync/2.0 (https://github.com; sports dashboard)",
		...source.headers,
	};

	const body = await httpGet(url, { headers, timeout: source.timeout || 10000 });

	let content = body;
	if (source.responseType === "json") {
		const parsed = JSON.parse(body);
		if (source.contentPath) {
			content = navigatePath(parsed, source.contentPath);
			if (typeof content !== "string") {
				content = JSON.stringify(content);
			}
		} else {
			content = JSON.stringify(parsed);
		}
	}

	return { content, url, fetchedAt: new Date().toISOString() };
}

function buildUrl(source) {
	let url = source.urlPattern || source.url;
	if (source.urlParams) {
		const params = new URLSearchParams(source.urlParams);
		url += (url.includes("?") ? "&" : "?") + params.toString();
	}
	return url;
}

function navigatePath(obj, pathStr) {
	return pathStr.split(".").reduce((current, key) => {
		if (current == null) return undefined;
		// Handle wildcard * (take first value)
		if (key === "*") {
			if (typeof current === "object") {
				const values = Object.values(current);
				return values[0];
			}
			return undefined;
		}
		return current[key];
	}, obj);
}

function httpGet(url, options = {}) {
	const mod = url.startsWith("https") ? https : http;
	return new Promise((resolve, reject) => {
		const req = mod.get(url, { headers: options.headers }, (res) => {
			// Follow redirects
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				httpGet(res.headers.location, options).then(resolve, reject);
				return;
			}
			if (res.statusCode >= 400) {
				reject(new Error(`HTTP ${res.statusCode} from ${url}`));
				return;
			}
			let body = "";
			res.on("data", (chunk) => (body += chunk));
			res.on("end", () => resolve(body));
			res.on("error", reject);
		});
		req.on("error", reject);
		if (options.timeout) {
			req.setTimeout(options.timeout, () => {
				req.destroy();
				reject(new Error(`Timeout after ${options.timeout}ms: ${url}`));
			});
		}
	});
}

// ─── Field Extraction ───────────────────────────────────────────────────────

/**
 * Split content into blocks and extract fields from each block.
 */
export function extractFromContent(content, extraction) {
	if (!content || !extraction) return [];

	// Split content into repeating blocks
	const blocks = splitIntoBlocks(content, extraction);

	// Extract fields from each block
	const results = [];
	for (const block of blocks) {
		const item = extractFields(block, extraction.fields);
		if (item && hasRequiredFields(item, extraction.fields)) {
			results.push(item);
		}
	}

	return results;
}

function splitIntoBlocks(content, extraction) {
	if (!extraction.splitPattern) return [content];

	if (extraction.splitType === "regex" || !extraction.splitType) {
		const regex = new RegExp(extraction.splitPattern, extraction.splitFlags || "g");
		const parts = content.split(regex);
		// First part is before the first match — skip it
		return parts.slice(1);
	}

	if (extraction.splitType === "json") {
		// Content is JSON — split by array path
		try {
			const parsed = typeof content === "string" ? JSON.parse(content) : content;
			const arr = navigatePath(parsed, extraction.splitPattern);
			return Array.isArray(arr) ? arr.map((item) => JSON.stringify(item)) : [];
		} catch {
			return [];
		}
	}

	return [content];
}

function extractFields(block, fields) {
	if (!fields || !Array.isArray(fields)) return null;
	const item = {};

	for (const field of fields) {
		let value = null;

		if (field.selectorType === "regex" || !field.selectorType) {
			value = extractWithRegex(block, field);
		} else if (field.selectorType === "jsonpath") {
			value = extractWithJsonPath(block, field);
		} else if (field.selectorType === "regex-all") {
			value = extractAllWithRegex(block, field);
		}

		// Apply transforms
		if (value != null) {
			value = applyTransforms(value, field.transform);
		}

		// Use default if no value extracted
		if (value == null && field.default !== undefined) {
			value = field.default;
		}

		if (value != null) {
			item[field.name] = value;
		}
	}

	return Object.keys(item).length > 0 ? item : null;
}

function extractWithRegex(block, field) {
	const regex = new RegExp(field.selector, field.flags || "");
	const occurrence = field.occurrence || 0;

	if (occurrence === 0) {
		const match = block.match(regex);
		return match ? (match[1] !== undefined ? match[1] : match[0]) : null;
	}

	// Find nth occurrence
	const globalRegex = new RegExp(field.selector, (field.flags || "") + "g");
	const matches = [...block.matchAll(globalRegex)];
	if (matches.length > occurrence) {
		const m = matches[occurrence];
		return m[1] !== undefined ? m[1] : m[0];
	}
	return null;
}

function extractAllWithRegex(block, field) {
	const regex = new RegExp(field.selector, (field.flags || "") + "g");
	const matches = [...block.matchAll(regex)];
	return matches.map((m) => (m[1] !== undefined ? m[1] : m[0]));
}

function extractWithJsonPath(block, field) {
	try {
		const parsed = typeof block === "string" ? JSON.parse(block) : block;
		return navigatePath(parsed, field.selector);
	} catch {
		return null;
	}
}

function hasRequiredFields(item, fields) {
	for (const field of fields) {
		if (field.required && (item[field.name] == null || item[field.name] === "")) {
			return false;
		}
	}
	return true;
}

// ─── Transforms ─────────────────────────────────────────────────────────────

export function applyTransforms(value, transforms) {
	if (!transforms) return value;
	const chain = Array.isArray(transforms) ? transforms : [transforms];

	for (const t of chain) {
		if (value == null) break;
		value = applySingleTransform(value, t);
	}
	return value;
}

function applySingleTransform(value, transform) {
	if (typeof transform !== "string") return value;

	if (transform === "trim") return String(value).trim();
	if (transform === "parseInt") return parseInt(value, 10);
	if (transform === "parseFloat") return parseFloat(value);
	if (transform === "isoDate") return new Date(Number(value) || value).toISOString();
	if (transform === "toLowerCase") return String(value).toLowerCase();

	if (transform.startsWith("multiply:")) {
		const factor = parseFloat(transform.split(":")[1]);
		return Number(value) * factor;
	}
	if (transform.startsWith("prefix:")) {
		return transform.slice(7) + value;
	}
	if (transform.startsWith("suffix:")) {
		return value + transform.slice(7);
	}
	if (transform.startsWith("default:")) {
		return value == null || value === "" ? transform.slice(8) : value;
	}
	if (transform.startsWith("replace:")) {
		const parts = transform.slice(8).split(":");
		if (parts.length >= 2) {
			return String(value).replace(new RegExp(parts[0], "g"), parts[1]);
		}
	}

	return value;
}

// ─── Output Mapping ─────────────────────────────────────────────────────────

/**
 * Map extracted items to the standard event schema using template strings.
 * Templates use {fieldName} and {fieldName|transform} syntax.
 */
export function mapToEvents(items, output) {
	if (!output?.mapping) return items;

	return items.map((item) => {
		const event = {};
		for (const [key, template] of Object.entries(output.mapping)) {
			if (typeof template === "string" && template.includes("{")) {
				event[key] = resolveTemplate(template, item);
			} else {
				// Static value
				event[key] = template;
			}
		}
		return event;
	});
}

function resolveTemplate(template, item) {
	return template.replace(/\{([^}]+)\}/g, (_, expr) => {
		const [field, ...transforms] = expr.split("|");
		let value = item[field];
		for (const t of transforms) {
			value = applySingleTransform(value, t);
		}
		return value ?? "";
	});
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate extraction results against recipe criteria.
 * Returns { valid, issues[] } for self-repair triggering.
 */
export function validateResults(results, validation) {
	if (!validation) return { valid: true, issues: [] };
	const issues = [];

	if (validation.minResults != null && results.length < validation.minResults) {
		issues.push(`Too few results: got ${results.length}, expected >= ${validation.minResults}`);
	}

	if (validation.maxResults != null && results.length > validation.maxResults) {
		issues.push(`Too many results: got ${results.length}, expected <= ${validation.maxResults}`);
	}

	if (validation.requiredFields) {
		for (const result of results) {
			for (const field of validation.requiredFields) {
				if (result[field] == null || result[field] === "") {
					issues.push(`Missing required field "${field}" in result`);
					break;
				}
			}
		}
	}

	if (validation.timeRangeCheck && validation.freshnessDays) {
		const cutoff = Date.now() - validation.freshnessDays * 86400000;
		const validTimes = results.filter((r) => {
			const t = r.time ? new Date(r.time).getTime() : 0;
			return t > cutoff;
		});
		if (results.length > 0 && validTimes.length === 0) {
			issues.push(`All ${results.length} results have times older than ${validation.freshnessDays} days`);
		}
	}

	return { valid: issues.length === 0, issues };
}

// ─── Health Tracking ────────────────────────────────────────────────────────

/**
 * Update recipe health stats after an execution.
 * Returns updated health object.
 */
export function updateHealth(health, resultCount, valid) {
	const updated = { ...health };

	if (valid && resultCount > 0) {
		updated.consecutiveFailures = 0;
		updated.lastSuccessCount = resultCount;
		// Rolling average
		const prev = updated.avgResultCount || resultCount;
		updated.avgResultCount = Math.round((prev * 0.8 + resultCount * 0.2) * 10) / 10;
		// Success rate (exponential moving average)
		updated.successRate = Math.round(((updated.successRate || 1) * 0.9 + 0.1) * 100) / 100;
	} else {
		updated.consecutiveFailures = (updated.consecutiveFailures || 0) + 1;
		updated.successRate = Math.round(((updated.successRate || 1) * 0.9) * 100) / 100;
	}

	return updated;
}

/**
 * Check if a recipe needs self-repair based on health stats.
 */
export function needsRepair(health) {
	if (!health) return false;
	const maxFailures = health.maxConsecutiveFailures || 3;
	return (health.consecutiveFailures || 0) >= maxFailures;
}

// ─── Diagnosis ──────────────────────────────────────────────────────────────

/**
 * Diagnose why a recipe failed (Level 1: static diagnosis).
 * Returns diagnosis object with suspected cause and suggestions.
 */
export function diagnoseFailure(content, extraction) {
	const diagnosis = { cause: "unknown", details: [], suggestions: [] };

	if (!content || content.length === 0) {
		diagnosis.cause = "empty-content";
		diagnosis.details.push("Fetched content is empty");
		diagnosis.suggestions.push("Check if URL is still valid", "Check for Cloudflare blocking");
		return diagnosis;
	}

	// Check if split pattern matches
	if (extraction.splitPattern) {
		const regex = new RegExp(extraction.splitPattern);
		if (!regex.test(content)) {
			diagnosis.cause = "split-pattern-broken";
			diagnosis.details.push(`Split pattern /${extraction.splitPattern}/ no longer matches content`);
			diagnosis.suggestions.push("Page structure may have changed", "Re-learn recipe with LLM");
			return diagnosis;
		}
	}

	// Check individual field selectors
	const blocks = splitIntoBlocks(content, extraction);
	if (blocks.length === 0) {
		diagnosis.cause = "no-blocks";
		diagnosis.details.push("Split pattern matched but produced zero blocks");
		diagnosis.suggestions.push("Split pattern may be too broad/narrow");
		return diagnosis;
	}

	// Check which fields are failing
	const sampleBlock = blocks[0];
	for (const field of extraction.fields || []) {
		if (field.required) {
			const value = extractWithRegex(sampleBlock, field);
			if (value == null) {
				diagnosis.cause = "field-selector-broken";
				diagnosis.details.push(`Required field "${field.name}" selector no longer matches`);
				diagnosis.suggestions.push(`Update selector for "${field.name}"`, "Re-learn recipe with LLM");
			}
		}
	}

	if (diagnosis.details.length === 0) {
		diagnosis.cause = "validation-failure";
		diagnosis.details.push("Extraction works but results fail validation");
		diagnosis.suggestions.push("Check validation criteria", "Data may have legitimately changed");
	}

	return diagnosis;
}

// ─── Full Recipe Execution ──────────────────────────────────────────────────

/**
 * Execute a recipe end-to-end: fetch → extract → map → validate.
 * Returns { success, events, resultCount, validation, health, diagnosis? }
 */
export async function executeRecipe(recipe) {
	const startTime = Date.now();

	try {
		// Fetch content
		const { content } = await fetchContent(recipe.source);

		// Extract from content
		const rawItems = extractFromContent(content, recipe.extraction);

		// Map to event schema
		const events = mapToEvents(rawItems, recipe.output);

		// Validate
		const validation = validateResults(events, recipe.validation);

		// Update health
		const health = updateHealth(
			recipe.health || {},
			events.length,
			validation.valid
		);

		// Diagnose if failed
		let diagnosis = null;
		if (!validation.valid || events.length === 0) {
			diagnosis = diagnoseFailure(content, recipe.extraction);
		}

		return {
			success: validation.valid && events.length > 0,
			events,
			resultCount: events.length,
			validation,
			health,
			diagnosis,
			durationMs: Date.now() - startTime,
		};
	} catch (error) {
		const health = updateHealth(recipe.health || {}, 0, false);
		return {
			success: false,
			events: [],
			resultCount: 0,
			validation: { valid: false, issues: [error.message] },
			health,
			diagnosis: { cause: "fetch-error", details: [error.message], suggestions: ["Check URL accessibility"] },
			durationMs: Date.now() - startTime,
		};
	}
}
