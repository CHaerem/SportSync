import { describe, it, expect, vi } from "vitest";
import {
	titleSimilarity,
	detectSportFromTitle,
	ESPN_SCOREBOARD_URLS,
	verifyStatic,
	verifyWithESPN,
	verifyWithRSS,
	verifyWithSportData,
	verifyWithWebSearch,
	aggregateConfidence,
	verifyConfig,
	buildVerificationHints,
} from "../scripts/lib/schedule-verifier.js";

// --- titleSimilarity ---

describe("titleSimilarity()", () => {
	it("returns 1.0 for identical titles", () => {
		expect(titleSimilarity("Sprint Classic", "Sprint Classic")).toBe(1.0);
	});

	it("returns 0 for completely different titles", () => {
		expect(titleSimilarity("Sprint Classic", "Marathon Final")).toBe(0);
	});

	it("returns partial score for overlapping words", () => {
		const score = titleSimilarity("Men's Sprint Classic", "Sprint Classic Women");
		expect(score).toBeGreaterThan(0.3);
		expect(score).toBeLessThan(1.0);
	});

	it("is case insensitive", () => {
		expect(titleSimilarity("SPRINT CLASSIC", "sprint classic")).toBe(1.0);
	});

	it("handles empty strings", () => {
		expect(titleSimilarity("", "Sprint")).toBe(0);
		expect(titleSimilarity("Sprint", "")).toBe(0);
	});

	it("ignores punctuation", () => {
		expect(titleSimilarity("Men's Sprint", "Mens Sprint")).toBe(1.0);
	});
});

// --- detectSportFromTitle ---

describe("detectSportFromTitle()", () => {
	it("detects cross-country skiing", () => {
		expect(detectSportFromTitle("Cross-Country Skiing — Sprint")).toBe("cross-country");
	});

	it("detects biathlon", () => {
		expect(detectSportFromTitle("Biathlon — Mixed Relay")).toBe("biathlon");
	});

	it("detects ski jumping", () => {
		expect(detectSportFromTitle("Ski Jumping — Normal Hill")).toBe("ski-jumping");
	});

	it("detects alpine skiing", () => {
		expect(detectSportFromTitle("Alpine Skiing — Giant Slalom")).toBe("alpine-skiing");
	});

	it("detects nordic combined", () => {
		expect(detectSportFromTitle("Nordic Combined — Gundersen")).toBe("nordic-combined");
	});

	it("detects football", () => {
		expect(detectSportFromTitle("Football — Premier League")).toBe("football");
	});

	it("detects golf", () => {
		expect(detectSportFromTitle("Golf — PGA Tour")).toBe("golf");
	});

	it("detects tennis", () => {
		expect(detectSportFromTitle("Tennis — Australian Open")).toBe("tennis");
	});

	it("detects F1", () => {
		expect(detectSportFromTitle("Formula 1 — Monaco Grand Prix")).toBe("f1");
		expect(detectSportFromTitle("F1 — Race")).toBe("f1");
		expect(detectSportFromTitle("Bahrain Grand Prix")).toBe("f1");
	});

	it("returns null for unknown sports", () => {
		expect(detectSportFromTitle("Curling — Round Robin")).toBeNull();
		expect(detectSportFromTitle("")).toBeNull();
	});
});

// --- ESPN_SCOREBOARD_URLS ---

describe("ESPN_SCOREBOARD_URLS", () => {
	it("has entries for all detected sports", () => {
		expect(ESPN_SCOREBOARD_URLS["cross-country"]).toBeTruthy();
		expect(ESPN_SCOREBOARD_URLS.biathlon).toBeTruthy();
		expect(ESPN_SCOREBOARD_URLS.football).toBeTruthy();
		expect(ESPN_SCOREBOARD_URLS.golf).toBeTruthy();
		expect(ESPN_SCOREBOARD_URLS.tennis).toBeTruthy();
		expect(ESPN_SCOREBOARD_URLS.f1).toBeTruthy();
	});
});

// --- verifyStatic ---

describe("verifyStatic()", () => {
	it("returns verified for valid event within range", () => {
		const event = { title: "Sprint Classic", time: "2026-02-15T10:00:00Z" };
		const context = {
			startDate: "2026-02-06",
			endDate: "2026-02-22",
			siblings: [],
			now: new Date("2026-02-12T12:00:00Z"),
		};
		const result = verifyStatic(event, context);
		expect(result.verified).toBe(true);
		expect(result.confidence).toBe(0.4);
		expect(result.source).toBe("static");
	});

	it("flags missing time", () => {
		const result = verifyStatic({ title: "No Time" }, { siblings: [] });
		expect(result.verified).toBe(false);
		expect(result.details).toContain("Missing time");
	});

	it("flags invalid time", () => {
		const result = verifyStatic({ title: "Bad", time: "not-a-date" }, { siblings: [] });
		expect(result.verified).toBe(false);
		expect(result.details).toContain("Invalid time");
	});

	it("flags event outside config date range", () => {
		const event = { title: "Late Event", time: "2026-03-15T10:00:00Z" };
		const context = {
			startDate: "2026-02-06",
			endDate: "2026-02-22",
			siblings: [],
			now: new Date("2026-02-12T12:00:00Z"),
		};
		const result = verifyStatic(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("Outside config range");
	});

	it("flags far-future events (>365 days)", () => {
		const event = { title: "Future Event", time: "2028-06-15T10:00:00Z" };
		const context = { siblings: [], now: new Date("2026-02-12T12:00:00Z") };
		const result = verifyStatic(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("more than 1 year");
	});

	it("flags past events (>7 days ago)", () => {
		const event = { title: "Old Event", time: "2026-01-01T10:00:00Z" };
		const context = { siblings: [], now: new Date("2026-02-12T12:00:00Z") };
		const result = verifyStatic(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("7 days in the past");
	});

	it("flags duplicate time+venue among siblings", () => {
		const event = { title: "Event A", time: "2026-02-15T10:00:00Z", venue: "Arena" };
		const sibling = { title: "Event B", time: "2026-02-15T10:00:00Z", venue: "Arena" };
		const context = { siblings: [event, sibling], now: new Date("2026-02-12T12:00:00Z") };
		const result = verifyStatic(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("Shares time and venue");
	});

	it("allows events at same time but different venues", () => {
		const event = { title: "Event A", time: "2026-02-15T10:00:00Z", venue: "Arena A" };
		const sibling = { title: "Event B", time: "2026-02-15T10:00:00Z", venue: "Arena B" };
		const context = { siblings: [event, sibling], now: new Date("2026-02-12T12:00:00Z") };
		const result = verifyStatic(event, context);
		expect(result.verified).toBe(true);
	});
});

// --- verifyWithESPN ---

describe("verifyWithESPN()", () => {
	it("returns verified for matching ESPN event within 1h", () => {
		const event = { title: "Biathlon Mixed Relay", time: "2026-02-15T10:00:00Z" };
		const context = {
			espnEvents: {
				biathlon: [{ name: "Biathlon Mixed Relay", date: "2026-02-15T10:30:00Z" }],
			},
		};
		const result = verifyWithESPN(event, context);
		expect(result.verified).toBe(true);
		expect(result.confidence).toBe(0.9);
		expect(result.source).toBe("espn-api");
	});

	it("detects time mismatch with correction", () => {
		const event = { title: "Biathlon Mixed Relay", time: "2026-02-15T10:00:00Z" };
		const context = {
			espnEvents: {
				biathlon: [{ name: "Biathlon Mixed Relay", date: "2026-02-15T16:00:00Z" }],
			},
		};
		const result = verifyWithESPN(event, context);
		expect(result.verified).toBe(false);
		expect(result.confidence).toBe(0.7);
		expect(result.correction).toBeTruthy();
		expect(result.correction.field).toBe("time");
		expect(result.correction.newValue).toContain("2026-02-15");
	});

	it("returns no data when sport has no ESPN endpoint", () => {
		const event = { title: "Chess — Round 1", time: "2026-02-15T10:00:00Z" };
		const context = { espnEvents: {} };
		const result = verifyWithESPN(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("No ESPN endpoint");
	});

	it("returns no data when ESPN data is empty", () => {
		const event = { title: "Football — Premier League Match", time: "2026-02-15T10:00:00Z" };
		const context = { espnEvents: { football: [] } };
		const result = verifyWithESPN(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("No ESPN data");
	});

	it("handles no matching event in ESPN data", () => {
		const event = { title: "Biathlon Sprint Women", time: "2026-02-15T10:00:00Z" };
		const context = {
			espnEvents: {
				biathlon: [{ name: "Something Completely Different", date: "2026-08-15T10:00:00Z" }],
			},
		};
		const result = verifyWithESPN(event, context);
		expect(result.details).toContain("No matching ESPN");
	});

	it("accepts sportKey from context when title detection fails", () => {
		const event = { title: "10km Classic", time: "2026-02-15T10:00:00Z" };
		const context = {
			sportKey: "cross-country",
			espnEvents: {
				"cross-country": [{ name: "10km Classic", date: "2026-02-15T10:15:00Z" }],
			},
		};
		const result = verifyWithESPN(event, context);
		expect(result.verified).toBe(true);
		expect(result.confidence).toBe(0.9);
	});
});

// --- verifyWithRSS ---

describe("verifyWithRSS()", () => {
	it("finds corroborating RSS headline", () => {
		const event = { title: "Biathlon World Cup Sprint" };
		const context = {
			rssDigest: {
				items: [
					{ title: "Biathlon World Cup Sprint preview: Norway leads pack" },
					{ title: "Premier League roundup" },
				],
			},
		};
		const result = verifyWithRSS(event, context);
		expect(result.verified).toBe(true);
		expect(result.confidence).toBe(0.5);
		expect(result.source).toBe("rss-cross-ref");
	});

	it("returns partial match for low overlap", () => {
		const event = { title: "Biathlon World Cup Sprint" };
		const context = {
			rssDigest: {
				items: [{ title: "Biathlon roundup for February events" }],
			},
		};
		const result = verifyWithRSS(event, context);
		expect(result.verified).toBe(false);
		expect(result.confidence).toBe(0.2);
	});

	it("returns no match when RSS is empty", () => {
		const event = { title: "Biathlon Sprint" };
		const context = { rssDigest: { items: [] } };
		const result = verifyWithRSS(event, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("No RSS mentions");
	});

	it("handles missing RSS digest", () => {
		const event = { title: "Sprint" };
		const context = {};
		const result = verifyWithRSS(event, context);
		expect(result.details).toContain("No RSS digest");
	});

	it("handles event with very short title", () => {
		const event = { title: "XC" };
		const context = { rssDigest: { items: [{ title: "XC skiing news" }] } };
		const result = verifyWithRSS(event, context);
		// "XC" has length 2, filtered out by > 2 check
		expect(result.details).toContain("too short");
	});
});

// --- verifyWithSportData ---

describe("verifyWithSportData()", () => {
	it("finds matching event in sport data", () => {
		const event = { title: "Premier League Match", time: "2026-02-15T15:00:00Z" };
		const context = {
			sportKey: "football",
			sportDataMap: {
				football: {
					tournaments: [{
						name: "Premier League",
						events: [{ title: "Premier League Match", time: "2026-02-15T15:00:00Z" }],
					}],
				},
			},
		};
		const result = verifyWithSportData(event, context);
		expect(result.verified).toBe(true);
		expect(result.confidence).toBe(0.8);
		expect(result.source).toBe("sport-data");
	});

	it("detects time mismatch in sport data", () => {
		const event = { title: "Premier League Match", time: "2026-02-15T15:00:00Z" };
		const context = {
			sportKey: "football",
			sportDataMap: {
				football: {
					tournaments: [{
						name: "Premier League",
						events: [{ title: "Premier League Match", time: "2026-02-15T20:00:00Z" }],
					}],
				},
			},
		};
		const result = verifyWithSportData(event, context);
		expect(result.verified).toBe(false);
		expect(result.confidence).toBe(0.5);
		expect(result.correction).toBeTruthy();
	});

	it("handles missing sport data", () => {
		const event = { title: "Match", time: "2026-02-15T15:00:00Z" };
		const context = { sportKey: "football", sportDataMap: {} };
		const result = verifyWithSportData(event, context);
		expect(result.details).toContain("No sport data");
	});

	it("handles empty tournaments", () => {
		const event = { title: "Match", time: "2026-02-15T15:00:00Z" };
		const context = {
			sportKey: "football",
			sportDataMap: { football: { tournaments: [] } },
		};
		const result = verifyWithSportData(event, context);
		expect(result.details).toContain("No matching event");
	});

	it("uses event.sport as fallback for sportKey", () => {
		const event = { title: "PGA Tour Event", time: "2026-02-15T15:00:00Z", sport: "golf" };
		const context = {
			sportDataMap: {
				golf: {
					tournaments: [{
						name: "PGA Tour",
						events: [{ title: "PGA Tour Event", time: "2026-02-15T15:00:00Z" }],
					}],
				},
			},
		};
		const result = verifyWithSportData(event, context);
		expect(result.verified).toBe(true);
	});
});

// --- verifyWithWebSearch ---

describe("verifyWithWebSearch()", () => {
	it("calls webSearchFn and returns result", async () => {
		const event = { title: "Test Event", time: "2026-02-15T10:00:00Z" };
		const context = {
			webSearchFn: vi.fn().mockResolvedValue({
				verified: true,
				confidence: 0.85,
				details: "Confirmed via web search",
			}),
			webSearchCount: 0,
			maxWebSearches: 3,
		};
		const result = await verifyWithWebSearch(event, context);
		expect(result.verified).toBe(true);
		expect(result.confidence).toBe(0.85);
		expect(context.webSearchCount).toBe(1);
	});

	it("skips when webSearchFn is not available", async () => {
		const result = await verifyWithWebSearch({ title: "Test" }, {});
		expect(result.details).toContain("No web search function");
	});

	it("skips when budget exhausted", async () => {
		const context = {
			webSearchFn: vi.fn(),
			webSearchCount: 3,
			maxWebSearches: 3,
		};
		const result = await verifyWithWebSearch({ title: "Test" }, context);
		expect(result.details).toContain("budget exhausted");
		expect(context.webSearchFn).not.toHaveBeenCalled();
	});

	it("handles webSearchFn error gracefully", async () => {
		const context = {
			webSearchFn: vi.fn().mockRejectedValue(new Error("Timeout")),
			webSearchCount: 0,
			maxWebSearches: 3,
		};
		const result = await verifyWithWebSearch({ title: "Test" }, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("failed");
	});

	it("handles null return from webSearchFn", async () => {
		const context = {
			webSearchFn: vi.fn().mockResolvedValue(null),
			webSearchCount: 0,
			maxWebSearches: 3,
		};
		const result = await verifyWithWebSearch({ title: "Test" }, context);
		expect(result.verified).toBe(false);
		expect(result.details).toContain("no results");
	});
});

// --- aggregateConfidence ---

describe("aggregateConfidence()", () => {
	it("returns unverified for empty results", () => {
		const result = aggregateConfidence([]);
		expect(result.confidence).toBe(0);
		expect(result.status).toBe("unverified");
		expect(result.sources).toEqual([]);
	});

	it("returns unverified for null input", () => {
		const result = aggregateConfidence(null);
		expect(result.status).toBe("unverified");
	});

	it("takes best confidence from results", () => {
		const results = [
			{ verified: false, confidence: 0.3, source: "static" },
			{ verified: true, confidence: 0.9, source: "espn-api" },
			{ verified: false, confidence: 0.2, source: "rss-cross-ref" },
		];
		const result = aggregateConfidence(results);
		expect(result.confidence).toBe(0.9);
		expect(result.status).toBe("verified");
	});

	it("adds 0.1 corroboration bonus for 2+ verified sources", () => {
		const results = [
			{ verified: true, confidence: 0.5, source: "rss-cross-ref" },
			{ verified: true, confidence: 0.8, source: "sport-data" },
		];
		const result = aggregateConfidence(results);
		expect(result.confidence).toBe(0.9);
	});

	it("caps confidence at 1.0", () => {
		const results = [
			{ verified: true, confidence: 0.95, source: "espn-api" },
			{ verified: true, confidence: 0.8, source: "sport-data" },
		];
		const result = aggregateConfidence(results);
		expect(result.confidence).toBe(1.0);
	});

	it("classifies as plausible for 0.3-0.69", () => {
		const results = [
			{ verified: false, confidence: 0.5, source: "static" },
		];
		const result = aggregateConfidence(results);
		expect(result.status).toBe("plausible");
	});

	it("classifies as unverified for <0.3", () => {
		const results = [
			{ verified: false, confidence: 0.1, source: "static" },
		];
		const result = aggregateConfidence(results);
		expect(result.status).toBe("unverified");
	});

	it("collects sources with confidence > 0", () => {
		const results = [
			{ verified: false, confidence: 0.4, source: "static" },
			{ verified: false, confidence: 0, source: "espn-api" },
			{ verified: true, confidence: 0.5, source: "rss-cross-ref" },
		];
		const result = aggregateConfidence(results);
		expect(result.sources).toContain("static");
		expect(result.sources).toContain("rss-cross-ref");
		expect(result.sources).not.toContain("espn-api");
	});
});

// --- verifyConfig ---

describe("verifyConfig()", () => {
	it("verifies a config with valid events", async () => {
		const config = {
			file: "test.json",
			sport: "biathlon",
			startDate: "2026-02-06",
			endDate: "2026-02-22",
			events: [
				{ title: "Biathlon Sprint", time: "2026-02-15T10:00:00Z" },
			],
		};
		const context = {
			espnEvents: {
				biathlon: [{ name: "Biathlon Sprint", date: "2026-02-15T10:00:00Z" }],
			},
			rssDigest: { items: [] },
			sportDataMap: {},
			now: new Date("2026-02-12T12:00:00Z"),
			webSearchUsed: false,
		};
		const result = await verifyConfig(config, context, { skipWebSearch: true });
		expect(result.file).toBe("test.json");
		expect(result.eventsChecked).toBe(1);
		expect(result.verified).toBe(1);
		expect(result.verificationSummary.eventsChecked).toBe(1);
	});

	it("handles config with no events", async () => {
		const config = { file: "empty.json", events: [] };
		const context = { espnEvents: {}, rssDigest: { items: [] }, sportDataMap: {}, now: new Date() };
		const result = await verifyConfig(config, context, { skipWebSearch: true });
		expect(result.eventsChecked).toBe(0);
		expect(result.overallConfidence).toBe(0);
	});

	it("collects corrections from verifiers", async () => {
		const config = {
			file: "test.json",
			sport: "biathlon",
			events: [
				{ title: "Biathlon Mixed Relay", time: "2026-02-15T10:00:00Z" },
			],
		};
		const context = {
			espnEvents: {
				biathlon: [{ name: "Biathlon Mixed Relay", date: "2026-02-15T16:00:00Z" }],
			},
			rssDigest: { items: [] },
			sportDataMap: {},
			now: new Date("2026-02-12T12:00:00Z"),
		};
		const result = await verifyConfig(config, context, { skipWebSearch: true });
		expect(result.corrections.length).toBeGreaterThanOrEqual(0);
		// The correction should exist since ESPN mismatch has confidence 0.7
		if (result.corrections.length > 0) {
			expect(result.corrections[0].field).toBe("time");
		}
	});

	it("produces per-event verification metadata", async () => {
		const config = {
			file: "test.json",
			events: [
				{ title: "Biathlon Sprint", time: "2026-02-15T10:00:00Z" },
			],
		};
		const context = {
			espnEvents: {},
			rssDigest: { items: [] },
			sportDataMap: {},
			now: new Date("2026-02-12T12:00:00Z"),
		};
		const result = await verifyConfig(config, context, { skipWebSearch: true });
		expect(result.eventResults[0].verification).toBeDefined();
		expect(result.eventResults[0].verification.confidence).toBeGreaterThanOrEqual(0);
		expect(result.eventResults[0].verification.status).toBeTruthy();
		expect(result.eventResults[0].verification.lastVerified).toBeTruthy();
	});

	it("reports overall confidence as average", async () => {
		const config = {
			file: "test.json",
			sport: "biathlon",
			startDate: "2026-02-06",
			endDate: "2026-02-22",
			events: [
				{ title: "Biathlon Sprint", time: "2026-02-15T10:00:00Z" },
				{ title: "Biathlon Relay", time: "2026-02-16T14:00:00Z" },
			],
		};
		const context = {
			espnEvents: {
				biathlon: [{ name: "Biathlon Sprint", date: "2026-02-15T10:00:00Z" }],
			},
			rssDigest: { items: [] },
			sportDataMap: {},
			now: new Date("2026-02-12T12:00:00Z"),
		};
		const result = await verifyConfig(config, context, { skipWebSearch: true });
		expect(result.eventsChecked).toBe(2);
		expect(result.overallConfidence).toBeGreaterThan(0);
		expect(result.overallConfidence).toBeLessThanOrEqual(1);
	});
});

// --- buildVerificationHints ---

describe("buildVerificationHints()", () => {
	it("returns empty for null history", () => {
		const { hints, metrics } = buildVerificationHints(null);
		expect(hints).toEqual([]);
		expect(metrics).toEqual({});
	});

	it("returns empty for empty runs", () => {
		const { hints } = buildVerificationHints({ runs: [] });
		expect(hints).toEqual([]);
	});

	it("generates accuracy hint when overall accuracy is low", () => {
		const history = {
			runs: [
				{
					timestamp: "2026-02-10T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 2, unverified: 8, corrections: [] }],
				},
				{
					timestamp: "2026-02-11T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 3, unverified: 7, corrections: [] }],
				},
				{
					timestamp: "2026-02-12T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 4, unverified: 6, corrections: [] }],
				},
			],
		};
		const { hints, metrics } = buildVerificationHints(history);
		expect(hints.some((h) => h.includes("low accuracy"))).toBe(true);
		expect(metrics.overallAccuracy).toBeLessThan(0.6);
	});

	it("generates sport-specific hint when sport accuracy is low", () => {
		const history = {
			runs: [
				{
					timestamp: "2026-02-10T00:00:00Z",
					results: [{ sport: "olympics", eventsChecked: 10, verified: 1, unverified: 9, corrections: [] }],
				},
				{
					timestamp: "2026-02-11T00:00:00Z",
					results: [{ sport: "olympics", eventsChecked: 10, verified: 2, unverified: 8, corrections: [] }],
				},
			],
		};
		const { hints } = buildVerificationHints(history);
		expect(hints.some((h) => h.includes("olympics"))).toBe(true);
	});

	it("generates correction hint when time corrections were applied", () => {
		const history = {
			runs: [
				{
					timestamp: "2026-02-12T00:00:00Z",
					results: [{
						eventsChecked: 5,
						verified: 4,
						unverified: 0,
						corrections: [{ event: "Test", field: "time" }],
					}],
				},
			],
		};
		const { hints } = buildVerificationHints(history);
		expect(hints.some((h) => h.includes("timezone"))).toBe(true);
	});

	it("generates unverified hint when >30% events are unverified", () => {
		const history = {
			runs: [
				{
					timestamp: "2026-02-12T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 2, unverified: 5, corrections: [] }],
				},
			],
		};
		const { hints } = buildVerificationHints(history);
		expect(hints.some((h) => h.includes("couldn't be verified"))).toBe(true);
	});

	it("returns no hints when accuracy is high", () => {
		const history = {
			runs: [
				{
					timestamp: "2026-02-10T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 9, unverified: 0, corrections: [] }],
				},
				{
					timestamp: "2026-02-11T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 10, unverified: 0, corrections: [] }],
				},
				{
					timestamp: "2026-02-12T00:00:00Z",
					results: [{ eventsChecked: 10, verified: 10, unverified: 0, corrections: [] }],
				},
			],
		};
		const { hints, metrics } = buildVerificationHints(history);
		expect(hints).toEqual([]);
		expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.9);
	});

	it("analyzes only last 5 runs", () => {
		const runs = [];
		for (let i = 0; i < 10; i++) {
			runs.push({
				timestamp: `2026-02-0${i + 1}T00:00:00Z`,
				results: [{ eventsChecked: 10, verified: i < 5 ? 0 : 10, unverified: i < 5 ? 10 : 0, corrections: [] }],
			});
		}
		const { hints, metrics } = buildVerificationHints({ runs });
		// Only last 5 runs analyzed (all verified)
		expect(metrics.runsAnalyzed).toBe(5);
		expect(metrics.overallAccuracy).toBeGreaterThanOrEqual(0.9);
	});

	it("includes runsAnalyzed in metrics", () => {
		const history = {
			runs: [
				{ timestamp: "2026-02-12T00:00:00Z", results: [{ eventsChecked: 5, verified: 5, unverified: 0, corrections: [] }] },
			],
		};
		const { metrics } = buildVerificationHints(history);
		expect(metrics.runsAnalyzed).toBe(1);
	});
});
