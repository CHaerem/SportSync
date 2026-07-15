// lib/helpers.js: time-window logic and last-good retention.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { isEventInWindow, retainLastGood, hasEvents, normalizeToUTC, MS_PER_DAY,
	normalizeText, containsName, normalizeEntity, matchInterest, mustWatchEntity,
	normalizeParticipants, normalizeNorwegianPlayers, yyyymmdd, espnDateRange } from "../scripts/lib/helpers.js";

describe("yyyymmdd / espnDateRange (shared ESPN date helpers)", () => {
	it("formats a date as YYYYMMDD in UTC", () => {
		expect(yyyymmdd(new Date("2026-07-03T12:00:00Z"))).toBe("20260703");
		expect(yyyymmdd(Date.parse("2026-01-09T23:59:59Z"))).toBe("20260109");
	});

	it("espnDateRange returns `days` consecutive yyyymmdd strings starting today", () => {
		const range = espnDateRange(3);
		expect(range).toHaveLength(3);
		expect(range[0]).toBe(yyyymmdd());
		expect(range.every((d) => /^\d{8}$/.test(d))).toBe(true);
		expect(range[1]).toBe(yyyymmdd(Date.now() + MS_PER_DAY));
	});
});

describe("isEventInWindow", () => {
	const day = (n) => new Date(Date.parse("2026-07-02T00:00:00Z") + n * MS_PER_DAY);

	it("includes single-point events inside the window", () => {
		expect(isEventInWindow({ time: day(1).toISOString() }, day(0), day(2))).toBe(true);
	});

	it("excludes events outside the window", () => {
		expect(isEventInWindow({ time: day(5).toISOString() }, day(0), day(2))).toBe(false);
	});

	it("includes multi-day events that started before the window but end inside it", () => {
		const golf = { time: day(-2).toISOString(), endTime: day(1).toISOString() };
		expect(isEventInWindow(golf, day(0), day(2))).toBe(true);
	});

	it("returns false for events without a time", () => {
		expect(isEventInWindow({}, day(0), day(1))).toBe(false);
	});
});

describe("retainLastGood", () => {
	it("keeps previous data when new fetch is empty", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-retain-"));
		const file = path.join(dir, "golf.json");
		const good = { lastUpdated: new Date().toISOString(), tournaments: [{ name: "PGA", events: [{ title: "x" }] }] };
		fs.writeFileSync(file, JSON.stringify(good));
		const result = retainLastGood(file, { tournaments: [] });
		expect(result.kept).toBe(true);
		expect(hasEvents(JSON.parse(fs.readFileSync(file, "utf-8")))).toBe(true);
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("writes fresh data when the new fetch has events", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-retain2-"));
		const file = path.join(dir, "golf.json");
		const fresh = { tournaments: [{ name: "PGA", events: [{ title: "new" }] }] };
		const result = retainLastGood(file, fresh);
		expect(result.kept).toBe(false);
		expect(JSON.parse(fs.readFileSync(file, "utf-8")).tournaments[0].events[0].title).toBe("new");
		fs.rmSync(dir, { recursive: true, force: true });
	});
});

describe("interest entity matching", () => {
	it("normalizeText lowercases and strips diacritics", () => {
		expect(normalizeText("Barça")).toBe("barca");
		expect(normalizeText("Vålerenga")).toBe("valerenga");
	});

	it("containsName matches whole names at word boundaries, accent-insensitive", () => {
		expect(containsName("Lyn slo VIF", "Lyn")).toBe(true);
		expect(containsName("kraftig lynnedslag", "Lyn")).toBe(false);
		expect(containsName("Barça vant 3-0", "Barca")).toBe(true); // haystack accented, needle not
		expect(containsName("FC Barca vant", "Barça")).toBe(true); // needle accented, haystack not
		// "barca" is a different token from "barcelona" — no fuzzy substring match.
		// This is exactly why the entity aliases exist to bridge the two.
		expect(containsName("FC Barcelona vant", "Barça")).toBe(false);
	});

	it("normalizeEntity coerces strings and objects into a uniform shape", () => {
		expect(normalizeEntity("Liverpool")).toEqual({ name: "Liverpool", aliases: [], sport: null, notify: true });
		expect(normalizeEntity({ name: "F1 World Championship", aliases: ["F1"], sport: "f1", notify: true }))
			.toEqual({ name: "F1 World Championship", aliases: ["F1"], sport: "f1", notify: true });
		expect(normalizeEntity("PL", { defaultNotify: false }).notify).toBe(false);
		expect(normalizeEntity(null)).toBeNull();
	});

	it("matchInterest matches by canonical name or alias and returns the entity", () => {
		const teams = [{ name: "Barcelona", aliases: ["FC Barcelona", "Barça", "Barca"], sport: "football" }];
		expect(matchInterest("Barca held to a draw", teams)?.name).toBe("Barcelona"); // alias hit
		expect(matchInterest("Real Madrid won", teams)).toBeNull();
	});

	it("matchInterest can scope by sport to avoid cross-sport false hits", () => {
		const entities = [{ name: "US Open", aliases: [], sport: "golf" }];
		expect(matchInterest("US Open final", entities, { sport: "tennis" })).toBeNull();
		expect(matchInterest("US Open final", entities, { sport: "golf" })?.name).toBe("US Open");
	});

	it("tolerates a stray bare string without crashing (defensive)", () => {
		expect(matchInterest("Liverpool won", ["Liverpool"])?.name).toBe("Liverpool");
	});
});

describe("normalizeToUTC", () => {
	it("normalizes parseable dates to ISO", () => {
		expect(normalizeToUTC("2026-07-02T12:00:00+02:00")).toBe("2026-07-02T10:00:00.000Z");
	});
});

// WP-04: canonical participation form — [{name, ...}], never strings/null.
describe("normalizeParticipants", () => {
	it("coerces bare strings into {name} objects", () => {
		expect(normalizeParticipants(["Casper Ruud", "Viktor Hovland"]))
			.toEqual([{ name: "Casper Ruud" }, { name: "Viktor Hovland" }]);
	});

	it("drops null/empty entries and passes through already-canonical objects", () => {
		expect(normalizeParticipants([null, { name: "Magnus Carlsen" }, ""])).toEqual([{ name: "Magnus Carlsen" }]);
	});

	it("returns [] for null, undefined, or a non-array", () => {
		expect(normalizeParticipants(null)).toEqual([]);
		expect(normalizeParticipants(undefined)).toEqual([]);
		expect(normalizeParticipants("not an array")).toEqual([]);
	});
});

describe("normalizeNorwegianPlayers", () => {
	it("coerces bare strings into {name} objects", () => {
		expect(normalizeNorwegianPlayers(["Viktor Hovland"])).toEqual([{ name: "Viktor Hovland" }]);
	});

	it("drops a lone null entry (the pre-WP-04 shape) and returns [] for a null field", () => {
		expect(normalizeNorwegianPlayers(null)).toEqual([]);
		expect(normalizeNorwegianPlayers([null])).toEqual([]);
	});

	it("preserves golf's optional teeTime/teeTimeUTC/status fields on object entries", () => {
		const players = [{ name: "Kristoffer Ventura", teeTime: "14:20", teeTimeUTC: "12:20Z", status: "Confirmed" }];
		expect(normalizeNorwegianPlayers(players)).toEqual(players);
	});
});

describe("mustWatchEntity with canonical + legacy participation shapes", () => {
	const interests = { alwaysTrack: { athletes: ["Casper Ruud"] } };

	it("matches a tracked athlete found only in participants (canonical {name} form)", () => {
		const event = { sport: "tennis", title: "R32", participants: [{ name: "Casper Ruud" }, { name: "Someone Else" }] };
		expect(mustWatchEntity(event, interests)?.name).toBe("Casper Ruud");
	});

	it("still matches the pre-WP-04 bare-string shape (defensive, one release of tolerance)", () => {
		const event = { sport: "tennis", title: "R32", participants: ["Casper Ruud", "Someone Else"] };
		expect(mustWatchEntity(event, interests)?.name).toBe("Casper Ruud");
	});
});
