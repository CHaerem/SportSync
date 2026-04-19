#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath, MS_PER_DAY } from "./lib/helpers.js";
import { filterEventsByFocusTeam, loadUserContext } from "./lib/focus-team-filter.js";

const dataDir = rootDataPath();
const userContext = loadUserContext();

// Auto-discover sport files by convention: any JSON with a { tournaments: [...] } structure
const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
const sports = [];
for (const f of dataFiles) {
	const data = readJsonIfExists(path.join(dataDir, f));
	if (data && Array.isArray(data.tournaments)) {
		sports.push(f.replace('.json', ''));
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
	// Esports match metadata: format (Bo1/Bo3), stage, result
	if (ev.format) event.format = ev.format;
	if (ev.stage) event.stage = ev.stage;
	if (ev.result) event.result = ev.result;
	if (ev.context) event.context = ev.context;
	if (ev.importance != null) event.importance = ev.importance;
	if (ev.importanceReason) event.importanceReason = ev.importanceReason;
	if (ev.summary) event.summary = ev.summary;
	if (ev.tags && ev.tags.length > 0) event.tags = ev.tags;
	if (ev.norwegianRelevance != null) event.norwegianRelevance = ev.norwegianRelevance;
	if (ev.enrichedAt) event.enrichedAt = ev.enrichedAt;
	if (ev._enrichHash) event._enrichHash = ev._enrichHash;
	// Tournament-level fields (synthesized from bracket data)
	if (ev._isTournament) event._isTournament = ev._isTournament;
	if (ev._bracketId) event._bracketId = ev._bracketId;
	if (ev.focusTeam) event.focusTeam = ev.focusTeam;
	if (ev.tier) event.tier = ev.tier;
	if (ev.prizePool) event.prizePool = ev.prizePool;
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
// Config prefixes whose events are already included via a sport fetcher's output
// (e.g., cycling fetcher reads cycling-*.json → docs/data/cycling.json, which Step 1 loads).
// Skip these to avoid duplicating events.
const FETCHER_HANDLED_PREFIXES = ['cycling-'];
const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
if (fs.existsSync(configDir)) {
	const configFiles = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
	for (const file of configFiles) {
		if (FETCHER_HANDLED_PREFIXES.some(prefix => file.startsWith(prefix))) {
			console.log(`  Curated config: ${file} → skipped (handled by fetcher)`);
			continue;
		}
		const config = readJsonIfExists(path.join(configDir, file));
		if (!config || !Array.isArray(config.events)) continue;
		const sport = config.sport || config.context?.split("-")[0] || file.replace(".json", "").split("-")[0];
		const tournamentName = config.name || file.replace(".json", "");
		// Focus-team filter: only keep events involving focus teams (esports only)
		const { filtered: configEvents, removedCount: focusRemoved } = filterEventsByFocusTeam(config.events, config, userContext);
		if (focusRemoved > 0) {
			console.log(`  Curated config: ${file} → ${config.events.length} events, focus-team filtered to ${configEvents.length} (sport: ${sport})`);
		} else {
			console.log(`  Curated config: ${file} → ${config.events.length} events (sport: ${sport})`);
		}
		configEvents.forEach((ev) => {
			if (config.context && !ev.context) ev.context = config.context;
			pushEvent(ev, sport, tournamentName);
		});

		// 2b. Synthesize tournament-level events from config.tournaments[]
		// When individual match events have been pruned but the tournament is still active,
		// this ensures a visible event exists for the bracket visualization to attach to.
		if (Array.isArray(config.tournaments)) {
			const MS_PER_HOUR = 60 * 60 * 1000;
			for (const t of config.tournaments) {
				if (!t.startDate || !t.endDate || !t.name) continue;
				const startDate = new Date(t.startDate + "T00:00:00Z");
				const endDate = new Date(t.endDate + "T23:59:59Z");
				// Skip tournaments that ended more than 6 hours ago
				if (endDate.getTime() < Date.now() - 6 * MS_PER_HOUR) continue;
				// Check if any existing event already covers this tournament
				const tNameLower = t.name.toLowerCase();
				const tFirstWord = tNameLower.split(" ")[0];
				const alreadyCovered = all.some((ev) => {
					if (ev.sport !== sport) return false;
					const title = (ev.title || "").toLowerCase();
					const evTournament = (ev.tournament || "").toLowerCase();
					return title.includes(tNameLower) || title.includes(tFirstWord) ||
						evTournament.includes(tNameLower) || evTournament.includes(tFirstWord);
				});
				if (alreadyCovered) continue;
				// Synthesize a tournament-level event
				const synthesized = {
					title: t.name,
					time: startDate.toISOString(),
					endTime: endDate.toISOString(),
					venue: t.venue || null,
					norwegian: !!(config.norwegianTeams?.length || config.norwegianAthletes?.length),
					norwegianPlayers: (config.norwegianAthletes || []).map((name) =>
						typeof name === "string" ? { name } : name
					),
					streaming: Array.isArray(t.streaming) ? t.streaming : [],
					_isTournament: true,
					_bracketId: t.id || null,
					focusTeam: t.focusTeam || null,
					tier: t.tier || null,
					prizePool: t.prizePool || null,
				};
				if (config.context) synthesized.context = config.context;
				pushEvent(synthesized, sport, tournamentName);
				console.log(`    Synthesized tournament event: ${t.name} (${t.startDate} to ${t.endDate})`);
			}
		}
	}
}
// Read previous events.json to carry forward enrichment data
const previousEventsPath = path.join(dataDir, "events.json");
const previousEvents = readJsonIfExists(previousEventsPath);
const enrichmentMap = new Map();
if (Array.isArray(previousEvents)) {
	for (const prev of previousEvents) {
		if (prev.enrichedAt) {
			const key = `${prev.sport}|${prev.tournament}|${prev.title}|${prev.time}`;
			enrichmentMap.set(key, {
				importance: prev.importance,
				importanceReason: prev.importanceReason,
				summary: prev.summary,
				tags: prev.tags,
				norwegianRelevance: prev.norwegianRelevance,
				enrichedAt: prev.enrichedAt,
				_enrichHash: prev._enrichHash,
			});
		}
	}
	if (enrichmentMap.size > 0) {
		console.log(`Carrying forward enrichment for ${enrichmentMap.size} events from previous build.`);
	}
}

// Merge enrichment into new events
for (const event of all) {
	const key = `${event.sport}|${event.tournament}|${event.title}|${event.time}`;
	const prev = enrichmentMap.get(key);
	if (prev && !event.enrichedAt) {
		if (prev.importance != null) event.importance = prev.importance;
		if (prev.importanceReason) event.importanceReason = prev.importanceReason;
		if (prev.summary) event.summary = prev.summary;
		if (prev.tags?.length > 0) event.tags = prev.tags;
		if (prev.norwegianRelevance != null) event.norwegianRelevance = prev.norwegianRelevance;
		if (prev.enrichedAt) event.enrichedAt = prev.enrichedAt;
		if (prev._enrichHash) event._enrichHash = prev._enrichHash;
	}
}

// Keep events from the last 14 days + upcoming (for day navigator history)
const now = Date.now() - 14 * MS_PER_DAY;
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

// 5. Extract tournament bracket data from curated configs and write to brackets.json
const brackets = {};
if (fs.existsSync(configDir)) {
	const configFiles = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
	for (const file of configFiles) {
		const config = readJsonIfExists(path.join(configDir, file));
		if (!config?.tournaments) continue;
		for (const t of config.tournaments) {
			if (t.bracket && t.id) {
				brackets[t.id] = {
					name: t.name,
					venue: t.venue,
					startDate: t.startDate,
					endDate: t.endDate,
					format: t.format,
					tier: t.tier,
					prizePool: t.prizePool,
					focusTeam: t.focusTeam,
					focusTeamRoster: t.focusTeamRoster,
					coach: t.coach,
					bracket: t.bracket,
					_lastUpdated: config.lastResearched || null,
				};
			}
		}
	}
}
if (Object.keys(brackets).length > 0) {
	fs.writeFileSync(
		path.join(dataDir, "brackets.json"),
		JSON.stringify(brackets, null, 2)
	);
	console.log(`Wrote ${Object.keys(brackets).length} tournament bracket(s) to brackets.json`);
}
