import { describe, it, expect } from "vitest";
import { detectCoverageGaps, MAJOR_EVENT_PATTERNS } from "../scripts/detect-coverage-gaps.js";

describe("detectCoverageGaps()", () => {
	it("returns no gaps when RSS events are already covered", () => {
		const rssItems = [
			{ title: "Champions League draw: Barcelona vs Bayern" },
		];
		const events = [
			{ title: "Barcelona vs Bayern", tournament: "Champions League", sport: "football" },
		];
		const result = detectCoverageGaps(rssItems, events);
		expect(result.gaps).toHaveLength(0);
		expect(result.summary.totalGapsDetected).toBe(0);
	});

	it("detects Champions League gap when no CL events exist", () => {
		const rssItems = [
			{ title: "Champions League draw: Barcelona vs Bayern set for February" },
		];
		const events = [
			{ title: "Arsenal vs Liverpool", tournament: "Premier League", sport: "football" },
		];
		const result = detectCoverageGaps(rssItems, events);
		expect(result.gaps).toHaveLength(1);
		expect(result.gaps[0].sport).toBe("football");
		expect(result.gaps[0].type).toBe("tournament");
		expect(result.gaps[0].headlines).toHaveLength(1);
	});

	it("ignores headlines that match no pattern", () => {
		const rssItems = [
			{ title: "Local team wins friendly match" },
			{ title: "Player signs new contract" },
		];
		const events = [];
		const result = detectCoverageGaps(rssItems, events);
		expect(result.gaps).toHaveLength(0);
	});

	it("deduplicates across headlines for same pattern", () => {
		const rssItems = [
			{ title: "Champions League round of 16 preview" },
			{ title: "Champions League matchday recap" },
			{ title: "Champions League quarter-final draw" },
		];
		const events = [];
		const result = detectCoverageGaps(rssItems, events);

		// Should create only one gap for CL
		const clGaps = result.gaps.filter((g) => g.sport === "football" && g.matchedPattern.includes("champions league"));
		expect(clGaps).toHaveLength(1);
		expect(clGaps[0].headlines).toHaveLength(3);
	});

	it("assigns correct confidence levels", () => {
		const rssItems = [
			{ title: "Champions League match tonight" },
		];
		const events = [];
		const result1 = detectCoverageGaps(rssItems, events);
		expect(result1.gaps[0].confidence).toBe("low");

		rssItems.push({ title: "Champions League qualifier" });
		const result2 = detectCoverageGaps(rssItems, events);
		expect(result2.gaps[0].confidence).toBe("medium");

		rssItems.push({ title: "Champions League draw announced" });
		const result3 = detectCoverageGaps(rssItems, events);
		expect(result3.gaps[0].confidence).toBe("high");
	});

	it("returns no gaps for empty RSS", () => {
		const result = detectCoverageGaps([], [{ title: "Match", sport: "football" }]);
		expect(result.gaps).toHaveLength(0);
	});

	it("detects gaps with empty events", () => {
		const rssItems = [
			{ title: "Wimbledon seeds announced for 2026" },
		];
		const result = detectCoverageGaps(rssItems, []);
		expect(result.gaps.length).toBeGreaterThan(0);
		expect(result.gaps[0].sport).toBe("tennis");
	});

	it("covers multiple sport patterns", () => {
		const rssItems = [
			{ title: "F1 Monaco Grand Prix preview" },
			{ title: "IEM Katowice CS2 bracket revealed" },
			{ title: "Norway Chess kicks off in Stavanger" },
		];
		const events = [];
		const result = detectCoverageGaps(rssItems, events);

		const sports = result.gaps.map((g) => g.sport);
		expect(sports).toContain("f1");
		expect(sports).toContain("esports");
		expect(sports).toContain("chess");
	});

	it("classifies actionable vs informational correctly", () => {
		const rssItems = [
			{ title: "Champions League final preview" },  // actionable tournament, but 1 headline = low
		];
		const events = [];
		const result = detectCoverageGaps(rssItems, events);

		// Tournaments stay actionable even at low confidence
		const gap = result.gaps.find((g) => g.sport === "football");
		expect(gap.classification).toBe("actionable");
	});

	it("provides correct summary counts", () => {
		const rssItems = [
			{ title: "Champions League round of 16" },
			{ title: "Wimbledon seedings revealed" },
		];
		const events = [];
		const result = detectCoverageGaps(rssItems, events);

		expect(result.summary.totalGapsDetected).toBe(result.gaps.length);
		expect(result.summary.actionableGaps + result.summary.informationalGaps).toBe(result.summary.totalGapsDetected);
	});

	it("generates suggested config name", () => {
		const rssItems = [{ title: "Champions League draw" }];
		const result = detectCoverageGaps(rssItems, []);
		expect(result.gaps[0].suggestedConfigName).toMatch(/^football-tournament-\d{4}\.json$/);
	});

	it("has generatedAt timestamp", () => {
		const result = detectCoverageGaps([], []);
		expect(result.generatedAt).toBeDefined();
		expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
	});
});

describe("MAJOR_EVENT_PATTERNS", () => {
	it("has patterns for all expected sports", () => {
		const sports = [...new Set(MAJOR_EVENT_PATTERNS.map((p) => p.sport))];
		expect(sports).toContain("football");
		expect(sports).toContain("tennis");
		expect(sports).toContain("golf");
		expect(sports).toContain("f1");
		expect(sports).toContain("chess");
		expect(sports).toContain("esports");
		expect(sports).toContain("olympics");
	});
});
