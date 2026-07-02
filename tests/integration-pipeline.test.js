// E2E: fixture sport data → build-events → validate passes → ICS builds.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

describe("pipeline integration", () => {
	it("fixture data flows through build → validate → ics", () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-e2e-"));
		const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-e2e-cfg-"));
		const env = { ...process.env, SPORTSYNC_DATA_DIR: dataDir, SPORTSYNC_CONFIG_DIR: configDir };
		const future = (d) => new Date(Date.now() + d * 86400000).toISOString();

		// Fixture: one static sport file + one prior AI-research event + tracked.json
		fs.writeFileSync(path.join(dataDir, "football.json"), JSON.stringify({
			tournaments: [{ name: "Premier League", events: [
				{ title: "Liverpool vs Arsenal", time: future(1), homeTeam: "Liverpool", awayTeam: "Arsenal" },
			] }],
		}));
		fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify([
			{ sport: "biathlon", title: "Holmenkollen Sprint", time: future(3), source: "ai-research", confidence: "medium", evidence: ["https://nrk.no/x"] },
		]));
		fs.writeFileSync(path.join(configDir, "tracked.json"), JSON.stringify({ version: 1, leagues: [], athletes: [], tournaments: [], notes: [] }));

		execFileSync("node", ["scripts/build-events.js"], { env });
		execFileSync("node", ["scripts/validate-events.js"], { env });
		execFileSync("node", ["scripts/build-ics.js"], { env });

		const events = JSON.parse(fs.readFileSync(path.join(dataDir, "events.json"), "utf-8"));
		expect(events).toHaveLength(2);
		expect(events.some((e) => e.source === "ai-research")).toBe(true);
		expect(fs.existsSync(path.join(dataDir, "events.ics"))).toBe(true);
		expect(fs.existsSync(path.join(dataDir, "tracked.json"))).toBe(true);

		fs.rmSync(dataDir, { recursive: true, force: true });
		fs.rmSync(configDir, { recursive: true, force: true });
	});
});
