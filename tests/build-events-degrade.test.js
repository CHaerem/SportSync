// WP-94: build-events.js validates in-process before writing events.json, so a
// schema/contract violation degrades gracefully instead of freezing the hourly
// static-pipeline (the "13. juli" incident — validate-events.js hard-failing the
// separate CLI step aborted the whole job, publishing NOTHING for that hour).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

let dataDir, configDir;
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

function runBuild(env = {}) {
	execFileSync("node", ["scripts/build-events.js"], {
		env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir, ...env },
	});
}

beforeEach(() => {
	dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-degrade-"));
	configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-degrade-cfg-"));
});

afterEach(() => {
	fs.rmSync(dataDir, { recursive: true, force: true });
	fs.rmSync(configDir, { recursive: true, force: true });
});

describe("build-events validate-degrade (WP-94)", () => {
	it("keeps the previous good events.json + writes an ok:false alarm when the fresh build is invalid", () => {
		// Previous good data already on disk (as if a prior successful hourly run wrote it).
		const goodPrevious = [{ sport: "golf", title: "Genesis Scottish Open", time: future(2), id: "abc123" }];
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(goodPrevious, null, 2));

		// A curated config event with an out-of-range importance — a hard validation
		// error (ad-hoc rule, not just the formal schema) with no static fetcher involved.
		fs.writeFileSync(
			path.join(configDir, "broken.json"),
			JSON.stringify({ sport: "biathlon", name: "Bad Config", events: [{ title: "Broken Event", time: future(1), importance: 99 }] })
		);

		runBuild();

		const eventsAfter = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
		expect(eventsAfter).toEqual(goodPrevious); // untouched — the broken build was NOT published

		const alert = JSON.parse(fs.readFileSync(path.join(dataDir, "build-alert.json"), "utf-8"));
		expect(alert.ok).toBe(false);
		expect(alert.errorCount).toBeGreaterThan(0);
		expect(alert.retained).toBe(true);
		expect(alert.retainedEventCount).toBe(goodPrevious.length);
		expect(Array.isArray(alert.sampleErrors)).toBe(true);
		expect(alert.sampleErrors.length).toBeGreaterThan(0);
	});

	it("publishes anyway (best-effort) when there is no previous good data to fall back on, but still alarms", () => {
		// No pre-existing events.json in dataDir at all.
		fs.writeFileSync(
			path.join(configDir, "broken.json"),
			JSON.stringify({ sport: "biathlon", name: "Bad Config", events: [{ title: "Broken Event", time: future(1), importance: 99 }] })
		);

		runBuild();

		const eventsAfter = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
		expect(eventsAfter.some((e) => e.title === "Broken Event")).toBe(true);

		const alert = JSON.parse(fs.readFileSync(path.join(dataDir, "build-alert.json"), "utf-8"));
		expect(alert.ok).toBe(false);
		expect(alert.retained).toBe(false);
	});

	it("exits 0 on a build-time violation — the pipeline job must not abort here", () => {
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([{ sport: "golf", title: "Open", time: future(2) }], null, 2));
		fs.writeFileSync(
			path.join(configDir, "broken.json"),
			JSON.stringify({ sport: "biathlon", name: "Bad Config", events: [{ title: "Broken Event", time: future(1), importance: 99 }] })
		);
		expect(() => runBuild()).not.toThrow();
	});

	it("the downstream validate-events.js CLI step then passes, re-checking the RETAINED good file", () => {
		const goodPrevious = [{ sport: "golf", title: "Open", time: future(2) }];
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(goodPrevious, null, 2));
		fs.writeFileSync(
			path.join(configDir, "broken.json"),
			JSON.stringify({ sport: "biathlon", name: "Bad Config", events: [{ title: "Broken Event", time: future(1), importance: 99 }] })
		);

		runBuild();
		expect(() =>
			execFileSync("node", ["scripts/validate-events.js"], {
				env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir },
			})
		).not.toThrow();
	});

	it("writes an ok:true alarm (clearing any previous alert) on a clean build", () => {
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([], null, 2));
		fs.writeFileSync(path.join(dataDir, "build-alert.json"), JSON.stringify({ ok: false, checkedAt: "2020-01-01T00:00:00Z", errorCount: 3 }, null, 2));
		fs.writeFileSync(
			path.join(dataDir, "golf.json"),
			JSON.stringify({ tournaments: [{ name: "PGA Tour", events: [{ title: "Open", time: future(2) }] }] })
		);

		runBuild();

		const alert = JSON.parse(fs.readFileSync(path.join(dataDir, "build-alert.json"), "utf-8"));
		expect(alert.ok).toBe(true);
	});
});
