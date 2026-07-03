// lib/helpers.js: time-window logic and last-good retention.
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { isEventInWindow, retainLastGood, hasEvents, normalizeToUTC, MS_PER_DAY } from "../scripts/lib/helpers.js";

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

describe("normalizeToUTC", () => {
	it("normalizes parseable dates to ISO", () => {
		expect(normalizeToUTC("2026-07-02T12:00:00+02:00")).toBe("2026-07-02T10:00:00.000Z");
	});
});
