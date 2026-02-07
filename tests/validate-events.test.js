import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DATA_DIR = path.resolve(process.cwd(), "docs", "data");
const EVENTS_PATH = path.join(DATA_DIR, "events.json");

function futureTime(hoursAhead = 24) {
	return new Date(Date.now() + hoursAhead * 3600000).toISOString();
}

describe("validate-events.js", () => {
	let originalEvents;

	beforeEach(() => {
		if (fs.existsSync(EVENTS_PATH)) {
			originalEvents = fs.readFileSync(EVENTS_PATH, "utf-8");
		}
	});

	afterEach(() => {
		if (originalEvents) {
			fs.writeFileSync(EVENTS_PATH, originalEvents);
		}
	});

	it("passes with valid events", () => {
		const events = [
			{
				sport: "football",
				title: "Test Match",
				time: futureTime(),
				tournament: "Test League",
			},
		];
		fs.writeFileSync(EVENTS_PATH, JSON.stringify(events));
		const output = execSync("node scripts/validate-events.js", { cwd: process.cwd() }).toString();
		expect(output).toContain("0 error(s)");
	});

	it("passes with valid enrichment fields", () => {
		const events = [
			{
				sport: "football",
				title: "Test Match",
				time: futureTime(),
				tournament: "Test",
				importance: 4,
				norwegianRelevance: 2,
				tags: ["must-watch"],
			},
		];
		fs.writeFileSync(EVENTS_PATH, JSON.stringify(events));
		const output = execSync("node scripts/validate-events.js", { cwd: process.cwd() }).toString();
		expect(output).toContain("0 error(s)");
		expect(output).toContain("1 enriched");
	});

	it("fails on invalid importance", () => {
		const events = [
			{
				sport: "football",
				title: "Test",
				time: futureTime(),
				tournament: "Test",
				importance: 10,
			},
		];
		fs.writeFileSync(EVENTS_PATH, JSON.stringify(events));
		expect(() =>
			execSync("node scripts/validate-events.js", { cwd: process.cwd() })
		).toThrow();
	});

	it("fails on invalid tags type", () => {
		const events = [
			{
				sport: "football",
				title: "Test",
				time: futureTime(),
				tournament: "Test",
				tags: "not-an-array",
			},
		];
		fs.writeFileSync(EVENTS_PATH, JSON.stringify(events));
		expect(() =>
			execSync("node scripts/validate-events.js", { cwd: process.cwd() })
		).toThrow();
	});
});
