import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { buildSnapshot, validateSnapshot, cleanOldSnapshots } from "../scripts/build-day-snapshots.js";

// Helper to create events for a specific date
function makeEvent(overrides = {}) {
	const now = new Date();
	return {
		sport: "football",
		title: "Test Match",
		time: now.toISOString(),
		tournament: "Premier League",
		venue: "Emirates Stadium",
		importance: 3,
		norwegian: false,
		streaming: [],
		tags: [],
		...overrides,
	};
}

function todayAt(hour) {
	const d = new Date();
	d.setHours(hour, 0, 0, 0);
	return d;
}

function daysAgo(n) {
	const d = new Date();
	d.setDate(d.getDate() - n);
	d.setHours(12, 0, 0, 0);
	return d;
}

function daysAhead(n) {
	const d = new Date();
	d.setDate(d.getDate() + n);
	d.setHours(12, 0, 0, 0);
	return d;
}

function formatDateKey(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

const baseInput = {
	events: [],
	recentResults: null,
	standings: null,
	watchPlan: null,
	rssDigest: null,
};

describe("buildSnapshot()", () => {
	it("generates a valid snapshot with schema version", () => {
		const today = new Date();
		const snapshot = buildSnapshot(today, baseInput);

		expect(snapshot.schemaVersion).toBe(1);
		expect(snapshot.date).toBe(formatDateKey(today));
		expect(snapshot.generatedAt).toBeDefined();
		expect(snapshot.events.upcoming).toEqual([]);
		expect(snapshot.events.results).toEqual([]);
		expect(snapshot.matchResults).toEqual([]);
		expect(snapshot.meta.eventCount).toBe(0);
	});

	it("filters events for the correct date", () => {
		const today = new Date();
		const todayEvent = makeEvent({ time: todayAt(14).toISOString(), title: "Today Match" });
		const tomorrowEvent = makeEvent({ time: daysAhead(1).toISOString(), title: "Tomorrow Match" });
		const yesterdayEvent = makeEvent({ time: daysAgo(1).toISOString(), title: "Yesterday Match" });

		const snapshot = buildSnapshot(today, {
			...baseInput,
			events: [todayEvent, tomorrowEvent, yesterdayEvent],
		});

		expect(snapshot.meta.eventCount).toBe(1);
		// Today's event is upcoming (hasn't started yet or recently started)
		const allEvents = [...snapshot.events.upcoming, ...snapshot.events.results];
		expect(allEvents.some(e => e.title === "Today Match")).toBe(true);
		expect(allEvents.some(e => e.title === "Tomorrow Match")).toBe(false);
	});

	it("handles multi-day events via isEventInWindow", () => {
		const today = new Date();
		const multiDayEvent = makeEvent({
			time: daysAgo(1).toISOString(),
			endTime: daysAhead(1).toISOString(),
			title: "Golf Tournament",
			sport: "golf",
		});

		const snapshot = buildSnapshot(today, {
			...baseInput,
			events: [multiDayEvent],
		});

		expect(snapshot.meta.eventCount).toBe(1);
	});

	it("includes match results for the date", () => {
		const today = new Date();
		const dateKey = formatDateKey(today);
		const snapshot = buildSnapshot(today, {
			...baseInput,
			recentResults: {
				football: [
					{ homeTeam: "Arsenal", awayTeam: "Liverpool", homeScore: 2, awayScore: 1, date: `${dateKey}T15:00:00Z`, league: "Premier League" },
					{ homeTeam: "Chelsea", awayTeam: "Spurs", homeScore: 0, awayScore: 0, date: `${formatDateKey(daysAgo(1))}T15:00:00Z`, league: "Premier League" },
				],
			},
		});

		expect(snapshot.matchResults).toHaveLength(1);
		expect(snapshot.matchResults[0].homeTeam).toBe("Arsenal");
	});

	it("includes standings only for today and yesterday", () => {
		const standings = {
			football: { premierLeague: [{ team: "Arsenal", points: 50, rank: 1 }] },
			golf: { pga: { name: "Genesis", leaderboard: [{ player: "Hovland", score: "-10" }] } },
			f1: { drivers: [{ driver: "Verstappen", points: 200 }] },
		};

		// Today: includes standings
		const todaySnap = buildSnapshot(new Date(), { ...baseInput, standings });
		expect(todaySnap.standings).not.toBeNull();
		expect(todaySnap.standings.premierLeague).toHaveLength(1);

		// Yesterday: includes standings
		const yesterdaySnap = buildSnapshot(daysAgo(1), { ...baseInput, standings });
		expect(yesterdaySnap.standings).not.toBeNull();

		// 3 days ago: no standings
		const oldSnap = buildSnapshot(daysAgo(3), { ...baseInput, standings });
		expect(oldSnap.standings).toBeNull();

		// Tomorrow: no standings
		const tomorrowSnap = buildSnapshot(daysAhead(1), { ...baseInput, standings });
		expect(tomorrowSnap.standings).toBeNull();
	});

	it("includes watch plan only for today", () => {
		const watchPlan = {
			picks: [{ title: "Arsenal v Liverpool", sport: "football" }],
			headline: "Big day",
		};

		const todaySnap = buildSnapshot(new Date(), { ...baseInput, watchPlan });
		expect(todaySnap.watchPlan).not.toBeNull();
		expect(todaySnap.watchPlan.picks).toHaveLength(1);

		const yesterdaySnap = buildSnapshot(daysAgo(1), { ...baseInput, watchPlan });
		expect(yesterdaySnap.watchPlan).toBeNull();
	});

	it("includes RSS highlights only for today and yesterday", () => {
		const rssDigest = {
			items: [
				{ title: "News 1", source: "NRK", sport: "football", link: "https://nrk.no" },
				{ title: "News 2", source: "BBC", sport: "golf" },
			],
		};

		const todaySnap = buildSnapshot(new Date(), { ...baseInput, rssDigest });
		expect(todaySnap.rssHighlights).toHaveLength(2);

		const yesterdaySnap = buildSnapshot(daysAgo(1), { ...baseInput, rssDigest });
		expect(yesterdaySnap.rssHighlights).toHaveLength(2);

		const oldSnap = buildSnapshot(daysAgo(3), { ...baseInput, rssDigest });
		expect(oldSnap.rssHighlights).toBeNull();
	});

	it("limits RSS highlights to 5 items", () => {
		const items = Array.from({ length: 10 }, (_, i) => ({
			title: `News ${i}`, source: "NRK", sport: "football",
		}));
		const rssDigest = { items };

		const snapshot = buildSnapshot(new Date(), { ...baseInput, rssDigest });
		expect(snapshot.rssHighlights).toHaveLength(5);
	});

	it("limits standings to top 5", () => {
		const teams = Array.from({ length: 20 }, (_, i) => ({ team: `Team ${i}`, points: 100 - i }));
		const standings = {
			football: { premierLeague: teams },
			golf: { pga: { leaderboard: [] } },
			f1: { drivers: [] },
		};

		const snapshot = buildSnapshot(new Date(), { ...baseInput, standings });
		expect(snapshot.standings.premierLeague).toHaveLength(5);
	});

	it("populates meta.sportsCovered correctly", () => {
		const today = new Date();
		const events = [
			makeEvent({ time: todayAt(14).toISOString(), sport: "football" }),
			makeEvent({ time: todayAt(15).toISOString(), sport: "golf" }),
			makeEvent({ time: todayAt(16).toISOString(), sport: "golf" }),
		];

		const snapshot = buildSnapshot(today, { ...baseInput, events });
		expect(snapshot.meta.sportsCovered.sort()).toEqual(["football", "golf"]);
	});

	it("handles empty inputs gracefully", () => {
		const snapshot = buildSnapshot(new Date(), baseInput);
		expect(snapshot.meta.eventCount).toBe(0);
		expect(snapshot.matchResults).toEqual([]);
		expect(snapshot.standings).toBeNull();
		expect(snapshot.watchPlan).toBeNull();
		expect(snapshot.rssHighlights).toBeNull();
	});
});

describe("validateSnapshot()", () => {
	it("passes when event count matches", () => {
		const today = new Date();
		const events = [makeEvent({ time: todayAt(14).toISOString() })];
		const snapshot = buildSnapshot(today, { ...baseInput, events });
		const result = validateSnapshot(snapshot, events);
		expect(result.valid).toBe(true);
	});

	it("fails when event count mismatches", () => {
		const today = new Date();
		const snapshot = {
			date: formatDateKey(today),
			meta: { eventCount: 5 },
		};
		const events = [makeEvent({ time: todayAt(14).toISOString() })];
		const result = validateSnapshot(snapshot, events);
		expect(result.valid).toBe(false);
		expect(result.expected).toBe(1);
		expect(result.actual).toBe(5);
	});
});

describe("cleanOldSnapshots()", () => {
	let tmpDir;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshots-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("removes old snapshot files", () => {
		// Create a very old snapshot
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 30);
		const oldKey = formatDateKey(oldDate);
		fs.writeFileSync(path.join(tmpDir, `${oldKey}.json`), "{}");

		// Create a recent snapshot
		const recentKey = formatDateKey(new Date());
		fs.writeFileSync(path.join(tmpDir, `${recentKey}.json`), "{}");

		const removed = cleanOldSnapshots(tmpDir, 14);
		expect(removed).toBe(1);
		expect(fs.existsSync(path.join(tmpDir, `${recentKey}.json`))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, `${oldKey}.json`))).toBe(false);
	});

	it("preserves _meta.json", () => {
		fs.writeFileSync(path.join(tmpDir, "_meta.json"), "{}");
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 30);
		const oldKey = formatDateKey(oldDate);
		fs.writeFileSync(path.join(tmpDir, `${oldKey}.json`), "{}");

		cleanOldSnapshots(tmpDir, 14);
		expect(fs.existsSync(path.join(tmpDir, "_meta.json"))).toBe(true);
	});

	it("returns 0 when directory is empty", () => {
		const removed = cleanOldSnapshots(tmpDir);
		expect(removed).toBe(0);
	});

	it("returns 0 when directory does not exist", () => {
		const removed = cleanOldSnapshots("/nonexistent/path");
		expect(removed).toBe(0);
	});
});
