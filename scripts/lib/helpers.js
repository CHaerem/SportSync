import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** Norwegian football clubs that appear in European competitions (ESPN naming) */
export const NORWEGIAN_CLUBS = [
	"bodo/glimt", "bodø/glimt", "molde", "rosenborg", "viking",
	"brann", "lillestrøm", "lillestrom", "tromsø", "tromso",
	"vålerenga", "valerenga", "sarpsborg", "odd", "lyn",
];

/** UEFA competition league codes where Norwegian club results are noteworthy */
export const UEFA_COMPETITIONS = [
	"uefa.champions", "uefa.europa", "uefa.europa.conf",
];

/**
 * Check if a football result involves a Norwegian club.
 * Matches team names against NORWEGIAN_CLUBS (case-insensitive, substring match).
 */
export function isNorwegianClubResult(result) {
	const home = (result.homeTeam || "").toLowerCase();
	const away = (result.awayTeam || "").toLowerCase();
	return NORWEGIAN_CLUBS.some(club => home.includes(club) || away.includes(club));
}

/**
 * Check if a result is noteworthy for a Norwegian-focused dashboard.
 * A result is noteworthy if it involves a Norwegian club in a UEFA competition.
 */
export function isNoteworthyNorwegianResult(result) {
	if (!isNorwegianClubResult(result)) return false;
	const code = (result.leagueCode || "").toLowerCase();
	return UEFA_COMPETITIONS.some(comp => code.includes(comp));
}

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

export function rootDataPath() {
	return process.env.SPORTSYNC_DATA_DIR || path.resolve(process.cwd(), "docs", "data");
}
