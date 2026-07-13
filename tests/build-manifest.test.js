// build-manifest.js (WP-03): docs/data/manifest.json — bytes + sha256 per
// published data file, the ground truth a client diffs against (never fs
// mtime — git doesn't preserve mtimes, so hash-diff is the only sync contract
// that survives a checkout).
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { buildManifest, listPublishedFiles, writeManifest, MANIFEST_NAME } from "../scripts/build-manifest.js";

function tmpDir(prefix) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256(buf) {
	return crypto.createHash("sha256").update(buf).digest("hex");
}

describe("listPublishedFiles", () => {
	it("includes every docs/data/*.json and events.ics, excludes manifest.json and *.jsonl", () => {
		const dataDir = tmpDir("ss-manifest-list-");
		fs.writeFileSync(path.join(dataDir, "events.json"), "[]");
		fs.writeFileSync(path.join(dataDir, "meta.json"), '{"lastUpdated":"2026-07-13T10:00:00Z"}');
		fs.writeFileSync(path.join(dataDir, "events.ics"), "BEGIN:VCALENDAR\nEND:VCALENDAR\n");
		fs.writeFileSync(path.join(dataDir, "calibration-ledger.jsonl"), '{"a":1}\n{"a":2}\n');
		fs.writeFileSync(path.join(dataDir, MANIFEST_NAME), "{}"); // a stale manifest from a prior run
		fs.writeFileSync(path.join(dataDir, ".DS_Store"), "junk"); // non-data cruft, ignored

		const files = listPublishedFiles(dataDir);

		expect(files).toContain("events.json");
		expect(files).toContain("meta.json");
		expect(files).toContain("events.ics");
		expect(files).not.toContain(MANIFEST_NAME);
		expect(files).not.toContain("calibration-ledger.jsonl");
		expect(files).not.toContain(".DS_Store");

		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("returns an empty list for a directory that doesn't exist", () => {
		expect(listPublishedFiles(path.join(os.tmpdir(), "ss-manifest-does-not-exist-xyz"))).toEqual([]);
	});
});

describe("buildManifest", () => {
	it("covers all published files and stamps the required top-level fields", () => {
		const dataDir = tmpDir("ss-manifest-cover-");
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([{ sport: "golf", title: "Open" }]));
		fs.writeFileSync(path.join(dataDir, "featured.json"), JSON.stringify({ headline: "x" }));
		fs.writeFileSync(path.join(dataDir, "events.ics"), "BEGIN:VCALENDAR\nEND:VCALENDAR\n");
		fs.writeFileSync(path.join(dataDir, "calibration-ledger.jsonl"), '{"a":1}\n');

		const now = Date.parse("2026-07-13T12:00:00Z");
		const manifest = buildManifest(dataDir, now);

		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.generatedAt).toBe(new Date(now).toISOString());
		expect(Object.keys(manifest.files).sort()).toEqual(["events.ics", "events.json", "featured.json"]);
		expect(manifest.files["events.json"]).toMatchObject({ bytes: expect.any(Number), sha256: expect.any(String) });

		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("never includes itself even if manifest.json already exists on disk", () => {
		const dataDir = tmpDir("ss-manifest-self-");
		fs.writeFileSync(path.join(dataDir, "events.json"), "[]");
		fs.writeFileSync(path.join(dataDir, MANIFEST_NAME), JSON.stringify({ schemaVersion: 1, files: {} }));
		const manifest = buildManifest(dataDir);
		expect(manifest.files).not.toHaveProperty(MANIFEST_NAME);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("excludes .jsonl ledgers from the covered set", () => {
		const dataDir = tmpDir("ss-manifest-jsonl-");
		fs.writeFileSync(path.join(dataDir, "usage-history.jsonl"), '{"a":1}\n{"a":2}\n');
		fs.writeFileSync(path.join(dataDir, "usage-state.json"), '{"level":"green"}');
		const manifest = buildManifest(dataDir);
		expect(Object.keys(manifest.files)).toEqual(["usage-state.json"]);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("computes correct bytes and sha256 for each entry (regenerate and compare)", () => {
		const dataDir = tmpDir("ss-manifest-hash-");
		const eventsContent = JSON.stringify([{ sport: "chess", title: "World Cup", time: "2026-08-01T10:00:00Z" }], null, 2);
		const icsContent = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
		fs.writeFileSync(path.join(dataDir, "events.json"), eventsContent);
		fs.writeFileSync(path.join(dataDir, "events.ics"), icsContent);

		const manifest = buildManifest(dataDir);

		const expectedEventsBuf = Buffer.from(eventsContent);
		const expectedIcsBuf = Buffer.from(icsContent);
		expect(manifest.files["events.json"].bytes).toBe(expectedEventsBuf.length);
		expect(manifest.files["events.json"].sha256).toBe(sha256(expectedEventsBuf));
		expect(manifest.files["events.ics"].bytes).toBe(expectedIcsBuf.length);
		expect(manifest.files["events.ics"].sha256).toBe(sha256(expectedIcsBuf));
		// sha256 is hex-encoded (64 lowercase hex chars)
		expect(manifest.files["events.json"].sha256).toMatch(/^[0-9a-f]{64}$/);

		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("mirrors a file's own lastUpdated as sourceLastUpdated, without using fs mtime", () => {
		const dataDir = tmpDir("ss-manifest-lastupdated-");
		fs.writeFileSync(path.join(dataDir, "meta.json"), JSON.stringify({ lastUpdated: "2026-07-01T05:00:00Z" }));
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([{ sport: "golf" }])); // no lastUpdated field

		const manifest = buildManifest(dataDir);

		expect(manifest.files["meta.json"].sourceLastUpdated).toBe("2026-07-01T05:00:00Z");
		expect(manifest.files["events.json"]).not.toHaveProperty("sourceLastUpdated");

		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("does not crash on a .json file that isn't valid JSON", () => {
		const dataDir = tmpDir("ss-manifest-badjson-");
		fs.writeFileSync(path.join(dataDir, "broken.json"), "{ not actually json");
		const manifest = buildManifest(dataDir);
		expect(manifest.files["broken.json"]).toBeTruthy();
		expect(manifest.files["broken.json"]).not.toHaveProperty("sourceLastUpdated");
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});

describe("determinism (WP-03 acceptance)", () => {
	it("sorts file keys alphabetically regardless of on-disk / creation order", () => {
		const dataDir = tmpDir("ss-manifest-sort-");
		// Write in a deliberately non-alphabetical order.
		fs.writeFileSync(path.join(dataDir, "zzz.json"), "{}");
		fs.writeFileSync(path.join(dataDir, "aaa.json"), "{}");
		fs.writeFileSync(path.join(dataDir, "mmm.json"), "{}");
		const manifest = buildManifest(dataDir);
		expect(Object.keys(manifest.files)).toEqual(["aaa.json", "mmm.json", "zzz.json"]);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("produces byte-identical JSON.stringify output across two builds with the same generatedAt", () => {
		const dataDir = tmpDir("ss-manifest-stable-");
		fs.writeFileSync(path.join(dataDir, "b.json"), JSON.stringify({ x: 1 }));
		fs.writeFileSync(path.join(dataDir, "a.json"), JSON.stringify({ y: 2 }));
		const now = Date.parse("2026-07-13T12:00:00Z");
		const first = JSON.stringify(buildManifest(dataDir, now));
		const second = JSON.stringify(buildManifest(dataDir, now));
		expect(first).toBe(second);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});

describe("idempotence (WP-03 acceptance)", () => {
	it("gives two runs over unchanged input identical content, aside from generatedAt", () => {
		const dataDir = tmpDir("ss-manifest-idem-");
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([{ sport: "golf", title: "Open" }]));
		fs.writeFileSync(path.join(dataDir, "tracked.json"), JSON.stringify({ athletes: ["Viktor Hovland"] }));
		fs.writeFileSync(path.join(dataDir, "events.ics"), "BEGIN:VCALENDAR\nEND:VCALENDAR\n");

		const first = buildManifest(dataDir, Date.parse("2026-07-13T10:00:00Z"));
		const second = buildManifest(dataDir, Date.parse("2026-07-13T14:00:00Z"));

		const { generatedAt: g1, ...rest1 } = first;
		const { generatedAt: g2, ...rest2 } = second;
		expect(g1).not.toBe(g2); // sanity: the injected clock actually moved
		expect(rest1).toEqual(rest2);

		fs.rmSync(dataDir, { recursive: true, force: true });
	});

	it("writeManifest is idempotent across two real invocations on disk", () => {
		const dataDir = tmpDir("ss-manifest-writeidem-");
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([{ sport: "golf" }]));

		writeManifest(dataDir, Date.parse("2026-07-13T10:00:00Z"));
		const firstOnDisk = JSON.parse(fs.readFileSync(path.join(dataDir, MANIFEST_NAME), "utf-8"));

		writeManifest(dataDir, Date.parse("2026-07-13T11:00:00Z"));
		const secondOnDisk = JSON.parse(fs.readFileSync(path.join(dataDir, MANIFEST_NAME), "utf-8"));

		const { generatedAt: g1, ...rest1 } = firstOnDisk;
		const { generatedAt: g2, ...rest2 } = secondOnDisk;
		expect(g1).not.toBe(g2);
		expect(rest1).toEqual(rest2);
		// And the manifest never lists itself, even on the second run where it
		// already existed on disk before writeManifest ran.
		expect(secondOnDisk.files).not.toHaveProperty(MANIFEST_NAME);

		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});

describe("build-manifest CLI entrypoint", () => {
	it("writes manifest.json when run directly with node", () => {
		const dataDir = tmpDir("ss-manifest-cli-");
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([{ sport: "golf" }]));
		execFileSync("node", ["scripts/build-manifest.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir },
		});
		const manifestPath = path.join(dataDir, MANIFEST_NAME);
		expect(fs.existsSync(manifestPath)).toBe(true);
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.files).toHaveProperty("events.json");
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});

describe("build-events.js integration (WP-03)", () => {
	it("writes manifest.json as the last step of a build-events.js run, covering events.json/tracked.json it just published", () => {
		const dataDir = tmpDir("ss-manifest-integ-");
		const configDir = tmpDir("ss-manifest-integ-cfg-");
		const future = new Date(Date.now() + 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "golf.json"),
			JSON.stringify({ tournaments: [{ name: "PGA Tour", events: [{ title: "Open", time: future, norwegian: true }] }] })
		);
		fs.writeFileSync(path.join(configDir, "tracked.json"), JSON.stringify({ athletes: [] }));

		execFileSync("node", ["scripts/build-events.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir },
		});

		const manifestPath = path.join(dataDir, MANIFEST_NAME);
		expect(fs.existsSync(manifestPath)).toBe(true);
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		expect(manifest.schemaVersion).toBe(1);
		expect(manifest.files).toHaveProperty("events.json");
		expect(manifest.files).toHaveProperty("tracked.json");
		expect(manifest.files).not.toHaveProperty(MANIFEST_NAME);

		// The hash must match what's actually on disk after the build.
		const eventsBuf = fs.readFileSync(path.join(dataDir, "events.json"));
		expect(manifest.files["events.json"].sha256).toBe(sha256(eventsBuf));
		expect(manifest.files["events.json"].bytes).toBe(eventsBuf.length);

		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it("running build-events.js twice on unchanged input yields an identical manifest, aside from generatedAt", () => {
		const dataDir = tmpDir("ss-manifest-integ2-");
		const configDir = tmpDir("ss-manifest-integ2-cfg-");
		const future = new Date(Date.now() + 2 * 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "football.json"),
			JSON.stringify({
				tournaments: [{ name: "Premier League", events: [{ title: "Liverpool vs Arsenal", time: future, homeTeam: "Liverpool", awayTeam: "Arsenal" }] }],
			})
		);
		const env = { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir };

		execFileSync("node", ["scripts/build-events.js"], { env });
		const first = JSON.parse(fs.readFileSync(path.join(dataDir, MANIFEST_NAME), "utf-8"));

		execFileSync("node", ["scripts/build-events.js"], { env }); // re-reads its own events.json output, rebuilds
		const second = JSON.parse(fs.readFileSync(path.join(dataDir, MANIFEST_NAME), "utf-8"));

		const { generatedAt: g1, ...rest1 } = first;
		const { generatedAt: g2, ...rest2 } = second;
		expect(rest1).toEqual(rest2);

		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});
