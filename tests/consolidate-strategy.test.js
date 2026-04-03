import { describe, it, expect } from "vitest";
import { extractThemes, consolidateEntries } from "../scripts/consolidate-strategy.js";

describe("extractThemes", () => {
	it("detects parallel execution theme", () => {
		const themes = extractThemes({ note: "Run 6: Used 3 parallel subagents for tasks." });
		expect(themes).toContain("parallel-execution");
	});

	it("detects quality metrics theme", () => {
		const themes = extractThemes({ note: "Editorial score dropped to 75. Quality metric fix." });
		expect(themes).toContain("quality-metrics");
	});

	it("detects multiple themes", () => {
		const themes = extractThemes({
			note: "Run 10: parallel subagents fixed quality metric bug. Key insight: test coverage matters.",
		});
		expect(themes).toContain("parallel-execution");
		expect(themes).toContain("quality-metrics");
		expect(themes).toContain("key-learnings");
	});

	it("returns general for unrecognized content", () => {
		const themes = extractThemes({ note: "Nothing special happened." });
		expect(themes).toEqual(["general"]);
	});

	it("handles missing note", () => {
		expect(extractThemes({})).toEqual(["general"]);
		expect(extractThemes({ note: "" })).toEqual(["general"]);
	});
});

describe("consolidateEntries", () => {
	it("returns unchanged when under threshold", () => {
		const entries = Array(10).fill({ date: "2026-01-01", note: "Test" });
		const result = consolidateEntries(entries);
		expect(result.entries).toHaveLength(10);
		expect(result.consolidated).toBeNull();
		expect(result.consolidatedCount).toBe(0);
	});

	it("consolidates old entries when over threshold", () => {
		const now = new Date("2026-04-03T12:00:00Z");
		const entries = [
			// Old entries (>21 days ago)
			...Array(20).fill(null).map((_, i) => ({
				date: `2026-02-${String(i + 1).padStart(2, "0")}`,
				note: `Run ${i + 1}: Used parallel subagents. Key insight: parallel saves time.`,
			})),
			// Recent entries (<21 days ago)
			...Array(10).fill(null).map((_, i) => ({
				date: `2026-03-${String(20 + i).padStart(2, "0")}`,
				note: `Run ${21 + i}: Recent work. Quality metrics improved.`,
			})),
		];

		const result = consolidateEntries(entries, now);
		expect(result.consolidatedCount).toBe(20);
		expect(result.entries).toHaveLength(10); // only recent kept
		expect(result.consolidated.length).toBeGreaterThan(0);
		expect(result.consolidated.length).toBeLessThanOrEqual(10);
	});

	it("preserves recent entries", () => {
		const now = new Date("2026-04-03T12:00:00Z");
		const entries = [
			{ date: "2026-01-01", note: "Old run" },
			...Array(25).fill(null).map((_, i) => ({
				date: `2026-03-${String(20 + Math.min(i, 10)).padStart(2, "0")}`,
				note: `Recent run ${i}`,
			})),
		];

		const result = consolidateEntries(entries, now);
		expect(result.consolidatedCount).toBe(1);
		// All recent entries preserved
		expect(result.entries.every(e => new Date(e.date) >= new Date("2026-03-13"))).toBe(true);
	});

	it("generates theme summaries with insights", () => {
		const now = new Date("2026-04-03T12:00:00Z");
		const entries = [
			...Array(26).fill(null).map((_, i) => ({
				date: `2026-02-${String(Math.min(i + 1, 28)).padStart(2, "0")}`,
				note: `Run ${i + 1}: Parallel subagents worked well. Key insight: cache sharing saves tokens.`,
			})),
		];

		const result = consolidateEntries(entries, now);
		expect(result.consolidated).toBeDefined();
		const parallelTheme = result.consolidated.find(c => c.theme === "parallel-execution");
		expect(parallelTheme).toBeDefined();
		expect(parallelTheme.summary).toContain("parallel-execution");
	});
});
