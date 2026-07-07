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

// --- Interest entity matching (shared, deterministic) ---
// alwaysTrack entries may be a bare string OR { name, aliases, sport, notify }.
// normalizeEntity upgrades either into a uniform shape so a stray string never
// crashes the pipeline. matchInterest is the ONE matcher used everywhere
// (fetchers, results, coverage gaps, relevance filter, must-watch/notify) so a
// name is matched the same way in every code path — same input, same output.

/** Lowercase + strip diacritics so "Barça" and "Barca" compare equal. */
export function normalizeText(s) {
	return (s || "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase();
}

/**
 * Word-boundary, accent-insensitive containment. "Lyn" matches "Lyn Oslo" and
 * "Vålerenga-Lyn" but NOT "Brooklyn"/"lynnedslag" — boundaries kill the class of
 * false positive that plain substring matching produces.
 */
export function containsName(haystack, name) {
	const n = normalizeText(name).trim();
	if (!n) return false;
	const h = normalizeText(haystack);
	const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "iu").test(h);
}

/**
 * Coerce an alwaysTrack entry into { name, aliases, sport, notify }.
 * Accepts a bare string (defensive: never crash) or an object; returns null for
 * anything without a usable name. `defaultNotify` sets `notify` when the entry
 * doesn't specify it (teams/athletes default true, tournaments false).
 */
export function normalizeEntity(entry, { defaultNotify = true } = {}) {
	if (typeof entry === "string") {
		const name = entry.trim();
		return name ? { name, aliases: [], sport: null, notify: defaultNotify } : null;
	}
	if (entry && typeof entry === "object" && entry.name) {
		return {
			name: entry.name,
			aliases: Array.isArray(entry.aliases) ? entry.aliases.filter(Boolean) : [],
			sport: entry.sport || null,
			notify: entry.notify != null ? Boolean(entry.notify) : defaultNotify,
		};
	}
	return null;
}

/** Every string an entity can be recognised by: its name plus all aliases. */
export function entityTerms(entity) {
	return entity ? [entity.name, ...(entity.aliases || [])].filter(Boolean) : [];
}

/** Does `haystack` mention this entity (by canonical name or any alias)? */
export function matchesEntity(haystack, entity) {
	return entityTerms(entity).some((term) => containsName(haystack, term));
}

/**
 * Return the first entity whose name/alias appears in `haystack`, else null.
 * `entries` may hold bare strings or objects (normalized defensively). Pass
 * `opts.sport` to skip entities tagged to a different sport (a golf "US Open"
 * entity won't match a tennis event).
 */
export function matchInterest(haystack, entries, opts = {}) {
	const { sport } = opts;
	for (const raw of entries || []) {
		const e = normalizeEntity(raw, opts);
		if (!e) continue;
		if (sport && e.sport && normalizeText(e.sport) !== normalizeText(sport)) continue;
		if (matchesEntity(haystack, e)) return e;
	}
	return null;
}

/**
 * The tracked entities that should trigger a reminder/alarm ("must-watch").
 * Teams + athletes alarm by default; tournaments only when notify:true — so
 * following "Premier League" broadly doesn't alarm on every match, but Liverpool
 * (a followed team) or F1 (a tournament flagged notify:true) does. This keys ONLY
 * off the user-owned interests.json — never off an event's own isFavorite/importance
 * (which the AI can write), so what interrupts the user stays user-governed.
 */
export function notifyEntities(interests) {
	const at = interests?.alwaysTrack || {};
	const out = [];
	for (const raw of [...(at.teams || []), ...(at.athletes || [])]) {
		const e = normalizeEntity(raw, { defaultNotify: true });
		if (e && e.notify) out.push(e);
	}
	for (const raw of at.tournaments || []) {
		const e = normalizeEntity(raw, { defaultNotify: false });
		if (e && e.notify) out.push(e);
	}
	return out;
}

/** Which notify-entity (if any) makes this event a must-watch — else null. */
export function mustWatchEntity(event, interests) {
	if (!event) return null;
	const hay = [
		event.title, event.tournament, event.homeTeam, event.awayTeam,
		...((event.norwegianPlayers || []).map((p) => p.name || p)),
		...(event.participants || []),
	].join(" ");
	// Sport-scope so a sport-tagged entity (e.g. FC Barcelona) can't match a
	// different sport's event that merely mentions the name (a Tour de France
	// stage in the city of Barcelona). Untagged entities/events still match freely.
	return matchInterest(hay, notifyEntities(interests), { sport: event.sport });
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
