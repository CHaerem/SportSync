import { describe, it, expect } from "vitest";
import { EventNormalizer } from "../scripts/lib/event-normalizer.js";

describe("EventNormalizer.sanitizeString()", () => {
	it("trims whitespace", () => {
		expect(EventNormalizer.sanitizeString("  hello  ")).toBe("hello");
	});

	it("handles null/undefined", () => {
		expect(EventNormalizer.sanitizeString(null)).toBe("");
		expect(EventNormalizer.sanitizeString(undefined)).toBe("");
	});

	it("converts non-strings to strings", () => {
		expect(EventNormalizer.sanitizeString(42)).toBe("42");
	});

	it("truncates long strings", () => {
		const long = "a".repeat(600);
		expect(EventNormalizer.sanitizeString(long)).toHaveLength(500);
	});
});

describe("EventNormalizer.generateId()", () => {
	it("generates consistent IDs", () => {
		const event = { title: "Arsenal vs Chelsea", time: "2025-08-20T15:00:00Z" };
		const id1 = EventNormalizer.generateId(event, "football");
		const id2 = EventNormalizer.generateId(event, "football");
		expect(id1).toBe(id2);
	});

	it("includes sport in ID", () => {
		const event = { title: "Test Match", time: "2025-08-20T15:00:00Z" };
		expect(EventNormalizer.generateId(event, "football")).toContain("football");
	});
});

describe("EventNormalizer.validateEvent()", () => {
	it("rejects null events", () => {
		expect(EventNormalizer.validateEvent(null)).toBe(false);
	});

	it("rejects events without title", () => {
		expect(EventNormalizer.validateEvent({ time: "2025-08-20T15:00:00Z" })).toBe(false);
	});

	it("rejects events with invalid dates", () => {
		expect(EventNormalizer.validateEvent({ title: "Test", time: "not-a-date" })).toBe(false);
	});

	it("rejects past events", () => {
		expect(
			EventNormalizer.validateEvent({
				title: "Old Match",
				time: "2020-01-01T00:00:00Z",
			})
		).toBe(false);
	});

	it("accepts valid future events", () => {
		const futureTime = new Date(Date.now() + 86400000).toISOString();
		expect(
			EventNormalizer.validateEvent({
				title: "Future Match",
				time: futureTime,
			})
		).toBe(true);
	});
});

describe("EventNormalizer.deduplicate()", () => {
	it("removes duplicate events", () => {
		const events = [
			{ sport: "football", title: "Match A", time: "2025-08-20T15:00:00Z" },
			{ sport: "football", title: "Match A", time: "2025-08-20T15:00:00Z" },
			{ sport: "football", title: "Match B", time: "2025-08-20T17:00:00Z" },
		];
		expect(EventNormalizer.deduplicate(events)).toHaveLength(2);
	});

	it("keeps events with different sports", () => {
		const events = [
			{ sport: "football", title: "Match", time: "2025-08-20T15:00:00Z" },
			{ sport: "golf", title: "Match", time: "2025-08-20T15:00:00Z" },
		];
		expect(EventNormalizer.deduplicate(events)).toHaveLength(2);
	});
});

describe("EventNormalizer.normalizeStreaming()", () => {
	it("handles null", () => {
		expect(EventNormalizer.normalizeStreaming(null)).toEqual([]);
	});

	it("handles string arrays", () => {
		const result = EventNormalizer.normalizeStreaming(["Viaplay", "TV2 Play"]);
		expect(result).toHaveLength(2);
		expect(result[0].platform).toBe("Viaplay");
	});

	it("handles object arrays", () => {
		const result = EventNormalizer.normalizeStreaming([
			{ platform: "Viaplay", url: "https://viaplay.no", type: "viaplay" },
		]);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://viaplay.no");
	});
});
