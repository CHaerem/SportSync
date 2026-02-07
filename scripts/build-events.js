#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { readJsonIfExists, rootDataPath } from "./lib/helpers.js";

const dataDir = rootDataPath();
const sports = ["football", "golf", "tennis", "f1", "chess", "esports"];
const all = [];
for (const sport of sports) {
	const file = path.join(dataDir, `${sport}.json`);
	const json = readJsonIfExists(file);
	if (!json || !Array.isArray(json.tournaments)) continue;
	json.tournaments.forEach((t) => {
		(t.events || []).forEach((ev) => {
			const event = {
				sport,
				tournament: t.name,
				title: ev.title,
				time: ev.time,
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
			// Preserve AI enrichment fields if present
			if (ev.importance != null) event.importance = ev.importance;
			if (ev.importanceReason) event.importanceReason = ev.importanceReason;
			if (ev.summary) event.summary = ev.summary;
			if (ev.tags && ev.tags.length > 0) event.tags = ev.tags;
			if (ev.norwegianRelevance != null) event.norwegianRelevance = ev.norwegianRelevance;
			if (ev.enrichedAt) event.enrichedAt = ev.enrichedAt;
			all.push(event);
		});
	});
}
// Keep events that started up to 6 hours ago (ongoing matches/rounds)
const now = Date.now() - 6 * 60 * 60 * 1000;
const future = all.filter((e) => e.time && Date.parse(e.time) >= now);
future.sort((a, b) => new Date(a.time) - new Date(b.time));
fs.writeFileSync(
	path.join(dataDir, "events.json"),
	JSON.stringify(future, null, 2)
);
console.log(`Aggregated ${future.length} future events (filtered ${all.length - future.length} past) into events.json`);
