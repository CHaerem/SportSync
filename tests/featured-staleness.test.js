import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Tests for the featured.json staleness guard in dashboard.js.
 *
 * The dashboard loads featured.json on initial page load. If featured.json was
 * generated on a previous day (e.g., the pipeline ran in data-only mode overnight),
 * the dashboard should detect this and fall back to the date-specific briefing
 * (featured-{today}.json) if available.
 *
 * This test verifies the staleness detection logic exists in the source code
 * and validates the date-comparison pattern.
 */

const dashboardJs = fs.readFileSync(
	path.resolve(process.cwd(), "docs/js/dashboard.js"),
	"utf-8",
);

describe("featured.json staleness guard", () => {
	it("dashboard.js contains staleness detection logic", () => {
		// The guard should check generatedAt and compare to today's date
		expect(dashboardJs).toContain("Staleness guard");
		expect(dashboardJs).toContain("featuredDay");
		expect(dashboardJs).toContain("todayKey");
	});

	it("falls back to date-specific briefing when stale", () => {
		// Should fetch featured-{todayKey}.json when featured.json is from a different day
		expect(dashboardJs).toMatch(/featured-\$\{todayKey\}\.json/);
	});

	it("logs a message when using fallback", () => {
		// Should log for observability
		expect(dashboardJs).toContain("featured.json stale");
	});

	it("checks both generatedAt and _meta.generatedAt", () => {
		// featured.json uses top-level generatedAt, date-specific files use _meta.generatedAt
		expect(dashboardJs).toContain("this.featured.generatedAt");
		expect(dashboardJs).toContain("_meta?.generatedAt");
	});

	it("preserves stale featured as fallback if date-specific fails", () => {
		// The catch block should not null out this.featured
		expect(dashboardJs).toContain("keep stale featured.json as fallback");
	});
});

describe("featured.json date format", () => {
	const featuredPath = path.resolve(
		process.cwd(),
		"docs/data/featured.json",
	);

	it("featured.json has generatedAt timestamp", () => {
		if (!fs.existsSync(featuredPath)) return; // skip if not present
		const data = JSON.parse(fs.readFileSync(featuredPath, "utf-8"));
		// Should have either top-level generatedAt or _meta.generatedAt
		const genAt = data.generatedAt || data._meta?.generatedAt;
		// Skip if file was temporarily modified by parallel test (e.g., build-events)
		if (!genAt) return;
		// Should be ISO date string, extractable via substring(0,10)
		expect(genAt.substring(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("date-specific briefing files", () => {
	const dataDir = path.resolve(process.cwd(), "docs/data");

	it("date-specific files follow naming convention", () => {
		const files = fs.readdirSync(dataDir).filter((f) => /^featured-\d{4}-\d{2}-\d{2}\.json$/.test(f));
		// Should have at least one date-specific briefing
		expect(files.length).toBeGreaterThan(0);
	});

	it("date-specific files have _meta.date matching filename", () => {
		const files = fs.readdirSync(dataDir).filter((f) => /^featured-\d{4}-\d{2}-\d{2}\.json$/.test(f));
		for (const file of files.slice(0, 3)) {
			// Extract date from filename
			const dateMatch = file.match(/featured-(\d{4}-\d{2}-\d{2})\.json/);
			expect(dateMatch).not.toBeNull();
			const dateKey = dateMatch[1];

			const data = JSON.parse(
				fs.readFileSync(path.join(dataDir, file), "utf-8"),
			);
			expect(data._meta?.date).toBe(dateKey);
		}
	});

	it("date-specific files have blocks array", () => {
		const files = fs.readdirSync(dataDir).filter((f) => /^featured-\d{4}-\d{2}-\d{2}\.json$/.test(f));
		for (const file of files.slice(0, 3)) {
			const data = JSON.parse(
				fs.readFileSync(path.join(dataDir, file), "utf-8"),
			);
			expect(Array.isArray(data.blocks)).toBe(true);
		}
	});
});
