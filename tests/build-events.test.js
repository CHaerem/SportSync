import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

let tmpDataDir;
let tmpConfigDir;

function writeSportFile(sport, data) {
	fs.writeFileSync(path.join(tmpDataDir, `${sport}.json`), JSON.stringify(data));
}

function futureTime(hoursAhead = 24) {
	return new Date(Date.now() + hoursAhead * 3600000).toISOString();
}

function runBuildEvents() {
	execSync("node scripts/build-events.js", {
		cwd: process.cwd(),
		env: { ...process.env, SPORTSYNC_DATA_DIR: tmpDataDir, SPORTSYNC_CONFIG_DIR: tmpConfigDir },
	});
	return JSON.parse(fs.readFileSync(path.join(tmpDataDir, "events.json"), "utf-8"));
}

describe("build-events.js", () => {
	beforeEach(() => {
		tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-events-data-"));
		tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-events-config-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDataDir, { recursive: true, force: true });
		fs.rmSync(tmpConfigDir, { recursive: true, force: true });
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

		const events = runBuildEvents();
		expect(events).toHaveLength(2);
		expect(events[0].sport).toBeDefined();
		expect(events.find((e) => e.sport === "football")).toBeTruthy();
		expect(events.find((e) => e.sport === "golf")).toBeTruthy();
	});

	it("retains events from the last 14 days", () => {
		const recentPast = new Date(Date.now() - 3 * 24 * 3600000).toISOString(); // 3 days ago
		const futTime = futureTime();
		writeSportFile("football", {
			tournaments: [
				{
					name: "Test",
					events: [
						{ title: "Recent Past Game", time: recentPast },
						{ title: "Future Game", time: futTime },
					],
				},
			],
		});

		const events = runBuildEvents();
		expect(events).toHaveLength(2);
		expect(events.find(e => e.title === "Recent Past Game")).toBeTruthy();
		expect(events.find(e => e.title === "Future Game")).toBeTruthy();
	});

	it("filters out events older than 14 days", () => {
		const oldPast = new Date(Date.now() - 15 * 24 * 3600000).toISOString(); // 15 days ago
		const futTime = futureTime();
		writeSportFile("football", {
			tournaments: [
				{
					name: "Test",
					events: [
						{ title: "Old Game", time: oldPast },
						{ title: "Future Game", time: futTime },
					],
				},
			],
		});

		const events = runBuildEvents();
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

		const events = runBuildEvents();
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

		const events = runBuildEvents();
		expect(events[0].title).toBe("Earlier Game");
		expect(events[1].title).toBe("Later Game");
	});

	it("auto-discovers sport files by tournaments convention", () => {
		const time = futureTime();
		// Write a non-standard sport file with tournaments array
		writeSportFile("cycling", {
			tournaments: [
				{
					name: "Tour de France",
					events: [{ title: "Stage 1", time }],
				},
			],
		});
		writeSportFile("football", {
			tournaments: [
				{
					name: "PL",
					events: [{ title: "Arsenal vs Chelsea", time }],
				},
			],
		});

		const events = runBuildEvents();
		expect(events.find((e) => e.sport === "cycling")).toBeTruthy();
		expect(events.find((e) => e.sport === "football")).toBeTruthy();
		expect(events).toHaveLength(2);
	});

	it("ignores non-sport JSON files (no tournaments array)", () => {
		const time = futureTime();
		writeSportFile("football", {
			tournaments: [
				{
					name: "PL",
					events: [{ title: "Arsenal vs Chelsea", time }],
				},
			],
		});
		// Write files that should NOT be discovered
		fs.writeFileSync(path.join(tmpDataDir, "events.json"), JSON.stringify([]));
		fs.writeFileSync(path.join(tmpDataDir, "meta.json"), JSON.stringify({ lastUpdated: new Date().toISOString() }));
		fs.writeFileSync(path.join(tmpDataDir, "standings.json"), JSON.stringify({ football: {} }));

		const events = runBuildEvents();
		expect(events).toHaveLength(1);
		expect(events[0].sport).toBe("football");
	});
});
