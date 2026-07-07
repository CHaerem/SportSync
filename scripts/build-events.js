#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, MS_PER_DAY, matchInterest, mustWatchEntity } from "./lib/helpers.js";
import { resolveStreaming } from "./lib/norwegian-rights.js";

const dataDir = rootDataPath();

// Auto-discover sport files by convention: any JSON with a { tournaments: [...] } structure
const dataFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));
const sports = [];
for (const f of dataFiles) {
	if (f === "events.json") continue;
	const data = readJsonIfExists(path.join(dataDir, f));
	if (data && Array.isArray(data.tournaments)) {
		sports.push(f.replace(".json", ""));
	}
}

const all = [];

function pushEvent(ev, sport, tournament) {
	const event = {
		sport,
		tournament: ev.tournament || tournament,
		title: ev.title,
		time: ev.time,
		endTime: ev.endTime || null,
		venue: ev.venue,
		meta: ev.meta,
		norwegian: ev.norwegian || false,
		streaming: ev.streaming || [],
		participants: ev.participants || [],
		norwegianPlayers: ev.norwegianPlayers || [],
		totalPlayers: ev.totalPlayers || null,
		link: ev.link || null,
		status: ev.status || null,
		featuredGroups: ev.featuredGroups || [],
		homeTeam: ev.homeTeam || null,
		awayTeam: ev.awayTeam || null,
		isFavorite: ev.isFavorite || false,
		round: ev.round || null,
	};
	if (ev.format) event.format = ev.format;
	if (ev.stage) event.stage = ev.stage;
	if (ev.result) event.result = ev.result;
	if (ev.context) event.context = ev.context;
	if (ev.importance != null) event.importance = ev.importance;
	if (ev.summary) event.summary = ev.summary;
	// AI-research provenance fields — carried through verbatim
	if (ev.source) event.source = ev.source;
	if (ev.confidence) event.confidence = ev.confidence;
	if (ev.evidence) event.evidence = ev.evidence;
	if (ev.researchedAt) event.researchedAt = ev.researchedAt;
	if (ev.verifiedAt) event.verifiedAt = ev.verifiedAt;
	if (ev.verificationStatus) event.verificationStatus = ev.verificationStatus;
	if (ev.verificationSources) event.verificationSources = ev.verificationSources;
	all.push(event);
}

// 1. Load standard sport JSON files (static fetchers)
for (const sport of sports) {
	const file = path.join(dataDir, `${sport}.json`);
	const json = readJsonIfExists(file);
	if (!json || !Array.isArray(json.tournaments)) continue;
	json.tournaments.forEach((t) => {
		(t.events || []).forEach((ev) => pushEvent(ev, sport, t.name));
	});
}

// 2. Auto-discover curated event configs from scripts/config/*.json
const configDir =
	process.env.SPORTSYNC_CONFIG_DIR ||
	path.resolve(process.cwd(), "scripts", "config");
if (fs.existsSync(configDir)) {
	const configFiles = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
	for (const file of configFiles) {
		const config = readJsonIfExists(path.join(configDir, file));
		if (!config || !Array.isArray(config.events)) continue;
		const sport =
			config.sport ||
			config.context?.split("-")[0] ||
			file.replace(".json", "").split("-")[0];
		const tournamentName = config.name || file.replace(".json", "");
		console.log(`  Curated config: ${file} → ${config.events.length} events (sport: ${sport})`);
		config.events.forEach((ev) => {
			if (config.context && !ev.context) ev.context = config.context;
			pushEvent(ev, sport, tournamentName);
		});
	}
}

// 3. Preserve AI work from the previous events.json.
// (a) AI-research events no static fetcher knows about must survive rebuilds.
// (b) Agent amendments to STATIC events (streaming corrections, verification
//     stamps) must also survive — the fetchers regenerate those events from
//     API data and would otherwise silently erase the corrections every hour.
// Dedupe key: sport|title|time.
const CARRY_FORWARD_FIELDS = [
	"streaming",
	"status", // a "cancelled"/"postponed" mark from the verify agent must survive the hourly rebuild
	"verifiedAt",
	"verificationStatus",
	"verificationSources",
];
// Fuzzy "same event" check, to de-dupe an ai-research event against a static one
// when their exact start times disagree — common for multi-day golf/stage events
// (ESPN says 04:00, the research agent wrote 06:00, so a sport|title|time key
// misses it and both survive). Same sport + ≥2 shared title words (or one title's
// words ⊆ the other) + overlapping date range ⇒ the same event.
const TITLE_STOP = new Set(["the", "at", "in", "of", "and", "a", "vs", "v"]);
function titleTokens(s) {
	return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
		.filter((w) => w.length > 1 && !TITLE_STOP.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w));
}
function sameFuzzyEvent(a, b) {
	if (!a || !b || a.sport !== b.sport) return false;
	const at = titleTokens(a.title), bset = new Set(titleTokens(b.title));
	const shared = at.filter((w) => bset.has(w));
	const subset = at.length > 0 && at.every((w) => bset.has(w));
	if (shared.length < 2 && !subset) return false;
	const s1 = Date.parse(a.time), e1 = a.endTime ? Date.parse(a.endTime) : s1;
	const s2 = Date.parse(b.time), e2 = b.endTime ? Date.parse(b.endTime) : s2;
	if (!Number.isFinite(s1) || !Number.isFinite(s2)) return false;
	return s1 <= e2 && s2 <= e1; // date ranges overlap
}

const previousEvents = readJsonIfExists(path.join(dataDir, "events.json"));
if (Array.isArray(previousEvents)) {
	const byKey = new Map(all.map((e) => [`${e.sport}|${e.title}|${e.time}`, e]));
	// A live match can drop out of the ESPN fetch the moment it kicks off; if we
	// rebuild purely from the fetch, a verified in-progress event vanishes from
	// the board mid-play (see (c) below for the rescue).
	const now = Date.now();
	const LIVE_GRACE_MS = 3 * 60 * 60 * 1000; // match length + buffer, for events with no endTime
	let preserved = 0;
	let carried = 0;
	let keptOnBoard = 0;
	for (const prev of previousEvents) {
		const key = `${prev.sport}|${prev.title}|${prev.time}`;
		const current = byKey.get(key);
		if (current) {
			// Same event re-fetched: keep agent amendments the fetcher lacks
			for (const field of CARRY_FORWARD_FIELDS) {
				const currentEmpty =
					current[field] == null ||
					(Array.isArray(current[field]) && current[field].length === 0);
				const prevHasValue =
					prev[field] != null &&
					(!Array.isArray(prev[field]) || prev[field].length > 0);
				if (currentEmpty && prevHasValue) {
					current[field] = prev[field];
					carried++;
				}
			}
			continue;
		}
		// (a) AI-research events no static fetcher knows about must survive rebuilds
		//     — UNLESS a static fetcher already covers the same multi-day event under
		//     a slightly different start time (e.g. the Genesis Scottish Open, which
		//     ESPN lists at 04:00 and the agent re-added at 06:00). Prefer the static
		//     one (it carries the ESPN field + tee times) and drop the AI duplicate.
		if (prev.source === "ai-research") {
			if (all.some((cur) => cur.source !== "ai-research" && sameFuzzyEvent(cur, prev))) {
				continue;
			}
			byKey.set(key, prev);
			all.push(prev);
			preserved++;
			continue;
		}
		// (c) A STATIC event missing from the latest fetch is normally rebuilt
		//     from source — but keep it when dropping it would make it silently
		//     vanish from the board at the wrong moment:
		//       • it's happening RIGHT NOW (ESPN stops returning a match once it
		//         goes live), or
		//       • an agent marked it cancelled/postponed — verify keeps such a
		//         match on the board as "Avlyst"/"Utsatt" instead of removing it,
		//         and that annotation must survive the hourly rebuild.
		//     A plain *future* static event missing from the fetch is still dropped
		//     (may be genuinely cancelled/rescheduled — we only keep it once an
		//     agent has confirmed the status, which also avoids reschedule ghosts).
		const start = Date.parse(prev.time);
		const end = prev.endTime ? Date.parse(prev.endTime) : start + LIVE_GRACE_MS;
		const isLiveNow = Number.isFinite(start) && start <= now && now <= end;
		const sticky = ["cancelled", "canceled", "postponed"].includes(String(prev.status || "").toLowerCase());
		const stickyStillRelevant = sticky && Number.isFinite(end) && now <= end + MS_PER_DAY;
		if (isLiveNow || stickyStillRelevant) {
			byKey.set(key, prev);
			all.push(prev);
			keptOnBoard++;
		}
	}
	if (preserved > 0) {
		console.log(`Preserved ${preserved} AI-research event(s) from previous build.`);
	}
	if (keptOnBoard > 0) {
		console.log(`Kept ${keptOnBoard} in-progress / cancelled static event(s) missing from the latest fetch.`);
	}
	if (carried > 0) {
		console.log(`Carried forward ${carried} agent amendment(s) onto re-fetched static events.`);
	}
}

// A previously-CONFIRMED channel (from the verify agent or a real tvkampen
// listing) must not be downgraded to a tentative guess on the next rebuild.
// e.g. verify resolves a World Cup match's "NRK / TV 2" to the actual "NRK";
// without this the hourly rebuild would overwrite it with the guess again.
const prevConfirmedStreaming = new Map();
const prevStreamingByKey = new Map();
if (Array.isArray(previousEvents)) {
	for (const prev of previousEvents) {
		const s = prev.streaming;
		if (Array.isArray(s) && s.length) {
			prevStreamingByKey.set(`${prev.sport}|${prev.title}|${prev.time}`, s);
			if (!s.some((c) => c && c.tentative)) {
				prevConfirmedStreaming.set(`${prev.sport}|${prev.title}|${prev.time}`, s);
			}
		}
	}
}

// Keep the most specific known viewing URL per broadcaster. A deep per-event URL
// (e.g. a verify-found NRK program page tv.nrk.no/serie/…, which opens the app on
// the actual broadcast) must survive the hourly rebuild — otherwise resolveStreaming
// re-derives the generic sport-section landing from the rights map and clobbers it.
// Match by host, prefer the deeper path.
function hostOf(u) { try { return new URL(u).host; } catch { return ""; } }
function pathDepth(u) { try { return new URL(u).pathname.replace(/\/+$/, "").split("/").filter(Boolean).length; } catch { return -1; } }
function withDeepUrls(streaming, prevStreaming) {
	if (!Array.isArray(streaming) || !Array.isArray(prevStreaming) || !prevStreaming.length) return streaming;
	const bestByHost = new Map();
	for (const p of prevStreaming) {
		if (!p || !p.url || p.tentative) continue;
		const h = hostOf(p.url);
		if (h && (!bestByHost.has(h) || pathDepth(p.url) > pathDepth(bestByHost.get(h)))) bestByHost.set(h, p.url);
	}
	return streaming.map((c) => {
		if (!c || !c.url) return c;
		const deeper = bestByHost.get(hostOf(c.url));
		return (deeper && pathDepth(deeper) > pathDepth(c.url)) ? { ...c, url: deeper } : c;
	});
}

// A bare broadcaster homepage → its sport/live section (closer to the broadcast,
// likelier to be claimed by the app's universal links). Only exact homepages are
// rewritten, so a deeper per-event URL is never downgraded. Catches agent-set
// URLs that bypass the rights map (e.g. a verified WC channel written as
// "https://tv.nrk.no").
const LANDING_UPGRADE = {
	"https://tv.nrk.no": "https://tv.nrk.no/direkte",
	"https://play.tv2.no": "https://play.tv2.no/sport",
};
function upgradeLanding(streaming) {
	if (!Array.isArray(streaming)) return streaming;
	return streaming.map((c) => {
		if (!c || !c.url) return c;
		const bare = c.url.replace(/\/+$/, "");
		return LANDING_UPGRADE[bare] ? { ...c, url: LANDING_UPGRADE[bare] } : c;
	});
}

// Resolve streaming to Norwegian channels — prefer REAL tvkampen.com listings
// for football, fall back to the deterministic rights map (never FOX/ESPN).
const tvListings = readJsonIfExists(path.join(dataDir, "tv-listings.json"))?.listings || [];
let fromTv = 0;
let keptConfirmed = 0;
for (const e of all) {
	const before = e.streaming;
	const key = `${e.sport}|${e.title}|${e.time}`;
	const resolved = resolveStreaming(e, tvListings);
	const resolvedTentative = !resolved.length || resolved.some((c) => c && c.tentative);
	const priorConfirmed = prevConfirmedStreaming.get(key);
	if (resolvedTentative && priorConfirmed) {
		e.streaming = priorConfirmed; // keep the confirmed channel, don't re-guess
		keptConfirmed++;
	} else {
		e.streaming = resolved;
	}
	// Upgrade generic landing URLs to a deeper per-event URL we already knew,
	// then lift any bare homepage to the broadcaster's sport/live section.
	e.streaming = upgradeLanding(withDeepUrls(e.streaming, prevStreamingByKey.get(key)));
	if (e.sport === "football" && e.streaming !== before && e.streaming.length && tvListings.length) {
		// count football events whose channel came from a real listing match
		fromTv++;
	}
}
if (tvListings.length) {
	console.log(`Streaming: ${tvListings.length} tvkampen listing(s) available for football matching.`);
}
if (keptConfirmed > 0) {
	console.log(`Kept ${keptConfirmed} confirmed channel(s) over a tentative re-guess.`);
}

// Relevance filter — keep only what the user actually follows, so the agenda
// isn't cluttered with, e.g., minor tennis events with no tracked player.
const interests = readJsonIfExists(path.join(configDir, "interests.json")) || {};
const followBroadly = new Set(
	(interests.followBroadly || ["football", "golf", "f1", "cycling", "chess", "esports", "biathlon", "cross-country", "alpine", "nordic", "ski jumping"]).map((s) => s.toLowerCase())
);
const trackedEntities = [
	...(interests.alwaysTrack?.teams || []),
	...(interests.alwaysTrack?.athletes || []),
	...(interests.alwaysTrack?.tournaments || []),
];

function isRelevant(e) {
	if (followBroadly.has((e.sport || "").toLowerCase())) return true;
	if (e.norwegian || e.isFavorite || (e.importance || 0) >= 4 || e.source === "ai-research") return true;
	const hay = [e.title, e.tournament, e.homeTeam, e.awayTeam,
		...(e.norwegianPlayers || []).map((p) => p.name || p),
		...(e.participants || [])].join(" ");
	return matchInterest(hay, trackedEntities) != null;
}

// Keep events from the last 14 days + upcoming, and only those we follow
const cutoff = Date.now() - 14 * MS_PER_DAY;
let droppedIrrelevant = 0;
const kept = all.filter((e) => {
	if (!e.time) return false;
	const relevantTime = e.endTime ? Date.parse(e.endTime) : Date.parse(e.time);
	if (relevantTime < cutoff) return false;
	if (!isRelevant(e)) { droppedIrrelevant++; return false; }
	return true;
});
kept.sort((a, b) => new Date(a.time) - new Date(b.time));
// Tag must-watch deterministically from interests.json — the single source of
// truth for "you'll get a reminder for this". The client reads e.mustWatch to
// mark rows; build-ics reads it to decide VALARM + the must-watch feed.
let mustWatchCount = 0;
for (const e of kept) {
	e.mustWatch = mustWatchEntity(e, interests) != null;
	if (e.mustWatch) mustWatchCount++;
}
fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(kept, null, 2));
console.log(
	`Aggregated ${kept.length} events (${mustWatchCount} must-watch; filtered ${all.length - kept.length} past/irrelevant, of which ${droppedIrrelevant} off-interest) into events.json`
);

// Publish tracked.json + interests.json so the dashboard's "Hva vi følger"
// surface can show both what you asked for and what the AI discovered.
for (const name of ["tracked.json", "interests.json"]) {
	const src = path.join(configDir, name);
	if (fs.existsSync(src)) {
		fs.copyFileSync(src, path.join(dataDir, name));
		console.log(`Published ${name} to docs/data/`);
	}
}
