import { describe, it, expect } from "vitest";
import {
	validateFeaturedContent,
	validateBlocksContent,
	enforceEnrichmentQuality,
	getEnrichmentCoverage,
	isMajorEventActive,
	evaluateEditorialQuality,
	evaluateWatchPlanQuality,
	buildQualitySnapshot,
	buildAdaptiveHints,
	buildSanityHints,
	evaluateResultsQuality,
	buildResultsHints,
	computeRollingAverages,
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

describe("blocks_too_many warning", () => {
	it("triggers warning when blocks exceed 10", () => {
		const blocks = Array.from({ length: 12 }, (_, i) => ({
			type: "event-line",
			text: `⚽ Match ${i + 1}, 21:00`,
		}));
		const result = validateBlocksContent(blocks, { events: [] });
		const tooMany = result.issues.find((i) => i.code === "blocks_too_many");
		expect(tooMany).toBeDefined();
		expect(tooMany.message).toContain("12");
		expect(result.score).toBeLessThan(100);
	});
});

describe("component block validation", () => {
	it("accepts valid match-result blocks", () => {
		const blocks = [
			{ type: "match-result", homeTeam: "Girona", awayTeam: "Barcelona", _fallbackText: "⚽ FT: Girona 2-1 Barcelona" },
			{ type: "event-line", text: "⛳ Hovland at Genesis, 14:30" },
			{ type: "divider", text: "This Week" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks[0].type).toBe("match-result");
		expect(result.normalized.blocks[0].homeTeam).toBe("Girona");
	});

	it("accepts valid match-preview blocks", () => {
		const blocks = [
			{ type: "match-preview", homeTeam: "Arsenal", awayTeam: "Chelsea", showStandings: true },
			{ type: "event-line", text: "⛳ Golf, 14:00" },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks[0].type).toBe("match-preview");
		expect(result.normalized.blocks[0].showStandings).toBe(true);
	});

	it("accepts valid event-schedule blocks", () => {
		const blocks = [
			{ type: "event-schedule", label: "🏅 Olympics today", filter: { sport: "olympics", window: "today" }, maxItems: 6, showFlags: true, style: "highlight" },
			{ type: "event-line", text: "⚽ Football, 21:00" },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks[0].type).toBe("event-schedule");
		expect(result.normalized.blocks[0].filter.sport).toBe("olympics");
	});

	it("accepts valid golf-status blocks", () => {
		const blocks = [
			{ type: "golf-status", tournament: "pga" },
			{ type: "event-line", text: "⚽ Football, 21:00" },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.valid).toBe(true);
		expect(result.normalized.blocks[0].type).toBe("golf-status");
	});

	it("rejects component blocks missing required fields", () => {
		const blocks = [
			{ type: "match-result", homeTeam: "Girona" }, // missing awayTeam
			{ type: "event-line", text: "⚽ Football, 21:00" },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		// match-result is stripped, leaving 2 valid blocks (too few = error)
		expect(result.normalized.blocks).toHaveLength(2);
	});

	it("rejects event-schedule without filter.sport", () => {
		const blocks = [
			{ type: "event-schedule", label: "Schedule", filter: { window: "today" } }, // missing sport
			{ type: "event-line", text: "⚽ Football, 21:00" },
			{ type: "event-line", text: "⚽ Football, 22:00" },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		// event-schedule is stripped because filter.sport is missing
		expect(result.normalized.blocks.find(b => b.type === "event-schedule")).toBeUndefined();
	});

	it("counts component blocks as event content", () => {
		const blocks = [
			{ type: "headline", text: "Test headline" },
			{ type: "match-preview", homeTeam: "Arsenal", awayTeam: "Chelsea" },
			{ type: "narrative", text: "Some editorial context for the match." },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		// match-preview counts as event content, so no_event_blocks error should not appear
		const noEvents = result.issues.find(i => i.code === "no_event_blocks");
		expect(noEvents).toBeUndefined();
	});

	it("strips unknown fields from component blocks", () => {
		const blocks = [
			{ type: "match-result", homeTeam: "Girona", awayTeam: "Barcelona", _fallbackText: "fallback", unknownField: "junk" },
			{ type: "event-line", text: "⚽ Football, 21:00" },
			{ type: "divider", text: "Later" },
		];
		const result = validateBlocksContent(blocks, { events: [] });
		expect(result.normalized.blocks[0].unknownField).toBeUndefined();
		expect(result.normalized.blocks[0]._fallbackText).toBe("fallback");
	});
});

describe("isMajorEventActive()", () => {
	it("detects major events from context and title", () => {
		expect(isMajorEventActive([{ context: "olympics-2026", title: "Sprint Final" }])).toBe(true);
		expect(isMajorEventActive([{ context: "league-week", title: "Regular fixture" }])).toBe(false);
	});
});

describe("evaluateEditorialQuality()", () => {
	const now = new Date("2026-02-12T12:00:00Z");

	it("scores well when must-watch events are covered", () => {
		const events = [
			{ sport: "football", title: "Liverpool vs Arsenal", importance: 5, time: "2026-02-12T20:00:00Z" },
			{ sport: "golf", title: "Hovland Round 3", importance: 4, time: "2026-02-12T14:00:00Z" },
		];
		const featured = {
			blocks: [
				{ type: "headline", text: "Title race showdown tonight" },
				{ type: "event-line", text: "⚽ Liverpool vs Arsenal, 21:00" },
				{ type: "event-line", text: "⛳ Hovland Round 3, 15:00" },
				{ type: "divider", text: "This Week" },
				{ type: "event-line", text: "♟️ Carlsen at Freestyle" },
			],
		};
		const result = evaluateEditorialQuality(featured, events, { now });
		expect(result.score).toBeGreaterThanOrEqual(60);
		expect(result.metrics.mustWatchCoverage).toBe(1);
	});

	it("penalizes missed must-watch events", () => {
		const events = [
			{ sport: "football", title: "Liverpool vs Arsenal", importance: 5, time: "2026-02-12T20:00:00Z" },
			{ sport: "golf", title: "Hovland Round 3", importance: 4, time: "2026-02-12T14:00:00Z" },
		];
		const featured = {
			blocks: [
				{ type: "event-line", text: "⚽ Random match, 18:00" },
				{ type: "event-line", text: "🎾 Tennis open, 12:00" },
				{ type: "narrative", text: "A quiet day in sports." },
			],
		};
		const result = evaluateEditorialQuality(featured, events, { now });
		expect(result.metrics.mustWatchCoverage).toBe(0);
		expect(result.issues.some((i) => i.code === "must_watch_missed")).toBe(true);
	});

	it("handles empty events gracefully", () => {
		const featured = {
			blocks: [
				{ type: "event-line", text: "⚽ Match, 21:00" },
				{ type: "event-line", text: "⛳ Golf, 14:00" },
				{ type: "divider", text: "This Week" },
			],
		};
		const result = evaluateEditorialQuality(featured, [], { now });
		expect(result.score).toBeGreaterThanOrEqual(0);
		expect(result.metrics.mustWatchCoverage).toBe(1);
	});

	it("includes events within 3-day featured window", () => {
		const events = [
			{ sport: "football", title: "Liverpool vs Arsenal", importance: 5, time: "2026-02-14T20:00:00Z" },
		];
		const featured = {
			blocks: [
				{ type: "headline", text: "Weekend showdown" },
				{ type: "event-line", text: "⚽ Liverpool vs Arsenal, Sat 21:00" },
				{ type: "divider", text: "This Week" },
			],
		};
		const result = evaluateEditorialQuality(featured, events, { now });
		expect(result.metrics.mustWatchCoverage).toBe(1);
	});

	it("excludes events beyond 3-day featured window", () => {
		const events = [
			{ sport: "football", title: "Liverpool vs Arsenal", importance: 5, time: "2026-02-16T20:00:00Z" },
		];
		const featured = {
			blocks: [
				{ type: "event-line", text: "⚽ Liverpool vs Arsenal, Mon 21:00" },
				{ type: "event-line", text: "⛳ Golf, 14:00" },
				{ type: "divider", text: "This Week" },
			],
		};
		const result = evaluateEditorialQuality(featured, events, { now });
		// Event is beyond window, so no must-watch events to cover → defaults to 1
		expect(result.metrics.mustWatchCoverage).toBe(1);
	});

	it("penalizes quiet-day violations", () => {
		const events = [
			{ sport: "football", title: "Match A", importance: 2, time: "2026-02-12T20:00:00Z" },
		];
		const featured = {
			blocks: [
				{ type: "event-line", text: "⚽ Match A, 21:00" },
				{ type: "event-line", text: "⚽ Match B, 21:00" },
				{ type: "event-line", text: "⚽ Match C, 21:00" },
				{ type: "event-line", text: "⚽ Match D, 21:00" },
				{ type: "event-line", text: "⚽ Match E, 21:00" },
				{ type: "event-line", text: "⚽ Match F, 21:00" },
			],
		};
		const result = evaluateEditorialQuality(featured, events, { now });
		expect(result.metrics.quietDayCompliance).toBeLessThan(1);
	});
});

describe("evaluateWatchPlanQuality()", () => {
	it("scores normal watch plan with picks", () => {
		const watchPlan = {
			picks: [
				{ title: "Match A", score: 80, streaming: [{ platform: "Viaplay" }], reasons: ["Favorite team"] },
				{ title: "Match B", score: 60, streaming: [], reasons: ["Must-watch"] },
				{ title: "Match C", score: 50, streaming: [{ platform: "TV2" }], reasons: [] },
			],
		};
		const result = evaluateWatchPlanQuality(watchPlan);
		expect(result.score).toBeGreaterThan(40);
		expect(result.metrics.pickCount).toBe(3);
		expect(result.metrics.avgScore).toBe(63);
		expect(result.metrics.streamingCoverage).toBeCloseTo(0.667, 2);
		expect(result.metrics.reasonCoverage).toBeCloseTo(0.667, 2);
	});

	it("returns zero score for empty picks", () => {
		const result = evaluateWatchPlanQuality({ picks: [] });
		expect(result.score).toBe(0);
		expect(result.metrics.pickCount).toBe(0);
	});
});

describe("buildQualitySnapshot()", () => {
	it("builds compact snapshot from all sections", () => {
		const editorial = { score: 78, metrics: { mustWatchCoverage: 0.8, sportDiversity: 0.6 } };
		const enrichment = { score: 95, importanceCoverage: 1, summaryCoverage: 0.9 };
		const featured = { blocks: [{ type: "event-line" }, { type: "headline" }], score: 85, provider: "claude-cli", valid: true };
		const watchPlan = { metrics: { pickCount: 3, avgScore: 70, streamingCoverage: 0.67 } };

		const snapshot = buildQualitySnapshot(editorial, enrichment, featured, watchPlan);
		expect(snapshot.timestamp).toBeTruthy();
		expect(snapshot.editorial.score).toBe(78);
		expect(snapshot.editorial.blockCount).toBe(2);
		expect(snapshot.enrichment.score).toBe(95);
		expect(snapshot.featured.provider).toBe("claude-cli");
		expect(snapshot.watchPlan.pickCount).toBe(3);
	});

	it("handles null sections gracefully", () => {
		const snapshot = buildQualitySnapshot(null, null, null, null);
		expect(snapshot.timestamp).toBeTruthy();
		expect(snapshot.editorial).toBeNull();
		expect(snapshot.enrichment).toBeNull();
		expect(snapshot.featured).toBeNull();
		expect(snapshot.watchPlan).toBeNull();
	});

	it("includes hintsApplied when provided", () => {
		const editorial = { score: 78, metrics: { mustWatchCoverage: 0.8, sportDiversity: 0.6 } };
		const featured = { blocks: [{ type: "event-line" }], score: 85, provider: "claude-cli", valid: true };
		const hints = ["CORRECTION: Recent outputs missed must-watch events."];
		const snapshot = buildQualitySnapshot(editorial, null, featured, null, { hintsApplied: hints });
		expect(snapshot.hintsApplied).toEqual(hints);
	});

	it("defaults hintsApplied to empty array", () => {
		const snapshot = buildQualitySnapshot(null, null, null, null);
		expect(snapshot.hintsApplied).toEqual([]);
	});

	it("includes results metrics when provided", () => {
		const results = { score: 75, metrics: { recapHeadlineRate: 0.6, goalScorerCoverage: 0.8, footballCount: 12, freshnessScore: 1.0 } };
		const snapshot = buildQualitySnapshot(null, null, null, null, { results });
		expect(snapshot.results).toBeDefined();
		expect(snapshot.results.score).toBe(75);
		expect(snapshot.results.recapHeadlineRate).toBe(0.6);
		expect(snapshot.results.footballCount).toBe(12);
	});

	it("handles null results gracefully", () => {
		const snapshot = buildQualitySnapshot(null, null, null, null, {});
		expect(snapshot.results).toBeNull();
	});

	it("includes quota context when provided", () => {
		const quota = { tier: 1, model: "claude-sonnet-4-6", enrichmentModel: "claude-sonnet-4-6", featuredModel: "claude-sonnet-4-6" };
		const snapshot = buildQualitySnapshot(null, null, null, null, { quota });
		expect(snapshot.quota).toEqual(quota);
	});

	it("defaults quota to null when not provided", () => {
		const snapshot = buildQualitySnapshot(null, null, null, null, {});
		expect(snapshot.quota).toBeNull();
	});
});

describe("buildAdaptiveHints()", () => {
	function makeEditorialEntry(overrides = {}) {
		return {
			editorial: {
				score: 80,
				mustWatchCoverage: 1,
				sportDiversity: 0.8,
				blockTypeBalance: 1,
				textQuality: 1,
				blockCountTarget: 1,
				quietDayCompliance: 1,
				...overrides,
			},
		};
	}

	it("returns empty hints with fewer than 3 history entries", () => {
		const history = [makeEditorialEntry(), makeEditorialEntry()];
		const result = buildAdaptiveHints(history);
		expect(result.hints).toEqual([]);
		expect(result.metrics).toEqual({});
	});

	it("returns must-watch hint when coverage is low", () => {
		const history = Array.from({ length: 5 }, () =>
			makeEditorialEntry({ mustWatchCoverage: 0.3 })
		);
		const result = buildAdaptiveHints(history);
		expect(result.hints).toHaveLength(1);
		expect(result.hints[0]).toContain("must-watch");
		expect(result.metrics.mustWatchCoverage).toBeCloseTo(0.3);
	});

	it("returns sport diversity hint when diversity is low", () => {
		const history = Array.from({ length: 5 }, () =>
			makeEditorialEntry({ sportDiversity: 0.2 })
		);
		const result = buildAdaptiveHints(history);
		expect(result.hints.some((h) => h.includes("too focused on one sport"))).toBe(true);
	});

	it("returns text quality hint when blocks exceed limits", () => {
		const history = Array.from({ length: 5 }, () =>
			makeEditorialEntry({ textQuality: 0.5 })
		);
		const result = buildAdaptiveHints(history);
		expect(result.hints.some((h) => h.includes("word limits"))).toBe(true);
	});

	it("returns multiple hints when multiple metrics are bad", () => {
		const history = Array.from({ length: 5 }, () =>
			makeEditorialEntry({
				mustWatchCoverage: 0.2,
				sportDiversity: 0.1,
				textQuality: 0.4,
			})
		);
		const result = buildAdaptiveHints(history);
		expect(result.hints.length).toBeGreaterThanOrEqual(3);
	});

	it("returns no hints when all metrics are good", () => {
		const history = Array.from({ length: 5 }, () => makeEditorialEntry());
		const result = buildAdaptiveHints(history);
		expect(result.hints).toEqual([]);
	});

	it("generates quota-aware hint when constrained runs have lower quality", () => {
		const unconstrained = Array.from({ length: 2 }, () => ({
			...makeEditorialEntry({ score: 85 }),
			quota: { tier: 0, model: null },
		}));
		const constrained = Array.from({ length: 3 }, () => ({
			...makeEditorialEntry({ score: 60 }),
			quota: { tier: 1, model: "claude-sonnet-4-6" },
		}));
		const history = [...unconstrained, ...constrained];
		const result = buildAdaptiveHints(history);
		expect(result.hints.some(h => h.includes("quota-constrained"))).toBe(true);
	});

	it("does not generate quota hint when quality is similar across tiers", () => {
		const unconstrained = Array.from({ length: 2 }, () => ({
			...makeEditorialEntry({ score: 80 }),
			quota: { tier: 0, model: null },
		}));
		const constrained = Array.from({ length: 3 }, () => ({
			...makeEditorialEntry({ score: 78 }),
			quota: { tier: 1, model: "claude-sonnet-4-6" },
		}));
		const history = [...unconstrained, ...constrained];
		const result = buildAdaptiveHints(history);
		expect(result.hints.some(h => h.includes("quota-constrained"))).toBe(false);
	});
});

describe("buildSanityHints()", () => {
	it("returns empty for null report", () => {
		const result = buildSanityHints(null);
		expect(result.hints).toEqual([]);
		expect(result.findingCount).toBe(0);
	});

	it("returns empty for passing report with zero findings", () => {
		const result = buildSanityHints({ pass: true, summary: { total: 0 }, findings: [] });
		expect(result.hints).toEqual([]);
		expect(result.findingCount).toBe(0);
	});

	it("emits content hint for featured warnings", () => {
		const report = {
			pass: true,
			summary: { total: 1, warning: 1 },
			findings: [
				{ severity: "warning", check: "featured_orphan_ref", message: 'Featured references "Unknown Match"' },
			],
		};
		const result = buildSanityHints(report);
		expect(result.hints).toHaveLength(1);
		expect(result.hints[0]).toContain("SANITY:");
		expect(result.hints[0]).toContain("content issues");
		expect(result.findingCount).toBe(1);
	});

	it("includes actionable LLM findings", () => {
		const report = {
			pass: true,
			summary: { total: 1, warning: 0 },
			findings: [
				{ severity: "info", check: "llm_data_quality", message: "Golf event missing tee times", actionable: true },
			],
		};
		const result = buildSanityHints(report);
		expect(result.hints).toHaveLength(1);
		expect(result.hints[0]).toContain("SANITY:");
		expect(result.hints[0]).toContain("Golf event missing tee times");
	});

	it("groups result findings together", () => {
		const report = {
			pass: true,
			summary: { total: 2, warning: 2 },
			findings: [
				{ severity: "warning", check: "result_future_date", message: "Result has future date" },
				{ severity: "warning", check: "result_extreme_score", message: "Extreme score detected" },
			],
		};
		const result = buildSanityHints(report);
		expect(result.hints).toHaveLength(1);
		expect(result.hints[0]).toContain("Results data had quality issues");
		expect(result.findingCount).toBe(2);
	});

	it("emits coverage hint for sport_vanished", () => {
		const report = {
			pass: false,
			summary: { total: 1, critical: 1 },
			findings: [
				{ severity: "critical", check: "sport_vanished", message: "chess: 0 events" },
			],
		};
		const result = buildSanityHints(report);
		expect(result.hints).toHaveLength(1);
		expect(result.hints[0]).toContain("Coverage gaps detected");
	});
});

describe("buildQualitySnapshot() with sanity", () => {
	it("includes sanity section when provided", () => {
		const sanity = { findingCount: 3, warningCount: 2, pass: true };
		const snapshot = buildQualitySnapshot(null, null, null, null, { sanity });
		expect(snapshot.sanity).toBeDefined();
		expect(snapshot.sanity.findingCount).toBe(3);
		expect(snapshot.sanity.warningCount).toBe(2);
		expect(snapshot.sanity.pass).toBe(true);
	});

	it("sanity is null when not provided", () => {
		const snapshot = buildQualitySnapshot(null, null, null, null);
		expect(snapshot.sanity).toBeNull();
	});
});

describe("computeRollingAverages()", () => {
	it("returns null for empty or insufficient history", () => {
		expect(computeRollingAverages(null)).toBeNull();
		expect(computeRollingAverages([])).toBeNull();
		expect(computeRollingAverages([{}])).toBeNull();
	});

	it("computes averages from history entries", () => {
		const history = [
			{ editorial: { score: 80, mustWatchCoverage: 0.6, sportDiversity: 0.5 }, enrichment: { score: 90 }, results: { score: 70 } },
			{ editorial: { score: 90, mustWatchCoverage: 0.8, sportDiversity: 0.7 }, enrichment: { score: 100 }, results: { score: 80 } },
			{ editorial: { score: 85, mustWatchCoverage: 0.7, sportDiversity: 0.6 }, enrichment: { score: 95 }, results: { score: 75 } },
		];
		const avg = computeRollingAverages(history);
		expect(avg).not.toBeNull();
		expect(avg.windowSize).toBe(3);
		expect(avg.editorialScore).toBeCloseTo(85, 0);
		expect(avg.mustWatchCoverage).toBeCloseTo(0.7, 1);
		expect(avg.enrichmentScore).toBeCloseTo(95, 0);
		expect(avg.resultsScore).toBeCloseTo(75, 0);
	});

	it("uses only last N entries for window", () => {
		const history = [
			{ editorial: { score: 50 } },
			{ editorial: { score: 60 } },
			{ editorial: { score: 70 } },
			{ editorial: { score: 80 } },
			{ editorial: { score: 90 } },
		];
		const avg3 = computeRollingAverages(history, 3);
		expect(avg3.windowSize).toBe(3);
		expect(avg3.editorialScore).toBeCloseTo(80, 0); // avg of 70, 80, 90
	});

	it("handles missing metric values gracefully", () => {
		const history = [
			{ editorial: { score: 80 } },
			{ editorial: null },
			{ editorial: { score: 90 } },
		];
		const avg = computeRollingAverages(history);
		expect(avg.editorialScore).toBeCloseTo(85, 0); // only 2 valid values
		expect(avg.enrichmentScore).toBeNull(); // no enrichment data
	});
});
