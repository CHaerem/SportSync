// validate-events.js: catches malformed events, enforces the AI-research contract.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

function runValidate(events) {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-validate-"));
	fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(events));
	let exitCode = 0;
	try {
		execFileSync("node", ["scripts/validate-events.js"], {
			env: { ...process.env, SPORTSYNC_DATA_DIR: dataDir },
			stdio: "pipe",
		});
	} catch (err) {
		exitCode = err.status;
	}
	fs.rmSync(dataDir, { recursive: true, force: true });
	return exitCode;
}

const future = new Date(Date.now() + 86400000).toISOString();

describe("validate-events", () => {
	it("passes valid events", () => {
		expect(runValidate([{ sport: "golf", title: "Open", time: future }])).toBe(0);
	});

	it("fails on missing time", () => {
		expect(runValidate([{ sport: "golf", title: "Open" }])).toBe(1);
	});

	it("fails on invalid time format", () => {
		expect(runValidate([{ sport: "golf", title: "Open", time: "not-a-date" }])).toBe(1);
	});

	it("fails on out-of-range importance", () => {
		expect(runValidate([{ sport: "golf", title: "Open", time: future, importance: 9 }])).toBe(1);
	});

	it("fails on ai-research event without valid confidence", () => {
		expect(runValidate([{ sport: "biathlon", title: "Sprint", time: future, source: "ai-research" }])).toBe(1);
	});

	it("fails on high-confidence ai-research event with fewer than 2 evidence URLs", () => {
		expect(
			runValidate([{ sport: "biathlon", title: "Sprint", time: future, source: "ai-research", confidence: "high", evidence: ["https://a.no"] }])
		).toBe(1);
	});

	it("passes high-confidence ai-research event with 2+ evidence URLs", () => {
		expect(
			runValidate([
				{ sport: "biathlon", title: "Sprint", time: future, source: "ai-research", confidence: "high", evidence: ["https://a.no", "https://b.no"] },
			])
		).toBe(0);
	});
});
