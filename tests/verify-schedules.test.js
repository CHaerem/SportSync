import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	detectSportFromTitle,
	loadCuratedConfigs,
	verifyConfigDates,
	crossReferenceWithAPI,
	titleSimilarity,
	verifySchedules,
} from "../scripts/verify-schedules.js";

describe("detectSportFromTitle()", () => {
	it("detects cross-country skiing", () => {
		expect(detectSportFromTitle("Cross-Country Skiing — Sprint Classic")).toBe("cross-country");
	});

	it("detects biathlon", () => {
		expect(detectSportFromTitle("Biathlon — Mixed Relay")).toBe("biathlon");
	});

	it("detects ski jumping", () => {
		expect(detectSportFromTitle("Ski Jumping — Normal Hill Individual")).toBe("ski-jumping");
	});

	it("detects alpine skiing", () => {
		expect(detectSportFromTitle("Alpine Skiing — Men's Giant Slalom")).toBe("alpine-skiing");
	});

	it("detects nordic combined", () => {
		expect(detectSportFromTitle("Nordic Combined — Individual Gundersen")).toBe("nordic-combined");
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

describe("verifyConfigDates()", () => {
	it("returns no issues for valid config", () => {
		const config = {
			file: "test.json",
			startDate: "2026-02-06",
			endDate: "2026-02-22",
			events: [
				{
					title: "Event A",
					time: "2026-02-10T09:00:00+01:00",
					venue: "Venue A",
				},
			],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues).toHaveLength(0);
	});

	it("flags endDate before startDate", () => {
		const config = {
			file: "test.json",
			startDate: "2026-03-01",
			endDate: "2026-02-01",
			events: [{ title: "Event", time: "2026-02-15T09:00:00Z" }],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues.some((i) => i.code === "config_date_order")).toBe(true);
	});

	it("flags missing event time", () => {
		const config = {
			file: "test.json",
			events: [{ title: "No Time Event" }],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues).toHaveLength(1);
		expect(issues[0].code).toBe("missing_event_time");
	});

	it("flags invalid event time", () => {
		const config = {
			file: "test.json",
			events: [{ title: "Bad Time", time: "not-a-date" }],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues).toHaveLength(1);
		expect(issues[0].code).toBe("invalid_event_time");
	});

	it("flags event outside config date range", () => {
		const config = {
			file: "test.json",
			startDate: "2026-02-06",
			endDate: "2026-02-22",
			events: [{ title: "Late Event", time: "2026-03-15T10:00:00Z" }],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues.some((i) => i.code === "event_outside_range")).toBe(true);
	});

	it("flags duplicate event times at same venue", () => {
		const config = {
			file: "test.json",
			events: [
				{ title: "Event A", time: "2026-02-10T09:00:00Z", venue: "Arena" },
				{ title: "Event B", time: "2026-02-10T09:00:00Z", venue: "Arena" },
			],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues.some((i) => i.code === "duplicate_event_time")).toBe(true);
	});

	it("allows different events at same time but different venues", () => {
		const config = {
			file: "test.json",
			events: [
				{ title: "Event A", time: "2026-02-10T09:00:00Z", venue: "Arena A" },
				{ title: "Event B", time: "2026-02-10T09:00:00Z", venue: "Arena B" },
			],
		};
		const { issues } = verifyConfigDates(config);
		expect(issues).toHaveLength(0);
	});
});

describe("crossReferenceWithAPI()", () => {
	it("detects time mismatch for matching events", () => {
		const configEvents = [
			{ title: "Sprint Classic Final", time: "2026-02-10T09:00:00Z" },
		];
		const apiEvents = [
			{ name: "Sprint Classic Final", date: "2026-02-10T14:00:00Z" },
		];
		const results = crossReferenceWithAPI(configEvents, apiEvents, "cross-country");
		expect(results).toHaveLength(1);
		expect(results[0].timeDiffHours).toBe(5);
	});

	it("returns empty for matching times (within 1h)", () => {
		const configEvents = [
			{ title: "Sprint Classic", time: "2026-02-10T09:00:00Z" },
		];
		const apiEvents = [
			{ name: "Sprint Classic", date: "2026-02-10T09:30:00Z" },
		];
		const results = crossReferenceWithAPI(configEvents, apiEvents, "cross-country");
		expect(results).toHaveLength(0);
	});

	it("ignores events with invalid dates", () => {
		const configEvents = [{ title: "Event", time: "invalid" }];
		const apiEvents = [{ name: "Event", date: "2026-02-10T09:00:00Z" }];
		const results = crossReferenceWithAPI(configEvents, apiEvents, "cross-country");
		expect(results).toHaveLength(0);
	});

	it("sets correctable=true for high-confidence close matches", () => {
		const configEvents = [
			{ title: "Biathlon Mixed Relay", time: "2026-02-10T09:00:00Z" },
		];
		const apiEvents = [
			{ name: "Biathlon Mixed Relay", date: "2026-02-10T14:00:00Z" },
		];
		const results = crossReferenceWithAPI(configEvents, apiEvents, "biathlon");
		expect(results).toHaveLength(1);
		expect(results[0].confidence).toBe("high");
		expect(results[0].correctable).toBe(true);
	});

	it("handles no matching API events", () => {
		const configEvents = [
			{ title: "Completely Unrelated Event", time: "2026-02-10T09:00:00Z" },
		];
		const apiEvents = [
			{ name: "Something Else Entirely", date: "2026-02-10T14:00:00Z" },
		];
		const results = crossReferenceWithAPI(configEvents, apiEvents, "cross-country");
		expect(results).toHaveLength(0);
	});
});

describe("verifySchedules()", () => {
	it("runs with empty configs", async () => {
		const result = await verifySchedules({ configs: [], fetchFn: async () => ({}) });
		expect(result.configsChecked).toBe(0);
		expect(result.eventsChecked).toBe(0);
		expect(result.issues).toHaveLength(0);
	});

	it("reports static validation issues without API calls", async () => {
		const configs = [
			{
				file: "test.json",
				events: [{ title: "No Time Event" }],
			},
		];
		const fetchFn = vi.fn().mockResolvedValue({});
		const result = await verifySchedules({ configs, fetchFn, dryRun: true });
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].code).toBe("missing_event_time");
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("handles API fetch errors gracefully", async () => {
		const configs = [
			{
				file: "test.json",
				events: [
					{ title: "Cross-Country Skiing Sprint", time: "2026-02-10T09:00:00Z" },
				],
			},
		];
		const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));
		const result = await verifySchedules({ configs, fetchFn, dryRun: true });
		expect(result.configsChecked).toBe(1);
		// Should not throw, just warn
	});

	it("detects API mismatches", async () => {
		const configs = [
			{
				file: "test.json",
				events: [
					{ title: "Biathlon Mixed Relay", time: "2026-02-10T09:00:00Z" },
				],
			},
		];
		const fetchFn = vi.fn().mockResolvedValue({
			events: [
				{ name: "Biathlon Mixed Relay", date: "2026-02-10T15:00:00Z" },
			],
		});
		const result = await verifySchedules({ configs, fetchFn, dryRun: true });
		expect(result.apiMismatches).toHaveLength(1);
		expect(result.apiMismatches[0].config).toBe("test.json");
	});

	it("records corrections in dryRun mode without applying", async () => {
		const configs = [
			{
				file: "test.json",
				events: [
					{ title: "Biathlon Mixed Relay", time: "2026-02-10T09:00:00Z" },
				],
			},
		];
		const fetchFn = vi.fn().mockResolvedValue({
			events: [
				{ name: "Biathlon Mixed Relay", date: "2026-02-10T15:00:00Z" },
			],
		});
		const result = await verifySchedules({ configs, fetchFn, dryRun: true });
		// In dryRun, corrections are not generated
		expect(result.corrections).toHaveLength(0);
	});

	it("populates generatedAt timestamp", async () => {
		const result = await verifySchedules({ configs: [], fetchFn: async () => ({}) });
		expect(result.generatedAt).toBeTruthy();
		expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
	});
});

describe("loadCuratedConfigs()", () => {
	it("returns an array", () => {
		const configs = loadCuratedConfigs();
		expect(Array.isArray(configs)).toBe(true);
	});

	it("only loads configs with events arrays", () => {
		const configs = loadCuratedConfigs();
		for (const config of configs) {
			expect(Array.isArray(config.events)).toBe(true);
			expect(config.events.length).toBeGreaterThan(0);
		}
	});

	it("includes file name on each config", () => {
		const configs = loadCuratedConfigs();
		for (const config of configs) {
			expect(config.file).toBeTruthy();
			expect(config.file.endsWith(".json")).toBe(true);
		}
	});
});
