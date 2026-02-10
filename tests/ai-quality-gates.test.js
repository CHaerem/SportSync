import { describe, it, expect } from "vitest";
import {
	validateFeaturedContent,
	enforceEnrichmentQuality,
	getEnrichmentCoverage,
	isMajorEventActive,
} from "../scripts/lib/ai-quality-gates.js";

describe("validateFeaturedContent()", () => {
	it("accepts well-formed featured payload", () => {
		const featured = {
			brief: ["Hovland tees off in a packed leaderboard race.", "Premier League night brings four key fixtures."],
			sections: [
				{
					id: "olympics-2026",
					title: "Winter Olympics 2026",
					emoji: "🏅",
					style: "highlight",
					items: [{ text: "14:30 — Mixed relay biathlon", type: "event" }],
				},
			],
			radar: ["Ruud could meet a seeded rival in the next round.", "Watch for late title-race shifts in England tonight."],
		};
		const events = [{ context: "olympics-2026", title: "Biathlon relay", time: "2026-02-12T14:30:00Z" }];
		const result = validateFeaturedContent(featured, { events });

		expect(result.valid).toBe(true);
		expect(result.score).toBeGreaterThan(70);
		expect(result.normalized.brief).toHaveLength(2);
		expect(result.normalized.radar).toHaveLength(2);
	});

	it("flags missing radar lines", () => {
		const featured = {
			brief: ["Only one brief line", "Second line"],
			sections: [],
			radar: [],
		};
		const result = validateFeaturedContent(featured, { events: [] });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "radar_too_short")).toBe(true);
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

describe("isMajorEventActive()", () => {
	it("detects major events from context and title", () => {
		expect(isMajorEventActive([{ context: "olympics-2026", title: "Sprint Final" }])).toBe(true);
		expect(isMajorEventActive([{ context: "league-week", title: "Regular fixture" }])).toBe(false);
	});
});
