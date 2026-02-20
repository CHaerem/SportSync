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
		"day-nav",
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
		"quota",
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
		"day-nav-arrow",
		"day-nav-label",
		"day-nav-date-input",
		"date-empty",
		"briefing-mode-label",
		"exp-athletes",
		"exp-athletes-header",
		"exp-athlete",
		"exp-result",
		"exp-result-score",
		"exp-scorer",
		"exp-context-bar",
		"exp-context-label",
		"exp-medal-badge",
		"exp-multiday",
		// V3: leaderboard, cards, logos
		"lb-row",
		"lb-pos",
		"lb-name",
		"lb-score",
		"lead-lb",
		"lead-tour-logo",
		"matchday-logo",
		"event-card",
	];

	for (const cls of keyClasses) {
		it(`CSS defines .${cls}`, () => {
			const regex = new RegExp(`\\.${cls.replace(/-/g, "\\-")}\\b`);
			expect(indexHtml).toMatch(regex);
		});
	}
});

describe("sport mapping completeness", () => {
	it("all event sports map to SPORT_CONFIG entries", () => {
		const eventsPath = path.join(docsDir, "data/events.json");
		if (!fs.existsSync(eventsPath)) return; // skip if no events data
		const events = JSON.parse(fs.readFileSync(eventsPath, "utf-8"));
		const sportConfigJs = fs.readFileSync(
			path.join(docsDir, "js/sport-config.js"),
			"utf-8",
		);
		// Extract sport IDs and aliases from SPORT_CONFIG
		const idMatches = [...sportConfigJs.matchAll(/id:\s*'(\w+)'/g)].map(
			(m) => m[1],
		);
		const aliasMatches = [
			...sportConfigJs.matchAll(/aliases:\s*\[([^\]]+)\]/g),
		].flatMap(
			(m) =>
				m[1].match(/'(\w+)'/g)?.map((a) => a.replace(/'/g, "")) || [],
		);
		const knownSports = new Set([...idMatches, ...aliasMatches]);
		// Normalization map (mirrors dashboard.js line 107)
		const normalize = (s) =>
			s === "f1" ? "formula1" : s === "cs2" ? "esports" : s;
		const unmapped = [
			...new Set(events.map((e) => e.sport)),
		].filter((s) => !knownSports.has(normalize(s)));
		expect(unmapped, `Unmapped sports: ${unmapped.join(", ")}`).toEqual(
			[],
		);
	});
});

describe("hasLiveEvents logic", () => {
	// Extracted logic matches dashboard.js hasLiveEvents()
	function hasLiveEvents(events) {
		const now = Date.now();
		return events.some(e => {
			const start = new Date(e.time).getTime();
			const end = e.endTime ? new Date(e.endTime).getTime() : start + 4 * 60 * 60 * 1000;
			return start <= now && now <= end &&
				(e.sport === 'football' || e.sport === 'golf');
		});
	}

	it("returns true for multi-day golf tournaments in progress", () => {
		const now = new Date();
		const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
		const events = [{
			sport: 'golf', time: yesterday.toISOString(), endTime: inTwoDays.toISOString()
		}];
		expect(hasLiveEvents(events)).toBe(true);
	});

	it("returns true for football match within 4h window", () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
		const events = [{ sport: 'football', time: twoHoursAgo.toISOString() }];
		expect(hasLiveEvents(events)).toBe(true);
	});

	it("returns false for football match older than 4h", () => {
		const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
		const events = [{ sport: 'football', time: fiveHoursAgo.toISOString() }];
		expect(hasLiveEvents(events)).toBe(false);
	});

	it("returns false for future events", () => {
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const events = [{ sport: 'golf', time: tomorrow.toISOString() }];
		expect(hasLiveEvents(events)).toBe(false);
	});

	it("returns false for ended multi-day events", () => {
		const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const threeDAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		const events = [{
			sport: 'golf', time: weekAgo.toISOString(), endTime: threeDAgo.toISOString()
		}];
		expect(hasLiveEvents(events)).toBe(false);
	});

	it("ignores non-football/golf sports", () => {
		const now = new Date();
		const events = [{ sport: 'tennis', time: now.toISOString() }];
		expect(hasLiveEvents(events)).toBe(false);
	});
});

describe("tournament logo URLs", () => {
	const assetMaps = fs.readFileSync(path.join(docsDir, "js", "asset-maps.js"), "utf-8");

	it("PGA Tour and DP World Tour have different logos", () => {
		const pgaMatch = assetMaps.match(/'pga tour':\s*'([^']+)'/);
		const dpMatch = assetMaps.match(/'dp world tour':\s*'([^']+)'/);
		expect(pgaMatch).not.toBeNull();
		expect(dpMatch).not.toBeNull();
		expect(pgaMatch[1]).not.toBe(dpMatch[1]);
	});

	it("all logo URLs use HTTPS", () => {
		const urlPattern = /:\s*'(https?:\/\/[^']+)'/g;
		let match;
		while ((match = urlPattern.exec(assetMaps)) !== null) {
			if (match[1].includes('espncdn') || match[1].includes('thesportsdb') || match[1].includes('football-data')) {
				expect(match[1], `Logo URL should use HTTPS: ${match[1]}`).toMatch(/^https:\/\//);
			}
		}
	});
});
