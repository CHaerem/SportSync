import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

let tmpDir;

function futureTime(hoursAhead = 24) {
	return new Date(Date.now() + hoursAhead * 3600000).toISOString();
}

function writeEvents(events) {
	fs.writeFileSync(path.join(tmpDir, "events.json"), JSON.stringify(events));
}

function runValidate(captureStderr = false) {
	const cmd = captureStderr
		? "node scripts/validate-events.js 2>&1"
		: "node scripts/validate-events.js";
	return execSync(cmd, {
		cwd: process.cwd(),
		env: { ...process.env, SPORTSYNC_DATA_DIR: tmpDir },
	}).toString();
}

describe("validate-events.js — extended", () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-ext-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("passes with empty events array", () => {
		writeEvents([]);
		const output = runValidate();
		expect(output).toContain("0 error(s)");
	});

	it("passes with multiple valid events", () => {
		writeEvents([
			{ sport: "football", title: "Match A", time: futureTime(10), tournament: "PL" },
			{ sport: "golf", title: "Tournament B", time: futureTime(20), tournament: "PGA" },
			{ sport: "chess", title: "Event C", time: futureTime(30), tournament: "FIDE" },
		]);
		const output = runValidate();
		expect(output).toContain("3 events");
		expect(output).toContain("0 error(s)");
	});

	it("fails on missing time", () => {
		writeEvents([{ sport: "football", title: "No Time" }]);
		expect(() => runValidate()).toThrow();
	});

	it("fails on invalid time format", () => {
		writeEvents([{ sport: "football", title: "Bad Time", time: "not-a-date", tournament: "PL" }]);
		expect(() => runValidate()).toThrow();
	});

	it("fails on missing title", () => {
		writeEvents([{ sport: "football", time: futureTime(), tournament: "PL" }]);
		expect(() => runValidate()).toThrow();
	});

	it("fails on missing sport", () => {
		writeEvents([{ title: "No Sport", time: futureTime(), tournament: "PL" }]);
		expect(() => runValidate()).toThrow();
	});

	it("fails on past events (beyond grace window)", () => {
		// 15 days ago — beyond the 14-day grace window
		const pastTime = new Date(Date.now() - 15 * 24 * 3600000).toISOString();
		writeEvents([{ sport: "football", title: "Old Match", time: pastTime, tournament: "PL" }]);
		expect(() => runValidate()).toThrow();
	});

	it("passes for event within 6h grace window", () => {
		// 3 hours ago — within the 6h grace window
		const recentPast = new Date(Date.now() - 3 * 3600000).toISOString();
		writeEvents([{ sport: "football", title: "Recent Match", time: recentPast, tournament: "PL" }]);
		const output = runValidate();
		expect(output).toContain("0 error(s)");
	});

	it("fails on norwegianRelevance outside 1-5", () => {
		writeEvents([{
			sport: "football", title: "Test", time: futureTime(), tournament: "PL",
			norwegianRelevance: 0,
		}]);
		expect(() => runValidate()).toThrow();
	});

	it("counts enriched events with importance", () => {
		writeEvents([
			{ sport: "football", title: "A", time: futureTime(), tournament: "PL", importance: 3 },
			{ sport: "golf", title: "B", time: futureTime(), tournament: "PGA" },
		]);
		const output = runValidate();
		expect(output).toContain("1 enriched");
	});

	it("detects duplicate events", () => {
		const event = { sport: "football", title: "Dup", time: futureTime(), tournament: "PL" };
		writeEvents([event, event]);
		const output = runValidate(true);
		expect(output).toContain("Duplicate event");
	});

	it("fails when events.json is not valid JSON", () => {
		fs.writeFileSync(path.join(tmpDir, "events.json"), "not-json{{{");
		expect(() => runValidate()).toThrow();
	});

	it("fails when events.json root is not an array", () => {
		fs.writeFileSync(path.join(tmpDir, "events.json"), JSON.stringify({ events: [] }));
		expect(() => runValidate()).toThrow();
	});

	it("passes with multi-day event using endTime", () => {
		const endTime = new Date(Date.now() + 72 * 3600000);
		endTime.setUTCHours(20, 0, 0, 0);
		writeEvents([{
			sport: "golf", title: "Tournament", time: futureTime(),
			endTime: endTime.toISOString(), tournament: "PGA",
		}]);
		const output = runValidate();
		expect(output).toContain("0 error(s)");
	});

	it("accepts valid importance values 1-5", () => {
		const events = [1, 2, 3, 4, 5].map((imp) => ({
			sport: "football", title: `Match ${imp}`, time: futureTime(),
			tournament: "PL", importance: imp,
		}));
		writeEvents(events);
		const output = runValidate();
		expect(output).toContain("0 error(s)");
		expect(output).toContain("5 enriched");
	});
});
