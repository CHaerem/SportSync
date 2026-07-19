// build-ics.js: calendar export emits valid VEVENT blocks.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// Mirror build-ics.js formatDateTime: UTC datetime stamp YYYYMMDDTHHMMSSZ.
function stamp(iso) {
	const d = new Date(iso);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function buildIcs(events) {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-ics-"));
	fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(events));
	execFileSync("node", ["scripts/build-ics.js"], {
		env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir },
	});
	const ics = fs.readFileSync(path.join(dataDir, "events.ics"), "utf-8");
	fs.rmSync(dataDir, { recursive: true, force: true });
	return ics;
}

describe("build-ics", () => {
	it("emits valid VEVENT lines for events", () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const ics = buildIcs([{ sport: "golf", tournament: "PGA", title: "The Open", time: future, venue: "St Andrews" }]);
		expect(ics).toContain("BEGIN:VCALENDAR");
		expect(ics).toContain("BEGIN:VEVENT");
		expect(ics).toContain("END:VEVENT");
		expect(ics).toMatch(/SUMMARY:.*The Open/);
	});

	it("emits DTEND from endTime as a datetime block (WP-123)", () => {
		const start = new Date(Date.now() + 86400000);
		const end = new Date(start.getTime() + 5 * 3600000); // +5h stage-length block
		const ics = buildIcs([
			{ sport: "cycling", tournament: "Tour de France", title: "Etappe 3 (fjell)", time: start.toISOString(), endTime: end.toISOString() },
		]);
		expect(ics).toContain(`DTSTART:${stamp(start.toISOString())}`);
		expect(ics).toContain(`DTEND:${stamp(end.toISOString())}`);
		// DTEND follows DTSTART directly, before any LOCATION/SUMMARY.
		expect(ics.indexOf("DTSTART:")).toBeLessThan(ics.indexOf("DTEND:"));
	});

	it("omits DTEND for events without endTime (output byte-unchanged)", () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const ics = buildIcs([{ sport: "football", tournament: "PL", title: "Arsenal v Spurs", time: future }]);
		expect(ics).toContain("DTSTART:");
		expect(ics).not.toContain("DTEND");
	});

	it("renders a multi-day event as a block spanning start→end days", () => {
		// Golf: 4-day tournament — start and end fall on different UTC dates.
		const ics = buildIcs([
			{ sport: "golf", tournament: "PGA Tour", title: "Corales Puntacana Championship", time: "2026-07-16T04:00:00.000Z", endTime: "2026-07-19T20:00:00.000Z" },
		]);
		expect(ics).toContain("DTSTART:20260716T040000Z");
		expect(ics).toContain("DTEND:20260719T200000Z");
		// The block genuinely spans multiple days: end date != start date.
		expect(ics).toMatch(/DTSTART:20260716T\d{6}Z[\s\S]*DTEND:20260719T\d{6}Z/);
	});

	it("skips a DTEND that would be at or before DTSTART (no invalid block)", () => {
		const start = new Date(Date.now() + 86400000);
		const ics = buildIcs([
			{ sport: "chess", tournament: "Norway Chess", title: "Runde 1", time: start.toISOString(), endTime: start.toISOString() },
		]);
		expect(ics).toContain("DTSTART:");
		expect(ics).not.toContain("DTEND");
	});
});
