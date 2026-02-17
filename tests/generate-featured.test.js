import { describe, it, expect } from "vitest";
import {
	parseResponseJSON,
	toFeaturedShape,
	looksLikeMajorEvent,
	buildFallbackFeatured,
	fallbackLine,
	buildForYouBlock,
	buildFallbackHeadline,
	buildFallbackResultLines,
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

	it("includes headline block when events exist", () => {
		const events = [
			{ sport: "football", title: "Arsenal vs Chelsea", time: futureTime(), homeTeam: "Arsenal", awayTeam: "Chelsea" },
		];
		const result = buildFallbackFeatured(events, new Date());
		const headlines = result.blocks.filter((b) => b.type === "headline");
		expect(headlines.length).toBe(1);
	});

	it("includes result event-lines when recentResults has favorites", () => {
		const now = new Date();
		const events = [
			{ sport: "football", title: "Arsenal vs Chelsea", time: futureTime(), homeTeam: "Arsenal", awayTeam: "Chelsea" },
		];
		const recentResults = {
			football: [{
				homeTeam: "Girona", awayTeam: "Barcelona", homeScore: 2, awayScore: 1,
				date: new Date(now.getTime() - 12 * 3600000).toISOString(),
				isFavorite: true,
				goalScorers: [{ player: "Beltrán", team: "Girona", minute: "86'" }],
			}],
		};
		const result = buildFallbackFeatured(events, now, { recentResults });
		const resultLines = result.blocks.filter((b) => b.type === "event-line" && /FT:/.test(b.text));
		expect(resultLines.length).toBe(1);
		expect(resultLines[0].text).toContain("Girona");
		expect(resultLines[0].text).toContain("Beltrán");
	});

	it("does not include For You section", () => {
		const events = [
			{ sport: "football", title: "Barcelona vs Real Madrid", time: futureTime(), homeTeam: "Barcelona", awayTeam: "Real Madrid" },
		];
		const result = buildFallbackFeatured(events, new Date());
		const forYou = result.blocks.filter((b) => b.type === "section" && b.id === "for-you");
		expect(forYou.length).toBe(0);
	});

	it("deduplicates Olympics events between event-lines and sections", () => {
		const events = [
			{ sport: "olympics", title: "Biathlon Sprint", time: futureTime(), context: "olympics-2026", tournament: "Winter Olympics 2026" },
			{ sport: "olympics", title: "Cross-Country", time: futureTime(1), context: "olympics-2026", tournament: "Winter Olympics 2026" },
			{ sport: "football", title: "Arsenal vs Chelsea", time: futureTime(3), homeTeam: "Arsenal", awayTeam: "Chelsea" },
		];
		const result = buildFallbackFeatured(events, new Date());
		const sections = result.blocks.filter((b) => b.type === "section");
		const eventLines = result.blocks.filter((b) => b.type === "event-line" && !/FT:/.test(b.text) && b.text !== "No events scheduled today.");

		// Olympics should be in section, not in event-lines
		expect(sections.length).toBeGreaterThanOrEqual(1);
		const olympicsInLines = eventLines.filter((b) => /biathlon|cross-country/i.test(b.text));
		expect(olympicsInLines.length).toBe(0);
		// But football should still be in event-lines
		const footballInLines = eventLines.filter((b) => /Arsenal/i.test(b.text));
		expect(footballInLines.length).toBe(1);
	});
});

describe("buildForYouBlock()", () => {
	const futureTime = (hoursAhead = 2) => new Date(Date.now() + hoursAhead * 3600000).toISOString();
	const userContext = {
		favoriteTeams: ["Barcelona", "Lyn"],
		favoritePlayers: ["Viktor Hovland"],
		sportPreferences: { football: "high", golf: "high", tennis: "medium" },
	};

	it("returns null when no events", () => {
		expect(buildForYouBlock([], userContext, new Date())).toBeNull();
	});

	it("returns null when no user context", () => {
		const events = [{ sport: "football", title: "Test", time: futureTime() }];
		expect(buildForYouBlock(events, null, new Date())).toBeNull();
	});

	it("returns section block with for-you id", () => {
		const events = [
			{ sport: "football", title: "Barcelona vs Real Madrid", time: futureTime(), homeTeam: "Barcelona", awayTeam: "Real Madrid" },
		];
		const block = buildForYouBlock(events, userContext, new Date());
		expect(block).not.toBeNull();
		expect(block.type).toBe("section");
		expect(block.id).toBe("for-you");
		expect(block.style).toBe("highlight");
		expect(block.items.length).toBeGreaterThan(0);
	});

	it("prioritizes favorite team events", () => {
		const events = [
			{ sport: "football", title: "Barcelona vs Real Madrid", time: futureTime(), homeTeam: "Barcelona", awayTeam: "Real Madrid" },
			{ sport: "football", title: "Chelsea vs Arsenal", time: futureTime(3), homeTeam: "Chelsea", awayTeam: "Arsenal" },
		];
		const block = buildForYouBlock(events, userContext, new Date());
		expect(block).not.toBeNull();
		expect(block.items[0].text).toContain("Barcelona");
	});

	it("includes Norwegian events for high-pref sports", () => {
		const events = [
			{ sport: "football", title: "Lyn vs Brann", time: futureTime(), homeTeam: "Lyn", awayTeam: "Brann", norwegian: true },
		];
		const block = buildForYouBlock(events, userContext, new Date());
		expect(block).not.toBeNull();
		expect(block.items.length).toBe(1);
	});

	it("returns null when no events match preferences", () => {
		const events = [
			{ sport: "esports", title: "Random CS2 Match", time: futureTime() },
		];
		const block = buildForYouBlock(events, { sportPreferences: { esports: "low" } }, new Date());
		expect(block).toBeNull();
	});

	it("limits to 5 items", () => {
		const events = Array.from({ length: 10 }, (_, i) => ({
			sport: "football", title: `Barcelona vs Team ${i}`, time: futureTime(i + 1),
			homeTeam: "Barcelona", awayTeam: `Team ${i}`,
		}));
		const block = buildForYouBlock(events, userContext, new Date());
		expect(block.items.length).toBeLessThanOrEqual(5);
	});
});

describe("buildFallbackHeadline()", () => {
	const futureTime = (hoursAhead = 2) => new Date(Date.now() + hoursAhead * 3600000).toISOString();

	it("returns Olympics headline when Olympics events exist today", () => {
		const events = [
			{ sport: "olympics", title: "Biathlon", time: futureTime(), context: "olympics-2026" },
		];
		const headline = buildFallbackHeadline(events, new Date(), null, null);
		expect(headline).toContain("Milano-Cortina");
	});

	it("returns favorite result headline when recent results exist", () => {
		const now = new Date();
		const events = [
			{ sport: "football", title: "Arsenal vs Chelsea", time: futureTime() },
		];
		const recentResults = {
			football: [{
				homeTeam: "Girona", awayTeam: "Barcelona", homeScore: 2, awayScore: 1,
				date: new Date(now.getTime() - 6 * 3600000).toISOString(),
				isFavorite: true,
			}],
		};
		const headline = buildFallbackHeadline(events, now, recentResults, null);
		expect(headline).toContain("Girona");
		expect(headline).toContain("Barcelona");
	});

	it("returns must-watch event headline when no results", () => {
		const events = [
			{ sport: "football", title: "Arsenal vs Liverpool", time: futureTime(), homeTeam: "Arsenal", awayTeam: "Liverpool", importance: 5, tournament: "Premier League" },
		];
		const headline = buildFallbackHeadline(events, new Date(), null, null);
		expect(headline).toContain("Arsenal");
		expect(headline).toContain("Liverpool");
	});

	it("returns event count summary as fallback", () => {
		const events = [
			{ sport: "football", title: "Match 1", time: futureTime() },
			{ sport: "golf", title: "Tournament", time: futureTime(3) },
		];
		const headline = buildFallbackHeadline(events, new Date(), null, null);
		expect(headline).toContain("2 events");
		expect(headline).toContain("2 sports");
	});

	it("returns null when no events today", () => {
		const headline = buildFallbackHeadline([], new Date(), null, null);
		expect(headline).toBeNull();
	});
});

describe("buildFallbackResultLines()", () => {
	it("returns empty array when no results", () => {
		expect(buildFallbackResultLines(null, new Date())).toEqual([]);
		expect(buildFallbackResultLines({}, new Date())).toEqual([]);
	});

	it("returns FT lines for favorite results within 48h", () => {
		const now = new Date();
		const results = {
			football: [{
				homeTeam: "Girona", awayTeam: "Barcelona", homeScore: 2, awayScore: 1,
				date: new Date(now.getTime() - 12 * 3600000).toISOString(),
				isFavorite: true,
				goalScorers: [{ player: "Beltrán", team: "Girona", minute: "86'" }],
			}],
		};
		const lines = buildFallbackResultLines(results, now);
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain("FT:");
		expect(lines[0]).toContain("Girona");
		expect(lines[0]).toContain("Beltrán");
	});

	it("skips non-favorite results", () => {
		const now = new Date();
		const results = {
			football: [{
				homeTeam: "Arsenal", awayTeam: "Liverpool", homeScore: 1, awayScore: 0,
				date: new Date(now.getTime() - 6 * 3600000).toISOString(),
				isFavorite: false,
			}],
		};
		expect(buildFallbackResultLines(results, now)).toEqual([]);
	});

	it("skips results older than 48h", () => {
		const now = new Date();
		const results = {
			football: [{
				homeTeam: "Barcelona", awayTeam: "Madrid", homeScore: 3, awayScore: 1,
				date: new Date(now.getTime() - 3 * 24 * 3600000).toISOString(),
				isFavorite: true,
			}],
		};
		expect(buildFallbackResultLines(results, now)).toEqual([]);
	});

	it("limits to 2 result lines", () => {
		const now = new Date();
		const results = {
			football: [
				{ homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0, date: new Date(now.getTime() - 6 * 3600000).toISOString(), isFavorite: true },
				{ homeTeam: "C", awayTeam: "D", homeScore: 2, awayScore: 1, date: new Date(now.getTime() - 12 * 3600000).toISOString(), isFavorite: true },
				{ homeTeam: "E", awayTeam: "F", homeScore: 0, awayScore: 0, date: new Date(now.getTime() - 18 * 3600000).toISOString(), isFavorite: true },
			],
		};
		const lines = buildFallbackResultLines(results, now);
		expect(lines.length).toBe(2);
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
