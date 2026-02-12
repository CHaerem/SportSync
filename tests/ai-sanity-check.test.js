import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSanityCheck } from "../scripts/ai-sanity-check.js";
import { readJsonIfExists } from "../scripts/lib/helpers.js";

// Mock readJsonIfExists to provide test data
vi.mock("../scripts/lib/helpers.js", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		readJsonIfExists: vi.fn(),
		rootDataPath: actual.rootDataPath,
	};
});

const makeEvents = (overrides = []) => {
	const base = [
		{ title: "Arsenal v Chelsea", sport: "football", time: new Date(Date.now() + 3600000).toISOString(), importance: 4 },
		{ title: "AT&T Pebble Beach", sport: "golf", time: new Date(Date.now() - 7200000).toISOString(), endTime: new Date(Date.now() + 2 * 86400000).toISOString(), importance: 3 },
	];
	return [...base, ...overrides];
};

beforeEach(() => {
	readJsonIfExists.mockImplementation((filePath) => {
		if (filePath.includes("events.json")) return makeEvents();
		if (filePath.includes("featured.json")) return { blocks: [{ type: "headline", text: "Today's Brief" }] };
		if (filePath.includes("health-report.json")) return { status: "healthy", sportCoverage: { football: { count: 1 }, golf: { count: 1 } }, issues: [] };
		if (filePath.includes("ai-quality.json")) return { editorial: { score: 95 }, enrichment: { score: 100 }, featured: { score: 100 } };
		if (filePath.includes("standings.json")) return { football: { premierLeague: [{ team: "Arsenal" }] } };
		if (filePath.includes("meta.json")) return { lastUpdate: new Date().toISOString() };
		return null;
	});
});

describe("runSanityCheck()", () => {
	it("returns a valid report with pass=true for healthy data", async () => {
		const report = await runSanityCheck();
		expect(report.pass).toBe(true);
		expect(report.generatedAt).toBeDefined();
		expect(report.provider).toBe("rules-only");
		expect(report.summary).toBeDefined();
		expect(report.snapshot).toBeDefined();
	});

	it("snapshot classifies events into temporal bands", async () => {
		const report = await runSanityCheck();
		expect(report.snapshot.totalEvents).toBe(2);
		expect(report.snapshot.sports).toContain("football");
		expect(report.snapshot.sports).toContain("golf");
	});

	it("detects duplicate events", async () => {
		const dupeTime = new Date(Date.now() + 3600000).toISOString();
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return [
				{ title: "Same Event", sport: "football", time: dupeTime },
				{ title: "Same Event", sport: "football", time: dupeTime },
			];
			return null;
		});
		const report = await runSanityCheck();
		const dupe = report.findings.find(f => f.check === "duplicate_event");
		expect(dupe).toBeDefined();
	});

	it("detects events too far in the future", async () => {
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return [
				{ title: "Far Away Event", sport: "chess", time: new Date(Date.now() + 30 * 86400000).toISOString() },
			];
			return null;
		});
		const report = await runSanityCheck();
		const far = report.findings.find(f => f.check === "event_too_far");
		expect(far).toBeDefined();
		expect(far.message).toContain("Far Away Event");
	});

	it("detects sport vanished from health report", async () => {
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return makeEvents();
			if (filePath.includes("health-report.json")) return {
				status: "critical",
				sportCoverage: { football: { count: 1 } },
				issues: [{ severity: "critical", code: "sport_dropped", message: "chess: 0 events (was 5)" }],
			};
			return null;
		});
		const report = await runSanityCheck();
		expect(report.pass).toBe(false);
		const vanished = report.findings.find(f => f.check === "sport_vanished");
		expect(vanished).toBeDefined();
	});

	it("detects low editorial quality", async () => {
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return makeEvents();
			if (filePath.includes("ai-quality.json")) return { editorial: { score: 50 } };
			return null;
		});
		const report = await runSanityCheck();
		const low = report.findings.find(f => f.check === "low_editorial_quality");
		expect(low).toBeDefined();
	});

	it("detects stale dashboard data", async () => {
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return makeEvents();
			if (filePath.includes("meta.json")) return { lastUpdate: new Date(Date.now() - 5 * 3600000).toISOString() };
			return null;
		});
		const report = await runSanityCheck();
		const stale = report.findings.find(f => f.check === "stale_dashboard");
		expect(stale).toBeDefined();
	});

	it("handles empty events gracefully", async () => {
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return [];
			return null;
		});
		const report = await runSanityCheck();
		expect(report.pass).toBe(true);
		expect(report.snapshot.totalEvents).toBe(0);
	});

	it("detects events with missing fields", async () => {
		readJsonIfExists.mockImplementation((filePath) => {
			if (filePath.includes("events.json")) return [
				{ sport: "football", time: new Date().toISOString() },
			];
			return null;
		});
		const report = await runSanityCheck();
		const missing = report.findings.find(f => f.check === "missing_title");
		expect(missing).toBeDefined();
	});
});
