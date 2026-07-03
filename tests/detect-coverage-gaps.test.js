// detect-coverage-gaps.js: recall watch — entities in the news with no upcoming event.
import { describe, it, expect } from "vitest";
import { buildWatchlist, hasUpcomingEvent, detectGaps } from "../scripts/detect-coverage-gaps.js";

const NOW = Date.parse("2026-07-03T12:00:00Z");
const interests = { alwaysTrack: { athletes: ["Viktor Hovland"], teams: ["Lyn"], tournaments: [] } };
const tracked = { athletes: [{ name: "Casper Ruud" }], tournaments: [{ name: "Tour de France 2026" }], leagues: [] };

describe("buildWatchlist", () => {
	it("merges interests and tracked entities", () => {
		const list = buildWatchlist(interests, tracked);
		expect(list).toEqual(expect.arrayContaining(["Viktor Hovland", "Lyn", "Casper Ruud", "Tour de France 2026"]));
	});
});

describe("hasUpcomingEvent", () => {
	const events = [
		{ title: "John Deere Classic", norwegianPlayers: [{ name: "Viktor Hovland" }], time: "2026-07-05T10:00:00Z" },
	];
	it("finds entity mentions in upcoming events", () => {
		expect(hasUpcomingEvent("Viktor Hovland", events, NOW)).toBe(true);
	});
	it("returns false for entities without events", () => {
		expect(hasUpcomingEvent("Casper Ruud", events, NOW)).toBe(false);
	});
});

describe("detectGaps", () => {
	it("flags newsworthy entities with no upcoming event", () => {
		const rss = { items: [{ title: "Casper Ruud klar for ny turnering neste uke", link: "https://nrk.no/x" }] };
		const gaps = detectGaps({ rss, events: [], interests, tracked, now: NOW });
		expect(gaps).toHaveLength(1);
		expect(gaps[0].entity).toBe("Casper Ruud");
	});

	it("does not flag entities that already have events", () => {
		const rss = { items: [{ title: "Hovland i storform: Viktor Hovland jakter seier" }] };
		const events = [{ title: "The Open", norwegianPlayers: [{ name: "Viktor Hovland" }], time: "2026-07-10T08:00:00Z" }];
		const gaps = detectGaps({ rss, events, interests, tracked, now: NOW });
		expect(gaps).toHaveLength(0);
	});

	it("dedupes multiple headlines about the same entity", () => {
		const rss = { items: [
			{ title: "Casper Ruud vant" },
			{ title: "Casper Ruud til semifinale" },
		] };
		const gaps = detectGaps({ rss, events: [], interests, tracked, now: NOW });
		expect(gaps).toHaveLength(1);
	});

	it("handles missing inputs gracefully", () => {
		expect(detectGaps({ rss: null, events: [], interests: null, tracked: null, now: NOW })).toEqual([]);
	});
});
