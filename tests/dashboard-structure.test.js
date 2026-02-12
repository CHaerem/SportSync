import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const docsDir = path.resolve(process.cwd(), "docs");
const indexHtml = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");
const statusHtml = fs.readFileSync(path.join(docsDir, "status.html"), "utf-8");
const swJs = fs.readFileSync(path.join(docsDir, "sw.js"), "utf-8");

describe("index.html structure", () => {
	const expectedIds = [
		"the-brief",
		"events",
		"watch-plan",
		"news",
		"featured-sections",
		"date-line",
		"themeToggle",
	];

	for (const id of expectedIds) {
		it(`contains element with id="${id}"`, () => {
			const regex = new RegExp(`id=["']${id}["']`);
			expect(indexHtml).toMatch(regex);
		});
	}

	it("references all script files that exist", () => {
		const scriptRefs = [...indexHtml.matchAll(/src=["']([^"'?]+)/g)].map((m) => m[1]);
		expect(scriptRefs.length).toBeGreaterThan(0);

		for (const ref of scriptRefs) {
			const filePath = path.join(docsDir, ref);
			expect(fs.existsSync(filePath), `Script file missing: ${ref}`).toBe(true);
		}
	});

	it("has proper HTML structure", () => {
		expect(indexHtml).toContain("<!DOCTYPE html>");
		expect(indexHtml).toContain("<html");
		expect(indexHtml).toContain("</html>");
		expect(indexHtml).toContain("<head>");
		expect(indexHtml).toContain("<body>");
	});

	it("has meta viewport tag", () => {
		expect(indexHtml).toContain('name="viewport"');
	});

	it("has meta description tag", () => {
		expect(indexHtml).toContain('name="description"');
	});
});

describe("sw.js cache paths", () => {
	it("cache install paths reference existing files", () => {
		// Extract paths from cache.addAll([...]) in sw.js
		const addAllMatch = swJs.match(/cache\.addAll\(\[([\s\S]*?)\]\)/);
		expect(addAllMatch).not.toBeNull();

		const paths = [...addAllMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
		expect(paths.length).toBeGreaterThan(0);

		for (const cachePath of paths) {
			// Convert /SportSync/path to docs/path
			const relativePath = cachePath.replace(/^\/SportSync\/?/, "");
			const filePath = relativePath === "" ? path.join(docsDir, "index.html") : path.join(docsDir, relativePath);
			expect(fs.existsSync(filePath), `SW cache references missing file: ${cachePath} → ${filePath}`).toBe(true);
		}
	});
});

describe("index.html links to status page", () => {
	it("contains a link to status.html", () => {
		expect(indexHtml).toContain('href="status.html"');
	});
});

describe("status.html structure", () => {
	it("has proper HTML structure", () => {
		expect(statusHtml).toContain("<!DOCTYPE html>");
		expect(statusHtml).toContain("<html");
		expect(statusHtml).toContain("</html>");
		expect(statusHtml).toContain("<head>");
		expect(statusHtml).toContain("<body>");
	});

	it("has meta viewport tag", () => {
		expect(statusHtml).toContain('name="viewport"');
	});

	it("has meta description tag", () => {
		expect(statusHtml).toContain('name="description"');
	});

	const expectedIds = [
		"summary",
		"autonomy",
		"pipeline",
		"quality",
		"tokens",
		"trend",
		"sanity",
		"gaps",
		"autopilot",
		"freshness",
		"themeToggle",
	];

	for (const id of expectedIds) {
		it(`contains element with id="${id}"`, () => {
			const regex = new RegExp(`id=["']${id}["']`);
			expect(statusHtml).toMatch(regex);
		});
	}

	it("links back to main dashboard", () => {
		expect(statusHtml).toContain('href="./"');
	});
});

describe("sw.js caches status.html", () => {
	it("includes status.html in static cache", () => {
		expect(swJs).toContain("status.html");
	});
});

describe("dashboard.js key classes used in CSS", () => {
	const keyClasses = [
		"event-row",
		"row-main",
		"row-time",
		"row-title",
		"live-dot",
		"must-watch",
		"featured-section",
		"band-label",
		"band-live",
		"sport-section",
		"news-item",
		"watch-pick",
		"starting-soon",
		"row-rel-soon",
		"row-rel-far",
		"row-ft",
		"block-headline",
		"block-event-line",
		"block-event-group",
		"block-group-label",
		"block-group-item",
		"block-narrative",
		"block-divider",
	];

	for (const cls of keyClasses) {
		it(`CSS defines .${cls}`, () => {
			const regex = new RegExp(`\\.${cls.replace(/-/g, "\\-")}\\b`);
			expect(indexHtml).toMatch(regex);
		});
	}
});
