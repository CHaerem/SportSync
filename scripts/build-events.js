#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, MS_PER_HOUR } from "./lib/helpers.js";

const dataDir = rootDataPath();
const sports = ["football", "golf", "tennis", "f1", "chess", "esports"];
const all = [];

function pushEvent(ev, sport, tournament) {
	const event = {
		sport,
		tournament: tournament,
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
	if (ev.context) event.context = ev.context;
	if (ev.importance != null) event.importance = ev.importance;
	if (ev.importanceReason) event.importanceReason = ev.importanceReason;
	if (ev.summary) event.summary = ev.summary;
	if (ev.tags && ev.tags.length > 0) event.tags = ev.tags;
	if (ev.norwegianRelevance != null) event.norwegianRelevance = ev.norwegianRelevance;
	if (ev.enrichedAt) event.enrichedAt = ev.enrichedAt;
	all.push(event);
}

// 1. Load standard sport JSON files
for (const sport of sports) {
	const file = path.join(dataDir, `${sport}.json`);
	const json = readJsonIfExists(file);
	if (!json || !Array.isArray(json.tournaments)) continue;
	json.tournaments.forEach((t) => {
		(t.events || []).forEach((ev) => pushEvent(ev, sport, t.name));
	});
}

// 2. Auto-discover curated event configs from scripts/config/*.json
const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
if (fs.existsSync(configDir)) {
	const configFiles = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
	for (const file of configFiles) {
		const config = readJsonIfExists(path.join(configDir, file));
		if (!config || !Array.isArray(config.events)) continue;
		const sport = config.context?.split("-")[0] || file.replace(".json", "").split("-")[0];
		const tournamentName = config.name || file.replace(".json", "");
		console.log(`  Curated config: ${file} → ${config.events.length} events (sport: ${sport})`);
		config.events.forEach((ev) => {
			if (config.context && !ev.context) ev.context = config.context;
			pushEvent(ev, sport, tournamentName);
		});
	}
}
// Keep events that are ongoing or upcoming (use endTime for multi-day events)
const now = Date.now() - 6 * MS_PER_HOUR;
const future = all.filter((e) => {
	if (!e.time) return false;
	const relevantTime = e.endTime ? Date.parse(e.endTime) : Date.parse(e.time);
	return relevantTime >= now;
});
future.sort((a, b) => new Date(a.time) - new Date(b.time));
fs.writeFileSync(
	path.join(dataDir, "events.json"),
	JSON.stringify(future, null, 2)
);
console.log(`Aggregated ${future.length} future events (filtered ${all.length - future.length} past) into events.json`);
