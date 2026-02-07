import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DATA_DIR = path.resolve(process.cwd(), "docs", "data");
const EVENTS_PATH = path.join(DATA_DIR, "events.json");

// Create a temp sport file for testing
function writeSportFile(sport, data) {
	fs.writeFileSync(path.join(DATA_DIR, `${sport}.json`), JSON.stringify(data));
}

// Generate a future time
function futureTime(hoursAhead = 24) {
	return new Date(Date.now() + hoursAhead * 3600000).toISOString();
}

describe("build-events.js", () => {
	let originalFiles = {};

	beforeEach(() => {
		// Backup existing data files
		for (const sport of ["football", "golf", "tennis", "f1", "chess", "esports"]) {
			const file = path.join(DATA_DIR, `${sport}.json`);
			if (fs.existsSync(file)) {
				originalFiles[sport] = fs.readFileSync(file, "utf-8");
			}
		}
		if (fs.existsSync(EVENTS_PATH)) {
			originalFiles.events = fs.readFileSync(EVENTS_PATH, "utf-8");
		}
	});

	afterEach(() => {
		// Restore original files
		for (const [key, content] of Object.entries(originalFiles)) {
			const file = key === "events" ? EVENTS_PATH : path.join(DATA_DIR, `${key}.json`);
			fs.writeFileSync(file, content);
		}
		originalFiles = {};
	});

	it("aggregates events from multiple sport files", () => {
		const time = futureTime();
		writeSportFile("football", {
			tournaments: [
				{
					name: "Premier League",
					events: [{ title: "Arsenal vs Chelsea", time, homeTeam: "Arsenal", awayTeam: "Chelsea" }],
				},
			],
		});
		writeSportFile("golf", {
			tournaments: [
				{
					name: "PGA Tour",
					events: [{ title: "The Open", time, venue: "St Andrews" }],
				},
			],
		});
		// Clear other sports
		for (const sport of ["tennis", "f1", "chess", "esports"]) {
			writeSportFile(sport, { tournaments: [] });
		}

		execSync("node scripts/build-events.js", { cwd: process.cwd() });
		const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf-8"));

		expect(events).toHaveLength(2);
		expect(events[0].sport).toBeDefined();
		expect(events.find((e) => e.sport === "football")).toBeTruthy();
		expect(events.find((e) => e.sport === "golf")).toBeTruthy();
	});

	it("filters out past events", () => {
		const pastTime = new Date(Date.now() - 12 * 3600000).toISOString();
		const futTime = futureTime();
		writeSportFile("football", {
			tournaments: [
				{
					name: "Test",
					events: [
						{ title: "Past Game", time: pastTime },
						{ title: "Future Game", time: futTime },
					],
				},
			],
		});
		for (const sport of ["golf", "tennis", "f1", "chess", "esports"]) {
			writeSportFile(sport, { tournaments: [] });
		}

		execSync("node scripts/build-events.js", { cwd: process.cwd() });
		const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf-8"));

		expect(events).toHaveLength(1);
		expect(events[0].title).toBe("Future Game");
	});

	it("preserves enrichment fields", () => {
		const time = futureTime();
		writeSportFile("football", {
			tournaments: [
				{
					name: "Test",
					events: [
						{
							title: "Enriched Match",
							time,
							importance: 4,
							importanceReason: "Title decider",
							summary: "Big match",
							tags: ["must-watch", "title-race"],
							norwegianRelevance: 2,
							enrichedAt: "2025-08-20T12:00:00Z",
						},
					],
				},
			],
		});
		for (const sport of ["golf", "tennis", "f1", "chess", "esports"]) {
			writeSportFile(sport, { tournaments: [] });
		}

		execSync("node scripts/build-events.js", { cwd: process.cwd() });
		const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf-8"));

		expect(events).toHaveLength(1);
		expect(events[0].importance).toBe(4);
		expect(events[0].importanceReason).toBe("Title decider");
		expect(events[0].summary).toBe("Big match");
		expect(events[0].tags).toEqual(["must-watch", "title-race"]);
		expect(events[0].norwegianRelevance).toBe(2);
		expect(events[0].enrichedAt).toBe("2025-08-20T12:00:00Z");
	});

	it("sorts events chronologically", () => {
		const time1 = futureTime(48);
		const time2 = futureTime(24);
		writeSportFile("football", {
			tournaments: [
				{
					name: "Test",
					events: [
						{ title: "Later Game", time: time1 },
						{ title: "Earlier Game", time: time2 },
					],
				},
			],
		});
		for (const sport of ["golf", "tennis", "f1", "chess", "esports"]) {
			writeSportFile(sport, { tournaments: [] });
		}

		execSync("node scripts/build-events.js", { cwd: process.cwd() });
		const events = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf-8"));

		expect(events[0].title).toBe("Earlier Game");
		expect(events[1].title).toBe("Later Game");
	});
});
