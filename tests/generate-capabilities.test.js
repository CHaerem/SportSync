import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { generateCapabilities } from "../scripts/generate-capabilities.js";

const FIXTURES_DIR = path.join(os.tmpdir(), "sportsync-capabilities-test-" + Date.now());

beforeEach(() => {
	fs.mkdirSync(path.join(FIXTURES_DIR, "data"), { recursive: true });
	fs.mkdirSync(path.join(FIXTURES_DIR, "fetch"), { recursive: true });
	fs.mkdirSync(path.join(FIXTURES_DIR, "config"), { recursive: true });
});

afterEach(() => {
	fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

function writeManifest(phases) {
	const p = path.join(FIXTURES_DIR, "manifest.json");
	fs.writeFileSync(p, JSON.stringify({ version: 1, phases }));
	return p;
}

describe("generateCapabilities", () => {
	it("generates capabilities from manifest and data", () => {
		const manifestPath = writeManifest([
			{ name: "fetch", steps: [{ name: "s1", command: "echo", errorPolicy: "continue" }] },
			{ name: "build", steps: [{ name: "s2", command: "echo", errorPolicy: "continue" }] },
		]);

		// Create a sport data file
		fs.writeFileSync(
			path.join(FIXTURES_DIR, "data", "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [{ title: "A" }] }] })
		);
		// Create a fetcher
		fs.writeFileSync(path.join(FIXTURES_DIR, "fetch", "football.js"), "");

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.generatedAt).toBeDefined();
		expect(result.pipelineSteps).toBe(2);
		expect(result.pipelinePhases).toEqual(["fetch", "build"]);
		expect(result.sports.football.fetcher).toBe(true);
		expect(result.sports.football.data).toBe(true);
		expect(result.sports.football.eventCount).toBe(1);
	});

	it("detects sports with fetcher but no data", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(path.join(FIXTURES_DIR, "fetch", "tennis.js"), "");

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.sports.tennis.fetcher).toBe(true);
		expect(result.sports.tennis.data).toBe(false);
		expect(result.gaps).toContain("No data file for tennis — fetcher may be broken");
	});

	it("counts curated configs excluding user-context.json", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(path.join(FIXTURES_DIR, "config", "olympics-2026.json"), "{}");
		fs.writeFileSync(path.join(FIXTURES_DIR, "config", "chess-tournaments.json"), "{}");
		fs.writeFileSync(path.join(FIXTURES_DIR, "config", "user-context.json"), "{}");

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.curatedConfigs).toBe(2);
	});

	it("reads autonomy report for feedback loop count", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(
			path.join(FIXTURES_DIR, "data", "autonomy-report.json"),
			JSON.stringify({ loopCount: 11, loops: [] })
		);

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.feedbackLoops).toBe(11);
	});

	it("counts scouting heuristics from roadmap", () => {
		const manifestPath = writeManifest([]);
		const roadmap = `# Roadmap\n### A. Dead Field\n### B. Data-to-UI\n### C. Fetcher Waste\n`;
		fs.writeFileSync(path.join(FIXTURES_DIR, "roadmap.md"), roadmap);

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.scoutingHeuristics).toBe(3);
	});

	it("identifies gaps for sports without live scores", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(path.join(FIXTURES_DIR, "fetch", "chess.js"), "");
		fs.writeFileSync(
			path.join(FIXTURES_DIR, "data", "chess.json"),
			JSON.stringify({ tournaments: [{ events: [{ title: "A" }] }] })
		);

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		const liveGap = result.gaps.find((g) => g.includes("No live scores"));
		expect(liveGap).toContain("chess");
	});

	it("handles missing data directory gracefully", () => {
		const manifestPath = writeManifest([]);
		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "nonexistent"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.sports).toBeDefined();
		expect(result.gaps.length).toBeGreaterThan(0);
	});

	it("detects esports with zero events as stale", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(path.join(FIXTURES_DIR, "fetch", "esports.js"), "");
		fs.writeFileSync(
			path.join(FIXTURES_DIR, "data", "esports.json"),
			JSON.stringify({ tournaments: [] })
		);

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		const esportsGap = result.gaps.find((g) => g.includes("Esports HLTV"));
		expect(esportsGap).toBeDefined();
	});

	it("writes capabilities.json to data directory", () => {
		const manifestPath = writeManifest([]);
		generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		const written = JSON.parse(
			fs.readFileSync(path.join(FIXTURES_DIR, "data", "capabilities.json"), "utf-8")
		);
		expect(written.generatedAt).toBeDefined();
		expect(written.sports).toBeDefined();
	});

	it("handles missing manifest gracefully", () => {
		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath: path.join(FIXTURES_DIR, "nonexistent.json"),
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.pipelineSteps).toBe(0);
		expect(result.pipelinePhases).toEqual([]);
	});

	it("detects tennis standings from standings.json when ATP rankings present", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(path.join(FIXTURES_DIR, "fetch", "tennis.js"), "");
		fs.writeFileSync(
			path.join(FIXTURES_DIR, "data", "tennis.json"),
			JSON.stringify({ tournaments: [{ name: "Wimbledon", events: [{ title: "Men's Singles" }] }] })
		);
		// Write standings.json with tennis ATP rankings
		fs.writeFileSync(
			path.join(FIXTURES_DIR, "data", "standings.json"),
			JSON.stringify({
				tennis: {
					atp: [{ rank: 1, player: "Novak Djokovic", points: 11245 }],
					wta: [],
				},
			})
		);

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		expect(result.sports.tennis.standings).toBe(true);
		// Tennis should not appear in the "No standings" gap
		const standingsGap = result.gaps.find((g) => g.includes("No standings") && g.includes("tennis"));
		expect(standingsGap).toBeUndefined();
	});

	it("falls back to static caps when standings.json is absent", () => {
		const manifestPath = writeManifest([]);
		fs.writeFileSync(path.join(FIXTURES_DIR, "fetch", "tennis.js"), "");

		const result = generateCapabilities({
			dataDir: path.join(FIXTURES_DIR, "data"),
			manifestPath,
			fetcherDir: path.join(FIXTURES_DIR, "fetch"),
			configDir: path.join(FIXTURES_DIR, "config"),
			roadmapPath: path.join(FIXTURES_DIR, "roadmap.md"),
		});

		// Without standings.json, tennis falls back to static cap (false)
		expect(result.sports.tennis.standings).toBe(false);
	});
});
