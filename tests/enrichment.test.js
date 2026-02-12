import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../scripts/lib/enrichment-prompts.js";
import { buildEnrichmentHints } from "../scripts/enrich-events.js";

describe("buildSystemPrompt()", () => {
	it("includes user context in prompt", () => {
		const ctx = {
			location: "Norway",
			favoriteTeams: ["Barcelona", "Lyn"],
			favoritePlayers: ["Viktor Hovland"],
			favoriteEsportsOrgs: ["100 Thieves"],
			sportPreferences: { football: "high", golf: "high" },
		};
		const prompt = buildSystemPrompt(ctx);

		expect(prompt).toContain("Norway");
		expect(prompt).toContain("Barcelona");
		expect(prompt).toContain("Lyn");
		expect(prompt).toContain("Viktor Hovland");
		expect(prompt).toContain("100 Thieves");
	});

	it("handles empty user context", () => {
		const prompt = buildSystemPrompt({});
		expect(prompt).toContain("importance");
		expect(prompt).toContain("norwegianRelevance");
		expect(prompt).toContain("tags");
	});

	it("includes scoring guidance for all sports", () => {
		const prompt = buildSystemPrompt({});
		expect(prompt).toContain("Football");
		expect(prompt).toContain("Golf");
		expect(prompt).toContain("Tennis");
		expect(prompt).toContain("F1");
		expect(prompt).toContain("Chess");
		expect(prompt).toContain("Esports");
	});

	it("requests JSON output format", () => {
		const prompt = buildSystemPrompt({});
		expect(prompt).toContain("JSON");
		expect(prompt).toContain('"events"');
	});
});

describe("buildUserPrompt()", () => {
	it("serializes event batch into prompt", () => {
		const events = [
			{
				sport: "football",
				tournament: "Premier League",
				title: "Arsenal vs Chelsea",
				time: "2025-08-20T15:00:00Z",
				venue: "Emirates",
				homeTeam: "Arsenal",
				awayTeam: "Chelsea",
			},
		];
		const prompt = buildUserPrompt(events);

		expect(prompt).toContain("Arsenal vs Chelsea");
		expect(prompt).toContain("Premier League");
		expect(prompt).toContain("1 events");
	});

	it("limits participants to 10", () => {
		const events = [
			{
				sport: "golf",
				title: "Test",
				time: "2025-08-20T15:00:00Z",
				participants: Array.from({ length: 20 }, (_, i) => `Player ${i}`),
			},
		];
		const prompt = buildUserPrompt(events);
		const parsed = JSON.parse(prompt.split("\n\n")[1]);
		expect(parsed[0].participants).toHaveLength(10);
	});

	it("extracts Norwegian player names", () => {
		const events = [
			{
				sport: "golf",
				title: "Test",
				time: "2025-08-20T15:00:00Z",
				norwegianPlayers: [
					{ name: "Viktor Hovland", teeTime: "08:30" },
					{ name: "Kristoffer Reitan", teeTime: "09:00" },
				],
			},
		];
		const prompt = buildUserPrompt(events);
		expect(prompt).toContain("Viktor Hovland");
		expect(prompt).toContain("Kristoffer Reitan");
	});
});

describe("buildEnrichmentHints()", () => {
	it("returns empty hints when no previous quality data", () => {
		expect(buildEnrichmentHints(null)).toEqual([]);
		expect(buildEnrichmentHints(undefined)).toEqual([]);
		expect(buildEnrichmentHints({})).toEqual([]);
	});

	it("returns tag coverage hint when tags are low", () => {
		const qualityData = {
			enrichment: {
				after: { tagsCoverage: 0.5, summaryCoverage: 1.0 },
				failedBatches: 0,
			},
		};
		const hints = buildEnrichmentHints(qualityData);
		expect(hints).toHaveLength(1);
		expect(hints[0]).toContain("tag coverage");
		expect(hints[0]).toContain("CORRECTION");
	});

	it("returns summary hint when summaries are low", () => {
		const qualityData = {
			enrichment: {
				after: { tagsCoverage: 1.0, summaryCoverage: 0.7 },
				failedBatches: 0,
			},
		};
		const hints = buildEnrichmentHints(qualityData);
		expect(hints).toHaveLength(1);
		expect(hints[0]).toContain("summaries");
		expect(hints[0]).toContain("CORRECTION");
	});

	it("returns batch failure hint when batches failed", () => {
		const qualityData = {
			enrichment: {
				after: { tagsCoverage: 1.0, summaryCoverage: 1.0 },
				failedBatches: 2,
			},
		};
		const hints = buildEnrichmentHints(qualityData);
		expect(hints).toHaveLength(1);
		expect(hints[0]).toContain("batch failures");
		expect(hints[0]).toContain("same number of events");
	});

	it("returns must-watch hint when editorial must-watch coverage is low", () => {
		const qualityData = {
			enrichment: {
				after: { tagsCoverage: 1.0, summaryCoverage: 1.0 },
				failedBatches: 0,
			},
			editorial: {
				metrics: { mustWatchCoverage: 0.4 },
			},
		};
		const hints = buildEnrichmentHints(qualityData);
		expect(hints).toHaveLength(1);
		expect(hints[0]).toContain("Important events were missed");
		expect(hints[0]).toContain("importance");
	});

	it("returns no hints when all metrics are good", () => {
		const qualityData = {
			enrichment: {
				after: { tagsCoverage: 0.95, summaryCoverage: 0.95 },
				failedBatches: 0,
			},
			editorial: {
				metrics: { mustWatchCoverage: 0.8 },
			},
		};
		const hints = buildEnrichmentHints(qualityData);
		expect(hints).toEqual([]);
	});

	it("returns multiple hints when multiple metrics are bad", () => {
		const qualityData = {
			enrichment: {
				after: { tagsCoverage: 0.5, summaryCoverage: 0.6 },
				failedBatches: 3,
			},
			editorial: {
				metrics: { mustWatchCoverage: 0.3 },
			},
		};
		const hints = buildEnrichmentHints(qualityData);
		expect(hints).toHaveLength(4);
		expect(hints.some((h) => h.includes("tag coverage"))).toBe(true);
		expect(hints.some((h) => h.includes("summaries"))).toBe(true);
		expect(hints.some((h) => h.includes("batch failures"))).toBe(true);
		expect(hints.some((h) => h.includes("Important events"))).toBe(true);
	});
});
