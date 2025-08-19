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
			all.push({
				sport,
				tournament: t.name,
				title: ev.title,
				time: ev.time,
				venue: ev.venue,
				meta: ev.meta,
				norwegian: ev.norwegian || false,
				streaming: ev.streaming || [],
				participants: ev.participants || [],
			});
		});
	});
}
// Keep only future events (allow 2 minute grace window)
const now = Date.now() - 2 * 60 * 1000;
const future = all.filter((e) => e.time && Date.parse(e.time) >= now);
future.sort((a, b) => new Date(a.time) - new Date(b.time));
fs.writeFileSync(
	path.join(dataDir, "events.json"),
	JSON.stringify(future, null, 2)
);
console.log(`Aggregated ${future.length} future events (filtered ${all.length - future.length} past) into events.json`);
