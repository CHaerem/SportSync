import { describe, it, expect } from "vitest";
import {
	parseTelemetryFromIssueBody,
	parsePreferencesFromIssueBody,
	computeInsights,
} from "../scripts/analyze-engagement.js";

describe("parseTelemetryFromIssueBody", () => {
	it("extracts telemetry from JSON code block", () => {
		const body = `## SportSync Engagement Sync

\`\`\`json
{"backendPreferences":{},"telemetry":{"blocks":{"match-result":5},"sessions":{"count":3,"totalMinutes":20}},"syncedAt":"2026-02-28"}
\`\`\`
`;
		const t = parseTelemetryFromIssueBody(body);
		expect(t.blocks["match-result"]).toBe(5);
		expect(t.sessions.count).toBe(3);
	});

	it("returns null for body without JSON block", () => {
		expect(parseTelemetryFromIssueBody("no json here")).toBeNull();
	});

	it("returns null for invalid JSON", () => {
		const body = "```json\nnot valid\n```";
		expect(parseTelemetryFromIssueBody(body)).toBeNull();
	});

	it("returns null for null/undefined body", () => {
		expect(parseTelemetryFromIssueBody(null)).toBeNull();
		expect(parseTelemetryFromIssueBody(undefined)).toBeNull();
	});

	it("returns null when telemetry key is missing", () => {
		const body = '```json\n{"backendPreferences":{}}\n```';
		expect(parseTelemetryFromIssueBody(body)).toBeNull();
	});
});

describe("parsePreferencesFromIssueBody", () => {
	it("extracts backendPreferences from JSON block", () => {
		const body = '```json\n{"backendPreferences":{"engagement":{"football":{"clicks":20}}}}\n```';
		const prefs = parsePreferencesFromIssueBody(body);
		expect(prefs.engagement.football.clicks).toBe(20);
	});

	it("returns null for missing backendPreferences", () => {
		const body = '```json\n{"telemetry":{}}\n```';
		expect(parsePreferencesFromIssueBody(body)).toBeNull();
	});
});

describe("computeInsights", () => {
	it("returns empty insights with no data", () => {
		const insights = computeInsights(null, null);
		expect(insights.generatedAt).toBeTruthy();
		expect(insights.preferredBlocks).toEqual([]);
		expect(insights.peakHours).toEqual([]);
		expect(insights.contentHints).toEqual([]);
		expect(insights.avgSessionMinutes).toBe(0);
		expect(insights.dayNavPreference).toBeNull();
	});

	it("computes sport weights from engagement", () => {
		const engagement = {
			football: { clicks: 60, lastClick: "2026-02-28" },
			golf: { clicks: 30, lastClick: "2026-02-28" },
			tennis: { clicks: 10, lastClick: "2026-02-28" },
		};
		const insights = computeInsights(null, engagement);
		expect(insights.sportWeights.football).toBe(0.6);
		expect(insights.sportWeights.golf).toBe(0.3);
		expect(insights.sportWeights.tennis).toBe(0.1);
	});

	it("computes preferred blocks (top 3)", () => {
		const telemetry = {
			blocks: { "match-result": 20, "match-preview": 15, "golf-status": 10, "event-schedule": 5 },
			sessions: { count: 0, totalMinutes: 0 },
			peakHours: {},
			dayNav: {},
			watchPlanClicks: {},
			features: {},
		};
		const insights = computeInsights(telemetry, null);
		expect(insights.preferredBlocks).toEqual(["match-result", "match-preview", "golf-status"]);
	});

	it("computes peak hours (top 3)", () => {
		const telemetry = {
			blocks: {},
			sessions: { count: 0, totalMinutes: 0 },
			peakHours: { "07": 5, "12": 8, "19": 15, "22": 2 },
			dayNav: {},
			watchPlanClicks: {},
			features: {},
		};
		const insights = computeInsights(telemetry, null);
		expect(insights.peakHours).toEqual([19, 12, 7]);
	});

	it("computes average session minutes", () => {
		const telemetry = {
			blocks: {},
			sessions: { count: 10, totalMinutes: 71 },
			peakHours: {},
			dayNav: {},
			watchPlanClicks: {},
			features: {},
		};
		const insights = computeInsights(telemetry, null);
		expect(insights.avgSessionMinutes).toBe(7.1);
	});

	it("determines day navigation preference", () => {
		const telemetry = {
			blocks: {},
			sessions: { count: 0, totalMinutes: 0 },
			peakHours: {},
			dayNav: { past: 5, future: 12, today: 3 },
			watchPlanClicks: {},
			features: {},
		};
		const insights = computeInsights(telemetry, null);
		expect(insights.dayNavPreference).toBe("future");
	});

	it("classifies feature usage", () => {
		const telemetry = {
			blocks: {},
			sessions: { count: 0, totalMinutes: 0 },
			peakHours: {},
			dayNav: {},
			watchPlanClicks: {},
			features: { standings: 12, brackets: 3, liveScores: 1 },
		};
		const insights = computeInsights(telemetry, null);
		expect(insights.featureUsage.standings).toBe("high");
		expect(insights.featureUsage.brackets).toBe("medium");
		expect(insights.featureUsage.liveScores).toBe("low");
	});

	it("generates content hints from telemetry", () => {
		const telemetry = {
			blocks: { "match-result": 20, "match-preview": 10 },
			sessions: { count: 5, totalMinutes: 35 },
			peakHours: { "07": 3, "19": 5 },
			dayNav: { past: 2, future: 10, today: 5 },
			watchPlanClicks: { total: 8, byKey: {} },
			features: {},
		};
		const engagement = {
			football: { clicks: 50 },
			golf: { clicks: 20 },
		};
		const insights = computeInsights(telemetry, engagement);
		expect(insights.contentHints.length).toBeGreaterThan(0);

		// Should have block hint
		expect(insights.contentHints.some(h => h.includes("match-result"))).toBe(true);
		// Should have session hint
		expect(insights.contentHints.some(h => h.includes("7 min"))).toBe(true);
		// Should have day nav hint
		expect(insights.contentHints.some(h => h.includes("future"))).toBe(true);
		// Should have watch plan hint
		expect(insights.contentHints.some(h => h.includes("8 click"))).toBe(true);
	});

	it("handles watch plan with zero clicks", () => {
		const telemetry = {
			blocks: {},
			sessions: { count: 0, totalMinutes: 0 },
			peakHours: {},
			dayNav: {},
			watchPlanClicks: { total: 0, byKey: {} },
			features: {},
		};
		const insights = computeInsights(telemetry, null);
		expect(insights.watchPlanConversionRate).toBeNull();
	});

	it("handles engagement with zero clicks", () => {
		const engagement = {
			football: { clicks: 0 },
		};
		const insights = computeInsights(null, engagement);
		expect(Object.keys(insights.sportWeights)).toHaveLength(0);
	});
});
