#!/usr/bin/env node
// Generate an iCalendar (.ics) file from aggregated events.json
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { rootDataPath } from "./lib/helpers.js";

const dataDir = rootDataPath();
const eventsFile = path.join(dataDir, "events.json");
if (!fs.existsSync(eventsFile)) {
	console.error("events.json not found. Run build-events.js first.");
	process.exit(1);
}
let events;
try {
	events = JSON.parse(fs.readFileSync(eventsFile, "utf-8"));
} catch (e) {
	console.error("Failed to parse events.json:", e.message);
	process.exit(1);
}
if (!Array.isArray(events)) {
	console.error("events.json must be an array");
	process.exit(1);
}

function formatDateTime(dt) {
	const d = new Date(dt);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
		d.getUTCDate()
	)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(
		d.getUTCSeconds()
	)}Z`;
}

function esc(str = "") {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/\n/g, "\\n")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;");
}

const nowStamp = formatDateTime(new Date().toISOString());
let ics = [];
ics.push("BEGIN:VCALENDAR");
ics.push("VERSION:2.0");
ics.push("PRODID:-//SportSync//EN");
ics.push("CALSCALE:GREGORIAN");
ics.push("METHOD:PUBLISH");

for (const ev of events) {
	if (!ev.time) continue; // skip invalid
	const dtStart = formatDateTime(ev.time);
	const uidSeed = `${ev.sport}|${ev.tournament}|${ev.title}|${ev.time}`;
	const uid =
		crypto.createHash("sha1").update(uidSeed).digest("hex") + "@sportsync";
	const summary = esc(ev.title);
	const lines = [];
	lines.push("BEGIN:VEVENT");
	lines.push(`UID:${uid}`);
	lines.push(`DTSTAMP:${nowStamp}`);
	lines.push(`DTSTART:${dtStart}`);
	if (ev.venue) lines.push(`LOCATION:${esc(ev.venue)}`);
	const parts = [];
	if (ev.tournament) parts.push(ev.tournament);
	if (ev.meta && ev.meta !== ev.tournament) parts.push(ev.meta);
	if (Array.isArray(ev.participants) && ev.participants.length)
		parts.push("Participants: " + ev.participants.join(", "));
	if (ev.streaming && ev.streaming.length)
		parts.push("Streaming: " + ev.streaming.map((s) => s.platform).join("/"));
	if (ev.norwegian) parts.push("Norwegian focus");
	if (ev.importance) parts.push(`Importance: ${ev.importance}/5`);
	if (ev.summary) parts.push(ev.summary);
	if (ev.tags && ev.tags.length) parts.push("Tags: " + ev.tags.join(", "));
	const description = esc(parts.join("\n"));
	lines.push(`SUMMARY:${summary}`);
	if (description) lines.push(`DESCRIPTION:${description}`);
	lines.push("END:VEVENT");
	ics.push(...lines);
}

ics.push("END:VCALENDAR");

const outFile = path.join(dataDir, "events.ics");
fs.writeFileSync(outFile, ics.join("\n"));
console.log(`Wrote ${outFile} with ${events.length} events.`);
