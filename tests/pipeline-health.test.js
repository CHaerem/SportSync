import { describe, it, expect } from "vitest";
import { generateHealthReport, generateStatusSummary } from "../scripts/pipeline-health.js";

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
		// info-level issues (empty_day) don't affect health status
		const nonInfoIssues = report.issues.filter(i => i.severity !== "info");
		expect(nonInfoIssues).toHaveLength(0);
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

	it("detects sport with data file but zero events", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"football.json": { lastUpdated: new Date().toISOString() },
				"tennis.json": { lastUpdated: new Date().toISOString() },
			},
		});

		expect(report.sportCoverage.tennis).toBeDefined();
		expect(report.sportCoverage.tennis.count).toBe(0);
		const zeroIssue = report.issues.find((i) => i.code === "sport_zero_events");
		expect(zeroIssue).toBeDefined();
		expect(zeroIssue.message).toContain("tennis");
	});

	it("does not flag sport_zero_events when all sports have events", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5, tennis: 2 }),
			sportFiles: {
				"football.json": { lastUpdated: new Date().toISOString() },
				"tennis.json": { lastUpdated: new Date().toISOString() },
			},
		});

		const zeroIssue = report.issues.find((i) => i.code === "sport_zero_events");
		expect(zeroIssue).toBeUndefined();
	});

	it("handles missing previous report", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			previousReport: null,
		});
		expect(report.sportCoverage.football.previousCount).toBeNull();
		expect(report.sportCoverage.football.delta).toBeNull();
	});

	it("warns when recent-results.json is stale", () => {
		const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: { lastUpdated: staleDate, football: [], golf: {} },
		});

		expect(report.resultsHealth.present).toBe(true);
		expect(report.resultsHealth.stale).toBe(true);
		const staleIssue = report.issues.find((i) => i.code === "results_stale");
		expect(staleIssue).toBeDefined();
	});

	it("no results warning when fresh", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: {
				lastUpdated: new Date().toISOString(),
				football: [{ homeTeam: "Arsenal", awayTeam: "Liverpool" }],
				golf: {},
			},
			standings: {
				football: { premierLeague: [{ team: "Arsenal" }] },
				golf: { pga: { leaderboard: [{ player: "S" }] } },
				f1: { drivers: [{ driver: "V" }] },
			},
			rssDigest: { items: new Array(10).fill({ title: "News" }) },
		});

		expect(report.resultsHealth.present).toBe(true);
		expect(report.resultsHealth.stale).toBe(false);
		expect(report.resultsHealth.footballCount).toBe(1);
		const staleIssue = report.issues.find((i) => i.code === "results_stale");
		expect(staleIssue).toBeUndefined();
	});

	it("handles null recentResults gracefully", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: null,
		});
		expect(report.resultsHealth.present).toBe(false);
	});

	it("flags stale critical outputs (featured.json, ai-quality.json)", () => {
		const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			criticalOutputs: {
				"featured.json": { generatedAt: staleDate },
				"ai-quality.json": { generatedAt: staleDate },
			},
		});

		const staleIssues = report.issues.filter((i) => i.code === "stale_output");
		expect(staleIssues).toHaveLength(2);
		expect(staleIssues[0].message).toContain("featured.json");
		expect(staleIssues[1].message).toContain("ai-quality.json");
		expect(report.dataFreshness["featured.json"].stale).toBe(true);
	});

	it("does not flag fresh critical outputs", () => {
		const freshDate = new Date().toISOString();
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			criticalOutputs: {
				"featured.json": { generatedAt: freshDate },
				"ai-quality.json": { generatedAt: freshDate },
			},
		});

		const staleIssues = report.issues.filter((i) => i.code === "stale_output");
		expect(staleIssues).toHaveLength(0);
		expect(report.dataFreshness["featured.json"].stale).toBe(false);
	});

	it("handles missing criticalOutputs gracefully", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
		});
		// No criticalOutputs passed — should not crash
		const staleIssues = report.issues.filter((i) => i.code === "stale_output");
		expect(staleIssues).toHaveLength(0);
	});

	it("detects empty days in day navigator (no events or results)", () => {
		// No events, no results → all past 5 days are empty
		const report = generateHealthReport({
			events: [],
			recentResults: { football: [] },
		});

		const emptyDays = report.issues.filter((i) => i.code === "empty_day");
		expect(emptyDays.length).toBe(5);
		expect(emptyDays[0].severity).toBe("info");
		expect(emptyDays[0].message).toContain("no events or results");
	});

	it("no empty_day warning when results cover past dates", () => {
		// Create results for each of the past 5 days
		const football = [];
		for (let i = 1; i <= 5; i++) {
			const d = new Date(Date.now() - i * 86400000);
			football.push({
				homeTeam: "Arsenal",
				awayTeam: "Liverpool",
				date: d.toISOString(),
			});
		}
		const report = generateHealthReport({
			events: [],
			recentResults: { football },
		});

		const emptyDays = report.issues.filter((i) => i.code === "empty_day");
		expect(emptyDays.length).toBe(0);
	});
});

describe("snapshot health checks", () => {
	it("reports snapshotHealth when meta is provided", () => {
		const now = new Date();
		const perDay = {};
		for (let i = -7; i <= 7; i++) {
			const d = new Date(now);
			d.setDate(d.getDate() + i);
			const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			perDay[dk] = { eventCount: 0, resultCount: 0, sports: [] };
		}
		const report = generateHealthReport({
			events: [],
			snapshotHealth: {
				meta: {
					generatedAt: now.toISOString(),
					snapshotCount: 15,
					perDay,
					emptyDays: [],
				},
			},
		});

		expect(report.snapshotHealth.present).toBe(true);
		expect(report.snapshotHealth.snapshotCount).toBe(15);
	});

	it("flags empty day snapshots as info", () => {
		const report = generateHealthReport({
			events: [],
			snapshotHealth: {
				meta: {
					generatedAt: new Date().toISOString(),
					snapshotCount: 15,
					perDay: {},
					emptyDays: ["2026-02-10", "2026-02-11"],
				},
			},
		});

		const emptySnap = report.issues.find(i => i.code === "empty_day_snapshot");
		expect(emptySnap).toBeDefined();
		expect(emptySnap.severity).toBe("info");
		expect(emptySnap.message).toContain("2");
	});

	it("flags stale snapshots as warning", () => {
		const staleDate = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5h ago
		const report = generateHealthReport({
			events: [],
			snapshotHealth: {
				meta: {
					generatedAt: staleDate,
					snapshotCount: 15,
					perDay: {},
					emptyDays: [],
				},
			},
		});

		const staleSnap = report.issues.find(i => i.code === "stale_snapshot");
		expect(staleSnap).toBeDefined();
		expect(staleSnap.severity).toBe("warning");
	});

	it("flags missing snapshots as warning", () => {
		const report = generateHealthReport({
			events: [],
			snapshotHealth: {
				meta: {
					generatedAt: new Date().toISOString(),
					snapshotCount: 5,
					perDay: { "2026-01-01": { eventCount: 0, resultCount: 0, sports: [] } },
					emptyDays: [],
				},
			},
		});

		const missing = report.issues.find(i => i.code === "missing_snapshot");
		expect(missing).toBeDefined();
		expect(missing.severity).toBe("warning");
	});

	it("flags event count mismatch as critical", () => {
		const now = new Date();
		const dk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			snapshotHealth: {
				meta: {
					generatedAt: now.toISOString(),
					snapshotCount: 1,
					perDay: { [dk]: { eventCount: 99, resultCount: 0, sports: ["football"] } },
					emptyDays: [],
				},
			},
		});

		const mismatch = report.issues.find(i => i.code === "snapshot_event_mismatch");
		expect(mismatch).toBeDefined();
		expect(mismatch.severity).toBe("critical");
	});

	it("no snapshot issues when meta is absent", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
		});

		expect(report.snapshotHealth.present).toBe(false);
		const snapIssues = report.issues.filter(i =>
			["empty_day_snapshot", "stale_snapshot", "missing_snapshot", "snapshot_event_mismatch"].includes(i.code)
		);
		expect(snapIssues).toHaveLength(0);
	});
});

describe("generateStatusSummary()", () => {
	it("generates a fallback summary without API key", async () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 10, golf: 3 }),
		});
		const autonomy = { overallScore: 1, loopsClosed: 6, loopsTotal: 6 };
		const quality = { editorial: { score: 95 } };

		const summary = await generateStatusSummary(report, autonomy, quality);
		expect(summary).toContain("100%");
		expect(summary).toContain("6/6");
		expect(summary).toContain("95");
	});

	it("handles null inputs gracefully", async () => {
		const report = generateHealthReport({ events: [] });
		const summary = await generateStatusSummary(report, null, null);
		expect(typeof summary).toBe("string");
		expect(summary.length).toBeGreaterThan(0);
	});

	it("includes issue counts for non-healthy pipeline", async () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			previousReport: { sportCoverage: { football: { count: 5 }, chess: { count: 3 } } },
		});
		const autonomy = { overallScore: 0.83, loopsClosed: 5, loopsTotal: 6 };

		const summary = await generateStatusSummary(report, autonomy, null);
		expect(summary).toContain("critical");
	});
});
