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
