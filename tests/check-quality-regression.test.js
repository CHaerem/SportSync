import { describe, it, expect } from "vitest";
import { detectQualityRegression, detectTrendRegression, detectModelChanges } from "../scripts/check-quality-regression.js";

describe("detectQualityRegression()", () => {
	it("returns no regression when scores are equal", () => {
		const quality = { enrichment: { score: 100, totalEvents: 30, failedBatches: 0 }, featured: { score: 90 } };
		const result = detectQualityRegression(quality, quality);
		expect(result.hasRegression).toBe(false);
		expect(result.issues).toHaveLength(0);
	});

	it("returns no regression when scores improve", () => {
		const previous = { enrichment: { score: 80, totalEvents: 30, failedBatches: 1 }, featured: { score: 70 } };
		const current = { enrichment: { score: 100, totalEvents: 35, failedBatches: 0 }, featured: { score: 95 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(false);
	});

	it("detects enrichment score drop > 15", () => {
		const previous = { enrichment: { score: 100 }, featured: { score: 90 } };
		const current = { enrichment: { score: 80 }, featured: { score: 90 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		const issue = result.issues.find((i) => i.code === "enrichment_regression");
		expect(issue).toBeDefined();
		expect(issue.message).toContain("100");
		expect(issue.message).toContain("80");
	});

	it("detects featured score drop > 20", () => {
		const previous = { enrichment: { score: 100 }, featured: { score: 100 } };
		const current = { enrichment: { score: 100 }, featured: { score: 70 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		const issue = result.issues.find((i) => i.code === "featured_regression");
		expect(issue).toBeDefined();
	});

	it("detects event count collapse > 50%", () => {
		const previous = { enrichment: { totalEvents: 30 } };
		const current = { enrichment: { totalEvents: 10 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		const issue = result.issues.find((i) => i.code === "event_count_collapse");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("critical");
	});

	it("detects failed batches increase", () => {
		const previous = { enrichment: { failedBatches: 0 } };
		const current = { enrichment: { failedBatches: 2 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		const issue = result.issues.find((i) => i.code === "failed_batches_increase");
		expect(issue).toBeDefined();
	});

	it("handles missing previous data gracefully (first run)", () => {
		const current = { enrichment: { score: 100, totalEvents: 30 }, featured: { score: 90 } };
		const result = detectQualityRegression(current, null);
		expect(result.hasRegression).toBe(false);
		expect(result.issues).toHaveLength(0);
	});

	it("handles missing current data", () => {
		const result = detectQualityRegression(null, { enrichment: { score: 100 } });
		expect(result.hasRegression).toBe(false);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].code).toBe("quality_missing");
	});

	it("ignores small enrichment score drops (<= 15)", () => {
		const previous = { enrichment: { score: 100 } };
		const current = { enrichment: { score: 90 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(false);
	});

	it("ignores small featured score drops (<= 20)", () => {
		const previous = { featured: { score: 100 } };
		const current = { featured: { score: 85 } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(false);
	});

	it("reads totalEvents from nested after.totalEvents path", () => {
		const previous = { enrichment: { after: { totalEvents: 30 } } };
		const current = { enrichment: { after: { totalEvents: 10 } } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		expect(result.issues.find((i) => i.code === "event_count_collapse")).toBeDefined();
	});

	it("detects results score drop > 15", () => {
		const previous = { results: { score: 80, metrics: { footballCount: 10 } } };
		const current = { results: { score: 60, metrics: { footballCount: 10 } } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		expect(result.issues.find(i => i.code === "results_regression")).toBeDefined();
	});

	it("detects football count collapse > 50%", () => {
		const previous = { results: { score: 80, metrics: { footballCount: 20 } } };
		const current = { results: { score: 80, metrics: { footballCount: 5 } } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		const issue = result.issues.find(i => i.code === "football_count_collapse");
		expect(issue).toBeDefined();
		expect(issue.severity).toBe("critical");
	});

	it("detects favorite coverage drop from high to low", () => {
		const previous = { results: { metrics: { favoriteCoverage: 0.8 } } };
		const current = { results: { metrics: { favoriteCoverage: 0.2 } } };
		const result = detectQualityRegression(current, previous);
		expect(result.hasRegression).toBe(true);
		expect(result.issues.find(i => i.code === "favorite_coverage_drop")).toBeDefined();
	});
});

describe("detectTrendRegression()", () => {
	function makeEntry(editorialScore, mustWatchCoverage) {
		return { editorial: { score: editorialScore, mustWatchCoverage } };
	}

	it("returns no regression with insufficient history", () => {
		const history = [makeEntry(80, 0.9), makeEntry(75, 0.8)];
		const result = detectTrendRegression(history);
		expect(result.hasTrendRegression).toBe(false);
	});

	it("detects editorial score drop across runs", () => {
		const history = [
			makeEntry(85, 0.9), makeEntry(80, 0.85), makeEntry(82, 0.88),
			makeEntry(60, 0.8), makeEntry(55, 0.75), makeEntry(58, 0.7),
		];
		const result = detectTrendRegression(history);
		expect(result.hasTrendRegression).toBe(true);
		expect(result.issues.some((i) => i.code === "editorial_trend_regression")).toBe(true);
	});

	it("detects must-watch coverage drop across runs", () => {
		const history = [
			makeEntry(80, 0.95), makeEntry(80, 0.90), makeEntry(80, 0.92),
			makeEntry(80, 0.55), makeEntry(80, 0.50), makeEntry(80, 0.60),
		];
		const result = detectTrendRegression(history);
		expect(result.hasTrendRegression).toBe(true);
		expect(result.issues.some((i) => i.code === "must_watch_trend_regression")).toBe(true);
	});

	it("ignores small fluctuations", () => {
		const history = [
			makeEntry(80, 0.9), makeEntry(78, 0.88), makeEntry(82, 0.91),
			makeEntry(76, 0.85), makeEntry(79, 0.87), makeEntry(77, 0.86),
		];
		const result = detectTrendRegression(history);
		expect(result.hasTrendRegression).toBe(false);
	});

	it("works with snapshots that include hintsApplied", () => {
		const history = [
			{ ...makeEntry(80, 0.9), hintsApplied: [] },
			{ ...makeEntry(78, 0.88), hintsApplied: ["CORRECTION: fix must-watch"] },
			{ ...makeEntry(82, 0.91), hintsApplied: [] },
			{ ...makeEntry(76, 0.85), hintsApplied: ["CORRECTION: fix diversity"] },
			{ ...makeEntry(79, 0.87), hintsApplied: [] },
			{ ...makeEntry(77, 0.86), hintsApplied: [] },
		];
		const result = detectTrendRegression(history);
		expect(result.hasTrendRegression).toBe(false);
	});

	it("detects results quality trend regression", () => {
		const history = [
			{ ...makeEntry(80, 0.9), results: { score: 80 } },
			{ ...makeEntry(80, 0.9), results: { score: 78 } },
			{ ...makeEntry(80, 0.9), results: { score: 82 } },
			{ ...makeEntry(80, 0.9), results: { score: 55 } },
			{ ...makeEntry(80, 0.9), results: { score: 50 } },
			{ ...makeEntry(80, 0.9), results: { score: 58 } },
		];
		const result = detectTrendRegression(history);
		expect(result.hasTrendRegression).toBe(true);
		expect(result.issues.some(i => i.code === "results_trend_regression")).toBe(true);
	});
});

describe("detectModelChanges()", () => {
	it("detects enrichment model change", () => {
		const current = { enrichment: { model: "claude-sonnet-4-6" } };
		const previous = { enrichment: { model: "claude-opus-4-6" } };
		const changes = detectModelChanges(current, previous);
		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({ component: "enrichment", from: "claude-opus-4-6", to: "claude-sonnet-4-6" });
	});

	it("detects featured model change", () => {
		const current = { featured: { model: "claude-sonnet-4-6" } };
		const previous = { featured: { model: "default" } };
		const changes = detectModelChanges(current, previous);
		expect(changes).toHaveLength(1);
		expect(changes[0].component).toBe("featured");
	});

	it("detects changes in both components", () => {
		const current = { enrichment: { model: "sonnet" }, featured: { model: "sonnet" } };
		const previous = { enrichment: { model: "opus" }, featured: { model: "opus" } };
		const changes = detectModelChanges(current, previous);
		expect(changes).toHaveLength(2);
	});

	it("returns empty when models are unchanged", () => {
		const data = { enrichment: { model: "claude-sonnet-4-6" }, featured: { model: "default" } };
		expect(detectModelChanges(data, data)).toHaveLength(0);
	});

	it("returns empty when model fields are missing", () => {
		const current = { enrichment: { score: 80 } };
		const previous = { enrichment: { score: 90 } };
		expect(detectModelChanges(current, previous)).toHaveLength(0);
	});

	it("falls back to quotaModel when model is absent", () => {
		const current = { enrichment: { quotaModel: "claude-sonnet-4-6" } };
		const previous = { enrichment: { quotaModel: "claude-opus-4-6" } };
		const changes = detectModelChanges(current, previous);
		expect(changes).toHaveLength(1);
	});
});

describe("model-change quality correlation", () => {
	it("flags model_change_quality_drop when model changed AND quality dropped", () => {
		const previous = {
			enrichment: { score: 90, model: "claude-opus-4-6" },
			featured: { score: 85 },
		};
		const current = {
			enrichment: { score: 75, model: "claude-sonnet-4-6" },
			featured: { score: 85 },
		};
		const result = detectQualityRegression(current, previous);
		const issue = result.issues.find(i => i.code === "model_change_quality_drop");
		expect(issue).toBeDefined();
		expect(issue.message).toContain("enrichment");
		expect(issue.message).toContain("claude-opus-4-6");
		expect(issue.message).toContain("claude-sonnet-4-6");
	});

	it("flags model_change_quality_stable when model changed but quality held", () => {
		const previous = {
			enrichment: { score: 90, model: "claude-opus-4-6" },
		};
		const current = {
			enrichment: { score: 88, model: "claude-sonnet-4-6" },
		};
		const result = detectQualityRegression(current, previous);
		const stable = result.issues.find(i => i.code === "model_change_quality_stable");
		expect(stable).toBeDefined();
		expect(stable.severity).toBe("info");
	});

	it("detects quota tier change", () => {
		const previous = { enrichment: { quotaTier: 0, score: 90 } };
		const current = { enrichment: { quotaTier: 2, score: 85 } };
		const result = detectQualityRegression(current, previous);
		const issue = result.issues.find(i => i.code === "quota_tier_change");
		expect(issue).toBeDefined();
		expect(issue.message).toContain("0");
		expect(issue.message).toContain("2");
	});

	it("does not flag tier change when tier is unchanged", () => {
		const data = { enrichment: { quotaTier: 1, score: 85 } };
		const result = detectQualityRegression(data, data);
		expect(result.issues.find(i => i.code === "quota_tier_change")).toBeUndefined();
	});
});
