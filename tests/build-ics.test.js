// build-ics.js: calendar export emits valid VEVENT blocks.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

describe("build-ics", () => {
	it("emits valid VEVENT lines for events", () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-ics-"));
		const future = new Date(Date.now() + 86400000).toISOString();
		fs.writeFileSync(
			path.join(dataDir, "events.json"),
			JSON.stringify([{ sport: "golf", tournament: "PGA", title: "The Open", time: future, venue: "St Andrews" }])
		);
		execFileSync("node", ["scripts/build-ics.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir },
		});
		const ics = fs.readFileSync(path.join(dataDir, "events.ics"), "utf-8");
		expect(ics).toContain("BEGIN:VCALENDAR");
		expect(ics).toContain("BEGIN:VEVENT");
		expect(ics).toContain("END:VEVENT");
		expect(ics).toMatch(/SUMMARY:.*The Open/);
		fs.rmSync(dataDir, { recursive: true, force: true });
	});
});
