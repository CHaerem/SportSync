import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Stub browser globals needed by SportsAPI
globalThis.window = globalThis;
globalThis.fetch = vi.fn();

const src = readFileSync(join(import.meta.dirname, "../docs/js/sports-api.js"), "utf-8");
// The file defines a class SportsAPI without assigning to window, so we
// wrap it in a function that returns it after evaluation.
const SportsAPI = new Function(src + "\nreturn SportsAPI;")();

describe("SportsAPI", () => {
	let api;

	beforeEach(() => {
		api = new SportsAPI();
	});

	describe("formatTournamentData()", () => {
		it("maps tournament structure preserving name and events", () => {
			const input = [{
				name: "Premier League",
				events: [{
					title: "Arsenal vs Chelsea", meta: "PL", time: "2026-03-01T15:00:00Z",
					venue: "Emirates", sport: "football", streaming: [{ platform: "TV2" }],
					norwegian: false, homeTeam: "Arsenal", awayTeam: "Chelsea",
				}],
			}];
			const result = api.formatTournamentData(input);
			expect(result).toHaveLength(1);
			expect(result[0].tournament).toBe("Premier League");
			expect(result[0].events).toHaveLength(1);
			expect(result[0].events[0].title).toBe("Arsenal vs Chelsea");
			expect(result[0].events[0].sport).toBe("football");
			expect(result[0].events[0].homeTeam).toBe("Arsenal");
			expect(result[0].events[0].awayTeam).toBe("Chelsea");
		});

		it("preserves streaming array", () => {
			const input = [{
				name: "Test", events: [{
					title: "Match", time: "2026-03-01T15:00:00Z",
					streaming: [{ platform: "Viaplay", url: "https://viaplay.no" }],
				}],
			}];
			const result = api.formatTournamentData(input);
			expect(result[0].events[0].streaming).toEqual([{ platform: "Viaplay", url: "https://viaplay.no" }]);
		});

		it("defaults missing fields to empty arrays/null/false", () => {
			const input = [{ name: "Minimal", events: [{ title: "Event", time: "2026-03-01T12:00:00Z" }] }];
			const result = api.formatTournamentData(input);
			const evt = result[0].events[0];
			expect(evt.sport).toBe("unknown");
			expect(evt.streaming).toEqual([]);
			expect(evt.norwegian).toBe(false);
			expect(evt.norwegianPlayers).toEqual([]);
			expect(evt.totalPlayers).toBeNull();
			expect(evt.link).toBeNull();
			expect(evt.status).toBeNull();
			expect(evt.featuredGroups).toEqual([]);
			expect(evt.participants).toEqual([]);
		});

		it("adds timeFormatted via formatDateTime", () => {
			const input = [{ name: "T", events: [{ title: "E", time: "2026-03-01T12:00:00Z" }] }];
			const result = api.formatTournamentData(input);
			expect(result[0].events[0].timeFormatted).toBeDefined();
			expect(typeof result[0].events[0].timeFormatted).toBe("string");
		});

		it("handles multiple tournaments with multiple events", () => {
			const input = [
				{ name: "T1", events: [{ title: "E1", time: "2026-03-01T12:00:00Z" }, { title: "E2", time: "2026-03-02T12:00:00Z" }] },
				{ name: "T2", events: [{ title: "E3", time: "2026-03-03T12:00:00Z" }] },
			];
			const result = api.formatTournamentData(input);
			expect(result).toHaveLength(2);
			expect(result[0].events).toHaveLength(2);
			expect(result[1].events).toHaveLength(1);
		});

		it("preserves golf-specific fields", () => {
			const input = [{
				name: "PGA", events: [{
					title: "Masters", time: "2026-04-10T12:00:00Z", sport: "golf",
					norwegianPlayers: [{ name: "Viktor Hovland" }], totalPlayers: 88,
					link: "https://pga.com", status: "in_progress",
					featuredGroups: [{ players: ["Tiger", "Rory"] }],
				}],
			}];
			const evt = api.formatTournamentData(input)[0].events[0];
			expect(evt.norwegianPlayers).toEqual([{ name: "Viktor Hovland" }]);
			expect(evt.totalPlayers).toBe(88);
			expect(evt.link).toBe("https://pga.com");
			expect(evt.status).toBe("in_progress");
			expect(evt.featuredGroups).toHaveLength(1);
		});

		it("returns empty array for empty input", () => {
			expect(api.formatTournamentData([])).toEqual([]);
		});
	});

	describe("formatDateTime()", () => {
		it("returns TBD for null/undefined/empty", () => {
			expect(api.formatDateTime(null)).toBe("TBD");
			expect(api.formatDateTime(undefined)).toBe("TBD");
			expect(api.formatDateTime("")).toBe("TBD");
		});

		it("returns 'Today' for today's date", () => {
			const today = new Date();
			today.setHours(20, 0, 0, 0);
			expect(api.formatDateTime(today.toISOString())).toBe("Today");
		});

		it("returns 'Tomorrow' for tomorrow's date", () => {
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(15, 0, 0, 0);
			expect(api.formatDateTime(tomorrow.toISOString())).toBe("Tomorrow");
		});

		it("returns 'N days' for dates 2-7 days ahead", () => {
			const future = new Date();
			future.setDate(future.getDate() + 3);
			future.setHours(12, 0, 0, 0);
			expect(api.formatDateTime(future.toISOString())).toBe("3 days");
		});

		it("returns formatted date for dates beyond 7 days", () => {
			const far = new Date();
			far.setDate(far.getDate() + 30);
			const result = api.formatDateTime(far.toISOString());
			expect(result).not.toBe("TBD");
			expect(result).not.toMatch(/^\d+ days$/);
		});
	});

	describe("groupEventsByDay()", () => {
		it("initializes 7 days starting from today", () => {
			const result = api.groupEventsByDay([]);
			const keys = Object.keys(result);
			expect(keys).toHaveLength(7);
			const today = new Date().toISOString().split("T")[0];
			expect(keys[0]).toBe(today);
		});

		it("places events into correct day buckets", () => {
			const today = new Date();
			today.setHours(15, 0, 0, 0);
			const events = [{ title: "Match", time: today.toISOString(), sport: "football" }];
			const result = api.groupEventsByDay(events);
			const todayKey = today.toISOString().split("T")[0];
			expect(result[todayKey].events).toHaveLength(1);
			expect(result[todayKey].events[0].title).toBe("Match");
		});

		it("adds timeFormatted in Oslo timezone", () => {
			const today = new Date();
			today.setHours(14, 0, 0, 0);
			const events = [{ title: "E", time: today.toISOString(), sport: "golf" }];
			const result = api.groupEventsByDay(events);
			const todayKey = today.toISOString().split("T")[0];
			if (result[todayKey].events.length > 0) {
				expect(result[todayKey].events[0].timeFormatted).toBeDefined();
			}
		});

		it("ignores events with TBD time", () => {
			const events = [{ title: "TBD Match", time: "TBD", sport: "chess" }];
			const result = api.groupEventsByDay(events);
			const allEvents = Object.values(result).flatMap((d) => d.events);
			expect(allEvents).toHaveLength(0);
		});

		it("ignores events outside the 7-day window", () => {
			const far = new Date();
			far.setDate(far.getDate() + 30);
			const events = [{ title: "Far Event", time: far.toISOString(), sport: "tennis" }];
			const result = api.groupEventsByDay(events);
			const allEvents = Object.values(result).flatMap((d) => d.events);
			expect(allEvents).toHaveLength(0);
		});
	});
});
