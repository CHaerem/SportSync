// build-events.js: merges sport JSONs + curated configs, preserves AI-research events.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

let dataDir, configDir;

function runBuild() {
	execFileSync("node", ["scripts/build-events.js"], {
		env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		cwd: process.cwd(),
	});
	return JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
}

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

beforeEach(() => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-data-"));
	configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-config-"));
	fs.writeFileSync(
		path.join(dataDir, "football.json"),
		JSON.stringify({
			tournaments: [
				{ name: "Premier League", events: [{ title: "Liverpool vs Arsenal", time: future(2), homeTeam: "Liverpool", awayTeam: "Arsenal" }] },
			],
		})
	);
});

afterEach(() => {
	fs.rmSync(dataDir, { recursive: true, force: true });
	fs.rmSync(configDir, { recursive: true, force: true });
});

describe("build-events", () => {
	it("merges sport JSON files into events.json", () => {
		const events = runBuild();
		expect(events).toHaveLength(1);
		expect(events[0].sport).toBe("football");
		expect(events[0].tournament).toBe("Premier League");
	});

	it("merges curated configs with events arrays", () => {
		fs.writeFileSync(
			path.join(configDir, "biathlon-test.json"),
			JSON.stringify({ sport: "biathlon", name: "World Cup", events: [{ title: "Sprint", time: future(3) }] })
		);
		const events = runBuild();
		expect(events.map((e) => e.sport).sort()).toEqual(["biathlon", "football"]);
	});

	it("preserves ai-research events from the previous events.json", () => {
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "biathlon", title: "Mixed relay", time: future(5), source: "ai-research", confidence: "high", evidence: ["a", "b"] },
				{ sport: "football", title: "Old static event", time: future(1) },
			])
		);
		const events = runBuild();
		const aiEvents = events.filter((e) => e.source === "ai-research");
		expect(aiEvents).toHaveLength(1);
		expect(aiEvents[0].title).toBe("Mixed relay");
		// static events are rebuilt from source files, not carried over
		expect(events.find((e) => e.title === "Old static event")).toBeUndefined();
	});

	it("carries agent amendments (streaming, verification) onto re-fetched static events", () => {
		const time = future(2);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [{ title: "Derby", time }] }] })
		);
		// Previous build: verify agent added streaming + verification to the static event
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{
					sport: "football", tournament: "PL", title: "Derby", time,
					streaming: [{ platform: "TV 2 Play" }],
					verifiedAt: "2026-07-03T05:30:00Z",
					verificationStatus: "confirmed",
				},
			])
		);
		const events = runBuild();
		const derby = events.find((e) => e.title === "Derby");
		expect(derby.streaming).toEqual([{ platform: "TV 2 Play" }]);
		expect(derby.verificationStatus).toBe("confirmed");
	});

	it("keeps a confirmed channel instead of downgrading it to a tentative guess", () => {
		const time = future(2);
		// A World Cup fixture — resolveStreaming would produce the tentative NRK / TV 2 label.
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "FIFA World Cup 2026", events: [
				{ title: "Brazil vs Norway", time, homeTeam: "Brazil", awayTeam: "Norway" },
			] }] })
		);
		// Previous build: verify agent confirmed the real broadcaster (no tentative flag).
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "football", tournament: "FIFA World Cup 2026", title: "Brazil vs Norway", time,
				  streaming: [{ platform: "NRK", url: "https://tv.nrk.no" }] },
			])
		);
		const events = runBuild();
		const match = events.find((e) => e.title === "Brazil vs Norway");
		expect(match.streaming).toEqual([{ platform: "NRK", url: "https://tv.nrk.no" }]);
		expect(match.streaming.some((s) => s.tentative)).toBe(false);
	});

	it("dedupes ai-research events that a static fetcher now covers", () => {
		const time = future(2);
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [{ title: "Derby", time }] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([{ sport: "football", title: "Derby", time, source: "ai-research", confidence: "low" }])
		);
		const events = runBuild();
		expect(events.filter((e) => e.title === "Derby")).toHaveLength(1);
		expect(events[0].source).toBeUndefined();
	});

	it("filters out events older than 14 days", () => {
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "PL", events: [
				{ title: "Ancient", time: new Date(Date.now() - 20 * 86400000).toISOString() },
				{ title: "Upcoming", time: future(1) },
			] }] })
		);
		const events = runBuild();
		expect(events.map((e) => e.title)).toEqual(["Upcoming"]);
	});

	it("publishes tracked.json to the data dir when present in config", () => {
		fs.writeFileSync(path.join(configDir, "tracked.json"), JSON.stringify({ version: 1, leagues: [] }));
		runBuild();
		expect(fs.existsSync(path.join(dataDir, "tracked.json"))).toBe(true);
	});
});
