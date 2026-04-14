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

function writeConfigFile(name, data) {
	fs.writeFileSync(path.join(tmpConfigDir, `${name}.json`), JSON.stringify(data));
}

function readBrackets() {
	const bracketsPath = path.join(tmpDataDir, "brackets.json");
	if (!fs.existsSync(bracketsPath)) return null;
	return JSON.parse(fs.readFileSync(bracketsPath, "utf-8"));
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

	describe("curated config merging", () => {
		it("merges a curated config's events into events.json output", () => {
			const time = futureTime();
			writeConfigFile("chess-tournaments", {
				name: "Chess Majors",
				sport: "chess",
				events: [
					{ title: "Tata Steel R1", time, venue: "Wijk aan Zee" },
					{ title: "Tata Steel R2", time: futureTime(48), venue: "Wijk aan Zee" },
				],
			});

			const events = runBuildEvents();
			expect(events).toHaveLength(2);
			const r1 = events.find((e) => e.title === "Tata Steel R1");
			expect(r1).toBeTruthy();
			expect(r1.sport).toBe("chess");
			expect(r1.tournament).toBe("Chess Majors");
			expect(r1.venue).toBe("Wijk aan Zee");
		});

		it("extracts bracket data from a curated config into brackets.json", () => {
			writeConfigFile("esports-cs2", {
				name: "CS2 Majors",
				sport: "esports",
				events: [],
				tournaments: [
					{
						id: "cs2-major-2026",
						name: "PGL Major Bucharest",
						startDate: "2099-01-01",
						endDate: "2099-01-10",
						venue: "Bucharest",
						tier: "S-Tier",
						prizePool: "$1,250,000",
						focusTeam: "100 Thieves",
						bracket: {
							groups: {
								A: { name: "Group A", matches: [] },
							},
						},
					},
				],
			});

			runBuildEvents();
			const brackets = readBrackets();
			expect(brackets).toBeTruthy();
			expect(brackets["cs2-major-2026"]).toBeDefined();
			expect(brackets["cs2-major-2026"].name).toBe("PGL Major Bucharest");
			expect(brackets["cs2-major-2026"].tier).toBe("S-Tier");
			expect(brackets["cs2-major-2026"].focusTeam).toBe("100 Thieves");
			expect(brackets["cs2-major-2026"].bracket.groups.A.name).toBe("Group A");
		});

		it("propagates _bracketId from config events to merged events", () => {
			const time = futureTime();
			writeConfigFile("esports-cs2", {
				name: "CS2 Season",
				sport: "esports",
				events: [
					{
						title: "100 Thieves vs NAVI",
						time,
						homeTeam: "100 Thieves",
						awayTeam: "NAVI",
						_bracketId: "cs2-major-2026",
					},
				],
			});

			const events = runBuildEvents();
			const match = events.find((e) => e.title === "100 Thieves vs NAVI");
			expect(match).toBeTruthy();
			expect(match._bracketId).toBe("cs2-major-2026");
			expect(match.sport).toBe("esports");
		});

		it("does NOT load archived configs in an archive/ subdirectory", () => {
			const time = futureTime();
			// Write an active config
			writeConfigFile("active-config", {
				name: "Active Event",
				sport: "chess",
				events: [{ title: "Active Match", time }],
			});
			// Create an archive subdir with a config inside
			const archiveDir = path.join(tmpConfigDir, "archive");
			fs.mkdirSync(archiveDir);
			fs.writeFileSync(
				path.join(archiveDir, "old-config.json"),
				JSON.stringify({
					name: "Archived Event",
					sport: "chess",
					events: [{ title: "Archived Match", time }],
				})
			);

			const events = runBuildEvents();
			expect(events).toHaveLength(1);
			expect(events[0].title).toBe("Active Match");
			expect(events.find((e) => e.title === "Archived Match")).toBeUndefined();
		});

		it("skips configs with needsResearch=true and empty events without crashing", () => {
			const time = futureTime();
			writeConfigFile("needs-research", {
				name: "Unresearched Event",
				sport: "biathlon",
				autoGenerated: true,
				needsResearch: true,
				events: [],
			});
			writeConfigFile("populated", {
				name: "Populated Event",
				sport: "chess",
				events: [{ title: "Real Match", time }],
			});

			const events = runBuildEvents();
			expect(events).toHaveLength(1);
			expect(events[0].title).toBe("Real Match");
		});

		it("merges multiple configs across multiple sports without collision", () => {
			const time = futureTime();
			writeConfigFile("olympics-2026", {
				name: "Winter Olympics 2026",
				sport: "olympics",
				events: [
					{ title: "Opening Ceremony", time, venue: "Milan" },
					{ title: "Downhill Final", time: futureTime(48), venue: "Cortina" },
				],
			});
			writeConfigFile("chess-tournaments", {
				name: "Chess Majors",
				sport: "chess",
				events: [{ title: "Candidates R1", time: futureTime(72) }],
			});
			writeConfigFile("esports-cs2", {
				name: "CS2 Majors",
				sport: "esports",
				events: [{ title: "100 Thieves vs Fnatic", time: futureTime(96) }],
			});

			const events = runBuildEvents();
			expect(events).toHaveLength(4);
			expect(events.filter((e) => e.sport === "olympics")).toHaveLength(2);
			expect(events.filter((e) => e.sport === "chess")).toHaveLength(1);
			expect(events.filter((e) => e.sport === "esports")).toHaveLength(1);
		});

		it("handles empty configs and malformed JSON without crashing", () => {
			const time = futureTime();
			// Empty object
			writeConfigFile("empty-object", {});
			// Config with no events key (but other metadata)
			writeConfigFile("metadata-only", {
				name: "Metadata Only",
				sport: "chess",
				notes: "no events yet",
			});
			// Malformed JSON file
			fs.writeFileSync(path.join(tmpConfigDir, "broken.json"), "{ not valid json");
			// A valid config to prove the build still completes
			writeConfigFile("valid", {
				name: "Valid",
				sport: "chess",
				events: [{ title: "Valid Match", time }],
			});

			const events = runBuildEvents();
			expect(events).toHaveLength(1);
			expect(events[0].title).toBe("Valid Match");
		});

		it("only writes brackets.json entries for tournaments with both id and bracket", () => {
			writeConfigFile("esports-cs2", {
				name: "CS2 Majors",
				sport: "esports",
				events: [],
				tournaments: [
					{
						id: "has-bracket",
						name: "Has Bracket",
						startDate: "2099-01-01",
						endDate: "2099-01-10",
						bracket: { groups: {} },
					},
					{
						// Missing id — should be excluded
						name: "No ID",
						startDate: "2099-01-01",
						endDate: "2099-01-10",
						bracket: { groups: {} },
					},
					{
						id: "no-bracket",
						name: "No Bracket",
						startDate: "2099-01-01",
						endDate: "2099-01-10",
					},
				],
			});

			runBuildEvents();
			const brackets = readBrackets();
			expect(brackets).toBeTruthy();
			expect(Object.keys(brackets)).toHaveLength(1);
			expect(brackets["has-bracket"]).toBeDefined();
			expect(brackets["no-bracket"]).toBeUndefined();
		});
	});
});
