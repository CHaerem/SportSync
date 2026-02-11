import { describe, it, expect } from "vitest";
import { generateHealthReport } from "../scripts/pipeline-health.js";

const makeEvents = (sports) => {
	const events = [];
	for (const [sport, count] of Object.entries(sports)) {
		for (let i = 0; i < count; i++) {
			events.push({ sport, title: `${sport} event ${i}`, time: new Date().toISOString() });
		}
	}
	return events;
};

describe("generateHealthReport()", () => {
	it("generates a valid report with healthy status", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 10, golf: 3, tennis: 2 }),
			standings: {
				football: { premierLeague: [{ team: "Arsenal" }] },
				golf: { pga: { leaderboard: [{ player: "Scheffler" }] } },
				f1: { drivers: [{ driver: "Verstappen" }] },
			},
			rssDigest: { items: new Array(30).fill({ title: "News" }) },
			sportFiles: {
				"football.json": { lastUpdated: new Date().toISOString() },
				"golf.json": { lastUpdated: new Date().toISOString() },
			},
		});

		expect(report.status).toBe("healthy");
		expect(report.eventCount).toBe(15);
		expect(report.issues).toHaveLength(0);
		expect(report.generatedAt).toBeDefined();
		expect(report.sportCoverage.football.count).toBe(10);
	});

	it("detects sport dropping to 0", () => {
		const previousReport = {
			sportCoverage: {
				football: { count: 10 },
				chess: { count: 3 },
			},
		};

		const report = generateHealthReport({
			events: makeEvents({ football: 10 }),
			previousReport,
		});

		expect(report.status).toBe("critical");
		const dropped = report.issues.find((i) => i.code === "sport_dropped");
		expect(dropped).toBeDefined();
		expect(dropped.message).toContain("chess");
		expect(dropped.message).toContain("0 events");
	});

	it("flags stale data", () => {
		const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7 hours ago
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"football.json": { lastUpdated: staleDate },
			},
		});

		expect(report.dataFreshness["football.json"].stale).toBe(true);
		const staleIssue = report.issues.find((i) => i.code === "stale_data");
		expect(staleIssue).toBeDefined();
	});

	it("reports low RSS count", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			rssDigest: { items: [{ title: "One" }, { title: "Two" }] },
		});

		expect(report.rssFeedHealth.healthy).toBe(false);
		expect(report.rssFeedHealth.itemCount).toBe(2);
		const rssIssue = report.issues.find((i) => i.code === "rss_low");
		expect(rssIssue).toBeDefined();
	});

	it("reports empty standings", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			standings: {
				football: { premierLeague: [] },
				golf: { pga: { leaderboard: [] } },
				f1: { drivers: [] },
			},
		});

		const standingsIssues = report.issues.filter((i) => i.code === "standings_empty");
		expect(standingsIssues.length).toBe(3);
	});

	it("escalates status: healthy → warning → critical", () => {
		// Healthy: no issues — provide full standings and RSS to avoid warnings
		const healthy = generateHealthReport({
			events: makeEvents({ football: 5 }),
			standings: {
				football: { premierLeague: [{ team: "Arsenal" }] },
				golf: { pga: { leaderboard: [{ player: "S" }] } },
				f1: { drivers: [{ driver: "V" }] },
			},
			rssDigest: { items: new Array(10).fill({ title: "News" }) },
		});
		expect(healthy.status).toBe("healthy");

		// Warning: stale data
		const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
		const warning = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: { "football.json": { lastUpdated: staleDate } },
		});
		expect(warning.status).toBe("warning");

		// Critical: sport dropped
		const critical = generateHealthReport({
			events: makeEvents({ football: 5 }),
			previousReport: { sportCoverage: { football: { count: 5 }, chess: { count: 3 } } },
		});
		expect(critical.status).toBe("critical");
	});

	it("detects >50% sport count drop as warning", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 3 }),
			previousReport: { sportCoverage: { football: { count: 10 } } },
		});

		const dropIssue = report.issues.find((i) => i.code === "sport_count_drop");
		expect(dropIssue).toBeDefined();
		expect(dropIssue.severity).toBe("warning");
	});

	it("calculates schema completeness", () => {
		const events = [
			{ sport: "football", venue: "Emirates Stadium", streaming: [{ platform: "TV2" }] },
			{ sport: "football", venue: "TBD", streaming: [] },
			{ sport: "football" },
		];
		const report = generateHealthReport({ events });
		expect(report.schemaCompleteness.venuePercent).toBeCloseTo(0.33, 1);
		expect(report.schemaCompleteness.streamingPercent).toBeCloseTo(0.33, 1);
	});

	it("handles null standings gracefully", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			standings: null,
		});
		expect(report.standingsHealth.premierLeague).toBe(false);
	});

	it("handles missing previous report", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			previousReport: null,
		});
		expect(report.sportCoverage.football.previousCount).toBeNull();
		expect(report.sportCoverage.football.delta).toBeNull();
	});
});
