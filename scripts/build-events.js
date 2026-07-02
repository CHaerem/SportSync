#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, MS_PER_DAY } from "./lib/helpers.js";

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

// 3. Preserve AI-research events from the previous events.json.
// The research agent appends events with source: "ai-research" that no static
// fetcher knows about — a rebuild must not erase them. Dedupe key: sport|title|time.
const previousEvents = readJsonIfExists(path.join(dataDir, "events.json"));
if (Array.isArray(previousEvents)) {
	const seen = new Set(all.map((e) => `${e.sport}|${e.title}|${e.time}`));
	let preserved = 0;
	for (const prev of previousEvents) {
		if (prev.source !== "ai-research") continue;
		const key = `${prev.sport}|${prev.title}|${prev.time}`;
		if (seen.has(key)) continue;
		seen.add(key);
		all.push(prev);
		preserved++;
	}
	if (preserved > 0) {
		console.log(`Preserved ${preserved} AI-research event(s) from previous build.`);
	}
}

// Keep events from the last 14 days + upcoming
const cutoff = Date.now() - 14 * MS_PER_DAY;
const kept = all.filter((e) => {
	if (!e.time) return false;
	const relevantTime = e.endTime ? Date.parse(e.endTime) : Date.parse(e.time);
	return relevantTime >= cutoff;
});
kept.sort((a, b) => new Date(a.time) - new Date(b.time));
fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(kept, null, 2));
console.log(
	`Aggregated ${kept.length} events (filtered ${all.length - kept.length} past) into events.json`
);

// Publish tracked.json so the dashboard's "Hva vi følger" surface can read it
const trackedSrc = path.join(configDir, "tracked.json");
if (fs.existsSync(trackedSrc)) {
	fs.copyFileSync(trackedSrc, path.join(dataDir, "tracked.json"));
	console.log("Published tracked.json to docs/data/");
}
