// Tests for F1 race results rendering, DP World Tour results,
// and F1 meta formatting in docs/js/dashboard.js
//
// Uses source-text assertions (same pattern as ux-personalization.test.js)
// because dashboard.js is a browser module with many window-global deps.

import { describe, it, expect } from "vitest";
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

describe("F1 race results in _getRecentMatchResults (Task 1)", () => {
	it("reads recentResults.f1 array", () => {
		expect(dashboardSrc).toContain("this.recentResults?.f1?.length");
	});

	it("pushes f1 results with _resultSport f1", () => {
		expect(dashboardSrc).toContain("_resultSport: 'f1'");
	});

	it("extracts raceName, topDrivers, circuit from F1 results", () => {
		expect(dashboardSrc).toContain("_f1RaceName: race.raceName");
		expect(dashboardSrc).toContain("_f1TopDrivers: race.topDrivers");
		expect(dashboardSrc).toContain("_f1Circuit: race.circuit");
	});

	it("applies 72h cutoff to F1 results", () => {
		// The cutoff variable is defined earlier; F1 results check date >= cutoff
		expect(dashboardSrc).toContain("new Date(race.date) >= cutoff");
	});
});

describe("_renderF1ResultCard method (Task 1)", () => {
	it("exists as a method on the dashboard", () => {
		expect(dashboardSrc).toContain("_renderF1ResultCard(m)");
	});

	it("uses formula1 sport color accent", () => {
		expect(dashboardSrc).toContain("background:var(--sport-formula1)");
	});

	it("renders race name and circuit", () => {
		expect(dashboardSrc).toContain("result-f1-title");
		expect(dashboardSrc).toContain("m._f1RaceName");
		expect(dashboardSrc).toContain("result-f1-circuit");
		expect(dashboardSrc).toContain("m._f1Circuit");
	});

	it("renders podium with medal emojis for top 3 drivers", () => {
		expect(dashboardSrc).toContain("result-f1-podium");
		expect(dashboardSrc).toContain("result-f1-driver");
		// Gold, silver, bronze medals
		expect(dashboardSrc).toMatch(/medals.*=.*\[/);
	});

	it("routes f1 results to _renderF1ResultCard in results section", () => {
		expect(dashboardSrc).toContain("group.sport === 'f1'");
		expect(dashboardSrc).toContain("this._renderF1ResultCard(m)");
	});
});

describe("DP World Tour golf results (Task 2)", () => {
	it("reads recentResults.golf.dpWorld", () => {
		expect(dashboardSrc).toContain("this.recentResults?.golf?.dpWorld");
	});

	it("uses DP World Tour as the tour label", () => {
		expect(dashboardSrc).toContain("_golfTour: 'DP World Tour'");
	});

	it("golf result card renders tour name from _golfTour field", () => {
		expect(dashboardSrc).toContain("m._golfTour || 'PGA Tour'");
	});

	it("respects hasActiveGolf check for DP World (same as PGA)", () => {
		// DP World block is inside the !hasActiveGolf conditional
		const dpWorldIdx = dashboardSrc.indexOf("this.recentResults?.golf?.dpWorld");
		const hasActiveGolfIdx = dashboardSrc.lastIndexOf("!hasActiveGolf", dpWorldIdx);
		expect(hasActiveGolfIdx).toBeGreaterThan(-1);
	});
});

describe("F1 structured meta rendering in collapsed row (Task 3)", () => {
	it("has F1-specific meta handler for formula1 sport", () => {
		expect(dashboardSrc).toContain("event.sport === 'formula1' && typeof event.meta === 'object'");
	});

	it("formats F1 meta as Rd N with circuit", () => {
		expect(dashboardSrc).toContain("`Rd ${event.meta.round}`");
	});

	it("falls back to country when circuit is missing", () => {
		expect(dashboardSrc).toContain("event.meta.circuit");
		expect(dashboardSrc).toContain("event.meta.country");
	});

	it("F1 meta branch comes before generic object handler", () => {
		const f1MetaIdx = dashboardSrc.indexOf("event.sport === 'formula1' && typeof event.meta === 'object'");
		const genericIdx = dashboardSrc.indexOf("Object.values(event.meta).filter(Boolean).join");
		expect(f1MetaIdx).toBeGreaterThan(-1);
		expect(genericIdx).toBeGreaterThan(-1);
		expect(f1MetaIdx).toBeLessThan(genericIdx);
	});
});

describe("F1 expanded view circuit context (Task 4)", () => {
	it("renders exp-f1-meta in expanded view for formula1 events", () => {
		expect(dashboardSrc).toContain("exp-f1-meta");
	});

	it("shows round, circuit, and country in expanded F1 meta", () => {
		// The expanded view constructs f1MetaBits with round, circuit, country
		expect(dashboardSrc).toContain("f1MetaBits");
		expect(dashboardSrc).toContain("`Round ${event.meta.round}`");
		expect(dashboardSrc).toContain("event.meta.circuit");
	});

	it("F1 expanded meta is rendered before F1 standings", () => {
		const expF1MetaIdx = dashboardSrc.indexOf("exp-f1-meta");
		const f1StandingsIdx = dashboardSrc.indexOf("renderF1Standings()");
		expect(expF1MetaIdx).toBeGreaterThan(-1);
		expect(f1StandingsIdx).toBeGreaterThan(-1);
		expect(expF1MetaIdx).toBeLessThan(f1StandingsIdx);
	});
});

describe("CSS styles for F1 result card", () => {
	it("has result-f1-title style", () => {
		expect(indexHtml).toContain(".result-f1-title");
	});

	it("has result-f1-circuit style", () => {
		expect(indexHtml).toContain(".result-f1-circuit");
	});

	it("has result-f1-podium style", () => {
		expect(indexHtml).toContain(".result-f1-podium");
	});

	it("has result-f1-driver style", () => {
		expect(indexHtml).toContain(".result-f1-driver");
	});

	it("has exp-f1-meta style", () => {
		expect(indexHtml).toContain(".exp-f1-meta");
	});
});
