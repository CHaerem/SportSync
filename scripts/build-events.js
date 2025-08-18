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
all.sort((a, b) => new Date(a.time) - new Date(b.time));
fs.writeFileSync(
	path.join(dataDir, "events.json"),
	JSON.stringify(all, null, 2)
);
console.log(`Aggregated ${all.length} events into events.json`);
