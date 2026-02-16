import { describe, it, expect } from "vitest";
import {
	parseResponseJSON,
	toFeaturedShape,
	looksLikeMajorEvent,
	buildFallbackFeatured,
	fallbackLine,
} from "../scripts/generate-featured.js";

describe("parseResponseJSON()", () => {
	it("parses valid JSON directly", () => {
		const result = parseResponseJSON('{"blocks": [{"type": "headline", "text": "Test"}]}');
		expect(result.blocks).toHaveLength(1);
		expect(result.blocks[0].text).toBe("Test");
	});

	it("extracts JSON from markdown code fences", () => {
		const raw = '```json\n{"blocks": [{"type": "event-line", "text": "⚽ Test"}]}\n```';
		const result = parseResponseJSON(raw);
		expect(result.blocks).toHaveLength(1);
		expect(result.blocks[0].type).toBe("event-line");
	});

	it("extracts JSON from bare code fences", () => {
		const raw = '```\n{"blocks": []}\n```';
		const result = parseResponseJSON(raw);
		expect(result.blocks).toEqual([]);
	});

	it("throws on malformed input", () => {
		expect(() => parseResponseJSON("not json at all")).toThrow();
	});

	it("throws on empty input", () => {
		expect(() => parseResponseJSON("")).toThrow();
	});
});

describe("toFeaturedShape()", () => {
	it("returns blocks from valid input", () => {
		const result = toFeaturedShape({ blocks: [{ type: "headline", text: "Test" }] });
		expect(result.blocks).toHaveLength(1);
		expect(result.blocks[0].text).toBe("Test");
	});

	it("returns empty blocks for missing blocks array", () => {
		expect(toFeaturedShape({})).toEqual({ blocks: [] });
		expect(toFeaturedShape(null)).toEqual({ blocks: [] });
		expect(toFeaturedShape(undefined)).toEqual({ blocks: [] });
	});

	it("returns empty blocks for non-array blocks", () => {
		expect(toFeaturedShape({ blocks: "string" })).toEqual({ blocks: [] });
	});

	it("strips unexpected top-level keys", () => {
		const result = toFeaturedShape({ blocks: [], extra: "data" });
		expect(result).toEqual({ blocks: [] });
		expect(result.extra).toBeUndefined();
	});
});

describe("looksLikeMajorEvent()", () => {
	it("detects Olympics", () => {
		expect(looksLikeMajorEvent({ context: "olympics-2026" })).toBe(true);
	});

	it("detects World Cup", () => {
		expect(looksLikeMajorEvent({ tournament: "FIFA World Cup 2026" })).toBe(true);
	});

	it("detects Champions League", () => {
		expect(looksLikeMajorEvent({ title: "Champions League Final" })).toBe(true);
	});

	it("detects Grand Slam", () => {
		expect(looksLikeMajorEvent({ tournament: "Australian Open Grand Slam" })).toBe(true);
	});

	it("detects Masters (golf)", () => {
		expect(looksLikeMajorEvent({ tournament: "The Masters", sport: "golf" })).toBe(true);
	});

	it("does not detect Major in non-golf sport", () => {
		expect(looksLikeMajorEvent({ tournament: "CS2 Major Tournaments", sport: "esports" })).toBe(false);
	});

	it("detects playoff/final", () => {
		expect(looksLikeMajorEvent({ title: "NHL Playoff Game 5" })).toBe(true);
		expect(looksLikeMajorEvent({ title: "Cup Final" })).toBe(true);
	});

	it("returns false for regular match", () => {
		expect(looksLikeMajorEvent({ title: "Arsenal vs Chelsea", tournament: "Premier League" })).toBe(false);
	});

	it("returns false for empty/null event", () => {
		expect(looksLikeMajorEvent({})).toBe(false);
		expect(looksLikeMajorEvent(null)).toBe(false);
	});
});

describe("buildFallbackFeatured()", () => {
	const futureTime = (hoursAhead = 2) => new Date(Date.now() + hoursAhead * 3600000).toISOString();

	it("returns object with blocks array", () => {
		const events = [
			{ sport: "football", title: "Arsenal vs Chelsea", time: futureTime(), homeTeam: "Arsenal", awayTeam: "Chelsea" },
		];
		const result = buildFallbackFeatured(events, new Date());
		expect(result).toHaveProperty("blocks");
		expect(Array.isArray(result.blocks)).toBe(true);
		expect(result.blocks.length).toBeGreaterThan(0);
	});

	it("includes event-line blocks for today's events", () => {
		const events = [
			{ sport: "football", title: "Arsenal vs Chelsea", time: futureTime(), homeTeam: "Arsenal", awayTeam: "Chelsea" },
			{ sport: "golf", title: "The Open", time: futureTime(3) },
		];
		const result = buildFallbackFeatured(events, new Date());
		const eventLines = result.blocks.filter((b) => b.type === "event-line");
		expect(eventLines.length).toBeGreaterThanOrEqual(1);
	});

	it("handles empty events", () => {
		const result = buildFallbackFeatured([], new Date());
		expect(result.blocks).toBeDefined();
		// Should have at least a "no events" line
		const eventLines = result.blocks.filter((b) => b.type === "event-line");
		expect(eventLines.length).toBeGreaterThanOrEqual(1);
	});

	it("includes major event sections when applicable", () => {
		const events = [
			{ sport: "olympics", title: "Biathlon", time: futureTime(), context: "olympics-2026", tournament: "Winter Olympics 2026" },
		];
		const result = buildFallbackFeatured(events, new Date());
		const sections = result.blocks.filter((b) => b.type === "section");
		expect(sections.length).toBeGreaterThanOrEqual(1);
		expect(sections[0].style).toBe("highlight");
	});
});

describe("fallbackLine()", () => {
	it("formats football with team names", () => {
		const line = fallbackLine({
			sport: "football",
			title: "Arsenal vs Chelsea",
			time: "2026-02-14T20:00:00Z",
			homeTeam: "Arsenal",
			awayTeam: "Chelsea",
			tournament: "Premier League",
		});
		expect(line).toContain("⚽");
		expect(line).toContain("Arsenal");
		expect(line).toContain("Chelsea");
		expect(line).toContain("Premier League");
	});

	it("formats golf event", () => {
		const line = fallbackLine({
			sport: "golf",
			title: "The Genesis Invitational",
			time: "2026-02-14T18:00:00Z",
			tournament: "PGA Tour",
		});
		expect(line).toContain("⛳");
		expect(line).toContain("The Genesis Invitational");
		expect(line).toContain("PGA Tour");
	});

	it("formats event without tournament as title only", () => {
		const line = fallbackLine({
			sport: "tennis",
			title: "Australian Open Final",
			time: "2026-02-14T10:00:00Z",
			summary: "Sinner vs Djokovic in the decider.",
		});
		expect(line).toContain("🎾");
		expect(line).toContain("Australian Open Final");
		// Summary is not included in fallback lines (avoids duplication)
		expect(line).not.toContain("Sinner vs Djokovic");
	});

	it("includes time in HH:MM format", () => {
		const line = fallbackLine({
			sport: "chess",
			title: "Carlsen vs Firouzja",
			time: "2026-02-14T15:30:00Z",
		});
		expect(line).toContain("♟️");
		// Time should be present (exact format depends on timezone)
		expect(line).toMatch(/\d{2}:\d{2}/);
	});
});
