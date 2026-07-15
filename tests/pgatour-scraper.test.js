import { describe, it, expect, vi } from "vitest";
import {
	parseTeeTimeToUTC,
	tournamentNameMatches,
	fetchPGATourPage,
	fetchPGATourField,
	fetchPGATourTeeTimes,
} from "../scripts/lib/pgatour-scraper.js";

// --- Fixture helpers: wrap a __NEXT_DATA__ payload in the page's script tag ---

function makeNextDataPage(payload) {
	return `<!DOCTYPE html><html><head></head><body>
		<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>
	</body></html>`;
}

// A clean epoch we can assert deterministically: 2026-07-16T12:30:00Z → Oslo (summer, +02:00) = 14:30
const TEE_EPOCH_MS = Date.UTC(2026, 6, 16, 12, 30);
const TEE_UTC = "2026-07-16T12:30:00.000Z";
const TEE_OSLO = "14:30";

function leaderboardPage() {
	return makeNextDataPage({
		props: { pageProps: { dehydratedState: { queries: [
			{
				queryKey: ["leaderboardV3", "R2026"],
				state: { data: { leaderboard: {
					tournament: { tournamentName: "The Test Open", timezone: "America/New_York", date: "2026-07-16" },
					rows: [
						{ player: { firstName: "Kristoffer", lastName: "Ventura", displayName: "Kristoffer Ventura" },
						  scoringData: { teeTime: TEE_EPOCH_MS, backNine: true } },
						{ player: { firstName: "Viktor", lastName: "Hovland", displayName: "Viktor Hovland" },
						  scoringData: { teeTime: TEE_EPOCH_MS, backNine: false } },
					],
				} } },
			},
		] } } },
	});
}

function teeTimesPage() {
	return makeNextDataPage({
		props: { pageProps: {
			tournament: { tournamentName: "The Test Open", timezone: "America/New_York", currentRound: 1 },
			dehydratedState: { queries: [
				{
					queryKey: ["teeTimesV3", "R2026"],
					state: { data: { teeTimeV3: { rounds: [
						{ groups: [
							{ time: TEE_EPOCH_MS, startTee: 10, course: { courseName: "Test National" },
							  players: [
								{ displayName: "Kristoffer Ventura" },
								{ displayName: "Playing Partner" },
							  ] },
						] },
					] } } },
				},
			] },
		} },
	});
}

// --- parseTeeTimeToUTC ---

describe("parseTeeTimeToUTC", () => {
	// Use a date a few days ahead so the "within 7 days" sanity window passes deterministically.
	const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	it("returns a valid ISO string for a near-future tee time", () => {
		const out = parseTeeTimeToUTC("8:45 AM", soon, "America/New_York");
		expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	it("returns null for an unparseable time format", () => {
		expect(parseTeeTimeToUTC("morning", soon, "America/New_York")).toBeNull();
	});

	it("returns null for missing args", () => {
		expect(parseTeeTimeToUTC("", soon)).toBeNull();
		expect(parseTeeTimeToUTC("8:45 AM", null)).toBeNull();
	});

	it("returns null for a tee time outside the 7-day window (past)", () => {
		const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		expect(parseTeeTimeToUTC("8:45 AM", past, "America/New_York")).toBeNull();
	});
});

// --- tournamentNameMatches ---

describe("tournamentNameMatches", () => {
	it("matches names sharing >= 2 meaningful words", () => {
		expect(tournamentNameMatches("Corales Puntacana Championship", "Corales Puntacana Championship")).toBe(true);
	});

	it("matches despite punctuation and stop words", () => {
		expect(tournamentNameMatches("The Genesis Scottish Open", "Genesis Scottish Open")).toBe(true);
	});

	it("does not match on a single shared word", () => {
		expect(tournamentNameMatches("U.S. Open", "British Open")).toBe(false);
	});

	it("returns false for empty input", () => {
		expect(tournamentNameMatches("", "Anything")).toBe(false);
		expect(tournamentNameMatches("Anything", null)).toBe(false);
	});
});

// --- fetchPGATourPage ---

describe("fetchPGATourPage", () => {
	it("extracts nextData + queries from a valid page", async () => {
		const fetcher = vi.fn().mockResolvedValue(leaderboardPage());
		const out = await fetchPGATourPage("/leaderboard", fetcher);
		expect(fetcher).toHaveBeenCalledWith(
			"https://www.pgatour.com/leaderboard",
			expect.objectContaining({ headers: expect.any(Object), timeout: expect.any(Number) })
		);
		expect(Array.isArray(out.queries)).toBe(true);
		expect(out.nextData.props.pageProps.dehydratedState.queries).toHaveLength(1);
	});

	it("returns null when __NEXT_DATA__ tag is missing", async () => {
		const fetcher = vi.fn().mockResolvedValue("<html><body>no data</body></html>");
		expect(await fetchPGATourPage("/leaderboard", fetcher)).toBeNull();
	});

	it("returns null when __NEXT_DATA__ is not valid JSON", async () => {
		const html = `<script id="__NEXT_DATA__" type="application/json">{not json}</script>`;
		const fetcher = vi.fn().mockResolvedValue(html);
		expect(await fetchPGATourPage("/leaderboard", fetcher)).toBeNull();
	});

	it("returns null when there is no queries array", async () => {
		const fetcher = vi.fn().mockResolvedValue(makeNextDataPage({ props: { pageProps: {} } }));
		expect(await fetchPGATourPage("/leaderboard", fetcher)).toBeNull();
	});

	it("returns null when the fetch rejects", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
		expect(await fetchPGATourPage("/leaderboard", fetcher)).toBeNull();
	});
});

// --- fetchPGATourField ---

describe("fetchPGATourField", () => {
	it("parses tournament, timezone and players with epoch tee times", async () => {
		const fetcher = vi.fn().mockResolvedValue(leaderboardPage());
		const out = await fetchPGATourField(fetcher);
		expect(out.tournamentName).toBe("The Test Open");
		expect(out.timezone).toBe("America/New_York");
		expect(out.players).toHaveLength(2);

		const ventura = out.players.find(p => p.displayName === "Kristoffer Ventura");
		expect(ventura.teeTimeUTC).toBe(TEE_UTC);
		expect(ventura.teeTime).toBe(TEE_OSLO);
		expect(ventura.startingHole).toBe(10); // backNine → 10

		const hovland = out.players.find(p => p.displayName === "Viktor Hovland");
		expect(hovland.startingHole).toBeNull(); // not backNine, no explicit startingHole
	});

	it("returns null when no leaderboard data is present", async () => {
		const page = makeNextDataPage({ props: { pageProps: { dehydratedState: { queries: [] } } } });
		const fetcher = vi.fn().mockResolvedValue(page);
		expect(await fetchPGATourField(fetcher)).toBeNull();
	});

	it("returns null when the leaderboard has zero players", async () => {
		const page = makeNextDataPage({
			props: { pageProps: { dehydratedState: { queries: [
				{ queryKey: ["leaderboardV3"], state: { data: { leaderboard: {
					tournament: { tournamentName: "Empty", timezone: "UTC" }, rows: [],
				} } } },
			] } } },
		});
		const fetcher = vi.fn().mockResolvedValue(page);
		expect(await fetchPGATourField(fetcher)).toBeNull();
	});
});

// --- fetchPGATourTeeTimes ---

describe("fetchPGATourTeeTimes", () => {
	it("parses per-player tee times, groupmates and course from the current round", async () => {
		const fetcher = vi.fn().mockResolvedValue(teeTimesPage());
		const out = await fetchPGATourTeeTimes(fetcher);
		expect(out.tournamentName).toBe("The Test Open");
		expect(out.playerTeeTimes.size).toBe(2);

		const info = out.playerTeeTimes.get("kristoffer ventura");
		expect(info.teeTime).toBe(TEE_OSLO);
		expect(info.teeTimeUTC).toBe(TEE_UTC);
		expect(info.startingHole).toBe(10);
		expect(info.courseName).toBe("Test National");
		expect(info.groupmates).toEqual(["Playing Partner"]);
	});

	it("returns null when there are no rounds", async () => {
		const page = makeNextDataPage({
			props: { pageProps: {
				tournament: { currentRound: 1 },
				dehydratedState: { queries: [
					{ queryKey: ["teeTimesV3"], state: { data: { teeTimeV3: { rounds: [] } } } },
				] },
			} },
		});
		const fetcher = vi.fn().mockResolvedValue(page);
		expect(await fetchPGATourTeeTimes(fetcher)).toBeNull();
	});

	it("returns null when the page rejects", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
		expect(await fetchPGATourTeeTimes(fetcher)).toBeNull();
	});
});
