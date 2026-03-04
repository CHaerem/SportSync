import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
	NORWEGIAN_CLUBS,
	UEFA_COMPETITIONS,
	MS_PER_DAY,
	MS_PER_HOUR,
	MS_PER_MINUTE,
	isEventInWindow,
	isNoteworthyNorwegianResult,
} from "../scripts/lib/helpers.js";

// Load client-side shared-constants.js via eval (same pattern as other client tests)
globalThis.window = globalThis;
const src = readFileSync(join(import.meta.dirname, "../docs/js/shared-constants.js"), "utf-8");
eval(src);

describe("client-server constant sync", () => {
	it("NORWEGIAN_CLUBS arrays match", () => {
		expect(window.SS_CONSTANTS.NORWEGIAN_CLUBS).toEqual(NORWEGIAN_CLUBS);
	});

	it("UEFA competition codes match", () => {
		// Server uses UEFA_COMPETITIONS, client uses UEFA_COMPETITION_CODES — same values
		expect(window.SS_CONSTANTS.UEFA_COMPETITION_CODES).toEqual(UEFA_COMPETITIONS);
	});

	it("time constants match", () => {
		expect(window.SS_CONSTANTS.MS_PER_DAY).toBe(MS_PER_DAY);
		expect(window.SS_CONSTANTS.MS_PER_HOUR).toBe(MS_PER_HOUR);
		expect(window.SS_CONSTANTS.MS_PER_MINUTE).toBe(MS_PER_MINUTE);
	});

	it("isEventInWindow produces same results", () => {
		const event = { time: "2026-03-04T12:00:00Z" };
		const start = new Date("2026-03-04T00:00:00Z");
		const end = new Date("2026-03-05T00:00:00Z");
		expect(window.isEventInWindow(event, start, end)).toBe(isEventInWindow(event, start, end));
	});

	it("isEventInWindow matches for multi-day events", () => {
		const event = { time: "2026-03-02T08:00:00Z", endTime: "2026-03-05T18:00:00Z" };
		const start = new Date("2026-03-04T00:00:00Z");
		const end = new Date("2026-03-05T00:00:00Z");
		expect(window.isEventInWindow(event, start, end)).toBe(isEventInWindow(event, start, end));
	});

	it("isNoteworthyNorwegianResult produces same results", () => {
		const match = { homeTeam: "Bodø/Glimt", awayTeam: "Barcelona", leagueCode: "uefa.champions" };
		expect(window.isNoteworthyNorwegianResult(match)).toBe(isNoteworthyNorwegianResult(match));

		const domestic = { homeTeam: "Rosenborg", awayTeam: "Lyn", leagueCode: "nor.1" };
		expect(window.isNoteworthyNorwegianResult(domestic)).toBe(isNoteworthyNorwegianResult(domestic));
	});
});
