#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, MS_PER_DAY } from "./lib/helpers.js";
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
	"verifiedAt",
	"verificationStatus",
	"verificationSources",
];
const previousEvents = readJsonIfExists(path.join(dataDir, "events.json"));
if (Array.isArray(previousEvents)) {
	const byKey = new Map(all.map((e) => [`${e.sport}|${e.title}|${e.time}`, e]));
	let preserved = 0;
	let carried = 0;
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
		if (prev.source !== "ai-research") continue;
		byKey.set(key, prev);
		all.push(prev);
		preserved++;
	}
	if (preserved > 0) {
		console.log(`Preserved ${preserved} AI-research event(s) from previous build.`);
	}
	if (carried > 0) {
		console.log(`Carried forward ${carried} agent amendment(s) onto re-fetched static events.`);
	}
}

// Resolve streaming to Norwegian channels — prefer REAL tvkampen.com listings
// for football, fall back to the deterministic rights map (never FOX/ESPN).
const tvListings = readJsonIfExists(path.join(dataDir, "tv-listings.json"))?.listings || [];
let fromTv = 0;
for (const e of all) {
	const before = e.streaming;
	e.streaming = resolveStreaming(e, tvListings);
	if (e.sport === "football" && e.streaming !== before && e.streaming.length && tvListings.length) {
		// count football events whose channel came from a real listing match
		fromTv++;
	}
}
if (tvListings.length) {
	console.log(`Streaming: ${tvListings.length} tvkampen listing(s) available for football matching.`);
}

// Relevance filter — keep only what the user actually follows, so the agenda
// isn't cluttered with, e.g., minor tennis events with no tracked player.
const interests = readJsonIfExists(path.join(configDir, "interests.json")) || {};
const followBroadly = new Set(
	(interests.followBroadly || ["football", "golf", "f1", "cycling", "chess", "esports", "biathlon", "cross-country", "alpine", "nordic", "ski jumping"]).map((s) => s.toLowerCase())
);
const trackTeams = (interests.alwaysTrack?.teams || []).map((t) => t.toLowerCase());
const trackAthletes = (interests.alwaysTrack?.athletes || []).map((a) => a.toLowerCase());
const trackTournaments = (interests.alwaysTrack?.tournaments || []).map((t) => t.toLowerCase());

function isRelevant(e) {
	if (followBroadly.has((e.sport || "").toLowerCase())) return true;
	if (e.norwegian || e.isFavorite || (e.importance || 0) >= 4 || e.source === "ai-research") return true;
	const hay = [e.title, e.tournament, e.homeTeam, e.awayTeam,
		...(e.norwegianPlayers || []).map((p) => p.name || p),
		...(e.participants || [])].join(" ").toLowerCase();
	if (trackTournaments.some((t) => hay.includes(t))) return true;
	if (trackTeams.some((t) => hay.includes(t))) return true;
	if (trackAthletes.some((a) => hay.includes(a))) return true;
	return false;
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
fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(kept, null, 2));
console.log(
	`Aggregated ${kept.length} events (filtered ${all.length - kept.length} past/irrelevant, of which ${droppedIrrelevant} off-interest) into events.json`
);

// Publish tracked.json so the dashboard's "Hva vi følger" surface can read it
const trackedSrc = path.join(configDir, "tracked.json");
if (fs.existsSync(trackedSrc)) {
	fs.copyFileSync(trackedSrc, path.join(dataDir, "tracked.json"));
	console.log("Published tracked.json to docs/data/");
}
