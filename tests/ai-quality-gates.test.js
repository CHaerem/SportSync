import { describe, it, expect } from "vitest";
import {
	validateFeaturedContent,
	validateBlocksContent,
	enforceEnrichmentQuality,
	getEnrichmentCoverage,
	isMajorEventActive,
} from "../scripts/lib/ai-quality-gates.js";

describe("validateFeaturedContent()", () => {
	it("validates blocks format", () => {
		const featured = {
			blocks: [
				{ type: "event-line", text: "⚽ Match, 21:00" },
				{ type: "event-line", text: "⛳ Golf, 14:00" },
				{ type: "divider", text: "This Week" },
				{ type: "event-line", text: "⚽ Fri fixture" },
			],
		};
		const result = validateFeaturedContent(featured, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks).toBeDefined();
		expect(result.normalized.blocks).toHaveLength(4);
	});

	it("rejects empty featured (no blocks)", () => {
		const result = validateFeaturedContent({}, { events: [] });
		expect(result.valid).toBe(false);
	});
});

describe("enrichment quality gates", () => {
	it("fills missing enrichment fields with deterministic fallback", () => {
		const events = [
			{
				sport: "football",
				title: "Liverpool vs Arsenal",
				tournament: "Premier League",
				time: "2026-02-12T19:00:00Z",
				homeTeam: "Liverpool",
				awayTeam: "Arsenal",
				norwegian: false,
			},
			{
				sport: "olympics",
				title: "Mixed Relay",
				tournament: "Winter Olympics 2026",
				context: "olympics-2026",
				time: "2026-02-12T14:30:00Z",
				norwegian: true,
			},
		];

		const result = enforceEnrichmentQuality(events);
		expect(result.valid).toBe(true);
		expect(result.changedCount).toBeGreaterThan(0);
		expect(events[0].importance).toBeGreaterThanOrEqual(1);
		expect(events[0].summary).toContain("Liverpool");
		expect(events[0].tags.length).toBeGreaterThan(0);
		expect(events[1].norwegianRelevance).toBe(5);
	});

	it("reports full coverage after fallback", () => {
		const events = [
			{ sport: "golf", title: "The Open", tournament: "Major", time: "2026-02-13T08:00:00Z", norwegian: true },
		];
		enforceEnrichmentQuality(events);
		const coverage = getEnrichmentCoverage(events);
		expect(coverage.importanceCoverage).toBe(1);
		expect(coverage.summaryCoverage).toBe(1);
		expect(coverage.relevanceCoverage).toBe(1);
		expect(coverage.tagsCoverage).toBe(1);
	});
});

describe("validateBlocksContent()", () => {
	it("accepts valid blocks with mixed types", () => {
		const blocks = [
			{ type: "headline", text: "Medal day in Milano-Cortina" },
			{ type: "event-line", text: "⚽ Barcelona at Atlético Madrid, 21:00" },
			{ type: "event-group", label: "🏅 Olympics today", items: ["Biathlon 10:00", "GS 10:00", "XC 13:00"] },
			{ type: "narrative", text: "Norway's golden generation goes for three medals today." },
			{ type: "divider", text: "This Week" },
			{ type: "event-line", text: "♟️ Carlsen opens Freestyle Chess, Fri 15:00" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks).toHaveLength(6);
	});

	it("rejects blocks without any event content", () => {
		const blocks = [
			{ type: "headline", text: "Headline" },
			{ type: "narrative", text: "Some context." },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(false);
	});
});

describe("isMajorEventActive()", () => {
	it("detects major events from context and title", () => {
		expect(isMajorEventActive([{ context: "olympics-2026", title: "Sprint Final" }])).toBe(true);
		expect(isMajorEventActive([{ context: "league-week", title: "Regular fixture" }])).toBe(false);
	});
});
