#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { rootDataPath } from "./lib/helpers.js";

const GRACE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours — matches build-events.js ongoing event window
const dataDir = rootDataPath();
const file = path.join(dataDir, "events.json");
if (!fs.existsSync(file)) {
	console.error("events.json not found. Run build-events.js first.");
	process.exit(1);
}
const raw = fs.readFileSync(file, "utf-8");
let events;
try {
	events = JSON.parse(raw);
} catch (e) {
	console.error("Invalid JSON:", e.message);
	process.exit(1);
}
if (!Array.isArray(events)) {
	console.error("events.json root must be an array");
	process.exit(1);
}

let errors = 0;
const now = Date.now() - GRACE_WINDOW_MS; // allow tiny grace window
const seenKeys = new Set();
for (const ev of events) {
	const key = ev.sport + ev.tournament + ev.title + ev.time;
	if (seenKeys.has(key)) {
		console.warn("Duplicate event:", key);
	}
	seenKeys.add(key);
	if (!ev.time) {
		console.warn("Missing time for", key);
		errors++;
		continue;
	}
	const ts = Date.parse(ev.time);
	if (isNaN(ts)) {
		console.warn("Invalid time format for", key, ev.time);
		errors++;
	}
	const endTs = ev.endTime ? Date.parse(ev.endTime) : ts;
	if (endTs < now) {
		console.warn("Past event found (will fail):", key, ev.time);
		errors++;
	}
	if (!ev.title) {
		console.warn("Missing title for", key);
		errors++;
	}
	if (!ev.sport) {
		console.warn("Missing sport for", key);
		errors++;
	}
	// Validate enrichment fields if present
	if (ev.importance != null) {
		if (typeof ev.importance !== "number" || ev.importance < 1 || ev.importance > 5) {
			console.warn("Invalid importance (must be 1-5) for", key, ev.importance);
			errors++;
		}
	}
	if (ev.norwegianRelevance != null) {
		if (typeof ev.norwegianRelevance !== "number" || ev.norwegianRelevance < 1 || ev.norwegianRelevance > 5) {
			console.warn("Invalid norwegianRelevance (must be 1-5) for", key, ev.norwegianRelevance);
			errors++;
		}
	}
	if (ev.tags != null && !Array.isArray(ev.tags)) {
		console.warn("Invalid tags (must be array) for", key);
		errors++;
	}
	// Timezone bleed check: endTime crossing midnight in CET but not UTC
	if (ev.endTime) {
		const endUTC = new Date(ev.endTime);
		const endCET = new Date(endUTC.getTime() + 3600000); // UTC+1
		const endUTCDay = endUTC.toISOString().slice(0, 10);
		const endCETDay = endCET.toISOString().slice(0, 10);
		if (endUTCDay !== endCETDay) {
			console.warn(`Timezone bleed: ${key} endTime ${ev.endTime} crosses midnight in CET (${endCETDay})`);
		}
	}
}
let enrichedCount = events.filter(e => e.importance != null).length;
console.log(`Validated ${events.length} events with ${errors} error(s). ${enrichedCount} enriched.`);
if (errors) process.exit(1);
