#!/usr/bin/env node
// Generate one iCalendar (.ics) from aggregated events.json:
//   events.ics — everything you follow; a reminder (VALARM) is attached only to
//                must-watch events, so the calendar has it all but only the
//                things you follow ping you.
// Must-watch is computed deterministically from the user-owned interests.json
// (notifyEntities/mustWatchEntity) — never from an event's own isFavorite/importance.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { rootDataPath, readJsonIfExists, mustWatchEntity } from "./lib/helpers.js";

const dataDir = rootDataPath();
const configDir = process.env.SPORTSYNC_CONFIG_DIR || path.resolve(process.cwd(), "scripts", "config");
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

const interests = readJsonIfExists(path.join(configDir, "interests.json")) || {};
const leadMinutes = Number(interests?.notify?.leadMinutes) > 0
	? Math.round(Number(interests.notify.leadMinutes))
	: 30;

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

/** Build the VEVENT lines for one event; attach a VALARM when `withAlarm`. */
function vevent(ev, withAlarm) {
	const dtStart = formatDateTime(ev.time);
	const uidSeed = `${ev.sport}|${ev.tournament}|${ev.title}|${ev.time}`;
	const uid = crypto.createHash("sha1").update(uidSeed).digest("hex") + "@sportsync";
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
	if (withAlarm) {
		lines.push("BEGIN:VALARM");
		lines.push("ACTION:DISPLAY");
		lines.push(`DESCRIPTION:${summary}`);
		lines.push(`TRIGGER:-PT${leadMinutes}M`);
		lines.push("END:VALARM");
	}
	lines.push("END:VEVENT");
	return lines;
}

/** Wrap a set of events into a full VCALENDAR string. */
function calendar(list, { alarms }) {
	const ics = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//SportSync//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
	];
	for (const ev of list) {
		if (!ev.time) continue; // skip invalid
		ics.push(...vevent(ev, alarms && ev._mustWatch));
	}
	ics.push("END:VCALENDAR");
	return ics.join("\n");
}

// Prefer the flag build-events already persisted; recompute only if absent
// (standalone runs / older data) so this stays the same deterministic set.
for (const ev of events) ev._mustWatch = ev.mustWatch != null ? ev.mustWatch : mustWatchEntity(ev, interests) != null;
const mustWatchCount = events.filter((ev) => ev.time && ev._mustWatch).length;

// One calendar: everything you follow, with a reminder (VALARM) only on the
// must-watch events. Non-must-watch events are in the calendar but stay silent.
fs.writeFileSync(path.join(dataDir, "events.ics"), calendar(events, { alarms: true }));
console.log(
	`Wrote events.ics (${events.length} events, ${mustWatchCount} with a -${leadMinutes}m reminder).`
);
