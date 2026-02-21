import fs from "fs";
import os from "os";
import path from "path";
import https from "https";
import zlib from "zlib";

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export function iso(d = Date.now()) {
	return new Date(d).toISOString();
}

/**
 * Check if an event overlaps with a time window.
 * Handles multi-day events (endTime) and single-point events uniformly.
 * An event overlaps [windowStart, windowEnd) if it starts before the window
 * ends AND it ends at or after the window starts.
 */
export function isEventInWindow(event, windowStart, windowEnd) {
	if (!event?.time) return false;
	const start = new Date(event.time).getTime();
	const end = event.endTime ? new Date(event.endTime).getTime() : start;
	const ws = windowStart instanceof Date ? windowStart.getTime() : windowStart;
	const we = windowEnd instanceof Date ? windowEnd.getTime() : windowEnd;
	return start < we && end >= ws;
}

export function normalizeToUTC(dateString) {
	// Handle various date formats from APIs and ensure proper UTC conversion
	if (!dateString) return new Date().toISOString();
	
	try {
		const date = new Date(dateString);
		
		// Check if the date is valid
		if (isNaN(date.getTime())) {
			console.warn(`Invalid date string: ${dateString}`);
			return new Date().toISOString();
		}
		
		return date.toISOString();
	} catch (error) {
		console.warn(`Error parsing date ${dateString}:`, error);
		return new Date().toISOString();
	}
}

export async function fetchJson(
	url,
	{ headers = {}, retries = 2, retryDelay = 500, timeout = 0 } = {}
) {
	headers["User-Agent"] = headers["User-Agent"] || "SportSync/1.0";
	return new Promise((resolve, reject) => {
		let settled = false;
		let timeoutId = null;

		function settle(fn, value) {
			if (settled) return;
			settled = true;
			if (timeoutId) clearTimeout(timeoutId);
			fn(value);
		}

		const req = https
			.get(url, { headers }, (res) => {
				let stream = res;
				if (res.headers["content-encoding"] === "gzip") {
					stream = res.pipe(zlib.createGunzip());
				}
				let body = "";
				stream.on("data", (c) => (body += c));
				stream.on("error", (err) => settle(reject, err));
				stream.on("end", async () => {
					if (res.statusCode && res.statusCode >= 500 && retries > 0) {
						await new Promise((r) => setTimeout(r, retryDelay));
						try {
							settle(resolve,
								await fetchJson(url, {
									headers,
									retries: retries - 1,
									retryDelay: retryDelay * 2,
									timeout,
								})
							);
						} catch (e) {
							settle(reject, e);
						}
						return;
					}
					try {
						settle(resolve, JSON.parse(body));
					} catch (e) {
						settle(reject, e);
					}
				});
			})
			.on("error", async (err) => {
				if (retries > 0) {
					await new Promise((r) => setTimeout(r, retryDelay));
					try {
						settle(resolve,
							await fetchJson(url, {
								headers,
								retries: retries - 1,
								retryDelay: retryDelay * 2,
								timeout,
							})
						);
					} catch (e) {
						settle(reject, e);
					}
				} else settle(reject, err);
			});

		if (timeout > 0) {
			timeoutId = setTimeout(() => {
				req.destroy();
				settle(reject, new Error(`Request timed out after ${timeout}ms: ${url}`));
			}, timeout);
		}
	});
}

export function readJsonIfExists(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return null;
	}
}

export function writeJsonPretty(file, data) {
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function retainLastGood(targetFile, newData, maxAgeDays = 14) {
	const exists = readJsonIfExists(targetFile);
	const newHasEvents = hasEvents(newData);
	// Skip retention if fetcher explicitly says empty is intentional (not a failure)
	if (newData?._noRetain) {
		delete newData._noRetain;
		if (newData._retained) delete newData._retained;
		writeJsonPretty(targetFile, newData);
		return { kept: false, data: newData };
	}
	if (!newHasEvents && exists && hasEvents(exists)) {
		// Check if retained data is too old to keep
		const retainedAge = exists.lastUpdated
			? (Date.now() - new Date(exists.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
			: Infinity;
		if (retainedAge <= maxAgeDays) {
			// Mark the retained data so health checks can detect chronic retention
			exists._retained = {
				since: exists._retained?.since || new Date().toISOString(),
				consecutiveRetains: (exists._retained?.consecutiveRetains || 0) + 1,
				lastFreshFetch: exists._retained?.lastFreshFetch || exists.lastUpdated || null,
			};
			writeJsonPretty(targetFile, exists);
			return { kept: true, data: exists };
		}
		console.warn(`Retained data expired (${Math.round(retainedAge)} days old) for ${path.basename(targetFile)}`);
	}
	// Fresh data — clear retention marker
	if (newData && newData._retained) delete newData._retained;
	writeJsonPretty(targetFile, newData);
	return { kept: false, data: newData };
}

export function hasEvents(obj) {
	if (!obj) return false;
	if (Array.isArray(obj.tournaments)) {
		return obj.tournaments.some(
			(t) => Array.isArray(t.events) && t.events.length > 0
		);
	}
	return false;
}

export function mergePrimaryAndOpen(primary, open) {
	if (!primary || !hasEvents(primary)) return open || primary;
	if (!open || !hasEvents(open)) return primary;
	const map = new Map(primary.tournaments.map((t) => [t.name, t]));
	for (const t of open.tournaments) {
		if (!map.has(t.name) || !hasEvents(map.get(t.name))) {
			map.set(t.name, t);
		}
	}
	return { ...primary, tournaments: Array.from(map.values()) };
}

/** Format a Date as YYYY-MM-DD string (in local time). */
export function formatDateKey(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function rootDataPath() {
	return process.env.SPORTSYNC_DATA_DIR || path.resolve(process.cwd(), "docs", "data");
}

export function countEvents(obj) {
	if (!obj || !Array.isArray(obj.tournaments)) return 0;
	return obj.tournaments.reduce((acc, t) => acc + (t.events?.length || 0), 0);
}

/**
 * Parse Claude CLI --output-format json response.
 * Extracts the result text and real token usage data.
 * @param {string} rawOutput - Raw JSON string from CLI stdout
 * @returns {{ result: string, usage: object }}
 */
export function parseCliJsonOutput(rawOutput) {
	const response = JSON.parse(rawOutput);
	if (response.is_error) {
		throw new Error(`CLI error: ${response.result || "unknown error"}`);
	}
	const u = response.usage || {};
	const inputTokens = u.input_tokens || 0;
	const outputTokens = u.output_tokens || 0;
	const cacheCreation = u.cache_creation_input_tokens || 0;
	const cacheRead = u.cache_read_input_tokens || 0;
	return {
		result: response.result || "",
		usage: {
			input: inputTokens + cacheCreation + cacheRead,
			output: outputTokens,
			cacheCreation,
			cacheRead,
			total: inputTokens + cacheCreation + cacheRead + outputTokens,
			costUSD: response.total_cost_usd || 0,
		},
		numTurns: response.num_turns || 0,
		durationApiMs: response.duration_api_ms || 0,
	};
}

/**
 * Parse token usage from a Claude Code session JSONL file.
 * Session files are stored in ~/.claude/projects/{project-dir}/{sessionId}.jsonl.
 * Each assistant message contains usage data with input/output/cache tokens.
 * @param {string} sessionId - The session ID (from claude-code-action output)
 * @returns {{ input: number, output: number, cacheCreation: number, cacheRead: number, total: number } | null}
 */
export function parseSessionUsage(sessionId) {
	if (!sessionId) return null;
	const claudeDir = path.join(os.homedir(), ".claude", "projects");
	if (!fs.existsSync(claudeDir)) return null;

	// Search project dirs for the session file (path varies by machine)
	let sessionFile = null;
	for (const dir of fs.readdirSync(claudeDir)) {
		const candidate = path.join(claudeDir, dir, `${sessionId}.jsonl`);
		if (fs.existsSync(candidate)) { sessionFile = candidate; break; }
	}
	if (!sessionFile) return null;

	const content = fs.readFileSync(sessionFile, "utf-8");
	let input = 0, output = 0, cacheCreation = 0, cacheRead = 0;
	for (const line of content.split("\n")) {
		if (!line) continue;
		try {
			const entry = JSON.parse(line);
			if (entry.type === "assistant") {
				const u = entry.message?.usage;
				if (u) {
					input += u.input_tokens || 0;
					output += u.output_tokens || 0;
					cacheCreation += u.cache_creation_input_tokens || 0;
					cacheRead += u.cache_read_input_tokens || 0;
				}
			}
		} catch { /* skip malformed lines */ }
	}
	return { input, output, cacheCreation, cacheRead, total: input + output + cacheCreation + cacheRead };
}
