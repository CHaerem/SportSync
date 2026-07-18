// Every event emitted by build-events has the minimal schema the client relies on.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

describe("build-events output schema", () => {
	it("every output event has sport, title and a parseable time", () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-schema-"));
		const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-schema-cfg-"));
		const future = new Date(Date.now() + 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "golf.json"),
			JSON.stringify({
				tournaments: [{ name: "PGA Tour", events: [
					{ title: "Open", time: future, endTime: new Date(Date.now() + 4 * 86400000).toISOString(), norwegian: true },
				] }],
			})
		);
		execFileSync("node", ["scripts/build-events.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		});
		const events = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
		expect(events.length).toBeGreaterThan(0);
		for (const e of events) {
			expect(typeof e.sport).toBe("string");
			expect(typeof e.title).toBe("string");
			expect(Number.isNaN(Date.parse(e.time))).toBe(false);
			expect(Array.isArray(e.streaming)).toBe(true);
			expect(Array.isArray(e.norwegianPlayers)).toBe(true);
		}
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});

// WP-02: stable event ID — a hash of the sport|title|time dedupe key, emitted
// by every path that produces output events (fresh fetch, curated config,
// ai-research/kept-on-board preservation).
describe("build-events stable event id (WP-02)", () => {
	function freshDirs() {
		return {
			dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "ss-id-")),
			configDir: fs.mkdtempSync(path.join(os.tmpdir(), "ss-id-cfg-")),
		};
	}
	function runBuild(dataDir, configDir) {
		execFileSync("node", ["scripts/build-events.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		});
		return JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
	}

	it("gives every output event a stable, hash-shaped id", () => {
		const { dataDir, configDir } = freshDirs();
		const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "golf.json"),
			JSON.stringify({ tournaments: [{ name: "PGA Tour", events: [
				{ title: "Open", time: future(1), norwegian: true },
			] }] })
		);
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "biathlon", title: "Mixed relay", time: future(5), source: "ai-research", confidence: "high", evidence: ["a", "b"] },
			])
		);
		const events = runBuild(dataDir, configDir);
		expect(events.length).toBeGreaterThan(0);
		for (const e of events) {
			expect(typeof e.id).toBe("string");
			expect(e.id).toMatch(/^[0-9a-f]{12}$/); // first 12 hex chars of sha256
		}
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("gives two consecutive builds on the same input identical ids", () => {
		const { dataDir, configDir } = freshDirs();
		const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({ tournaments: [{ name: "Premier League", events: [
				{ title: "Liverpool vs Arsenal", time: future(2), homeTeam: "Liverpool", awayTeam: "Arsenal" },
			] }] })
		);
		// An ai-research event with no static counterpart — preserved as-is across
		// rebuilds, exercising the "carried forward without going through
		// pushEvent()" path.
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "chess", title: "World Cup Round 1", time: future(3), source: "ai-research", confidence: "high", evidence: ["a", "b"] },
			])
		);
		const first = runBuild(dataDir, configDir);
		const second = runBuild(dataDir, configDir); // reads the events.json the first run just wrote
		const idsOf = (evts) => Object.fromEntries(evts.map((e) => [`${e.sport}|${e.title}|${e.time}`, e.id]));
		const firstIds = idsOf(first), secondIds = idsOf(second);
		expect(Object.keys(secondIds).sort()).toEqual(Object.keys(firstIds).sort());
		for (const key of Object.keys(firstIds)) {
			expect(secondIds[key]).toBe(firstIds[key]);
		}
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("mints a new id when the verify agent amends an event's title", () => {
		// Known, accepted property (see computeEventId() in build-events.js):
		// an amendment changes the dedupe key, so the id changes too — a
		// client/notification diff treats it as remove+add, not an update.
		const { dataDir, configDir } = freshDirs();
		const time = new Date(Date.now() + 4 * 86400000).toISOString();
		// WP-92: use a broadly-followed sport so the event survives the relevance
		// gate (chess is now entity-gated) — this test is about id stability under a
		// title amendment, not the relevance decision.
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([
				{ sport: "biathlon", title: "World Cup Round 1", time, source: "ai-research", confidence: "high", evidence: ["a", "b"] },
			])
		);
		const before = runBuild(dataDir, configDir);
		const beforeId = before.find((e) => e.title === "World Cup Round 1").id;

		// Simulate a verify-agent amendment: title changed in-place in events.json.
		const amended = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"))
			.map((e) => (e.title === "World Cup Round 1" ? { ...e, title: "World Cup Round 1 (rescheduled)" } : e));
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(amended));

		const after = runBuild(dataDir, configDir);
		const afterId = after.find((e) => e.title === "World Cup Round 1 (rescheduled)").id;
		expect(afterId).not.toBe(beforeId);
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("has no id collisions when built from today's real data files", () => {
		// Exercise the real pipeline against a copy of today's actual fetcher
		// output + curated configs (never the real dataDir — build-events.js
		// writes events.json in place, and this must not mutate committed data).
		const realDataDir = path.resolve(process.cwd(), "docs", "data");
		const realConfigDir = path.resolve(process.cwd(), "scripts", "config");
		if (!fs.existsSync(realDataDir)) return; // no published data in this environment
		const { dataDir, configDir } = freshDirs();
		for (const f of fs.readdirSync(realDataDir)) {
			if (f.endsWith(".json")) fs.copyFileSync(path.join(realDataDir, f), path.join(dataDir, f));
		}
		for (const f of fs.readdirSync(realConfigDir)) {
			if (f.endsWith(".json")) fs.copyFileSync(path.join(realConfigDir, f), path.join(configDir, f));
		}
		const events = runBuild(dataDir, configDir);
		expect(events.length).toBeGreaterThan(0);
		const ids = events.map((e) => e.id).filter(Boolean);
		expect(ids.length).toBe(events.length); // every event got an id
		expect(new Set(ids).size).toBe(ids.length); // and none collide
		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});
