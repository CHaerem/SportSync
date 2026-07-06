// f1.js: re-stamps ESPN's Friday-dated GP weekends with the actual Race session
// date/time (the source-quirks "ESPN mis-dates F1 weekends" root-cause fix).
import { describe, it, expect, beforeEach } from "vitest";
import { F1Fetcher } from "../scripts/fetch/f1.js";

// A scoreboard event as ESPN returns it: dated to Friday FP1, prematurely FINAL.
function scoreboardEvent(overrides = {}) {
	return {
		id: "600057439",
		date: "2026-07-17T11:30Z",
		name: "Belgian Grand Prix",
		status: { type: { name: "STATUS_FINAL" } },
		competitions: [{ venue: { fullName: "Circuit de Spa" } }],
		...overrides,
	};
}

// The core-API session list: FP1 (Fri) … Race (Sun).
const raceCompetitions = {
	items: [
		{ date: "2026-07-17T11:30Z", type: { id: "1", text: "Free Practice", abbreviation: "FP1" } },
		{ date: "2026-07-18T14:00Z", type: { id: "2", text: "Qualifying", abbreviation: "Q" } },
		{ date: "2026-07-19T13:00Z", type: { id: "3", text: "Race", abbreviation: "Race" } },
	],
};

let fetcher;
let calls;

beforeEach(() => {
	fetcher = new F1Fetcher();
	calls = [];
});

// Anchor "now" so the event's date sits inside the enrichment window regardless
// of the real clock: give the raw event a date 10 days out.
function inWindow(daysFromNow) {
	const d = new Date(Date.now() + daysFromNow * 86400000);
	// Snap to a Friday-ish practice time; only the timestamp matters here.
	return d.toISOString().replace(".000Z", "Z");
}

describe("F1Fetcher.useRaceSessionDates", () => {
	it("re-stamps a Friday-dated weekend with the Sunday race date and clears FINAL status", async () => {
		fetcher.apiClient.fetchJSON = async (url) => {
			calls.push(url);
			return raceCompetitions;
		};

		const raw = scoreboardEvent({ date: inWindow(10) });
		const [out] = await fetcher.useRaceSessionDates([raw]);

		expect(out.date).toBe("2026-07-19T13:00Z");
		expect(out.status).toBeUndefined();
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain("/events/600057439/competitions");
	});

	it("is fail-open: keeps ESPN's original date if the core API throws", async () => {
		fetcher.apiClient.fetchJSON = async () => {
			throw new Error("boom");
		};

		const original = inWindow(10);
		const [out] = await fetcher.useRaceSessionDates([scoreboardEvent({ date: original })]);

		expect(out.date).toBe(original);
	});

	it("is fail-open: keeps the original date if no Race session is present", async () => {
		fetcher.apiClient.fetchJSON = async () => ({
			items: [{ date: "2026-07-17T11:30Z", type: { id: "1", abbreviation: "FP1" } }],
		});

		const original = inWindow(10);
		const [out] = await fetcher.useRaceSessionDates([scoreboardEvent({ date: original })]);

		expect(out.date).toBe(original);
	});

	it("does not enrich events outside the lookahead window (avoids needless calls)", async () => {
		fetcher.apiClient.fetchJSON = async (url) => {
			calls.push(url);
			return raceCompetitions;
		};

		const farOut = inWindow(120); // beyond the 35-day window
		const [out] = await fetcher.useRaceSessionDates([scoreboardEvent({ date: farOut })]);

		expect(out.date).toBe(farOut);
		expect(calls).toHaveLength(0);
	});

	it("re-stamps a mid-weekend event already dated in the recent past (the drop-off case)", async () => {
		fetcher.apiClient.fetchJSON = async () => raceCompetitions;

		// Friday of a weekend in progress: date is ~2 days ago, race still ahead.
		const [out] = await fetcher.useRaceSessionDates([scoreboardEvent({ date: inWindow(-2) })]);

		expect(out.date).toBe("2026-07-19T13:00Z");
	});
});
