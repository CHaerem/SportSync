import { describe, it, expect } from "vitest";
import { generateHealthReport, generateStatusSummary, analyzePipelineTiming } from "../scripts/pipeline-health.js";

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

	it("uses info severity for zero events with fresh data", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"football.json": { lastUpdated: new Date().toISOString() },
				"tennis.json": { lastUpdated: new Date().toISOString() },
			},
		});

		const zeroIssue = report.issues.find((i) => i.code === "sport_zero_events");
		expect(zeroIssue).toBeDefined();
		expect(zeroIssue.severity).toBe("info");
	});

	it("uses warning severity for zero events with stale data", () => {
		const staleTime = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7h ago
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"football.json": { lastUpdated: new Date().toISOString() },
				"tennis.json": { lastUpdated: staleTime },
			},
		});

		const zeroIssue = report.issues.find((i) => i.code === "sport_zero_events");
		expect(zeroIssue).toBeDefined();
		expect(zeroIssue.severity).toBe("warning");
		expect(zeroIssue.message).toContain("stale");
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

	it("flags empty day snapshots within event range as info", () => {
		const report = generateHealthReport({
			events: [
				{ sport: "football", time: "2026-02-09T15:00:00Z" },
				{ sport: "football", time: "2026-02-12T15:00:00Z" },
			],
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

	it("does not flag boundary empty snapshots outside event range", () => {
		const report = generateHealthReport({
			events: [
				{ sport: "football", time: "2026-02-15T15:00:00Z" },
			],
			snapshotHealth: {
				meta: {
					generatedAt: new Date().toISOString(),
					snapshotCount: 15,
					perDay: {},
					emptyDays: ["2026-02-10", "2026-02-24"],
				},
			},
		});

		const emptySnap = report.issues.find(i => i.code === "empty_day_snapshot");
		expect(emptySnap).toBeUndefined();
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

describe("results validation and recap tracking", () => {
	it("detects low validation pass rate", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: {
				lastUpdated: new Date().toISOString(),
				football: [{ homeTeam: "A", awayTeam: "B" }],
				validationMetrics: { totalResults: 10, validResults: 7 },
			},
		});

		expect(report.resultsHealth.validationPassRate).toBe(0.7);
		const issue = report.issues.find(i => i.code === "results_validation_low");
		expect(issue).toBeDefined();
		expect(issue.message).toContain("70%");
	});

	it("no validation warning when pass rate is high", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: {
				lastUpdated: new Date().toISOString(),
				football: [],
				validationMetrics: { totalResults: 10, validResults: 10 },
			},
		});

		expect(report.resultsHealth.validationPassRate).toBe(1);
		const issue = report.issues.find(i => i.code === "results_validation_low");
		expect(issue).toBeUndefined();
	});

	it("computes recapHeadlineRate correctly", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: {
				lastUpdated: new Date().toISOString(),
				football: [
					{ homeTeam: "A", awayTeam: "B", recapHeadline: "Great match!" },
					{ homeTeam: "C", awayTeam: "D" },
					{ homeTeam: "E", awayTeam: "F", recapHeadline: "Stunning upset" },
				],
			},
		});

		expect(report.resultsHealth.recapHeadlineRate).toBeCloseTo(0.67, 1);
	});

	it("recapHeadlineRate is null when no football results", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: {
				lastUpdated: new Date().toISOString(),
				football: [],
			},
		});

		expect(report.resultsHealth.recapHeadlineRate).toBeNull();
	});
});

describe("preference evolution freshness", () => {
	it("flags stale preference evolution (>7 days)", () => {
		const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			preferenceEvolution: { lastEvolved: staleDate },
		});

		const issue = report.issues.find(i => i.code === "preference_evolution_stale");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("info");
	});

	it("no warning when preference evolution is recent", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			preferenceEvolution: { lastEvolved: new Date().toISOString() },
		});

		const issue = report.issues.find(i => i.code === "preference_evolution_stale");
		expect(issue).toBeUndefined();
	});
});

describe("fact-check history freshness", () => {
	it("flags stale fact-check history (>48h)", () => {
		const staleDate = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			factCheckHistory: [{ timestamp: staleDate }],
		});

		const issue = report.issues.find(i => i.code === "fact_check_stale");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("warning");
	});

	it("no warning when fact-check is recent", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			factCheckHistory: [{ timestamp: new Date().toISOString() }],
		});

		const issue = report.issues.find(i => i.code === "fact_check_stale");
		expect(issue).toBeUndefined();
	});

	it("handles empty fact-check history array", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			factCheckHistory: [],
		});

		const issue = report.issues.find(i => i.code === "fact_check_stale");
		expect(issue).toBeUndefined();
	});
});

describe("invisible events detection", () => {
	it("flags events with past dates as invisible", () => {
		const pastEvent = {
			sport: "chess",
			title: "Past Tournament",
			time: new Date(Date.now() - 2 * 86400000).toISOString(),
		};
		const futureEvent = {
			sport: "football",
			title: "Future Match",
			time: new Date(Date.now() + 86400000).toISOString(),
		};
		const report = generateHealthReport({
			events: [pastEvent, futureEvent],
		});

		const invisible = report.issues.find(i => i.code === "invisible_events");
		expect(invisible).toBeDefined();
		expect(invisible.message).toContain("1 event(s)");
		expect(invisible.message).toContain("chess");
	});

	it("no invisible events warning when all events are in the future", () => {
		const events = [
			{ sport: "football", title: "Match", time: new Date(Date.now() + 86400000).toISOString() },
		];
		const report = generateHealthReport({ events });

		const invisible = report.issues.find(i => i.code === "invisible_events");
		expect(invisible).toBeUndefined();
	});

	it("multi-day events with endTime spanning today are NOT invisible", () => {
		const event = {
			sport: "golf",
			title: "PGA Tour",
			time: new Date(Date.now() - 2 * 86400000).toISOString(),
			endTime: new Date(Date.now() + 2 * 86400000).toISOString(),
		};
		const report = generateHealthReport({ events: [event] });

		const invisible = report.issues.find(i => i.code === "invisible_events");
		expect(invisible).toBeUndefined();
	});
});

describe("quota API health check", () => {
	it("reports quota_api_unavailable when API is down", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			usageTracking: {
				quotaApiStatus: { available: false, since: "2026-01-01T00:00:00Z", transitioned: false },
			},
		});
		expect(report.quotaApiHealth.available).toBe(false);
		const issue = report.issues.find(i => i.code === "quota_api_unavailable");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("info");
	});

	it("reports quota_api_restored on transition to available", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			usageTracking: {
				quotaApiStatus: { available: true, since: "2026-02-16T00:00:00Z", transitioned: true },
			},
		});
		expect(report.quotaApiHealth.available).toBe(true);
		expect(report.quotaApiHealth.transitioned).toBe(true);
		const issue = report.issues.find(i => i.code === "quota_api_restored");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("info");
	});

	it("includes quotaApiHealth in report when no tracking data", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
		});
		expect(report.quotaApiHealth).toBeDefined();
		expect(report.quotaApiHealth.available).toBe(false);
	});

	it("does not add issues when no usageTracking provided", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
		});
		const quotaIssues = report.issues.filter(i => i.code?.startsWith("quota_api"));
		expect(quotaIssues).toHaveLength(0);
	});
});

describe("Norwegian tagging anomaly detection", () => {
	it("flags sport where all events are tagged norwegian without players", () => {
		const events = [];
		for (let i = 0; i < 5; i++) {
			events.push({ sport: "tennis", title: `Tennis match ${i}`, time: new Date().toISOString(), norwegian: true });
		}
		const report = generateHealthReport({ events });
		const anomaly = report.issues.find(i => i.code === "norwegian_tagging_anomaly");
		expect(anomaly).toBeDefined();
		expect(anomaly.message).toContain("tennis");
		expect(anomaly.message).toContain("false positives");
	});

	it("does not flag when events have norwegianPlayers listed", () => {
		const events = [];
		for (let i = 0; i < 5; i++) {
			events.push({
				sport: "tennis", title: `Tennis match ${i}`, time: new Date().toISOString(),
				norwegian: true, norwegianPlayers: [{ name: "Casper Ruud" }],
			});
		}
		const report = generateHealthReport({ events });
		const anomaly = report.issues.find(i => i.code === "norwegian_tagging_anomaly");
		expect(anomaly).toBeUndefined();
	});

	it("does not flag sports with fewer than 3 events", () => {
		const events = [
			{ sport: "chess", title: "Chess 1", time: new Date().toISOString(), norwegian: true },
			{ sport: "chess", title: "Chess 2", time: new Date().toISOString(), norwegian: true },
		];
		const report = generateHealthReport({ events });
		const anomaly = report.issues.find(i => i.code === "norwegian_tagging_anomaly");
		expect(anomaly).toBeUndefined();
	});

	it("does not flag when tagging rate is below threshold", () => {
		const events = [];
		for (let i = 0; i < 10; i++) {
			events.push({ sport: "football", title: `Match ${i}`, time: new Date().toISOString(), norwegian: i < 2 });
		}
		const report = generateHealthReport({ events });
		const anomaly = report.issues.find(i => i.code === "norwegian_tagging_anomaly");
		expect(anomaly).toBeUndefined();
	});
});

describe("editorial content duplication detection", () => {
	it("flags duplication when event-lines repeat section items", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "fallback",
				blocks: [
					{ type: "event-line", text: "10:00 — Biathlon Sprint" },
					{ type: "event-line", text: "13:00 — Cross-Country" },
					{ type: "section", id: "olympics", title: "Olympics", items: [
						{ text: "10:00 — Biathlon Sprint", type: "event" },
						{ text: "13:00 — Cross-Country", type: "event" },
					] },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_content_duplication");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("warning");
	});

	it("does not flag when event-lines and sections are different", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "fallback",
				blocks: [
					{ type: "event-line", text: "⚽ Arsenal vs Chelsea, 20:00" },
					{ type: "section", id: "olympics", title: "Olympics", items: [
						{ text: "10:00 — Biathlon Sprint", type: "event" },
					] },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_content_duplication");
		expect(issue).toBeUndefined();
	});
});

describe("editorial no narrative detection", () => {
	it("flags fallback content with no headline or narrative", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "fallback",
				blocks: [
					{ type: "event-line", text: "⚽ Arsenal vs Chelsea" },
					{ type: "event-line", text: "⛳ PGA Tour" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_no_narrative");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("warning");
	});

	it("does not flag when headline exists", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "fallback",
				blocks: [
					{ type: "headline", text: "Big day in football" },
					{ type: "event-line", text: "⚽ Arsenal vs Chelsea" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_no_narrative");
		expect(issue).toBeUndefined();
	});

	it("does not flag non-fallback provider", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "claude-cli",
				blocks: [
					{ type: "event-line", text: "⚽ Arsenal vs Chelsea" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_no_narrative");
		expect(issue).toBeUndefined();
	});
});

describe("editorial unsorted events detection", () => {
	it("flags when This Week events are not chronological", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "fallback",
				blocks: [
					{ type: "divider", text: "This Week" },
					{ type: "event-line", text: "⚽ Fri 20:00 — Match A" },
					{ type: "event-line", text: "🎮 Wed 10:00 — Match B" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_unsorted_events");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("warning");
	});

	it("does not flag when This Week events are in order", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				provider: "fallback",
				blocks: [
					{ type: "divider", text: "This Week" },
					{ type: "event-line", text: "⚽ Wed 20:00 — Match A" },
					{ type: "event-line", text: "🎮 Thu 10:00 — Match B" },
					{ type: "event-line", text: "🏎️ Fri 02:30 — Match C" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_unsorted_events");
		expect(issue).toBeUndefined();
	});
});

describe("editorial personalization detection", () => {
	it("flags section with Norwegian events but no flag indicators", () => {
		const events = [
			{ sport: "olympics", context: "olympics-2026", title: "Biathlon", time: new Date(Date.now() + 3600000).toISOString(), norwegian: true },
			{ sport: "olympics", context: "olympics-2026", title: "Cross-Country", time: new Date(Date.now() + 7200000).toISOString(), norwegian: true },
			{ sport: "football", title: "Match", time: new Date(Date.now() + 3600000).toISOString() },
		];
		const report = generateHealthReport({
			events,
			featured: {
				provider: "fallback",
				blocks: [
					{
						type: "section",
						id: "olympics-2026",
						title: "Winter Olympics 2026",
						items: [
							{ text: "14:30 — Biathlon", type: "event" },
							{ text: "15:30 — Cross-Country", type: "event" },
						],
					},
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_missing_personalization");
		expect(issue).toBeDefined();
	});

	it("does not flag when section items have Norwegian flags", () => {
		const events = [
			{ sport: "olympics", context: "olympics-2026", title: "Biathlon", time: new Date(Date.now() + 3600000).toISOString(), norwegian: true },
			{ sport: "olympics", context: "olympics-2026", title: "Cross-Country", time: new Date(Date.now() + 7200000).toISOString(), norwegian: true },
		];
		const report = generateHealthReport({
			events,
			featured: {
				provider: "fallback",
				blocks: [
					{
						type: "section",
						id: "olympics-2026",
						title: "Winter Olympics 2026",
						items: [
							{ text: "14:30 — Biathlon 🇳🇴", type: "event" },
							{ text: "15:30 — Cross-Country 🇳🇴", type: "event" },
						],
					},
				],
			},
		});
		const issue = report.issues.find(i => i.code === "editorial_missing_personalization");
		expect(issue).toBeUndefined();
	});
});

describe("chronic data retention detection", () => {
	it("flags sport with high consecutive retains", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"tennis.json": {
					lastUpdated: new Date().toISOString(),
					tournaments: [{ events: [{ title: "Old match", time: new Date().toISOString() }] }],
					_retained: { since: "2026-02-15T00:00:00Z", consecutiveRetains: 5, lastFreshFetch: "2026-02-14T00:00:00Z" },
				},
			},
		});
		const issue = report.issues.find(i => i.code === "chronic_data_retention");
		expect(issue).toBeDefined();
		expect(issue.message).toContain("tennis");
		expect(issue.message).toContain("5 consecutive");
	});

	it("does not flag sport with low consecutive retains", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"tennis.json": {
					lastUpdated: new Date().toISOString(),
					tournaments: [{ events: [{ title: "Match", time: new Date().toISOString() }] }],
					_retained: { since: "2026-02-17T00:00:00Z", consecutiveRetains: 1 },
				},
			},
		});
		const issue = report.issues.find(i => i.code === "chronic_data_retention");
		expect(issue).toBeUndefined();
	});

	it("does not flag sport without retention metadata", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			sportFiles: {
				"football.json": {
					lastUpdated: new Date().toISOString(),
					tournaments: [{ events: [{ title: "Match", time: new Date().toISOString() }] }],
				},
			},
		});
		const issue = report.issues.find(i => i.code === "chronic_data_retention");
		expect(issue).toBeUndefined();
	});
});

describe("component block resolution checks", () => {
	it("warns when match-result has no matching data", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: { football: [] },
			featured: {
				blocks: [
					{ type: "match-result", homeTeam: "Girona", awayTeam: "Barcelona" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "component_unresolvable" && i.message.includes("match-result"));
		expect(issue).toBeDefined();
		expect(issue.message).toContain("Girona");
	});

	it("does not warn when match-result has matching data", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			recentResults: {
				football: [{ homeTeam: "Girona", awayTeam: "Barcelona", homeScore: 2, awayScore: 1 }],
			},
			featured: {
				blocks: [
					{ type: "match-result", homeTeam: "Girona", awayTeam: "Barcelona" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "component_unresolvable" && i.message.includes("match-result"));
		expect(issue).toBeUndefined();
	});

	it("warns when match-preview has no matching event", () => {
		const report = generateHealthReport({
			events: [{ sport: "golf", title: "PGA", time: new Date().toISOString() }],
			featured: {
				blocks: [
					{ type: "match-preview", homeTeam: "Arsenal", awayTeam: "Chelsea" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "component_unresolvable" && i.message.includes("match-preview"));
		expect(issue).toBeDefined();
	});

	it("warns when event-schedule has no matching events", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			featured: {
				blocks: [
					{ type: "event-schedule", filter: { sport: "olympics", window: "today" } },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "component_unresolvable" && i.message.includes("olympics"));
		expect(issue).toBeDefined();
	});

	it("warns when golf-status has no leaderboard data", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			standings: { golf: { pga: { leaderboard: [] } } },
			featured: {
				blocks: [
					{ type: "golf-status", tournament: "pga" },
				],
			},
		});
		const issue = report.issues.find(i => i.code === "component_unresolvable" && i.message.includes("golf-status"));
		expect(issue).toBeDefined();
	});
});

describe("analyzePipelineTiming", () => {
	it("returns null when no pipeline result", () => {
		const issues = [];
		const result = analyzePipelineTiming(null, issues);
		expect(result).toBeNull();
		expect(issues).toHaveLength(0);
	});

	it("detects timeout hits from errorCategory", () => {
		const issues = [];
		const pipelineResult = {
			duration: 60000,
			phases: {
				monitor: {
					steps: [
						{ name: "verify-schedules", status: "failed", duration: 60000, error: "ETIMEDOUT", errorCategory: "timeout" },
						{ name: "health-check", status: "success", duration: 200 },
					],
				},
			},
		};
		const result = analyzePipelineTiming(pipelineResult, issues);
		expect(result.timeoutHits).toContain("verify-schedules");
		expect(issues.some(i => i.code === "step_timeout_hit" && i.message.includes("verify-schedules"))).toBe(true);
	});

	it("detects steps approaching default timeout", () => {
		const issues = [];
		const pipelineResult = {
			duration: 400000,
			phases: {
				build: {
					steps: [
						{ name: "slow-step", status: "success", duration: 280000 }, // 280s > 90% of 300s default
					],
				},
			},
		};
		const result = analyzePipelineTiming(pipelineResult, issues);
		expect(result.timeoutHits).toContain("slow-step");
	});

	it("detects dominant steps", () => {
		const issues = [];
		const pipelineResult = {
			duration: 300000,
			phases: {
				build: {
					steps: [
						{ name: "enrich-events", status: "success", duration: 120000 }, // 40% of total
						{ name: "build-events", status: "success", duration: 500 },
					],
				},
			},
		};
		const result = analyzePipelineTiming(pipelineResult, issues);
		expect(result.dominantSteps).toHaveLength(1);
		expect(result.dominantSteps[0].name).toBe("enrich-events");
		expect(result.dominantSteps[0].share).toBe(40);
		expect(issues.some(i => i.code === "step_dominant_duration")).toBe(true);
	});

	it("detects failed steps", () => {
		const issues = [];
		const pipelineResult = {
			duration: 10000,
			phases: {
				fetch: {
					steps: [
						{ name: "fetch-sports", status: "success", duration: 5000 },
						{ name: "fetch-rss", status: "failed", duration: 3000, error: "network error", errorCategory: "network" },
					],
				},
			},
		};
		const result = analyzePipelineTiming(pipelineResult, issues);
		expect(result.failedSteps).toContain("fetch-rss");
		expect(issues.some(i => i.code === "pipeline_step_failures")).toBe(true);
	});

	it("skips skipped steps", () => {
		const issues = [];
		const pipelineResult = {
			duration: 10000,
			phases: {
				discover: {
					steps: [
						{ name: "discover-events", status: "skipped", duration: 0, reason: "missing env: CLAUDE_CODE_OAUTH_TOKEN" },
					],
				},
			},
		};
		const result = analyzePipelineTiming(pipelineResult, issues);
		expect(result.stepCount).toBe(0);
		expect(issues).toHaveLength(0);
	});

	it("integrates with generateHealthReport via pipelineResult option", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			pipelineResult: {
				duration: 500000,
				phases: {
					build: {
						steps: [
							{ name: "enrich-events", status: "success", duration: 200000 },
						],
					},
					monitor: {
						steps: [
							{ name: "verify-schedules", status: "failed", duration: 300000, error: "ETIMEDOUT", errorCategory: "timeout" },
						],
					},
				},
			},
		});
		expect(report.pipelineTimingHealth).not.toBeNull();
		expect(report.pipelineTimingHealth.timeoutHits).toContain("verify-schedules");
		expect(report.pipelineTimingHealth.dominantSteps.some(s => s.name === "enrich-events")).toBe(true);
		expect(report.issues.some(i => i.code === "step_timeout_hit")).toBe(true);
		expect(report.issues.some(i => i.code === "step_dominant_duration")).toBe(true);
	});
});

describe("quota health", () => {
	it("surfaces quota tier and skipped steps from pipeline result", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			pipelineResult: {
				duration: 300000,
				quota: { fiveHour: 55, sevenDay: 60, tier: 1, maxPriority: 2, model: "claude-sonnet-4-6" },
				phases: {
					discover: {
						steps: [
							{ name: "discover-events", status: "skipped", duration: 0, reason: "quota tier 1 (max priority 2, step needs 3)" },
						],
					},
					build: {
						steps: [
							{ name: "enrich-events", status: "success", duration: 120000 },
						],
					},
				},
			},
		});
		expect(report.quotaHealth).toBeDefined();
		expect(report.quotaHealth.tier).toBe(1);
		expect(report.quotaHealth.fiveHour).toBe(55);
		expect(report.quotaHealth.sevenDay).toBe(60);
		expect(report.quotaHealth.model).toBe("claude-sonnet-4-6");
		expect(report.quotaHealth.stepsSkipped).toBe(1);
		expect(report.quotaHealth.skippedSteps).toContain("discover-events");
	});

	it("surfaces warning issue for high quota tier (>= 2)", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			pipelineResult: {
				duration: 100000,
				quota: { fiveHour: 80, sevenDay: 75, tier: 2, maxPriority: 1, model: "claude-sonnet-4-6" },
				phases: {
					discover: { steps: [{ name: "discover-events", status: "skipped", duration: 0, reason: "quota tier 2 (max priority 1, step needs 3)" }] },
					generate: { steps: [{ name: "generate-multiday", status: "skipped", duration: 0, reason: "quota tier 2 (max priority 1, step needs 2)" }] },
				},
			},
		});
		expect(report.quotaHealth.stepsSkipped).toBe(2);
		expect(report.issues.some(i => i.code === "quota_high_utilization")).toBe(true);
	});

	it("surfaces info issue for moderate quota tier with skipped steps", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			pipelineResult: {
				duration: 200000,
				quota: { fiveHour: 55, sevenDay: 50, tier: 1, maxPriority: 2, model: "claude-sonnet-4-6" },
				phases: {
					discover: { steps: [{ name: "discover-events", status: "skipped", duration: 0, reason: "quota tier 1 (max priority 2, step needs 3)" }] },
				},
			},
		});
		expect(report.issues.some(i => i.code === "quota_moderate_utilization")).toBe(true);
	});

	it("does not flag quota when tier is 0 (green)", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			pipelineResult: {
				duration: 200000,
				quota: { fiveHour: 30, sevenDay: 20, tier: 0, maxPriority: 3 },
				phases: {},
			},
		});
		expect(report.quotaHealth.tier).toBe(0);
		expect(report.issues.some(i => i.code?.startsWith("quota_"))).toBe(false);
	});

	it("handles missing quota in pipeline result gracefully", () => {
		const report = generateHealthReport({
			events: makeEvents({ football: 5 }),
			pipelineResult: { duration: 200000, phases: {} },
		});
		expect(report.quotaHealth.tier).toBeNull();
	});
});
