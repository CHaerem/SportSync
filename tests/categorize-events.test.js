import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";

// Extract categorizeEvents from dashboard.js to test it directly.
// The method only depends on this.allEvents and this.liveScores (no DOM).
const src = fs.readFileSync(path.resolve("docs/js/dashboard.js"), "utf-8");
const match = src.match(/categorizeEvents\(\)\s*\{([\s\S]*?)\n\t\}/);
if (!match) throw new Error("Could not extract categorizeEvents from dashboard.js");
const categorizeEvents = new Function(match[1]);

function categorize(allEvents, liveScores = {}) {
	return categorizeEvents.call({ allEvents, liveScores });
}

function bandTotal(bands) {
	return Object.values(bands).reduce((s, b) => s + b.length, 0);
}

describe("categorizeEvents()", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("puts multi-day event starting yesterday into today band", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));

		const event = {
			sport: "golf",
			title: "AT&T Pebble Beach Pro-Am",
			time: "2026-02-12T05:00:00Z",
			endTime: "2026-02-15T23:59:00Z",
		};

		const bands = categorize([event]);
		expect(bands.today).toHaveLength(1);
		expect(bands.today[0].title).toBe("AT&T Pebble Beach Pro-Am");
	});

	it("puts multi-day event starting days ago into today if endTime is today", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T08:00:00Z"));

		const event = {
			sport: "golf",
			title: "Final Round",
			time: "2026-02-10T05:00:00Z",
			endTime: "2026-02-13T23:59:00Z",
		};

		const bands = categorize([event]);
		expect(bands.today).toHaveLength(1);
	});

	it("drops multi-day event whose endTime has passed", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-16T12:00:00Z"));

		const event = {
			sport: "golf",
			title: "Past Tournament",
			time: "2026-02-10T05:00:00Z",
			endTime: "2026-02-14T23:59:00Z",
		};

		const bands = categorize([event]);
		expect(bandTotal(bands)).toBe(0);
	});

	it("puts event starting today into today band", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T10:00:00Z"));

		const event = {
			sport: "football",
			title: "Arsenal v Liverpool",
			time: "2026-02-13T15:00:00Z",
		};

		const bands = categorize([event]);
		expect(bands.today).toHaveLength(1);
	});

	it("drops single-day event from yesterday with no endTime", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));

		const event = {
			sport: "football",
			title: "Old Match",
			time: "2026-02-12T15:00:00Z",
		};

		const bands = categorize([event]);
		expect(bandTotal(bands)).toBe(0);
	});

	it("moves today event older than 3h to results", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T20:00:00Z"));

		const event = {
			sport: "football",
			title: "Earlier Match",
			time: "2026-02-13T14:00:00Z",
		};

		const bands = categorize([event]);
		expect(bands.results).toHaveLength(1);
		expect(bands.today).toHaveLength(0);
	});

	it("puts tomorrow event into tomorrow band", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));

		const event = {
			sport: "tennis",
			title: "Tomorrow Match",
			time: "2026-02-14T14:00:00Z",
		};

		const bands = categorize([event]);
		expect(bands.tomorrow).toHaveLength(1);
	});

	it("puts next-week event into week band", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));

		const event = {
			sport: "f1",
			title: "Grand Prix",
			time: "2026-02-17T14:00:00Z",
		};

		const bands = categorize([event]);
		expect(bands.week).toHaveLength(1);
	});

	it("puts far-future event into later band", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));

		const event = {
			sport: "chess",
			title: "World Championship",
			time: "2026-03-15T10:00:00Z",
		};

		const bands = categorize([event]);
		expect(bands.later).toHaveLength(1);
	});

	it("puts live-scored event into live band", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-13T15:30:00Z"));

		const event = {
			id: "match-1",
			sport: "football",
			title: "Live Match",
			time: "2026-02-13T15:00:00Z",
		};

		const bands = categorize([event], { "match-1": { state: "in", clock: "30'" } });
		expect(bands.live).toHaveLength(1);
	});
});

describe("loadEvents mapper preserves endTime", () => {
	it("event mapper includes endTime in mapped fields", () => {
		// Verify the loadEvents mapper doesn't strip endTime
		const mapperMatch = src.match(/this\.allEvents\s*=\s*data\s*\n?\s*\.map\(ev\s*=>\s*\(\{([\s\S]*?)\}\)\)/);
		expect(mapperMatch, "Could not find event mapper in dashboard.js").toBeTruthy();
		expect(mapperMatch[1]).toContain("endTime");
	});
});
