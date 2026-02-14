import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

let tmpDir;

function futureTime(hoursAhead = 24) {
	return new Date(Date.now() + hoursAhead * 3600000).toISOString();
}

function writeEvents(events) {
	fs.writeFileSync(path.join(tmpDir, "events.json"), JSON.stringify(events));
}

function runValidate() {
	return execSync("node scripts/validate-events.js", {
		cwd: process.cwd(),
		env: { ...process.env, SPORTSYNC_DATA_DIR: tmpDir },
	}).toString();
}

describe("validate-events.js", () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-events-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("passes with valid events", () => {
		writeEvents([
			{
				sport: "football",
				title: "Test Match",
				time: futureTime(),
				tournament: "Test League",
			},
		]);
		const output = runValidate();
		expect(output).toContain("0 error(s)");
	});

	it("passes with valid enrichment fields", () => {
		writeEvents([
			{
				sport: "football",
				title: "Test Match",
				time: futureTime(),
				tournament: "Test",
				importance: 4,
				norwegianRelevance: 2,
				tags: ["must-watch"],
			},
		]);
		const output = runValidate();
		expect(output).toContain("0 error(s)");
		expect(output).toContain("1 enriched");
	});

	it("fails on invalid importance", () => {
		writeEvents([
			{
				sport: "football",
				title: "Test",
				time: futureTime(),
				tournament: "Test",
				importance: 10,
			},
		]);
		expect(() => runValidate()).toThrow();
	});

	it("fails on invalid tags type", () => {
		writeEvents([
			{
				sport: "football",
				title: "Test",
				time: futureTime(),
				tournament: "Test",
				tags: "not-an-array",
			},
		]);
		expect(() => runValidate()).toThrow();
	});

	it("warns about timezone bleed when endTime crosses CET midnight", () => {
		// endTime at 23:30 UTC → 00:30 CET next day = timezone bleed
		const tomorrow = new Date(Date.now() + 24 * 3600000);
		const endTime = new Date(tomorrow);
		endTime.setUTCHours(23, 30, 0, 0);
		writeEvents([
			{
				sport: "golf",
				title: "Test Tournament",
				time: futureTime(),
				endTime: endTime.toISOString(),
				tournament: "PGA Tour",
			},
		]);
		// console.warn goes to stderr — redirect to capture it
		const output = execSync("node scripts/validate-events.js 2>&1", {
			cwd: process.cwd(),
			env: { ...process.env, SPORTSYNC_DATA_DIR: tmpDir },
		}).toString();
		expect(output).toContain("Timezone bleed");
		expect(output).toContain("crosses midnight in CET");
	});

	it("no timezone bleed warning for safe endTime", () => {
		const tomorrow = new Date(Date.now() + 24 * 3600000);
		const endTime = new Date(tomorrow);
		endTime.setUTCHours(20, 0, 0, 0); // 21:00 CET — safe
		writeEvents([
			{
				sport: "golf",
				title: "Test Tournament",
				time: futureTime(),
				endTime: endTime.toISOString(),
				tournament: "PGA Tour",
			},
		]);
		// Capture stderr too so we can confirm no timezone bleed warning
		const output = execSync("node scripts/validate-events.js 2>&1", {
			cwd: process.cwd(),
			env: { ...process.env, SPORTSYNC_DATA_DIR: tmpDir },
		}).toString();
		expect(output).toContain("0 error(s)");
		expect(output).not.toContain("Timezone bleed");
	});
});
