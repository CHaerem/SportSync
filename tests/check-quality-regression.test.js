import { describe, it, expect } from "vitest";
import { detectQualityRegression, detectTrendRegression } from "../scripts/check-quality-regression.js";

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
});
