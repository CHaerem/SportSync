// Regression coverage for UX personalization batch:
//   1. Standings band-preview teaser (docs/js/standings-renderer.js)
//   2. Favorite-team day-nav dots (docs/js/dashboard.js renderDayNav)
//   3. Tennis seed + structured meta in expanded view (docs/js/dashboard.js)
//
// dashboard.js is a large browser module with many window-global dependencies,
// so these tests assert against source text (static regression) for the
// dashboard changes, and against live rendering for standings-renderer (which
// is already exercised as a pure function elsewhere).

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const dashboardSrc = readFileSync(
	join(import.meta.dirname, "../docs/js/dashboard.js"),
	"utf-8",
);
const indexHtml = readFileSync(
	join(import.meta.dirname, "../docs/index.html"),
	"utf-8",
);

describe("standings band-preview (Task 1)", () => {
	// Load the renderer in isolation — same pattern as standings-renderer.test.js
	globalThis.window = globalThis;
	eval(
		readFileSync(
			join(import.meta.dirname, "../docs/js/shared-constants.js"),
			"utf-8",
		),
	);
	window.getGolferHeadshot = vi.fn(() => null);
	eval(
		readFileSync(
			join(import.meta.dirname, "../docs/js/standings-renderer.js"),
			"utf-8",
		),
	);

	it("produces a band-preview element surfacing sport/table names", () => {
		const standings = {
			football: {
				premierLeague: [
					{
						position: 1,
						team: "Liverpool",
						teamShort: "LIV",
						points: 70,
						gd: 35,
					},
				],
			},
			golf: {
				pga: {
					name: "The Masters 2026",
					status: "in_progress",
					leaderboard: [
						{
							position: 1,
							player: "Scheffler",
							score: "-10",
							thru: "F",
						},
					],
				},
			},
		};
		const html = window.StandingsRenderer.renderStandingsSection(
			standings,
			null,
		);
		// band-preview element present with the right data attribute
		expect(html).toMatch(
			/<div class="band-preview" data-band-preview="standings">/,
		);
		// Should tease Premier League and Masters (year stripped)
		expect(html).toMatch(/PL/);
		expect(html).toMatch(/The Masters/);
		// Year should be removed from tournament name in preview
		const previewMatch = html.match(
			/<div class="band-preview"[^>]*>([^<]+)<\/div>/,
		);
		expect(previewMatch).toBeTruthy();
		expect(previewMatch[1]).not.toMatch(/2026/);
	});
});

describe("favorite-team day-nav dots (Task 2)", () => {
	it("renderDayNav reads preferences.isEventFavorite", () => {
		// Source-level regression: the render method must consult preferences
		// and produce the day-dot-fav class + has-favorite class.
		expect(dashboardSrc).toMatch(/renderDayNav\s*\(\s*\)\s*\{/);
		// Key behavior: per-sport favorite detection
		expect(dashboardSrc).toMatch(/isEventFavorite\(ev,\s*ev\.id\)/);
		// Class hooks used in CSS
		expect(dashboardSrc).toContain("day-dot-fav");
		expect(dashboardSrc).toContain("has-favorite");
	});

	it("CSS defines accent styling for favorite day dots", () => {
		// Dot ring + star marker must both be styled; neither can be hard-coded color
		expect(indexHtml).toMatch(/\.day-dot\.day-dot-fav[^{]*\{[^}]*var\(--accent\)/s);
		expect(indexHtml).toMatch(/\.day-item\.has-favorite[^{]*\{[\s\S]*?var\(--accent\)/);
	});

	it("aria-label mentions favorites when day has a favorite-team match", () => {
		expect(dashboardSrc).toContain("includes favorites");
	});
});

describe("tennis seed + structured meta in expanded view (Task 3)", () => {
	it("renders seed markup for tennis norwegianPlayers", () => {
		// Must check player.seed only for tennis events
		expect(dashboardSrc).toMatch(
			/event\.sport === 'tennis'[\s\S]{0,120}player\.seed/,
		);
		// Seed wrapped in a dedicated class so it can be styled
		expect(dashboardSrc).toContain("exp-athlete-seed");
	});

	it("surfaces structured meta (category + surface) for tennis", () => {
		// Guards event.meta as an object and extracts category/surface
		expect(dashboardSrc).toContain("exp-tennis-meta");
		expect(dashboardSrc).toMatch(/event\.meta\.category/);
		expect(dashboardSrc).toMatch(/event\.meta\.surface/);
	});

	it("CSS styles the seed + meta elements with theme-aware colors", () => {
		expect(indexHtml).toMatch(/\.exp-athlete-seed[^{]*\{[^}]*var\(--accent\)/s);
		expect(indexHtml).toMatch(/\.exp-tennis-meta[^{]*\{[^}]*var\(--muted\)/s);
	});
});
