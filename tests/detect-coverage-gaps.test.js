// detect-coverage-gaps.js: recall watch — entities in the news with no upcoming event.
import { describe, it, expect } from "vitest";
import {
	buildWatchlist,
	hasUpcomingEvent,
	detectGaps,
	containsName,
	headlineIsImminent,
	detectSourceAnomalies,
} from "../scripts/detect-coverage-gaps.js";

const NOW = Date.parse("2026-07-03T12:00:00Z");
const interests = { alwaysTrack: { athletes: ["Viktor Hovland"], teams: ["Lyn"], tournaments: [] } };
const tracked = { athletes: [{ name: "Casper Ruud" }], tournaments: [{ name: "Tour de France 2026" }], leagues: [] };

describe("buildWatchlist", () => {
	it("merges interests and tracked entities", () => {
		const list = buildWatchlist(interests, tracked);
		expect(list).toEqual(expect.arrayContaining(["Viktor Hovland", "Lyn", "Casper Ruud", "Tour de France 2026"]));
	});

	it("includes interests.alwaysTrack.tournaments (review finding)", () => {
		const list = buildWatchlist(
			{ alwaysTrack: { athletes: [], teams: [], tournaments: ["Wimbledon"] } },
			null
		);
		expect(list).toContain("Wimbledon");
	});
});

describe("containsName (word boundaries)", () => {
	it("matches whole names but not substrings inside words (review finding)", () => {
		expect(containsName("lyn slo vif i går", "lyn")).toBe(true);
		expect(containsName("kraftig lynnedslag i oslo", "lyn")).toBe(false);
		expect(containsName("vålerenga-lyn utsatt", "lyn")).toBe(true);
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

describe("headlineIsImminent", () => {
	it("recognises Norwegian and English 'happening now' language", () => {
		expect(headlineIsImminent("Formel 1: British GP i dag på Silverstone")).toBe(true);
		expect(headlineIsImminent("Live: landskampen mot Sverige")).toBe(true);
		expect(headlineIsImminent("Ruud klar for turnering neste uke")).toBe(false);
	});
});

describe("detectGaps — imminence (entity has a later event but nothing soon)", () => {
	it("flags an entity the news says plays today while our next event is far out", () => {
		// Hovland's next event is 12 days out (covered at 14d, not at 4d); news says "i dag".
		const events = [
			{ title: "Genesis Scottish Open", norwegianPlayers: [{ name: "Viktor Hovland" }], time: "2026-07-15T10:00:00Z" },
		];
		const rss = { items: [{ title: "Viktor Hovland spiller i dag", link: "https://nrk.no/h" }] };
		const gaps = detectGaps({ rss, events, interests, tracked, now: NOW });
		const g = gaps.find((x) => x.entity === "Viktor Hovland");
		expect(g).toBeTruthy();
		expect(g.type).toBe("imminent");
		expect(g.imminent).toBe(true);
	});

	it("does NOT flag imminence when the entity already has an event in the next few days", () => {
		const events = [
			{ title: "The Open R1", norwegianPlayers: [{ name: "Viktor Hovland" }], time: "2026-07-04T08:00:00Z" },
		];
		const rss = { items: [{ title: "Viktor Hovland spiller i dag" }] };
		const gaps = detectGaps({ rss, events, interests, tracked, now: NOW });
		expect(gaps.find((x) => x.entity === "Viktor Hovland")).toBeUndefined();
	});
});

describe("detectGaps — ongoing multi-day events (WP-43 regression)", () => {
	// A golf tournament that STARTED three days before NOW and is still running.
	// Windowing on e.time alone read this as "not on the board" and produced
	// false entity/sport gaps; isEventInWindow must count it as coverage.
	const ongoingGolf = {
		sport: "golf",
		title: "The Open Championship",
		norwegianPlayers: [{ name: "Viktor Hovland" }],
		time: "2026-06-30T06:00:00Z", // > 1 day before NOW (2026-07-03)
		endTime: "2026-07-06T18:00:00Z", // still in progress
	};

	it("does NOT flag an entity playing an ongoing multi-day event", () => {
		const rss = { items: [{ title: "Viktor Hovland spiller i dag", link: "https://nrk.no/h" }] };
		const gaps = detectGaps({ rss, events: [ongoingGolf], interests, tracked, now: NOW });
		expect(gaps.find((x) => x.entity === "Viktor Hovland")).toBeUndefined();
	});

	it("does NOT flag a sport gap when the sport has an ongoing multi-day event", () => {
		const rss = { items: [{ title: "PGA Tour: avgjørelsen faller i dag" }] };
		const gaps = detectGaps({ rss, events: [ongoingGolf], interests, tracked, now: NOW });
		expect(gaps.find((x) => x.kind === "sport" && x.sport === "golf")).toBeUndefined();
	});

	it("still flags when the multi-day event is already over", () => {
		const finished = { ...ongoingGolf, time: "2026-06-25T06:00:00Z", endTime: "2026-06-28T18:00:00Z" };
		const rss = { items: [{ title: "Viktor Hovland spiller i dag", link: "https://nrk.no/h" }] };
		const gaps = detectGaps({ rss, events: [finished], interests, tracked, now: NOW });
		expect(gaps.find((x) => x.entity === "Viktor Hovland")).toBeTruthy();
	});
});

describe("detectGaps — sport-level blind spot (the F1 case)", () => {
	it("flags a followed sport that is imminent in the news but absent from the board soon", () => {
		// F1 in the news happening today; board only has a race 14 days out (the real bug).
		const events = [{ sport: "f1", title: "Belgian Grand Prix", time: "2026-07-17T11:30:00Z" }];
		const rss = { items: [{ title: "Formel 1: British Grand Prix i dag", link: "https://f1.no/gp" }] };
		const gaps = detectGaps({ rss, events, interests, tracked, now: NOW });
		const g = gaps.find((x) => x.kind === "sport" && x.sport === "f1");
		expect(g).toBeTruthy();
		expect(g.type).toBe("imminent");
	});

	it("does not flag the sport when an event is actually on the board soon", () => {
		const events = [{ sport: "f1", title: "British Grand Prix", time: "2026-07-05T14:00:00Z" }];
		const rss = { items: [{ title: "Formel 1: British Grand Prix i dag" }] };
		const gaps = detectGaps({ rss, events, interests, tracked, now: NOW });
		expect(gaps.find((x) => x.kind === "sport" && x.sport === "f1")).toBeUndefined();
	});

	it("requires imminence language, not just a sport mention", () => {
		const events = [];
		const rss = { items: [{ title: "Formel 1: sesongen oppsummert så langt" }] };
		const gaps = detectGaps({ rss, events, interests, tracked, now: NOW });
		expect(gaps.find((x) => x.kind === "sport" && x.sport === "f1")).toBeUndefined();
	});
});

describe("detectSourceAnomalies", () => {
	const healthy = () => {
		const s = {};
		for (const sport of ["football", "golf", "tennis", "f1", "chess", "esports", "cycling"]) {
			s[sport] = { tournaments: [{ events: [{ time: "2026-07-05T10:00:00Z" }] }] };
		}
		return s;
	};
	const boardWithAll = () =>
		["football", "golf", "tennis", "f1", "chess", "esports", "cycling"].map((sport) => ({
			sport,
			time: "2026-07-05T10:00:00Z",
		}));

	it("is quiet when every source is healthy and on the board", () => {
		expect(detectSourceAnomalies({ sources: healthy(), events: boardWithAll(), now: NOW })).toEqual([]);
	});

	it("stays quiet when the fetcher file is empty but the board is covered (AI research)", () => {
		// chess/cycling have no API and are filled by research — an empty file is expected.
		const s = healthy();
		s.chess = { tournaments: [] };
		const a = detectSourceAnomalies({ sources: s, events: boardWithAll(), now: NOW });
		expect(a.find((x) => x.sport === "chess")).toBeUndefined();
	});

	it("flags a missing fetcher file only when the board also lacks the sport", () => {
		const s = healthy();
		s.f1 = null;
		const board = boardWithAll().filter((e) => e.sport !== "f1");
		const a = detectSourceAnomalies({ sources: s, events: board, now: NOW });
		expect(a.find((x) => x.sport === "f1")?.issue).toBe("file-missing");
	});

	it("flags an empty fetcher file when the board lacks the sport", () => {
		const s = healthy();
		s.chess = { tournaments: [] };
		const board = boardWithAll().filter((e) => e.sport !== "chess");
		const a = detectSourceAnomalies({ sources: s, events: board, now: NOW });
		expect(a.find((x) => x.sport === "chess")?.issue).toBe("file-empty");
	});

	it("counts an ongoing multi-day event in the source file as upcoming (WP-43 regression)", () => {
		const s = healthy();
		// Started 3 days before NOW, still running — must register as dropped-in-build, not file-empty.
		s.golf = { tournaments: [{ events: [{ time: "2026-06-30T06:00:00Z", endTime: "2026-07-06T18:00:00Z" }] }] };
		const board = boardWithAll().filter((e) => e.sport !== "golf");
		const a = detectSourceAnomalies({ sources: s, events: board, now: NOW });
		expect(a.find((x) => x.sport === "golf")?.issue).toBe("dropped-in-build");
	});

	it("flags (high) events present in the source but dropped from the board", () => {
		const s = healthy();
		const board = boardWithAll().filter((e) => e.sport !== "f1"); // f1 has source events but none on board
		const a = detectSourceAnomalies({ sources: s, events: board, now: NOW });
		const f1 = a.find((x) => x.sport === "f1");
		expect(f1?.issue).toBe("dropped-in-build");
		expect(f1?.severity).toBe("high");
	});
});
