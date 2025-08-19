#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { rootDataPath } from "./lib/helpers.js";

const GRACE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes grace window
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
	if (ts < now) {
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
}
console.log(`Validated ${events.length} events with ${errors} error(s).`);
if (errors) process.exit(1);
